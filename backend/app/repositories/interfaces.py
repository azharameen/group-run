"""Abstract repository interfaces -- provider-agnostic contracts.

All domain services and API route handlers MUST depend on these ABCs, never
on concrete implementations. Swapping the database provider requires only
changing the concrete implementation and the DI wiring -- zero changes to
business logic.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class IOrganizationRepository(ABC):
    """Read/write access to organizations and their hierarchy."""

    @abstractmethod
    async def get_organization_rows(self, org_id: str) -> dict[str, Any] | None:
        """Return the full organization tree or None if not found."""

    @abstractmethod
    async def list_organizations(self) -> list[dict[str, Any]]:
        """Return all organizations with aggregate counts, newest first."""

    @abstractmethod
    async def insert_organization_tree(
        self,
        org_id: str,
        name: str,
        description: str,
        now: str,
        structure: dict[str, Any],
    ) -> None:
        """Insert an organization and its complete hierarchy atomically."""

    @abstractmethod
    async def update_agent_status(self, org_id: str, agent_id: str, status: str) -> bool:
        """Update one agent's status. Return True if a row was changed."""


class IWorkItemRepository(ABC):
    """Read/write access to work items, routing decisions, templates, and reviews."""

    @abstractmethod
    async def insert_work_item(self, item: dict[str, Any], routing: dict[str, Any]) -> None:
        """Insert a work item and its routing decision atomically."""

    @abstractmethod
    async def get_work_item_rows(self, work_item_id: str) -> dict[str, Any] | None:
        """Return the work item and routing rows or None."""

    @abstractmethod
    async def list_work_items_with_routing(
        self, org_id: str | None = None
    ) -> list[dict[str, Any]]:
        """Return work items paired with routing rows, newest first."""

    @abstractmethod
    async def count_open_work_items_by_department(self, org_id: str) -> dict[str, int]:
        """Count open items per department for an organization."""

    @abstractmethod
    async def insert_decision(self, decision: dict[str, Any]) -> None:
        """Insert an agent decision record."""

    @abstractmethod
    async def list_decisions(
        self,
        work_item_id: str | None = None,
        agent_id: str | None = None,
        from_ts: str | None = None,
        to_ts: str | None = None,
    ) -> list[dict[str, Any]]:
        """Return decision records, optionally filtered."""

    @abstractmethod
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
        """Insert a workflow template."""

    @abstractmethod
    async def list_templates(self, org_id: str) -> list[dict[str, Any]]:
        """List templates for an organization."""

    @abstractmethod
    async def get_template(self, template_id: str) -> dict[str, Any] | None:
        """Fetch one template by id."""

    @abstractmethod
    async def record_template_usage(self, template_id: str, now: str) -> None:
        """Increment usage_count and update last_used_at."""

    @abstractmethod
    async def insert_review(self, review: dict[str, Any], decision: dict[str, Any]) -> None:
        """Insert an accuracy review and its companion decision atomically."""

    @abstractmethod
    async def list_reviews(self, work_item_id: str) -> list[dict[str, Any]]:
        """Return accuracy reviews for a work item, oldest first."""

    # Lifecycle
    @abstractmethod
    async def insert_lifecycle_event(self, event: dict[str, Any]) -> None: ...

    @abstractmethod
    async def list_lifecycle_events(self, work_item_id: str) -> list[dict[str, Any]]: ...

    @abstractmethod
    async def update_work_item_status(
        self,
        work_item_id: str,
        status: str,
        department_id: str,
        updated_at: str,
        expected_status: str | None = None,
    ) -> None: ...

    @abstractmethod
    async def record_transition(
        self,
        work_item_id: str,
        status: str,
        department_id: str,
        updated_at: str,
        event: dict[str, Any],
        expected_status: str | None = None,
        decision: dict[str, Any] | None = None,
    ) -> None: ...

    @abstractmethod
    async def record_reassignment(
        self,
        work_item_id: str,
        owner_agent_id: str,
        updated_at: str,
        event: dict[str, Any],
        previous_owner_agent_id: str | None = None,
    ) -> None: ...

    @abstractmethod
    async def insert_org_alert(self, alert: dict[str, Any]) -> None: ...

    @abstractmethod
    async def list_org_alerts(self, org_id: str) -> list[dict[str, Any]]: ...

    @abstractmethod
    async def has_org_alert(self, org_id: str, work_item_id: str, phase: str) -> bool: ...

    @abstractmethod
    async def record_escalation(
        self, alert: dict[str, Any], event: dict[str, Any]
    ) -> None: ...


class IInterruptRepository(ABC):
    """Read/write access to HITL interrupt/approval records."""

    @abstractmethod
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
    ) -> dict[str, Any]: ...

    @abstractmethod
    async def get(self, interrupt_id: str) -> dict[str, Any] | None: ...

    @abstractmethod
    async def list_pending(self) -> list[dict[str, Any]]: ...

    @abstractmethod
    async def list_all(self) -> list[dict[str, Any]]: ...

    @abstractmethod
    async def approve(
        self,
        interrupt_id: str,
        decision: str,
        reason: str,
        reasoning: str | None,
        now: str,
    ) -> dict[str, Any] | None: ...

    @abstractmethod
    async def reject(
        self,
        interrupt_id: str,
        reason: str,
        reasoning: str | None,
        now: str,
    ) -> dict[str, Any] | None: ...


class IThreadMetadataRepository(ABC):
    """Read/write access to LangGraph thread metadata."""

    @abstractmethod
    async def create(self, thread_id: str, title: str, idea_id: str | None, tags: list[str], agent_names: list[str], now: str) -> dict[str, Any]: ...

    @abstractmethod
    async def get(self, thread_id: str) -> dict[str, Any] | None: ...

    @abstractmethod
    async def list_all(self, status: str | None, limit: int, offset: int) -> list[dict[str, Any]]: ...

    @abstractmethod
    async def update(self, thread_id: str, **fields: Any) -> dict[str, Any] | None: ...

    @abstractmethod
    async def delete(self, thread_id: str) -> bool: ...

    @abstractmethod
    async def touch(self, thread_id: str, updated_at: str) -> None: ...
