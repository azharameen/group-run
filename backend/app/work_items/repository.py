"""PostgreSQL repository for work items and routing decisions (Story 8.2).

Full async implementation using SQLAlchemy AsyncSession with a shared connection pool.
"""

import json
import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from ..db.session import get_session_factory
from .models import LIFECYCLE_PHASES

_OPEN_LIFECYCLE_PHASES = tuple(phase for phase in LIFECYCLE_PHASES if phase != "monitoring")


# ── Internal helpers ──────────────────────────────────────────────────────


def _deserialize(row: dict[str, Any], *json_fields: str) -> dict[str, Any]:
    """Deserialize JSON string fields in a row dict."""
    for field in json_fields:
        if field in row:
            val = row[field]
            if isinstance(val, str):
                try:
                    row[field] = json.loads(val)
                except (json.JSONDecodeError, TypeError):
                    row[field] = []
            elif val is None:
                row[field] = []
    return row


# ── Work Items ─────────────────────────────────────────────────────────────


async def insert_work_item(item: dict[str, Any], routing: dict[str, Any]) -> None:
    """Insert a work item and its routing decision in one transaction."""
    async with get_session_factory()() as session:
        try:
            await session.execute(
                text(
                    "INSERT INTO work_items "
                    "(work_item_id, org_id, title, description, status, owner_agent_id, "
                    "source, created_at, updated_at, department_id, template_id) "
                    "VALUES (:work_item_id, :org_id, :title, :description, :status, "
                    ":owner_agent_id, :source, :created_at, :updated_at, :department_id, :template_id)"
                ),
                {
                    "work_item_id": item["work_item_id"],
                    "org_id": item["org_id"],
                    "title": item["title"],
                    "description": item["description"],
                    "status": item["status"],
                    "owner_agent_id": item["owner_agent_id"],
                    "source": item["source"],
                    "created_at": item["created_at"],
                    "updated_at": item["updated_at"],
                    "department_id": routing["department_id"],
                    "template_id": item.get("template_id"),
                },
            )
            await session.execute(
                text(
                    "INSERT INTO routing_decisions "
                    "(work_item_id, department_id, decided_by, decided_at, confidence, reasoning, alternatives) "
                    "VALUES (:work_item_id, :department_id, :decided_by, :decided_at, "
                    ":confidence, :reasoning, :alternatives)"
                ),
                {
                    "work_item_id": item["work_item_id"],
                    "department_id": routing["department_id"],
                    "decided_by": routing["decided_by"],
                    "decided_at": routing["decided_at"],
                    "confidence": routing["confidence"],
                    "reasoning": routing["reasoning"],
                    "alternatives": json.dumps(routing["alternatives"]),
                },
            )
            await _insert_decision_within_session(
                session,
                {
                    "decision_id": str(uuid.uuid4()),
                    "work_item_id": item["work_item_id"],
                    "agent_id": routing["decided_by"],
                    "decision_type": "routing",
                    "reasoning": routing["reasoning"],
                    "evidence": [],
                    "confidence": routing["confidence"],
                    "alternatives": routing["alternatives"],
                    "decided_at": routing["decided_at"],
                },
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_work_item_rows(work_item_id: str) -> dict[str, Any] | None:
    """Return the work item and routing decision rows, or None."""
    async with get_session_factory()() as session:
        item_result = await session.execute(
            text("SELECT * FROM work_items WHERE work_item_id = :id"),
            {"id": work_item_id},
        )
        item = item_result.mappings().one_or_none()
        if item is None:
            return None
        routing_result = await session.execute(
            text("SELECT * FROM routing_decisions WHERE work_item_id = :id"),
            {"id": work_item_id},
        )
        routing = routing_result.mappings().one_or_none()
    return {"item": dict(item), "routing": dict(routing) if routing else None}


async def list_work_items_with_routing(org_id: str | None = None) -> list[dict[str, Any]]:
    """Return work items (newest first) paired with their routing rows."""
    async with get_session_factory()() as session:
        if org_id is None:
            item_result = await session.execute(
                text("SELECT * FROM work_items ORDER BY created_at DESC, work_item_id DESC")
            )
        else:
            item_result = await session.execute(
                text(
                    "SELECT * FROM work_items WHERE org_id = :org_id "
                    "ORDER BY created_at DESC, work_item_id DESC"
                ),
                {"org_id": org_id},
            )
        items = [dict(r) for r in item_result.mappings()]

        if not items:
            return []

        ids = [it["work_item_id"] for it in items]
        placeholders = ", ".join(f":id_{i}" for i in range(len(ids)))
        routing_result = await session.execute(
            text(f"SELECT * FROM routing_decisions WHERE work_item_id IN ({placeholders})"),
            {f"id_{i}": wid for i, wid in enumerate(ids)},
        )
        routing_map = {r["work_item_id"]: dict(r) for r in routing_result.mappings()}

    return [{"item": it, "routing": routing_map.get(it["work_item_id"])} for it in items]


async def count_open_work_items_by_department(org_id: str) -> dict[str, int]:
    """Count open items per department for one organization."""
    placeholders = ", ".join(f":ph_{i}" for i in range(len(_OPEN_LIFECYCLE_PHASES)))
    params = {"org_id": org_id}
    params.update({f"ph_{i}": ph for i, ph in enumerate(_OPEN_LIFECYCLE_PHASES)})
    async with get_session_factory()() as session:
        result = await session.execute(
            text(
                f"SELECT department_id, COUNT(*) AS n FROM work_items "
                f"WHERE org_id = :org_id AND status IN ({placeholders}) "
                f"GROUP BY department_id"
            ),
            params,
        )
        return {r["department_id"]: r["n"] for r in result.mappings()}


# ── Decisions ─────────────────────────────────────────────────────────────


async def _insert_decision_within_session(session: Any, decision: dict[str, Any]) -> None:
    """Insert a decision within an already-open session (no commit)."""
    await session.execute(
        text(
            "INSERT INTO decisions "
            "(decision_id, work_item_id, agent_id, decision_type, reasoning, "
            "evidence, confidence, alternatives, decided_at) "
            "VALUES (:decision_id, :work_item_id, :agent_id, :decision_type, :reasoning, "
            ":evidence, :confidence, :alternatives, :decided_at)"
        ),
        {
            "decision_id": decision["decision_id"],
            "work_item_id": decision["work_item_id"],
            "agent_id": decision["agent_id"],
            "decision_type": decision["decision_type"],
            "reasoning": decision["reasoning"],
            "evidence": json.dumps(decision.get("evidence", [])),
            "confidence": decision["confidence"],
            "alternatives": json.dumps(decision.get("alternatives", [])),
            "decided_at": decision["decided_at"],
        },
    )


async def insert_decision(decision: dict[str, Any]) -> None:
    """Insert an agent decision record."""
    async with get_session_factory()() as session:
        try:
            await _insert_decision_within_session(session, decision)
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def list_decisions(
    work_item_id: str | None = None,
    agent_id: str | None = None,
    from_ts: str | None = None,
    to_ts: str | None = None,
) -> list[dict[str, Any]]:
    """Return decision records, optionally filtered."""
    clauses, params = [], {}
    for column, value, operator in (
        ("work_item_id", work_item_id, "="),
        ("agent_id", agent_id, "="),
        ("decided_at", from_ts, ">="),
        ("decided_at", to_ts, "<="),
    ):
        if value is not None:
            key = f"p_{column}_{operator.replace('>', 'gt').replace('<', 'lt').replace('=', 'eq')}"
            clauses.append(f"{column} {operator} :{key}")
            params[key] = value

    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    async with get_session_factory()() as session:
        result = await session.execute(
            text(f"SELECT * FROM decisions{where} ORDER BY decided_at ASC, decision_id ASC"),
            params,
        )
        rows = [dict(r) for r in result.mappings()]
    for row in rows:
        _deserialize(row, "evidence", "alternatives")
    return rows


# ── Templates ─────────────────────────────────────────────────────────────


async def insert_template(
    template_id: str,
    org_id: str,
    name: str,
    source_work_item_id: str,
    phases: list[str],
    departments: list[str],
    created_at: str,
) -> None:
    """Insert a workflow template."""
    async with get_session_factory()() as session:
        try:
            await session.execute(
                text(
                    "INSERT INTO workflow_templates "
                    "(template_id, org_id, name, source_work_item_id, phases, departments, "
                    "usage_count, created_at, last_used_at) "
                    "VALUES (:template_id, :org_id, :name, :source_work_item_id, :phases, "
                    ":departments, 0, :created_at, NULL)"
                ),
                {
                    "template_id": template_id,
                    "org_id": org_id,
                    "name": name,
                    "source_work_item_id": source_work_item_id,
                    "phases": json.dumps(phases),
                    "departments": json.dumps(departments),
                    "created_at": created_at,
                },
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def list_templates(org_id: str) -> list[dict[str, Any]]:
    """List all templates for an organization."""
    async with get_session_factory()() as session:
        result = await session.execute(
            text(
                "SELECT * FROM workflow_templates WHERE org_id = :org_id "
                "ORDER BY created_at DESC"
            ),
            {"org_id": org_id},
        )
        rows = [dict(r) for r in result.mappings()]
    for row in rows:
        _deserialize(row, "phases", "departments")
    return rows


async def get_template(template_id: str) -> dict[str, Any] | None:
    """Fetch a single template by id, or None."""
    async with get_session_factory()() as session:
        result = await session.execute(
            text("SELECT * FROM workflow_templates WHERE template_id = :id"),
            {"id": template_id},
        )
        row = result.mappings().one_or_none()
    if row is None:
        return None
    data = dict(row)
    _deserialize(data, "phases", "departments")
    return data


async def record_template_usage(template_id: str, now: str) -> None:
    """Increment usage_count and set last_used_at for a template."""
    async with get_session_factory()() as session:
        try:
            await session.execute(
                text(
                    "UPDATE workflow_templates "
                    "SET usage_count = usage_count + 1, last_used_at = :now "
                    "WHERE template_id = :id"
                ),
                {"now": now, "id": template_id},
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ── Reviews ───────────────────────────────────────────────────────────────


async def insert_review(review: dict[str, Any], decision: dict[str, Any]) -> None:
    """Insert an accuracy review and its companion decision in one transaction."""
    async with get_session_factory()() as session:
        try:
            await session.execute(
                text(
                    "INSERT INTO accuracy_reviews "
                    "(review_id, work_item_id, reviewer, accuracy_score, summary, "
                    "flagged_for_review, reviewed_at) "
                    "VALUES (:review_id, :work_item_id, :reviewer, :accuracy_score, "
                    ":summary, :flagged_for_review, :reviewed_at)"
                ),
                {
                    "review_id": review["review_id"],
                    "work_item_id": review["work_item_id"],
                    "reviewer": review["reviewer"],
                    "accuracy_score": review["accuracy_score"],
                    "summary": review["summary"],
                    "flagged_for_review": bool(review["flagged_for_review"]),
                    "reviewed_at": review["reviewed_at"],
                },
            )
            await _insert_decision_within_session(session, decision)
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def list_reviews(work_item_id: str) -> list[dict[str, Any]]:
    """Return accuracy review rows for one item, oldest reviewed first."""
    async with get_session_factory()() as session:
        result = await session.execute(
            text(
                "SELECT * FROM accuracy_reviews WHERE work_item_id = :id "
                "ORDER BY reviewed_at ASC, review_id ASC"
            ),
            {"id": work_item_id},
        )
        return [dict(r) for r in result.mappings()]


# ── Lifecycle (delegated from lifecycle_repository) ───────────────────────


async def insert_lifecycle_event(event: dict[str, Any]) -> None:
    from . import lifecycle_repository
    await lifecycle_repository.insert_lifecycle_event(event)


async def list_lifecycle_events(work_item_id: str) -> list[dict[str, Any]]:
    from . import lifecycle_repository
    return await lifecycle_repository.list_lifecycle_events(work_item_id)


async def update_work_item_status(
    work_item_id: str,
    status: str,
    department_id: str,
    updated_at: str,
    expected_status: str | None = None,
) -> None:
    from . import lifecycle_repository
    await lifecycle_repository.update_work_item_status(
        work_item_id, status, department_id, updated_at, expected_status=expected_status
    )


async def record_transition(
    work_item_id: str,
    status: str,
    department_id: str,
    updated_at: str,
    event: dict[str, Any],
    expected_status: str | None = None,
    decision: dict[str, Any] | None = None,
) -> None:
    from . import lifecycle_repository
    await lifecycle_repository.record_transition(
        work_item_id, status, department_id, updated_at, event,
        expected_status=expected_status, decision=decision,
    )


async def record_reassignment(
    work_item_id: str,
    owner_agent_id: str,
    updated_at: str,
    event: dict[str, Any],
    previous_owner_agent_id: str | None = None,
) -> None:
    from . import lifecycle_repository
    await lifecycle_repository.record_reassignment(
        work_item_id, owner_agent_id, updated_at, event,
        previous_owner_agent_id=previous_owner_agent_id,
    )


async def insert_org_alert(alert: dict[str, Any]) -> None:
    from . import lifecycle_repository
    await lifecycle_repository.insert_org_alert(alert)


async def list_org_alerts(org_id: str) -> list[dict[str, Any]]:
    from . import lifecycle_repository
    return await lifecycle_repository.list_org_alerts(org_id)


async def has_org_alert(org_id: str, work_item_id: str, phase: str) -> bool:
    from . import lifecycle_repository
    return await lifecycle_repository.has_org_alert(org_id, work_item_id, phase)


async def record_escalation(alert: dict[str, Any], event: dict[str, Any]) -> None:
    from . import lifecycle_repository
    await lifecycle_repository.record_escalation(alert, event)
