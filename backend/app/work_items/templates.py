"""Workflow template capture and replay (Story 9.3)."""

import json
import uuid
from datetime import UTC, datetime

from . import repository, service
from .lifecycle import LIFECYCLE_PHASES, PHASE_DEPARTMENT
from .models import LifecycleEvent, WorkflowTemplate, WorkItem
from .service import UnknownWorkItemError


def save_template(work_item_id: str, name: str) -> WorkflowTemplate:
    """Capture a work item's phase sequence as a named template.

    Raises:
        UnknownWorkItemError: if the work item doesn't exist.
        ValueError: if the item is in 'new' phase (no captured workflow yet).
    """
    item = service.get_work_item(work_item_id)
    if item is None:
        raise UnknownWorkItemError(f"Work item {work_item_id} not found")

    if item.status == "new":
        raise ValueError(
            "Cannot save a template for an item in 'new' phase; "
            "it has no captured workflow yet"
        )

    # Capture phases up to and including current status
    current_index = LIFECYCLE_PHASES.index(item.status)
    phases = list(LIFECYCLE_PHASES[: current_index + 1])
    departments = [PHASE_DEPARTMENT[phase] for phase in phases]

    template_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()

    repository.insert_template(
        template_id=template_id,
        org_id=item.org_id,
        name=name,
        source_work_item_id=work_item_id,
        phases=phases,
        departments=departments,
        created_at=now,
    )

    return WorkflowTemplate(
        template_id=template_id,
        org_id=item.org_id,
        name=name,
        source_work_item_id=work_item_id,
        phases=phases,
        departments=departments,
        usage_count=0,
        created_at=now,
        last_used_at=None,
    )


def list_templates(org_id: str) -> list[WorkflowTemplate]:
    """List all templates for an organization."""
    rows = repository.list_templates(org_id)
    return [
        WorkflowTemplate(
            template_id=row["template_id"],
            org_id=row["org_id"],
            name=row["name"],
            source_work_item_id=row["source_work_item_id"],
            phases=json.loads(row["phases"]),
            departments=json.loads(row["departments"]),
            usage_count=row["usage_count"],
            created_at=row["created_at"],
            last_used_at=row["last_used_at"],
        )
        for row in rows
    ]


def replay_template(
    template_id: str, title: str, description: str = ""
) -> tuple[WorkItem, list[LifecycleEvent]]:
    """Create a new work item from a template and replay its phase sequence.

    Returns:
        tuple: (created work item, list of lifecycle events in order).

    Raises:
        ValueError: if template or org doesn't exist.
    """
    template_row = repository.get_template(template_id)
    if template_row is None:
        raise ValueError(f"Template {template_id} not found")

    phases = json.loads(template_row["phases"])
    org_id = template_row["org_id"]
    template_name = template_row["name"]

    # Create the new work item with source = template:{id}
    item = service.submit_work_item(
        title=title,
        description=description,
        org_id=org_id,
        source=f"template:{template_id}",
        template_id=template_id,
    )

    events = []

    # Replay: advance through each phase after 'new'
    for phase in phases[1:]:  # Skip 'new' since item is created in 'new'
        updated_item, event = service.transition_work_item(
            work_item_id=item.work_item_id,
            status=phase,
            reasoning=(
                f"Replayed template '{template_name}' ({template_id}): "
                f"{phases[phases.index(phase) - 1]} → {phase}."
            ),
            decided_by=service.OWNER_AGENT_ID,
        )
        events.append(event)
        item = updated_item

    # Record usage
    now = datetime.now(UTC).isoformat()
    repository.record_template_usage(template_id, now)

    return item, events
