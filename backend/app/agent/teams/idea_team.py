"""Idea Team research packet orchestration and filesystem persistence."""

from __future__ import annotations

import asyncio
import inspect
import json
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

from ...config import settings
from ...storage.artifacts import save_artifact_revision
from ...storage.idea_workspace import (
    create_idea_folder,
    load_idea_yaml,
    save_idea_yaml,
    workspace_transaction,
)

IDEA_ARTIFACTS = (
    "market-summary",
    "competitors",
    "prior-art",
    "feasibility",
    "target-audience",
)
logger = logging.getLogger(__name__)

Researcher = Callable[[str], dict[str, Any] | Awaitable[dict[str, Any]]]


class ResearchPacketError(RuntimeError):
    """Raised when an Idea Team provider cannot produce a valid packet."""


def _set_state(idea_id: str, state: str, **details: Any) -> dict[str, Any]:
    create_idea_folder(idea_id)
    idea = load_idea_yaml(idea_id, "idea.yaml") or {"idea_id": idea_id}
    research = {"state": state, "updated_at": time.time(), **details}
    idea["research"] = research
    save_idea_yaml(idea_id, "idea.yaml", idea)
    try:
        from ...infrastructure.events.stream_bus import _bus

        _bus.publish(
            f"research.{state}",
            {"idea_id": idea_id, "research": research},
        )
        _bus.publish(
            "research.progress",
            {"idea_id": idea_id, "research": research},
        )
    except Exception:
        logger.debug("Unable to publish research state", exc_info=True)
    return research


async def _default_researcher(_concept: str, *, idea_id: str = "unknown") -> dict[str, Any]:
    from ...orchestrator.supervisor import invoke_idea_team_research

    try:
        result = await invoke_idea_team_research(_concept, idea_id=idea_id)
        content: Any = result
        if isinstance(result, dict):
            content = result.get("output", result.get("messages", result))
        if isinstance(content, list) and content:
            last = content[-1]
            content = (
                last.get("content", last)
                if isinstance(last, dict)
                else getattr(last, "content", last)
            )
        if not isinstance(content, (dict, str)):
            content = getattr(content, "content", content)
        if isinstance(content, dict):
            return content
        if not isinstance(content, str):
            raise ResearchPacketError("Idea Team returned no structured research output")
        decoded = json.loads(content)
        if not isinstance(decoded, dict):
            raise ResearchPacketError("Idea Team returned a non-object packet")
        return decoded
    except ResearchPacketError:
        raise
    except Exception as exc:
        raise ResearchPacketError(f"Idea Team provider failed: {exc}") from exc


async def run_idea_research(
    idea_id: str,
    concept: str,
    *,
    researcher: Researcher | None = None,
    time_budget_sec: int | None = None,
    agent_id: str = "idea-team",
    work_item_id: str | None = None,
) -> dict[str, Any]:
    """Run source-backed research and persist only provider-supplied evidence.

    The provider is an explicit LLM/MCP boundary and is injectable for tests.
    A provider failure or deadline never becomes a successful packet.
    """
    budget = settings.research_time_budget_sec if time_budget_sec is None else time_budget_sec
    if budget <= 0:
        raise ValueError("research time budget must be positive")
    expected = list(IDEA_ARTIFACTS)
    started = time.monotonic()
    deadline = started + budget
    _set_state(
        idea_id,
        "initializing",
        artifact_names=expected,
        expected_artifacts=expected,
        completed_artifacts=[],
        agent_id=agent_id,
        work_item_id=work_item_id,
    )
    _set_state(
        idea_id,
        "running",
        artifact_names=expected,
        expected_artifacts=expected,
        completed_artifacts=[],
        agent_id=agent_id,
        work_item_id=work_item_id,
    )
    provider = researcher or (lambda concept: _default_researcher(concept, idea_id=idea_id))

    async def _await_deadline(awaitable: Awaitable[Any]) -> Any:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            close = getattr(awaitable, "close", None)
            if callable(close):
                close()
            raise TimeoutError
        task = asyncio.ensure_future(awaitable)
        try:
            return await asyncio.wait_for(asyncio.shield(task), timeout=remaining)
        except asyncio.CancelledError:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                logger.debug("Cancelled async provider task")
            except Exception:
                logger.debug("Cancelled async provider task failed", exc_info=True)
            raise
        except TimeoutError as exc:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                logger.debug("Timed-out async provider task cancelled")
            except Exception:
                logger.debug("Timed-out async provider task failed", exc_info=True)
            raise TimeoutError from exc

    def _consume_task_result(task: asyncio.Future[Any]) -> None:
        """Observe a detached worker result so late failures are not unhandled."""
        if task.cancelled():
            return
        try:
            task.exception()
        except Exception:
            logger.debug("Detached research worker failed", exc_info=True)

    async def _await_thread_deadline(
        awaitable: Awaitable[Any], *, wait_for_cleanup: bool = False
    ) -> Any:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            close = getattr(awaitable, "close", None)
            if callable(close):
                close()
            raise TimeoutError
        task = asyncio.ensure_future(awaitable)
        try:
            return await asyncio.wait_for(asyncio.shield(task), timeout=remaining)
        except asyncio.CancelledError:
            if wait_for_cleanup:
                # Persistence must finish (and roll back atomically) before
                # recording cancellation.
                try:
                    await task
                except asyncio.CancelledError:
                    logger.debug("Cancelled worker task")
                except Exception:
                    logger.debug("Cancelled worker task failed", exc_info=True)
            else:
                # A worker thread cannot be forcefully stopped. Do not block
                # cancellation on a provider that ignores the deadline.
                task.cancel()
                task.add_done_callback(_consume_task_result)
            raise
        except TimeoutError as exc:
            if wait_for_cleanup:
                # Persistence must finish (and roll back atomically) before
                # recording an incomplete state.
                try:
                    await task
                except asyncio.CancelledError:
                    logger.debug("Timed-out worker task cancelled")
                except Exception:
                    logger.debug("Timed-out worker task failed", exc_info=True)
            else:
                # A synchronous provider runs in a non-cancellable executor
                # thread. Return at the deadline and ignore its late result.
                task.cancel()
                task.add_done_callback(_consume_task_result)
            raise TimeoutError from exc

    async def _invoke_provider() -> Any:
        # A synchronous provider must not block the ASGI event loop or evade the
        # wall-clock deadline.
        result = await _await_thread_deadline(asyncio.to_thread(provider, concept))
        if inspect.isawaitable(result):
            return await _await_deadline(result)
        return result

    def _persist_packet(packet: dict[str, Any]) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        with workspace_transaction(idea_id):
            for name in expected:
                if time.monotonic() >= deadline:
                    raise TimeoutError
                evidence = packet[name]
                records.append(
                    save_artifact_revision(
                        idea_id,
                        name,
                        evidence["content"],
                        provenance=evidence["provenance"],
                        evidence_refs=evidence["evidence_refs"],
                        agent_id=agent_id,
                    )
                )
            if time.monotonic() >= deadline:
                raise TimeoutError
        return records

    try:
        packet = await _invoke_provider()
        if time.monotonic() >= deadline:
            raise TimeoutError
        if not isinstance(packet, dict):
            raise ResearchPacketError("Idea Team provider returned a non-object result")
        missing = [name for name in expected if not isinstance(packet.get(name), dict)]
        if missing:
            raise ResearchPacketError(f"Research packet missing artifacts: {', '.join(missing)}")
        for name in expected:
            evidence = packet[name]
            content = evidence.get("content")
            provenance = evidence.get("provenance")
            if not isinstance(content, str) or not content.strip():
                raise ResearchPacketError(f"{name} has no content")
            if not isinstance(provenance, str) or not provenance.strip():
                raise ResearchPacketError(f"{name} has no provenance")
            refs = evidence.get("evidence_refs")
            if (
                not isinstance(refs, list)
                or not refs
                or any(not isinstance(ref, str) or not ref.strip() for ref in refs)
            ):
                raise ResearchPacketError(f"{name} evidence_refs must contain non-empty strings")
        records = await _await_thread_deadline(
            asyncio.to_thread(_persist_packet, packet), wait_for_cleanup=True
        )
        if time.monotonic() >= deadline:
            raise TimeoutError
        return _set_state(
            idea_id,
            "completed",
            artifact_names=expected,
            expected_artifacts=expected,
            completed_artifacts=[record["artifact_name"] for record in records],
            elapsed_sec=round(time.monotonic() - started, 3),
            work_item_id=work_item_id,
        )
    except asyncio.CancelledError:
        _set_state(
            idea_id,
            "cancelled",
            artifact_names=expected,
            expected_artifacts=expected,
            completed_artifacts=[],
            error="research was cancelled",
            work_item_id=work_item_id,
        )
        raise
    except TimeoutError:
        return _set_state(
            idea_id,
            "incomplete",
            artifact_names=expected,
            expected_artifacts=expected,
            completed_artifacts=[],
            error="research time budget exceeded",
            work_item_id=work_item_id,
        )
    except Exception as exc:  # noqa: BLE001 - explicit provider failure state
        return _set_state(
            idea_id,
            "failed",
            artifact_names=expected,
            expected_artifacts=expected,
            completed_artifacts=[],
            error=str(exc),
            retryable=True,
            work_item_id=work_item_id,
        )
