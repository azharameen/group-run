"""LangChain tools exposed to the deep agent runtime (Story 8.2).

``DOMAIN_TOOLS`` are always appended to the runtime tool list (see
``app.agent.runtime.get_deep_agent_runtime``) alongside MCP tools, so
the Chief of Staff can accept work items from chat (PRD FR-3).
"""

import sqlite3

from langchain_core.tools import tool

from ..organization.service import OrganizationIntegrityError
from . import service
from .service import NoOrganizationError, UnknownOrganizationError


@tool
def submit_work_item(
    title: str, description: str = "", department: str | None = None
) -> str:
    """Submit a work item (idea, task, or feature) for the organization.

    The Chief of Staff receives the item, creates it with status "new",
    and routes it to a department. Pass `department` only when the user
    clearly indicated which department owns the work ("ideation" for new
    concepts and ideas, "technology" for build/test/deploy work).

    Args:
        title: Short title for the work item.
        description: Full description of the work.
        department: Optional department id to route the item to.
    """
    try:
        item = service.submit_work_item(
            title, description, department=department, source="chat"
        )
    except (
        NoOrganizationError,
        UnknownOrganizationError,
        ValueError,
        RuntimeError,
        sqlite3.Error,
        OrganizationIntegrityError,
    ) as exc:
        return f"Could not submit the work item: {exc}"
    return (
        f"Work item '{item.title}' created with status '{item.status}' and"
        f" routed to the {item.department_id} department by the Chief of Staff."
        " It is now visible in the Command Center (Work Items tab)."
    )


DOMAIN_TOOLS = [submit_work_item]
