"""Decision record service."""

import json
import uuid
from datetime import UTC, datetime

from . import repository
from .idea_mapping import validate_work_item_id
from .mapping import row_to_decision
from .models import DecisionRecord, RecordDecisionRequest
from .service import UnknownWorkItemError


def _decode(raw):
    try:
        value = json.loads(raw if isinstance(raw, str) else "[]")
        return value if isinstance(value, list) else []
    except (TypeError, ValueError):
        return []


async def record_decision(request: RecordDecisionRequest) -> DecisionRecord:
    validate_work_item_id(request.work_item_id)
    if await repository.get_work_item_rows(request.work_item_id) is None:
        raise UnknownWorkItemError(f"Work item {request.work_item_id} not found")
    record = DecisionRecord(
        decision_id=str(uuid.uuid4()),
        decided_at=datetime.now(UTC).isoformat(),
        **request.model_dump(),
    )
    await repository.insert_decision(record.model_dump())
    return record


async def list_decisions(work_item_id=None, agent_id=None, from_ts=None, to_ts=None):
    if work_item_id:
        validate_work_item_id(work_item_id)
    if work_item_id and await repository.get_work_item_rows(work_item_id) is None:
        raise UnknownWorkItemError(f"Work item {work_item_id} not found")
    rows = await repository.list_decisions(work_item_id, agent_id, from_ts, to_ts)
    stored = [row_to_decision(row) for row in rows]

    legacy = []
    seen = {(d.work_item_id, d.decided_at, d.decision_type) for d in stored}

    if work_item_id:
        rows_data = await repository.get_work_item_rows(work_item_id)
        if rows_data and rows_data["routing"]:
            r = rows_data["routing"]
            if (r["work_item_id"], r["decided_at"], "routing") not in seen:
                legacy.append(
                    DecisionRecord(
                        decision_id=f"legacy_routing_{r['work_item_id']}",
                        work_item_id=r["work_item_id"],
                        agent_id=r["decided_by"],
                        decision_type="routing",
                        reasoning=r["reasoning"],
                        confidence=r["confidence"],
                        alternatives=_decode(r["alternatives"]),
                        decided_at=r["decided_at"],
                    )
                )
        events = await repository.list_lifecycle_events(work_item_id)
        for item in events:
            values = (item["work_item_id"], item["decided_at"], item["event_type"])
            if values not in seen:
                legacy.append(
                    DecisionRecord(
                        decision_id=item["event_id"],
                        work_item_id=item["work_item_id"],
                        agent_id=item["decided_by"],
                        decision_type=item["event_type"],
                        reasoning=item["reasoning"],
                        confidence=item["confidence"],
                        alternatives=_decode(item["alternatives"]),
                        decided_at=item["decided_at"],
                    )
                )

    records = stored + legacy
    if agent_id:
        records = [d for d in records if d.agent_id == agent_id]
    if from_ts:
        records = [d for d in records if d.decided_at >= from_ts]
    if to_ts:
        records = [d for d in records if d.decided_at <= to_ts]
    return sorted(records, key=lambda d: (d.decided_at, d.decision_id))
