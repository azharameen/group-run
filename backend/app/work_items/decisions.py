"""Decision record service."""

import uuid
from datetime import UTC, datetime

from . import repository
from .mapping import row_to_decision
from .models import DecisionRecord, RecordDecisionRequest
from .service import UnknownWorkItemError


async def record_decision(request: RecordDecisionRequest) -> DecisionRecord:
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
    if work_item_id and await repository.get_work_item_rows(work_item_id) is None:
        raise UnknownWorkItemError(f"Work item {work_item_id} not found")
    rows = await repository.list_decisions(work_item_id, agent_id, from_ts, to_ts)
    return [row_to_decision(row) for row in rows]
