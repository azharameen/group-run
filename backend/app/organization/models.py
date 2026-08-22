"""Pydantic models for the organization structure (Story 8.1).

Defines the typed tree shape of the default Companion organization —
Chief of Staff, Departments, Teams, and Agents — plus the request model
served by the /api/organizations endpoints.
"""

from typing import Literal, TypedDict

from pydantic import BaseModel, Field

#: Valid status values for agents, teams, and departments.
AgentStatus = Literal["active", "idle", "overloaded"]


class AgentRow(TypedDict):
    """Raw agent row shape in the pinned default structure."""

    agent_id: str
    name: str
    role: str
    status: AgentStatus


class TeamRow(TypedDict):
    """Raw team row shape with its captain and specialist members."""

    team_id: str
    name: str
    status: AgentStatus
    captain: AgentRow
    members: list[AgentRow]


class DepartmentRow(TypedDict):
    """Raw department row shape with its chief and teams."""

    department_id: str
    name: str
    status: AgentStatus
    chief: AgentRow
    teams: list[TeamRow]


class OrgStructureRow(TypedDict):
    """Raw pinned default organization structure (Dev Notes §2)."""

    chief_of_staff: AgentRow
    departments: list[DepartmentRow]


def _agent(
    agent_id: str, name: str, role: str, status: AgentStatus = "idle"
) -> AgentRow:
    """Build a raw agent row dict for the default structure."""
    return {"agent_id": agent_id, "name": name, "role": role, "status": status}


#: Pinned default organization structure (Story 8.1 Dev Notes §2).
#:
#: Raw row shapes consumed by :mod:`app.organization.repository` when an
#: organization is created. Totals: 1 Chief of Staff, 2 departments,
#: 5 teams, 18 agents (1 CoS + 2 chiefs + 5 captains + 10 specialists).
DEFAULT_ORG_STRUCTURE: OrgStructureRow = {
    "chief_of_staff": _agent("chief_of_staff", "Chief of Staff", "chief_of_staff", "active"),
    "departments": [
        {
            "department_id": "ideation",
            "name": "Ideation",
            "status": "active",
            "chief": _agent("chief_ideation", "Chief of Ideation", "department_chief"),
            "teams": [
                {
                    "team_id": "idea-team",
                    "name": "Idea Team",
                    "status": "idle",
                    "captain": _agent("idea_captain", "Idea Captain", "team_captain"),
                    "members": [
                        _agent("market_research_analyst", "Market Research Analyst", "specialist"),
                        _agent("novelty_validator", "Novelty Validator", "specialist"),
                    ],
                },
                {
                    "team_id": "product-team",
                    "name": "Product Team",
                    "status": "idle",
                    "captain": _agent("product_captain", "Product Captain", "team_captain"),
                    "members": [
                        _agent("requirements_analyst", "Requirements Analyst", "specialist"),
                        _agent("roadmap_planner", "Roadmap Planner", "specialist"),
                    ],
                },
            ],
        },
        {
            "department_id": "technology",
            "name": "Technology",
            "status": "active",
            "chief": _agent("chief_technology", "Chief of Technology", "department_chief"),
            "teams": [
                {
                    "team_id": "development-team",
                    "name": "Development Team",
                    "status": "idle",
                    "captain": _agent("dev_captain", "Development Captain", "team_captain"),
                    "members": [
                        _agent("frontend_engineer", "Frontend Engineer", "specialist"),
                        _agent("backend_engineer", "Backend Engineer", "specialist"),
                    ],
                },
                {
                    "team_id": "testing-team",
                    "name": "Testing Team",
                    "status": "idle",
                    "captain": _agent("qa_captain", "QA Captain", "team_captain"),
                    "members": [
                        _agent("test_engineer", "Test Engineer", "specialist"),
                        _agent("quality_analyst", "Quality Analyst", "specialist"),
                    ],
                },
                {
                    "team_id": "devops-team",
                    "name": "DevOps Team",
                    "status": "idle",
                    "captain": _agent("devops_captain", "DevOps Captain", "team_captain"),
                    "members": [
                        _agent("deployment_engineer", "Deployment Engineer", "specialist"),
                        _agent("infrastructure_monitor", "Infrastructure Monitor", "specialist"),
                    ],
                },
            ],
        },
    ],
}


class OrgAgent(BaseModel):
    """A single agent node in the organization tree."""

    agent_id: str
    name: str
    role: str
    status: AgentStatus


class OrgTeam(BaseModel):
    """A team with its captain and agent list (captain is the first entry)."""

    team_id: str
    name: str
    status: AgentStatus
    captain: OrgAgent
    agents: list[OrgAgent] = Field(default_factory=list)
    active_agents: int = 0
    total_agents: int = 0


class OrgDepartment(BaseModel):
    """A department with its chief and the teams it owns."""

    department_id: str
    name: str
    status: AgentStatus
    chief: OrgAgent
    teams: list[OrgTeam] = Field(default_factory=list)


class Organization(BaseModel):
    """The full organization tree (OrgTree in the API contract)."""

    org_id: str
    name: str
    description: str = ""
    created_at: str
    updated_at: str
    chief_of_staff: OrgAgent
    departments: list[OrgDepartment] = Field(default_factory=list)


class OrganizationSummary(BaseModel):
    """List-endpoint summary of an organization with aggregate counts."""

    org_id: str
    name: str
    description: str = ""
    created_at: str
    updated_at: str
    department_count: int = 0
    team_count: int = 0
    agent_count: int = 0


class CreateOrganizationRequest(BaseModel):
    """Request body for POST /api/organizations."""

    name: str
    description: str = Field(default="", max_length=2000)
