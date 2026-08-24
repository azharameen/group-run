"""Organization health derivation (Story 9.1).

Read-only view over the organization rows and work items:
per-team capacity (active/idle/total agents) plus a workload state
derived from open work items routed to the team's department.
"""

from ..config import settings
from ..work_items import repository as work_items_repository
from . import repository
from .models import DepartmentHealth, OrganizationHealth, TeamHealth, WorkloadState


def _workload_state(
    open_items: int, active_agents: int, threshold: int
) -> WorkloadState:
    """Derive a team's workload state from open items and active agents."""
    if open_items > threshold:
        return "overloaded"
    if open_items == 0 and active_agents == 0:
        return "idle"
    return "active"


async def get_organization_health(org_id: str) -> OrganizationHealth | None:
    """Assemble the health snapshot for one organization, or None if unknown."""
    rows = await repository.get_organization_rows(org_id)
    if rows is None:
        return None
    org_row = rows["org"]
    open_by_department = await work_items_repository.count_open_work_items_by_department(
        org_id
    )

    departments: list[DepartmentHealth] = []
    for dept_row in rows["departments"]:
        dept_id = dept_row["department_id"]
        dept_agents = [
            a for a in rows["agents"] if a["department_id"] == dept_id
        ]
        open_items = open_by_department.get(dept_id, 0)
        teams: list[TeamHealth] = []
        for team_row in rows["teams"]:
            if team_row["department_id"] != dept_id:
                continue
            team_agents = [
                a
                for a in dept_agents
                if a["team_id"] == team_row["team_id"]
            ]
            active = sum(1 for a in team_agents if a["status"] == "active")
            idle = sum(1 for a in team_agents if a["status"] == "idle")
            teams.append(
                TeamHealth(
                    team_id=team_row["team_id"],
                    name=team_row["name"],
                    department_id=dept_id,
                    active_agents=active,
                    idle_agents=idle,
                    total_agents=len(team_agents),
                    open_work_items=open_items,
                    workload_state=_workload_state(
                        open_items, active, settings.team_overload_threshold
                    ),
                )
            )
        departments.append(
            DepartmentHealth(
                department_id=dept_id,
                name=dept_row["name"],
                teams=teams,
            )
        )

    return OrganizationHealth(
        org_id=org_row["org_id"],
        name=org_row["name"],
        departments=departments,
        total_open_work_items=sum(open_by_department.values()),
    )
