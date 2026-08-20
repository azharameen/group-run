"""Conversion of repository rows to public work-item models."""

import json
from typing import Any

from .models import RoutingDecision, WorkItem


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
        routing=RoutingDecision(
            department_id=routing["department_id"], decided_by=routing["decided_by"],
            decided_at=routing["decided_at"], confidence=routing["confidence"],
            reasoning=routing["reasoning"], alternatives=_parse_alternatives(routing["alternatives"]),
        ),
        created_at=item["created_at"], updated_at=item["updated_at"],
    )
