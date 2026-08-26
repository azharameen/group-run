"""Prerequisite-gated Product Team product-definition generation."""

import asyncio
import inspect
import logging
import threading
import time
import uuid
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ... import config as app_config
from ...config import settings
from ...storage.artifacts import load_artifact_revisions, save_artifact_revision
from ...storage.base import read_yaml, write_yaml
from ...storage.idea_workspace import (
    create_idea_folder,
    load_idea_yaml,
    save_idea_yaml,
    workspace_transaction,
)
from ...work_items import service as work_item_service
from ...work_items.product_definition_models import ProductDefinitionStatus
from .product_definition_support import (
    ProductDefinitionError,
    definition_evidence,
    definition_markdown,
    invoke_product_team,
    normalize_definition,
)

logger = logging.getLogger(__name__)
PRODUCT_DEFINITION_ARTIFACT = "product-definition"
Provider = Callable[[str], dict[str, Any] | Awaitable[dict[str, Any]]]


class GenerationSuperseded(RuntimeError):
    """Raised when another worker owns a newer generation token."""


_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()
_generation_locks: dict[str, "_GenerationLockEntry"] = {}
_generation_locks_guard = threading.Lock()


@dataclass
class _GenerationLockEntry:
    lock: asyncio.Lock
    users: int = 0


@asynccontextmanager
async def _generation_lock(idea_id: str):
    """Serialize the complete generation lifecycle for one idea."""
    with _generation_locks_guard:
        entry = _generation_locks.get(idea_id)
        if entry is None:
            entry = _GenerationLockEntry(asyncio.Lock())
            _generation_locks[idea_id] = entry
        entry.users += 1
    acquired = False
    try:
        await entry.lock.acquire()
        acquired = True
        yield
    finally:
        if acquired:
            entry.lock.release()
        with _generation_locks_guard:
            entry.users -= 1
            if entry.users == 0 and not entry.lock.locked() and _generation_locks.get(idea_id) is entry:
                _generation_locks.pop(idea_id, None)


generation_lock = _generation_lock


def _lock(idea_id: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(idea_id, threading.Lock())


def _publish(state: dict[str, Any]) -> None:
    try:
        from ...infrastructure.events.stream_bus import _bus

        payload = {"idea_id": state["idea_id"], "product_definition": state}
        _bus.publish(f"product-definition.{state['state']}", payload)
        _bus.publish("product-definition.progress", payload)
    except Exception:
        logger.debug("Unable to publish product-definition state", exc_info=True)


def _set_state(
    idea_id: str, state: str, *, work_item_id: str, **details: Any
) -> dict[str, Any]:
    generation_token = details.get("generation_token")
    with _lock(idea_id):
        create_idea_folder(idea_id)
        idea = load_idea_yaml(idea_id, "idea.yaml") or {"idea_id": idea_id}
        existing = idea.get("product_definition")
        if (
            state != "completed"
            and isinstance(existing, dict)
            and existing.get("state") == "completed"
            and (
                state != "initializing"
                or existing.get("approval_state") == "approved"
            )
        ):
            # A completed revision is terminal until a new generation has
            # explicitly claimed it.  Cleanup must never downgrade success.
            return existing
        if (
            state == "initializing"
            and isinstance(existing, dict)
            and existing.get("approval_state") == "approved"
        ):
            # An approved handoff is immutable; a late generation cannot
            # reset its approval metadata.
            return existing
        if (
            state != "initializing"
            and generation_token
            and isinstance(existing, dict)
            and existing.get("generation_token")
            and existing.get("generation_token") != generation_token
        ):
            return existing
        previous_summary = None
        previous_artifact = None
        if isinstance(existing, dict):
            previous_summary = existing.get("previous_success_summary") or (
                existing.get("summary") if existing.get("state") == "completed" else None
            )
            previous_artifact = existing.get("previous_success_artifact") or (
                existing.get("artifact") if existing.get("state") == "completed" else None
            )
        status = {
            "state": state,
            "idea_id": idea_id,
            "work_item_id": work_item_id,
            "expected_artifacts": [PRODUCT_DEFINITION_ARTIFACT],
            "completed_artifacts": [],
            "approval_state": "unreviewed",
            "updated_at": time.time(),
            **details,
        }
        if state != "completed" and previous_summary is not None:
            status["summary"] = previous_summary
            status["artifact"] = previous_artifact
            status["previous_success_summary"] = previous_summary
            status["previous_success_artifact"] = previous_artifact
        idea["product_definition"] = status
        save_idea_yaml(idea_id, "idea.yaml", idea)
    _publish(status)
    return status


def _unmapped_status_path() -> Path:
    return Path(app_config.WORKSPACE_DIR) / "product-definition-status.yaml"


def record_unmapped_product_definition_failure(
    work_item_id: str, failure: dict[str, Any]
) -> dict[str, Any]:
    """Persist a product-definition failure when no idea mapping exists."""
    path = _unmapped_status_path()
    with _locks_guard:
        statuses = read_yaml(str(path)) if path.exists() else {}
        if not isinstance(statuses, dict):
            statuses = {}
        statuses[work_item_id] = failure
        write_yaml(str(path), statuses)
    return failure


def unmapped_product_definition_status(work_item_id: str) -> dict[str, Any]:
    """Read the durable status for a work item without an idea mapping."""
    path = _unmapped_status_path()
    with _locks_guard:
        statuses = read_yaml(str(path)) if path.exists() else {}
    status = statuses.get(work_item_id) if isinstance(statuses, dict) else None
    if isinstance(status, dict):
        return ProductDefinitionStatus.model_validate(status).model_dump()
    return ProductDefinitionStatus(
        state="unknown", idea_id="", work_item_id=work_item_id
    ).model_dump()


def _completed_assessment(idea_id: str) -> dict[str, Any] | None:
    idea = load_idea_yaml(idea_id, "idea.yaml")
    validation = idea.get("validation") if isinstance(idea, dict) else None
    if not isinstance(validation, dict) or validation.get("state") != "completed":
        return None
    if "novelty-assessment" not in validation.get("completed_artifacts", []):
        return None
    revisions = [
        item
        for item in load_artifact_revisions(idea_id)
        if item.get("artifact_name") == "novelty-assessment"
    ]
    if not revisions:
        return None
    latest = revisions[-1]
    summary = validation.get("summary")
    expected_version = summary.get("artifact_version") if isinstance(summary, dict) else None
    refs = latest.get("evidence_refs")
    if expected_version not in (None, latest.get("version")):
        return None
    if not isinstance(refs, list) or not refs or not latest.get("content"):
        return None
    return latest


async def generate_product_definition(
    idea_id: str,
    work_item_id: str,
    concept: str,
    *,
    provider: Provider | None = None,
    time_budget_sec: int | None = None,
    agent_id: str = "product-team",
) -> dict[str, Any]:
    async with _generation_lock(idea_id):
        return await _generate_product_definition(
            idea_id,
            work_item_id,
            concept,
            provider=provider,
            time_budget_sec=time_budget_sec,
            agent_id=agent_id,
        )


async def _generate_product_definition(
    idea_id: str,
    work_item_id: str,
    concept: str,
    *,
    provider: Provider | None = None,
    time_budget_sec: int | None = None,
    agent_id: str = "product-team",
) -> dict[str, Any]:
    """Generate and atomically persist one strict product-definition revision."""
    configured = settings.validation_time_budget_sec or settings.research_time_budget_sec
    budget = min(time_budget_sec, configured) if time_budget_sec is not None else configured
    if budget <= 0:
        raise ValueError("product-definition time budget must be positive")
    started = time.monotonic()
    deadline = started + budget
    generation_token = str(uuid.uuid4())
    item_task = asyncio.create_task(work_item_service.get_work_item(work_item_id))
    cancelled_while_validating = False
    try:
        item = await asyncio.shield(item_task)
    except asyncio.CancelledError:
        cancelled_while_validating = True
        item = await item_task
    existing_idea = load_idea_yaml(idea_id, "idea.yaml") or {}
    existing_status = existing_idea.get("product_definition")
    if (
        isinstance(existing_status, dict)
        and existing_status.get("approval_state") == "approved"
    ):
        # The item may already be in development after a successful handoff.
        # Read and preserve the audited status instead of starting a new run.
        return ProductDefinitionStatus.model_validate(
            {**existing_status, "idea_id": idea_id, "work_item_id": work_item_id}
        ).model_dump()
    if cancelled_while_validating:
        return _set_state(
            idea_id,
            "cancelled",
            work_item_id=work_item_id,
            error="generation was cancelled",
            retryable=True,
        )
    if item is None:
        return _set_state(
            idea_id,
            "failed",
            work_item_id=work_item_id,
            error=f"Work item {work_item_id} not found",
            retryable=False,
            generation_token=generation_token,
        )
    if item.status != "product_definition":
        return _set_state(
            idea_id,
            "failed",
            work_item_id=work_item_id,
            error="Work item must be in product_definition before generation",
            retryable=False,
            generation_token=generation_token,
        )
    assessment = _completed_assessment(idea_id)
    if assessment is None:
        return _set_state(
            idea_id,
            "failed",
            work_item_id=work_item_id,
            error="A completed Story 11.2 assessment is required",
            retryable=False,
            generation_token=generation_token,
        )
    initial_status = _set_state(
        idea_id,
        "initializing",
        work_item_id=work_item_id,
        agent_id=agent_id,
        generation_token=generation_token,
    )
    if initial_status.get("approval_state") == "approved":
        return initial_status
    running_status = _set_state(
        idea_id,
        "running",
        work_item_id=work_item_id,
        agent_id=agent_id,
        generation_token=generation_token,
    )
    if running_status.get("approval_state") == "approved":
        return running_status
    context = (
        f"Validated concept:\n{concept}\n\nCompleted novelty assessment:\n"
        f"{assessment['content']}\n\nAllowed evidence references:\n"
        f"{assessment['evidence_refs']}"
    )
    boundary = provider or (lambda value: invoke_product_team(value, idea_id=idea_id))

    async def invoke() -> Any:
        remaining = deadline - time.monotonic()
        if inspect.iscoroutinefunction(boundary):
            return await asyncio.wait_for(boundary(context), timeout=remaining)
        result = await asyncio.wait_for(asyncio.to_thread(boundary, context), timeout=remaining)
        if inspect.isawaitable(result):
            return await asyncio.wait_for(result, timeout=max(0.001, deadline - time.monotonic()))
        return result

    def persist(summary) -> dict[str, Any]:
        with _lock(idea_id), workspace_transaction(idea_id):
            current = load_idea_yaml(idea_id, "idea.yaml") or {}
            current_status = current.get("product_definition")
            if (
                not isinstance(current_status, dict)
                or current_status.get("generation_token") != generation_token
            ):
                raise GenerationSuperseded
            record = save_artifact_revision(
                idea_id,
                PRODUCT_DEFINITION_ARTIFACT,
                definition_markdown(summary),
                provenance=summary.provenance,
                evidence_refs=sorted(definition_evidence(summary)),
                agent_id=summary.agent_id,
            )
            persisted = summary.model_copy(update={"artifact_version": record["version"]})
            status = {
                "state": "completed",
                "idea_id": idea_id,
                "work_item_id": work_item_id,
                "expected_artifacts": [PRODUCT_DEFINITION_ARTIFACT],
                "completed_artifacts": [PRODUCT_DEFINITION_ARTIFACT],
                "approval_state": "unreviewed",
                "updated_at": time.time(),
                "elapsed_sec": round(time.monotonic() - started, 3),
                "generation_token": generation_token,
                "summary": persisted.model_dump(),
                "artifact": {key: record[key] for key in ("artifact_name", "version", "file_name", "path", "provenance")},
            }
            idea = load_idea_yaml(idea_id, "idea.yaml") or {"idea_id": idea_id}
            idea["product_definition"] = status
            save_idea_yaml(idea_id, "idea.yaml", idea)
            return status

    try:
        output = await invoke()
        summary = normalize_definition(output, agent_id=agent_id)
        allowed = set(assessment["evidence_refs"])
        if not definition_evidence(summary).issubset(allowed):
            raise ProductDefinitionError(
                "All references must match supplied assessment evidence"
            )
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError
        task = asyncio.create_task(asyncio.to_thread(persist, summary))
        try:
            status = await asyncio.wait_for(asyncio.shield(task), timeout=remaining)
        except (asyncio.CancelledError, TimeoutError):
            try:
                status = await task
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.debug("Product-definition persistence cleanup failed", exc_info=True)
                raise
            else:
                # The persistence worker may have committed just as the
                # caller timed out or was cancelled.  Preserve that durable
                # completed result rather than writing an inaccurate terminal
                # state over it.
                _publish(status)
                return status
        _publish(status)
        return status
    except asyncio.CancelledError:
        return _set_state(idea_id, "cancelled", work_item_id=work_item_id, error="generation was cancelled", retryable=True, generation_token=generation_token)
    except GenerationSuperseded:
        return product_definition_status(idea_id, work_item_id)
    except TimeoutError:
        return _set_state(idea_id, "incomplete", work_item_id=work_item_id, error="generation time budget exceeded", retryable=True, generation_token=generation_token)
    except Exception as exc:  # noqa: BLE001 - provider failures are explicit terminal states
        return _set_state(idea_id, "failed", work_item_id=work_item_id, error=str(exc), retryable=True, generation_token=generation_token)


def product_definition_status(idea_id: str, work_item_id: str | None = None) -> dict[str, Any]:
    """Read product-definition metadata without parsing Markdown."""
    idea = load_idea_yaml(idea_id, "idea.yaml")
    status = idea.get("product_definition") if isinstance(idea, dict) else None
    if not isinstance(status, dict):
        return ProductDefinitionStatus(
            state="unknown", idea_id=idea_id, work_item_id=work_item_id
        ).model_dump()
    return ProductDefinitionStatus.model_validate(
        {**status, "idea_id": idea_id, "work_item_id": work_item_id or status.get("work_item_id")}
    ).model_dump()
