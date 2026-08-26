"""Evidence-gated Idea Team novelty, patentability, and FTO validation."""

from __future__ import annotations

import asyncio
import inspect
import json
import logging
import threading
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

from ...config import settings
from ...storage.artifacts import load_artifact_revisions, save_artifact_revision
from ...storage.idea_workspace import (
    create_idea_folder,
    load_idea_yaml,
    load_validation_metadata,
    save_idea_yaml,
    workspace_transaction,
)
from ...work_items.models import NoveltyAssessmentSummary, ValidationStatus

logger = logging.getLogger(__name__)

VALIDATION_ARTIFACT = "novelty-assessment"
VALIDATION_STATES = (
    "unknown",
    "initializing",
    "running",
    "completed",
    "failed",
    "incomplete",
    "cancelled",
)
Validator = Callable[[str], dict[str, Any] | Awaitable[dict[str, Any]]]
_validation_locks: dict[str, threading.Lock] = {}
_validation_locks_guard = threading.Lock()


def _validation_lock(idea_id: str) -> threading.Lock:
    with _validation_locks_guard:
        return _validation_locks.setdefault(idea_id, threading.Lock())


class NoveltyValidationError(RuntimeError):
    """Raised when evidence or provider output cannot support an assessment."""


def _publish_state(state: dict[str, Any]) -> None:
    try:
        from ...infrastructure.events.stream_bus import _bus

        event = f"validation.{state['state']}"
        payload = {"idea_id": state["idea_id"], "validation": state}
        _bus.publish(event, payload)
        _bus.publish("validation.progress", payload)
    except Exception:
        logger.debug("Unable to publish validation state", exc_info=True)


def _set_state(
    idea_id: str,
    state: str,
    *,
    work_item_id: str | None = None,
    **details: Any,
) -> dict[str, Any]:
    create_idea_folder(idea_id)
    idea = load_idea_yaml(idea_id, "idea.yaml") or {"idea_id": idea_id}
    validation = {
        "state": state,
        "idea_id": idea_id,
        "work_item_id": work_item_id,
        "expected_artifacts": [VALIDATION_ARTIFACT],
        "completed_artifacts": [],
        "updated_at": time.time(),
        **details,
    }
    idea["validation"] = validation
    save_idea_yaml(idea_id, "idea.yaml", idea)
    _publish_state(validation)
    return validation


def _latest_prior_art(idea_id: str) -> dict[str, Any] | None:
    revisions = [
        record
        for record in load_artifact_revisions(idea_id)
        if record.get("artifact_name") == "prior-art"
    ]
    if not revisions:
        return None
    latest = revisions[-1]
    refs = latest.get("evidence_refs")
    if (
        not isinstance(latest.get("content"), str)
        or not latest["content"].strip()
        or not isinstance(refs, list)
        or not refs
        or any(not isinstance(ref, str) or not ref.strip() for ref in refs)
    ):
        return None
    return latest


def _research_is_complete(idea_id: str) -> tuple[bool, str]:
    idea = load_idea_yaml(idea_id, "idea.yaml")
    research = idea.get("research") if isinstance(idea, dict) else None
    if not isinstance(research, dict) or research.get("state") != "completed":
        return False, "Story 11.1 research is missing or incomplete"
    completed = research.get("completed_artifacts", [])
    if not isinstance(completed, list) or "prior-art" not in completed:
        return False, "Completed research has no prior-art artifact"
    if _latest_prior_art(idea_id) is None:
        return False, "Usable prior-art references are required before validation"
    return True, ""


async def _default_validator(context: str, *, idea_id: str) -> dict[str, Any]:
    from ...orchestrator.supervisor import invoke_idea_team_validation

    try:
        result = await invoke_idea_team_validation(context, idea_id=idea_id)
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
        if isinstance(content, dict):
            return content
        if not isinstance(content, str):
            content = getattr(content, "content", content)
        if not isinstance(content, str):
            raise NoveltyValidationError("Idea Team returned no structured validation output")
        decoded = json.loads(content)
        if not isinstance(decoded, dict):
            raise NoveltyValidationError("Idea Team returned a non-object assessment")
        return decoded
    except NoveltyValidationError:
        raise
    except Exception as exc:
        raise NoveltyValidationError(f"Idea Team provider failed: {exc}") from exc


def _normalize_provider_output(
    output: dict[str, Any] | str, *, agent_id: str, assessed_at: str
) -> NoveltyAssessmentSummary:
    if isinstance(output, str):
        try:
            output = json.loads(output)
        except json.JSONDecodeError as exc:
            raise NoveltyValidationError("Idea Team returned invalid JSON") from exc
    if not isinstance(output, dict):
        raise NoveltyValidationError("Idea Team returned a non-object assessment")
    data = dict(output.get("assessment", output.get("validation", output)))
    # Story 11.1 calls source citations evidence_refs; accept that spelling at
    # this boundary while keeping one canonical API/storage field.
    if "source_refs" not in data and "evidence_refs" in data:
        data["source_refs"] = data["evidence_refs"]
    data.pop("evidence_refs", None)
    if "prior_art_refs" not in data and "prior_art_references" in data:
        data["prior_art_refs"] = data["prior_art_references"]
    data.pop("prior_art_references", None)
    if "assessed_at" not in data and "timestamp" in data:
        data["assessed_at"] = data["timestamp"]
    data.pop("timestamp", None)
    data["agent_id"] = agent_id
    data["assessed_at"] = assessed_at
    data.setdefault("artifact_name", VALIDATION_ARTIFACT)
    try:
        return NoveltyAssessmentSummary.model_validate(data)
    except Exception as exc:
        raise NoveltyValidationError(f"Invalid novelty assessment: {exc}") from exc


def _assessment_markdown(summary: NoveltyAssessmentSummary) -> str:
    refs = "\n".join(f"- {ref}" for ref in summary.prior_art_refs)
    sources = "\n".join(f"- {ref}" for ref in summary.source_refs)
    return (
        "# Novelty and Patentability Assessment\n\n"
        "> Decision-support artifact; not legal advice or a definitive patent/FTO opinion.\n\n"
        f"- **Novelty score:** {summary.novelty_score}/10\n"
        f"- **Patentability score:** {summary.patentability_score}/10\n"
        f"- **Patentability outcome:** {summary.patentability_outcome}\n"
        f"- **FTO risk:** {summary.fto_risk}\n"
        f"- **Confidence:** {summary.confidence}/10\n"
        f"- **Agent:** {summary.agent_id}\n"
        f"- **Assessed at:** {summary.assessed_at}\n\n"
        "## FTO analysis\n\n"
        f"{summary.fto_analysis}\n\n"
        "## Rationale\n\n"
        f"{summary.rationale}\n\n"
        f"## Prior-art references\n\n{refs}\n\n"
        f"## Source references\n\n{sources}\n\n"
        f"## Provenance\n\n{summary.provenance}\n"
    )


async def run_idea_validation(
    idea_id: str,
    concept: str = "",
    *,
    validator: Validator | None = None,
    time_budget_sec: int | None = None,
    agent_id: str = "idea-team-validator",
    work_item_id: str | None = None,
) -> dict[str, Any]:
    """Run an evidence-gated validation and atomically persist one revision."""
    configured_budget = (
        getattr(settings, "validation_time_budget_sec", None)
        or settings.research_time_budget_sec
    )
    budget = min(time_budget_sec, configured_budget) if time_budget_sec is not None else configured_budget
    if budget <= 0:
        raise ValueError("validation time budget must be positive")
    started = time.monotonic()
    deadline = started + budget
    expected = [VALIDATION_ARTIFACT]
    _set_state(
        idea_id,
        "initializing",
        work_item_id=work_item_id,
        expected_artifacts=expected,
        agent_id=agent_id,
    )
    usable, reason = _research_is_complete(idea_id)
    if not usable:
        return _set_state(
            idea_id,
            "failed",
            work_item_id=work_item_id,
            error=reason,
            retryable=False,
            expected_artifacts=expected,
        )
    _set_state(
        idea_id,
        "running",
        work_item_id=work_item_id,
        expected_artifacts=expected,
        agent_id=agent_id,
    )
    prior_art = _latest_prior_art(idea_id)
    assert prior_art is not None  # gated immediately above
    context = (
        f"Concept:\n{concept}\n\n"
        f"Prior-art research artifact:\n{prior_art['content']}\n\n"
        f"Prior-art evidence references:\n{json.dumps(prior_art['evidence_refs'])}"
    )
    provider = validator or (lambda value: _default_validator(value, idea_id=idea_id))

    async def _invoke() -> Any:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError
        if inspect.iscoroutinefunction(provider):
            return await asyncio.wait_for(provider(context), timeout=remaining)
        result = await asyncio.wait_for(asyncio.to_thread(provider, context), timeout=remaining)
        if inspect.isawaitable(result):
            return await asyncio.wait_for(result, timeout=max(0.001, deadline - time.monotonic()))
        return result

    async def _persist_with_deadline(summary: NoveltyAssessmentSummary) -> dict[str, Any]:
        """Persist on a worker while cancellation waits for atomic cleanup."""
        def persist() -> dict[str, Any]:
            markdown = _assessment_markdown(summary)
            with _validation_lock(idea_id), workspace_transaction(idea_id):
                if time.monotonic() >= deadline:
                    raise TimeoutError
                record = save_artifact_revision(
                    idea_id,
                    VALIDATION_ARTIFACT,
                    markdown,
                    provenance=summary.provenance,
                    evidence_refs=[*summary.source_refs, *summary.prior_art_refs],
                    agent_id=summary.agent_id,
                )
                if time.monotonic() >= deadline:
                    raise TimeoutError
                persisted_summary = summary.model_copy(update={"artifact_version": record["version"]})
                idea = load_idea_yaml(idea_id, "idea.yaml") or {"idea_id": idea_id}
                validation = {
                    "state": "completed",
                    "idea_id": idea_id,
                    "work_item_id": work_item_id,
                    "expected_artifacts": expected,
                    "completed_artifacts": [VALIDATION_ARTIFACT],
                    "updated_at": time.time(),
                    "elapsed_sec": round(time.monotonic() - started, 3),
                    "summary": persisted_summary.model_dump(),
                    "artifact": {
                        "artifact_name": VALIDATION_ARTIFACT,
                        "version": record["version"],
                        "file_name": record["file_name"],
                        "path": record["path"],
                        "provenance": record["provenance"],
                    },
                }
                idea["validation"] = validation
                save_idea_yaml(idea_id, "idea.yaml", idea)
            return validation

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError
        task = asyncio.create_task(asyncio.to_thread(persist))
        try:
            return await asyncio.wait_for(asyncio.shield(task), timeout=remaining)
        except (asyncio.CancelledError, TimeoutError):
            # A worker thread cannot be forcefully stopped. Wait until the
            # workspace transaction has either committed or rolled back.
            try:
                await task
            except Exception:
                logger.debug("Validation persistence cleanup failed", exc_info=True)
            raise

    try:
        output = await _invoke()
        if time.monotonic() >= deadline:
            raise TimeoutError
        summary = _normalize_provider_output(
            output,
            agent_id=agent_id,
            assessed_at=datetime.now(UTC).isoformat(),
        )
        prior_refs = set(prior_art["evidence_refs"])
        if any(ref not in prior_refs for ref in summary.prior_art_refs):
            raise NoveltyValidationError("Prior-art references must match supplied research evidence")
        validation = await _persist_with_deadline(summary)
        _publish_state(validation)
        return validation
    except asyncio.CancelledError:
        return _set_state(
            idea_id,
            "cancelled",
            work_item_id=work_item_id,
            error="validation was cancelled",
            retryable=True,
            expected_artifacts=expected,
        )
    except TimeoutError:
        return _set_state(
            idea_id,
            "incomplete",
            work_item_id=work_item_id,
            error="validation time budget exceeded",
            retryable=True,
            expected_artifacts=expected,
        )
    except Exception as exc:  # noqa: BLE001 - explicit provider/validation failure
        return _set_state(
            idea_id,
            "failed",
            work_item_id=work_item_id,
            error=str(exc),
            retryable=True,
            expected_artifacts=expected,
        )


def validation_status(idea_id: str, work_item_id: str | None = None) -> dict[str, Any]:
    """Read persisted validation metadata without parsing the Markdown artifact."""
    validation = load_validation_metadata(idea_id)
    if not isinstance(validation, dict):
        return ValidationStatus(
            state="unknown", idea_id=idea_id, work_item_id=work_item_id
        ).model_dump()
    return ValidationStatus.model_validate(
        {**validation, "idea_id": idea_id, "work_item_id": work_item_id or validation.get("work_item_id")}
    ).model_dump()
