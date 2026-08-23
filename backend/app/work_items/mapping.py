"""Conversion of repository rows to public work-item models."""

import json
from typing import Any

from .models import DecisionRecord, RoutingDecision, WorkItem


def _parse_alternatives(raw: object) -> list[str]:
    """Decode a persisted alternatives JSON column, tolerating corrupt data."""
    try:
        value = json.loads(raw if isinstance(raw, str) else "[]")
        return value if isinstance(value, list) else []
    except (TypeError, ValueError):
        return []


def row_to_work_item(rows: dict[str, Any]) -> WorkItem | None:
    item, routing = rows["item"], rows["routing"]
    item_keys = item.keys()
    if routing is None:
        return None
    return WorkItem(
        work_item_id=item["work_item_id"], org_id=item["org_id"], title=item["title"],
        description=item["description"], status=item["status"],
        owner_agent_id=item["owner_agent_id"], source=item["source"],
        department_id=(
            item["department_id"] if "department_id" in item_keys else routing["department_id"]
        ),
        template_id=item["template_id"] if "template_id" in item_keys else None,
        routing=RoutingDecision(
            department_id=routing["department_id"], decided_by=routing["decided_by"],
            decided_at=routing["decided_at"], confidence=routing["confidence"],
            reasoning=routing["reasoning"], alternatives=_parse_alternatives(routing["alternatives"]),
        ),
        created_at=item["created_at"], updated_at=item["updated_at"],
    )


def row_to_decision(row: Any) -> DecisionRecord:
    def parse(value: object) -> list[str]:
        try:
            decoded = json.loads(value if isinstance(value, str) else "[]")
            return decoded if isinstance(decoded, list) else []
        except (TypeError, ValueError):
            return []

    return DecisionRecord(
        decision_id=row["decision_id"], work_item_id=row["work_item_id"],
        agent_id=row["agent_id"], decision_type=row["decision_type"],
        reasoning=row["reasoning"], evidence=parse(row["evidence"]),
        confidence=row["confidence"], alternatives=parse(row["alternatives"]),
        decided_at=row["decided_at"],
    )
