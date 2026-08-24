"""LangChain tools exposed to the deep agent runtime (Story 8.2).

``DOMAIN_TOOLS`` are always appended to the runtime tool list alongside MCP tools,
so the Chief of Staff can accept work items from chat.
"""

from langchain_core.tools import tool
from sqlalchemy.exc import SQLAlchemyError

from ..organization.service import OrganizationIntegrityError
from . import service
from .service import (
    InvalidTransitionError,
    NoOrganizationError,
    UnknownOrganizationError,
    UnknownWorkItemError,
)


@tool
async def submit_work_item(
    title: str, description: str = "", department: str | None = None
) -> str:
    """Submit a work item (idea, task, or feature) for the organization."""
    try:
        item = await service.submit_work_item(
            title, description, department=department, source="chat"
        )
    except (
        NoOrganizationError,
        UnknownOrganizationError,
        ValueError,
        RuntimeError,
        SQLAlchemyError,
        OrganizationIntegrityError,
    ) as exc:
        return f"Could not submit the work item: {exc}"
    return (
        f"Work item '{item.title}' created with status '{item.status}' and"
        f" routed to the {item.department_id} department by the Chief of Staff."
        " It is now visible in the Command Center (Work Items tab)."
    )


@tool
async def transition_work_item(work_item_id: str, status: str, reasoning: str = "") -> str:
    """Advance a work item to a later lifecycle phase."""
    try:
        item, event = await service.transition_work_item(work_item_id, status, reasoning)
    except (
        UnknownWorkItemError,
        ValueError,
        InvalidTransitionError,
        SQLAlchemyError,
        OrganizationIntegrityError,
    ) as exc:
        return f"Could not transition the work item: {exc}"
    handoff = (
        f" Handoff approved by the Chief of Staff from {event.from_department} "
        f"to {event.to_department}."
        if event.event_type == "handoff"
        else ""
    )
    return (
        f"Work item '{item.title}' moved to '{item.status}' "
        f"(department: {item.department_id}).{handoff}"
    )


DOMAIN_TOOLS = [submit_work_item, transition_work_item]
