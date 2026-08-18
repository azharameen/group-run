"""Service layer for the organization structure (Story 8.1).

Creates organizations from the pinned default structure and assembles
the API tree (OrgTree) from stored rows. Synchronous by design — the
routes call it directly, matching the ideas/threads storage pattern.
"""

import uuid
from datetime import UTC, datetime

from . import repository
from .models import (
    DEFAULT_ORG_STRUCTURE,
    OrgAgent,
    Organization,
    OrganizationSummary,
    OrgDepartment,
    OrgTeam,
)


def _build_agent_order() -> dict[str, int]:
    """Derive canonical agent ordering from the pinned default structure."""
    order: dict[str, int] = {}
    for dept in DEFAULT_ORG_STRUCTURE["departments"]:
        for team in dept["teams"]:
            for agent in [team["captain"], *team["members"]]:
                order[agent["agent_id"]] = len(order)
    for dept in DEFAULT_ORG_STRUCTURE["departments"]:
        order[dept["chief"]["agent_id"]] = len(order)
    order[DEFAULT_ORG_STRUCTURE["chief_of_staff"]["agent_id"]] = len(order)
    return order


#: Canonical orderings (Story 8.1 Dev Notes §2) so API arrays match the
#: pinned structure instead of raw SQLite row order.
DEPARTMENT_ORDER = {
    d["department_id"]: i for i, d in enumerate(DEFAULT_ORG_STRUCTURE["departments"])
}
TEAM_ORDER = {
    t["team_id"]: i
    for d in DEFAULT_ORG_STRUCTURE["departments"]
    for i, t in enumerate(d["teams"])
}
AGENT_ORDER = _build_agent_order()


class OrganizationIntegrityError(RuntimeError):
    """Raised when stored organization rows are inconsistent (review P2)."""


def _agent_from_row(row) -> OrgAgent:
    """Build an OrgAgent from a stored agents row."""
    return OrgAgent(
        agent_id=row["agent_id"], name=row["name"], role=row["role"], status=row["status"]
    )


def create_organization(name: str, description: str = "") -> Organization:
    """Create an organization initialized with the pinned default structure.

    The org row and all 24 structure rows persist as a single transaction
    (review P1). Returns the full organization tree for the new org.
    """
    org_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    repository.insert_organization_tree(
        org_id, name, description, now, DEFAULT_ORG_STRUCTURE
    )
    created = get_organization(org_id)
    if created is None:
        raise RuntimeError(f"Organization {org_id} vanished after creation")
    return created


def get_organization(org_id: str) -> Organization | None:
    """Assemble the full organization tree, or None if the org is unknown.

    Raises :class:`OrganizationIntegrityError` when the stored rows are
    inconsistent (review P2) instead of crashing with StopIteration.
    """
    rows = repository.get_organization_rows(org_id)
    if rows is None:
        return None
    org_row = rows["org"]
    agent_rows = rows["agents"]

    cos_row = next(
        (a for a in agent_rows if a["department_id"] is None and a["team_id"] is None),
        None,
    )
    if cos_row is None:
        raise OrganizationIntegrityError(
            f"Organization {org_id} has no chief-of-staff row"
        )

    departments: list[OrgDepartment] = []
    dept_rows = sorted(
        rows["departments"],
        key=lambda r: DEPARTMENT_ORDER.get(r["department_id"], len(DEPARTMENT_ORDER)),
    )
    for dept_row in dept_rows:
        dept_agents = [a for a in agent_rows if a["department_id"] == dept_row["department_id"]]
        chief = next((a for a in dept_agents if a["team_id"] is None), None)
        if chief is None:
            raise OrganizationIntegrityError(
                f"Department {dept_row['department_id']} has no chief row"
            )
        teams: list[OrgTeam] = []
        team_rows = sorted(
            (t for t in rows["teams"] if t["department_id"] == dept_row["department_id"]),
            key=lambda r: TEAM_ORDER.get(r["team_id"], len(TEAM_ORDER)),
        )
        for team_row in team_rows:
            team_agents = [a for a in dept_agents if a["team_id"] == team_row["team_id"]]
            captain_row = next(
                (a for a in team_agents if a["role"] == "team_captain"), None
            )
            if captain_row is None:
                raise OrganizationIntegrityError(
                    f"Team {team_row['team_id']} has no captain or any agent rows"
                )
            ordered = sorted(
                team_agents, key=lambda a: AGENT_ORDER.get(a["agent_id"], len(AGENT_ORDER))
            )
            agents = [_agent_from_row(a) for a in ordered]
            teams.append(
                OrgTeam(
                    team_id=team_row["team_id"],
                    name=team_row["name"],
                    status=team_row["status"],
                    captain=_agent_from_row(captain_row),
                    agents=agents,
                    active_agents=sum(1 for a in team_agents if a["status"] == "active"),
                    total_agents=len(agents),
                )
            )
        departments.append(
            OrgDepartment(
                department_id=dept_row["department_id"],
                name=dept_row["name"],
                status=dept_row["status"],
                chief=_agent_from_row(chief),
                teams=teams,
            )
        )

    return Organization(
        org_id=org_row["org_id"],
        name=org_row["name"],
        description=org_row["description"],
        created_at=org_row["created_at"],
        updated_at=org_row["updated_at"],
        chief_of_staff=_agent_from_row(cos_row),
        departments=departments,
    )


def list_organizations() -> list[OrganizationSummary]:
    """Return organization summaries, most recently updated first."""
    return [
        OrganizationSummary(
            org_id=row["org_id"],
            name=row["name"],
            description=row["description"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            department_count=row["department_count"],
            team_count=row["team_count"],
            agent_count=row["agent_count"],
        )
        for row in repository.list_organizations()
    ]
