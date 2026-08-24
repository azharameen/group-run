"""PostgreSQL repository — organization hierarchy (Story 8.1).

Full async implementation using SQLAlchemy AsyncSession.
Implements IOrganizationRepository via PostgreSQL connection pool.
"""

from typing import Any

from sqlalchemy import text

from ..db.session import get_session_factory
from ..repositories.interfaces import IOrganizationRepository


class PostgresOrganizationRepository(IOrganizationRepository):
    """SQLAlchemy-backed async implementation of IOrganizationRepository."""

    async def get_organization_rows(self, org_id: str) -> dict[str, Any] | None:
        """Return the full organization tree or None if not found."""
        async with get_session_factory()() as session:
            org_result = await session.execute(
                text("SELECT * FROM organizations WHERE org_id = :org_id"),
                {"org_id": org_id},
            )
            org = org_result.mappings().one_or_none()
            if org is None:
                return None

            dept_result = await session.execute(
                text("SELECT * FROM departments WHERE org_id = :org_id ORDER BY department_id"),
                {"org_id": org_id},
            )
            team_result = await session.execute(
                text("SELECT * FROM teams WHERE org_id = :org_id ORDER BY team_id"),
                {"org_id": org_id},
            )
            agent_result = await session.execute(
                text("SELECT * FROM agents WHERE org_id = :org_id ORDER BY agent_id"),
                {"org_id": org_id},
            )

            return {
                "org": dict(org),
                "departments": [dict(r) for r in dept_result.mappings()],
                "teams": [dict(r) for r in team_result.mappings()],
                "agents": [dict(r) for r in agent_result.mappings()],
            }

    async def list_organizations(self) -> list[dict[str, Any]]:
        """Return all organizations with aggregate counts, newest first."""
        async with get_session_factory()() as session:
            result = await session.execute(
                text(
                    """
                    SELECT o.org_id, o.name, o.description, o.created_at, o.updated_at,
                           (SELECT COUNT(*) FROM departments d WHERE d.org_id = o.org_id)
                               AS department_count,
                           (SELECT COUNT(*) FROM teams t WHERE t.org_id = o.org_id)
                               AS team_count,
                           (SELECT COUNT(*) FROM agents a WHERE a.org_id = o.org_id)
                               AS agent_count
                    FROM organizations o
                    ORDER BY o.updated_at DESC, o.created_at DESC, o.org_id
                    """
                )
            )
            return [dict(r) for r in result.mappings()]

    async def insert_organization_tree(
        self,
        org_id: str,
        name: str,
        description: str,
        now: str,
        structure: dict[str, Any],
    ) -> None:
        """Insert an organization and its complete hierarchy atomically."""
        async with get_session_factory()() as session:
            try:
                await session.execute(
                    text(
                        "INSERT INTO organizations (org_id, name, description, created_at, updated_at) "
                        "VALUES (:org_id, :name, :description, :created_at, :updated_at)"
                    ),
                    {"org_id": org_id, "name": name, "description": description,
                     "created_at": now, "updated_at": now},
                )

                # Chief of staff (org-level agent, no dept/team)
                cos = structure["chief_of_staff"]
                await session.execute(
                    text(
                        "INSERT INTO agents (org_id, department_id, team_id, agent_id, name, role, status) "
                        "VALUES (:org_id, NULL, NULL, :agent_id, :name, :role, :status)"
                    ),
                    {"org_id": org_id, "agent_id": cos["agent_id"],
                     "name": cos["name"], "role": cos["role"], "status": cos["status"]},
                )

                for dept in structure["departments"]:
                    await session.execute(
                        text(
                            "INSERT INTO departments (org_id, department_id, name, status) "
                            "VALUES (:org_id, :department_id, :name, :status)"
                        ),
                        {"org_id": org_id, "department_id": dept["department_id"],
                         "name": dept["name"], "status": dept["status"]},
                    )
                    # Department chief
                    chief = dept["chief"]
                    await session.execute(
                        text(
                            "INSERT INTO agents (org_id, department_id, team_id, agent_id, name, role, status) "
                            "VALUES (:org_id, :dept_id, NULL, :agent_id, :name, :role, :status)"
                        ),
                        {"org_id": org_id, "dept_id": dept["department_id"],
                         "agent_id": chief["agent_id"], "name": chief["name"],
                         "role": chief["role"], "status": chief["status"]},
                    )

                    for team in dept["teams"]:
                        await session.execute(
                            text(
                                "INSERT INTO teams (org_id, department_id, team_id, name, status) "
                                "VALUES (:org_id, :dept_id, :team_id, :name, :status)"
                            ),
                            {"org_id": org_id, "dept_id": dept["department_id"],
                             "team_id": team["team_id"], "name": team["name"],
                             "status": team["status"]},
                        )
                        for agent in [team["captain"], *team["members"]]:
                            await session.execute(
                                text(
                                    "INSERT INTO agents "
                                    "(org_id, department_id, team_id, agent_id, name, role, status) "
                                    "VALUES (:org_id, :dept_id, :team_id, :agent_id, :name, :role, :status)"
                                ),
                                {"org_id": org_id, "dept_id": dept["department_id"],
                                 "team_id": team["team_id"], "agent_id": agent["agent_id"],
                                 "name": agent["name"], "role": agent["role"],
                                 "status": agent["status"]},
                            )

                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def update_agent_status(self, org_id: str, agent_id: str, status: str) -> bool:
        """Update one agent's status. Return True if a row was changed."""
        async with get_session_factory()() as session:
            result = await session.execute(
                text(
                    "UPDATE agents SET status = :status "
                    "WHERE org_id = :org_id AND agent_id = :agent_id"
                ),
                {"status": status, "org_id": org_id, "agent_id": agent_id},
            )
            await session.commit()
            return result.rowcount > 0


# Module-level singleton repository (backward-compatible interface).
# Route files call module-level functions; we delegate to this instance.
_repo = PostgresOrganizationRepository()


# ── Backward-compatible module-level API ───────────────────────────────────
# These async wrappers preserve the call signatures used by existing route
# handlers and services. When the route layer is refactored to use DI with
# IOrganizationRepository directly, these can be removed.

async def insert_organization_tree(
    org_id: str, name: str, description: str, now: str, structure: dict[str, Any]
) -> None:
    await _repo.insert_organization_tree(org_id, name, description, now, structure)


async def get_organization_rows(org_id: str) -> dict[str, Any] | None:
    return await _repo.get_organization_rows(org_id)


async def update_agent_status(org_id: str, agent_id: str, status: str) -> bool:
    return await _repo.update_agent_status(org_id, agent_id, status)


async def list_organizations() -> list[dict[str, Any]]:
    return await _repo.list_organizations()
