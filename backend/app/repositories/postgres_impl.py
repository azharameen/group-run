"""Concrete PostgreSQL repository implementations.

Implements all abstract repository interfaces using SQLAlchemy AsyncSession.
"""

from typing import Any

from ..organization import repository as org_repo
from ..repositories.interfaces import (
    IInterruptRepository,
    IOrganizationRepository,
    IThreadMetadataRepository,
    IWorkItemRepository,
)
from ..services import interrupt_service, thread_manager
from ..work_items import repository as work_items_repo


class PostgresOrganizationRepository(IOrganizationRepository):
    """PostgreSQL implementation of IOrganizationRepository."""

    async def get_organization_rows(self, org_id: str) -> dict[str, Any] | None:
        return await org_repo.get_organization_rows(org_id)

    async def list_organizations(self) -> list[dict[str, Any]]:
        return await org_repo.list_organizations()

    async def insert_organization_tree(
        self,
        org_id: str,
        name: str,
        description: str,
        now: str,
        structure: dict[str, Any],
    ) -> None:
        await org_repo.insert_organization_tree(org_id, name, description, now, structure)

    async def update_agent_status(self, org_id: str, agent_id: str, status: str) -> bool:
        return await org_repo.update_agent_status(org_id, agent_id, status)


class PostgresWorkItemRepository(IWorkItemRepository):
    """PostgreSQL implementation of IWorkItemRepository."""

    async def insert_work_item(self, item: dict[str, Any], routing: dict[str, Any]) -> None:
        await work_items_repo.insert_work_item(item, routing)

    async def get_work_item_rows(self, work_item_id: str) -> dict[str, Any] | None:
        return await work_items_repo.get_work_item_rows(work_item_id)

    async def list_work_items_with_routing(
        self, org_id: str | None = None
    ) -> list[dict[str, Any]]:
        return await work_items_repo.list_work_items_with_routing(org_id)

    async def count_open_work_items_by_department(self, org_id: str) -> dict[str, int]:
        return await work_items_repo.count_open_work_items_by_department(org_id)

    async def insert_decision(self, decision: dict[str, Any]) -> None:
        await work_items_repo.insert_decision(decision)

    async def list_decisions(
        self,
        work_item_id: str | None = None,
        agent_id: str | None = None,
        from_ts: str | None = None,
        to_ts: str | None = None,
    ) -> list[dict[str, Any]]:
        return await work_items_repo.list_decisions(work_item_id, agent_id, from_ts, to_ts)

    async def insert_template(
        self,
        template_id: str,
        org_id: str,
        name: str,
        source_work_item_id: str,
        phases: list[str],
        departments: list[str],
        created_at: str,
    ) -> None:
        await work_items_repo.insert_template(
            template_id, org_id, name, source_work_item_id, phases, departments, created_at
        )

    async def list_templates(self, org_id: str) -> list[dict[str, Any]]:
        return await work_items_repo.list_templates(org_id)

    async def get_template(self, template_id: str) -> dict[str, Any] | None:
        return await work_items_repo.get_template(template_id)

    async def record_template_usage(self, template_id: str, now: str) -> None:
        await work_items_repo.record_template_usage(template_id, now)

    async def insert_review(self, review: dict[str, Any], decision: dict[str, Any]) -> None:
        await work_items_repo.insert_review(review, decision)

    async def list_reviews(self, work_item_id: str) -> list[dict[str, Any]]:
        return await work_items_repo.list_reviews(work_item_id)

    async def insert_lifecycle_event(self, event: dict[str, Any]) -> None:
        await work_items_repo.insert_lifecycle_event(event)

    async def list_lifecycle_events(self, work_item_id: str) -> list[dict[str, Any]]:
        return await work_items_repo.list_lifecycle_events(work_item_id)

    async def update_work_item_status(
        self,
        work_item_id: str,
        status: str,
        department_id: str,
        updated_at: str,
        expected_status: str | None = None,
    ) -> None:
        await work_items_repo.update_work_item_status(
            work_item_id, status, department_id, updated_at, expected_status=expected_status
        )

    async def record_transition(
        self,
        work_item_id: str,
        status: str,
        department_id: str,
        updated_at: str,
        event: dict[str, Any],
        expected_status: str | None = None,
        decision: dict[str, Any] | None = None,
    ) -> None:
        await work_items_repo.record_transition(
            work_item_id, status, department_id, updated_at, event,
            expected_status=expected_status, decision=decision,
        )

    async def record_reassignment(
        self,
        work_item_id: str,
        owner_agent_id: str,
        updated_at: str,
        event: dict[str, Any],
        previous_owner_agent_id: str | None = None,
    ) -> None:
        await work_items_repo.record_reassignment(
            work_item_id, owner_agent_id, updated_at, event,
            previous_owner_agent_id=previous_owner_agent_id,
        )

    async def insert_org_alert(self, alert: dict[str, Any]) -> None:
        await work_items_repo.insert_org_alert(alert)

    async def list_org_alerts(self, org_id: str) -> list[dict[str, Any]]:
        return await work_items_repo.list_org_alerts(org_id)

    async def has_org_alert(self, org_id: str, work_item_id: str, phase: str) -> bool:
        return await work_items_repo.has_org_alert(org_id, work_item_id, phase)

    async def record_escalation(
        self, alert: dict[str, Any], event: dict[str, Any]
    ) -> None:
        await work_items_repo.record_escalation(alert, event)


class PostgresInterruptRepository(IInterruptRepository):
    """PostgreSQL implementation of IInterruptRepository."""

    def __init__(self) -> None:
        self._svc = interrupt_service.InterruptService.instance()

    async def create(
        self,
        interrupt_id: str,
        thread_id: str,
        tool_name: str,
        tool_input: dict,
        message: str,
        reasoning: str,
        decided_by: str,
        confidence: str,
        alternatives: list[str],
        now: str,
    ) -> dict[str, Any]:
        return await self._svc.create_interrupt(
            thread_id=thread_id,
            tool_name=tool_name,
            message=message,
            tool_input=tool_input,
            decided_by=decided_by,
            confidence=confidence,
            alternatives=alternatives,
            reasoning=reasoning,
        )

    async def get(self, interrupt_id: str) -> dict[str, Any] | None:
        return await self._svc.get_interrupt(interrupt_id)

    async def list_pending(self) -> list[dict[str, Any]]:
        return await self._svc.list_pending()

    async def list_all(self) -> list[dict[str, Any]]:
        return await self._svc.list_all()

    async def approve(
        self,
        interrupt_id: str,
        decision: str,
        reason: str,
        reasoning: str | None,
        now: str,
    ) -> dict[str, Any] | None:
        return await self._svc.approve_interrupt(
            interrupt_id, decision=decision, reason=reason, reasoning=reasoning
        )

    async def reject(
        self,
        interrupt_id: str,
        reason: str,
        reasoning: str | None,
        now: str,
    ) -> dict[str, Any] | None:
        return await self._svc.reject_interrupt(interrupt_id, reason=reason, reasoning=reasoning)


class PostgresThreadMetadataRepository(IThreadMetadataRepository):
    """PostgreSQL implementation of IThreadMetadataRepository."""

    async def create(self, thread_id: str, title: str, idea_id: str | None, tags: list[str], agent_names: list[str], now: str) -> dict[str, Any]:
        return await thread_manager.create_thread(title=title, idea_id=idea_id, tags=tags, agent_names=agent_names)

    async def get(self, thread_id: str) -> dict[str, Any] | None:
        return await thread_manager.get_thread(thread_id)

    async def list_all(self, status: str | None, limit: int, offset: int) -> list[dict[str, Any]]:
        return await thread_manager.list_threads(status=status, limit=limit, offset=offset)

    async def update(self, thread_id: str, **fields: Any) -> dict[str, Any] | None:
        return await thread_manager.update_thread(thread_id, **fields)

    async def delete(self, thread_id: str) -> bool:
        return await thread_manager.delete_thread(thread_id)

    async def touch(self, thread_id: str, updated_at: str) -> None:
        await thread_manager.touch_thread(thread_id)
