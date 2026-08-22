"""Decision record service and legacy provenance merge."""

import uuid
from datetime import UTC, datetime

from . import repository
from .mapping import row_to_decision
from .models import DecisionRecord, RecordDecisionRequest
from .service import UnknownWorkItemError


def record_decision(request: RecordDecisionRequest) -> DecisionRecord:
    if repository.get_work_item_rows(request.work_item_id) is None:
        raise UnknownWorkItemError(f"Work item {request.work_item_id} not found")
    record = DecisionRecord(
        decision_id=str(uuid.uuid4()), decided_at=datetime.now(UTC).isoformat(),
        **request.model_dump(),
    )
    repository.insert_decision(record.model_dump())
    return record


def list_decisions(work_item_id=None, agent_id=None, from_ts=None, to_ts=None):
    if work_item_id and repository.get_work_item_rows(work_item_id) is None:
        raise UnknownWorkItemError(f"Work item {work_item_id} not found")
    stored = [row_to_decision(row) for row in repository.list_decisions(
        work_item_id, agent_id, from_ts, to_ts
    )]
    seen = {(d.work_item_id, d.decided_at, d.decision_type) for d in stored}
    conn = repository._get_conn()
    query = "SELECT * FROM routing_decisions"
    args = []
    if work_item_id:
        query += " WHERE work_item_id = ?"
        args.append(work_item_id)
    legacy = []
    for row in conn.execute(query, args):
        item = dict(row)
        values = (item["work_item_id"], item["decided_at"], "routing")
        if values not in seen:
            legacy.append(DecisionRecord(
                decision_id=f"routing-{item['work_item_id']}", work_item_id=item["work_item_id"],
                agent_id=item["decided_by"], decision_type="routing", reasoning=item["reasoning"],
                confidence=item["confidence"], alternatives=_decode(item["alternatives"]),
                decided_at=item["decided_at"],
            ))
    query = "SELECT * FROM lifecycle_events"
    if work_item_id:
        query += " WHERE work_item_id = ?"
    for row in conn.execute(query, args):
        item = dict(row)
        values = (item["work_item_id"], item["decided_at"], item["event_type"])
        if values not in seen:
            legacy.append(DecisionRecord(
                decision_id=item["event_id"], work_item_id=item["work_item_id"],
                agent_id=item["decided_by"], decision_type=item["event_type"],
                reasoning=item["reasoning"], confidence=item["confidence"],
                alternatives=_decode(item["alternatives"]), decided_at=item["decided_at"],
            ))
    records = stored + legacy
    if agent_id:
        records = [d for d in records if d.agent_id == agent_id]
    if from_ts:
        records = [d for d in records if d.decided_at >= from_ts]
    if to_ts:
        records = [d for d in records if d.decided_at <= to_ts]
    return sorted(records, key=lambda d: d.decided_at)


def _decode(raw):
    import json
    try:
        value = json.loads(raw)
        return value if isinstance(value, list) else []
    except (TypeError, ValueError):
        return []
