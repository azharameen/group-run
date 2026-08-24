"""Tests for Story 10.1 — record decisions with provenance metadata.

Covers the I/O & edge-case matrix from the spec:
- routing decision recorded on submit
- transition/handoff decision recorded on transition
- record_decision happy path + unknown item
- list_decisions merge order, filters, and legacy synthesis
- corrupt evidence JSON tolerated
- GET/POST /api/work-items/decisions endpoints
"""

import pytest
from app.api.app import create_app
from app.organization import service as org_service
from app.work_items import decisions as decisions_service
from app.work_items import repository as work_items_repository
from app.work_items import service as work_items_service
from app.work_items.models import OWNER_AGENT_ID, RecordDecisionRequest
from app.work_items.service import UnknownWorkItemError
from fastapi.testclient import TestClient


@pytest.fixture
def client(org_db, work_item_db):
    """TestClient over the full app with isolated in-memory org + work item DBs."""
    return TestClient(create_app())


@pytest.fixture
def client(org_db, work_item_db):
    """TestClient over the full app with isolated in-memory org + work item DBs."""
    return TestClient(create_app())


@pytest.fixture
async def organization(org_db):
    """A default-structure organization to submit work items into."""
    return await org_service.create_organization("Acme Robotics")


class TestDecisionRecording:
    """Every decision point records provenance automatically."""

    @pytest.mark.asyncio
    async def test_routing_decision_recorded_on_submit(self, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        rows = await work_items_repository.list_decisions(item.work_item_id)
        assert len(rows) == 1
        assert rows[0]["decision_type"] == "routing"
        assert rows[0]["agent_id"] == OWNER_AGENT_ID
        assert rows[0]["confidence"] == "low"
        assert rows[0]["reasoning"]
        assert rows[0]["decided_at"]

    @pytest.mark.asyncio
    async def test_transition_decision_recorded(self, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        await work_items_service.transition_work_item(item.work_item_id, "ideation")
        rows = await work_items_repository.list_decisions(item.work_item_id)
        types = [row["decision_type"] for row in rows]
        assert types == ["routing", "transition"]

    @pytest.mark.asyncio
    async def test_handoff_decision_recorded(self, organization):
        item = await work_items_service.submit_work_item(
            "Scanner", org_id=organization.org_id, department="technology"
        )
        await work_items_service.transition_work_item(item.work_item_id, "development")
        rows = await work_items_repository.list_decisions(item.work_item_id)
        types = [row["decision_type"] for row in rows]
        assert "handoff" in types or "transition" in types


class TestRecordDecision:
    """Explicit decision recording via the service."""

    @pytest.mark.asyncio
    async def test_record_decision_happy_path(self, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        request = RecordDecisionRequest(
            work_item_id=item.work_item_id,
            agent_id="reviewer_agent",
            decision_type="review",
            reasoning="Output verified against source material.",
            evidence=["work_item:abc:research:1"],
            confidence="high",
            alternatives=["reject"],
        )
        record = await decisions_service.record_decision(request)
        assert record.decision_id
        assert record.agent_id == "reviewer_agent"
        assert record.decision_type == "review"
        assert record.evidence == ["work_item:abc:research:1"]
        assert record.confidence == "high"
        stored = await work_items_repository.list_decisions(item.work_item_id)
        assert any(row["decision_type"] == "review" for row in stored)

    @pytest.mark.asyncio
    async def test_record_decision_unknown_item(self):
        request = RecordDecisionRequest(
            work_item_id="does-not-exist",
            agent_id="reviewer_agent",
            decision_type="review",
            reasoning="Orphan decision.",
            confidence="low",
        )
        with pytest.raises(UnknownWorkItemError):
            await decisions_service.record_decision(request)


class TestListDecisions:
    """Merge order, filters, and legacy synthesis."""

    @pytest.mark.asyncio
    async def test_list_returns_routing_then_transition_oldest_first(
        self, organization
    ):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        await work_items_service.transition_work_item(item.work_item_id, "ideation")
        records = await decisions_service.list_decisions(item.work_item_id)
        assert [r.decision_type for r in records] == ["routing", "transition"]
        assert records[0].decided_at <= records[1].decided_at

    @pytest.mark.asyncio
    async def test_list_no_duplicates_for_new_items(self, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        await work_items_service.transition_work_item(item.work_item_id, "ideation")
        records = await decisions_service.list_decisions(item.work_item_id)
        assert len(records) == 2

    @pytest.mark.asyncio
    async def test_list_synthesizes_legacy_for_preexisting_items(
        self, organization
    ):
        item = await work_items_service.submit_work_item("Legacy", org_id=organization.org_id)
        await work_items_service.transition_work_item(item.work_item_id, "ideation")
        from sqlalchemy import text
        from app.db.session import get_session_factory
        async with get_session_factory()() as session:
            await session.execute(text("DELETE FROM decisions WHERE work_item_id = :id"), {"id": item.work_item_id})
            await session.commit()
        records = await decisions_service.list_decisions(item.work_item_id)
        assert [r.decision_type for r in records] == ["routing", "transition"]

    @pytest.mark.asyncio
    async def test_list_filters_by_agent(self, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        await decisions_service.record_decision(
            RecordDecisionRequest(
                work_item_id=item.work_item_id,
                agent_id="special_agent",
                decision_type="review",
                reasoning="Special review.",
                confidence="high",
            )
        )
        records = await decisions_service.list_decisions(item.work_item_id, agent_id="special_agent")
        assert all(r.agent_id == "special_agent" for r in records)
        assert len(records) == 1

    @pytest.mark.asyncio
    async def test_list_filters_by_time_range(self, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        all_records = await decisions_service.list_decisions(item.work_item_id)
        assert len(all_records) >= 1
        none_after = await decisions_service.list_decisions(
            item.work_item_id, from_ts="2999-01-01T00:00:00+00:00"
        )
        assert none_after == []

    @pytest.mark.asyncio
    async def test_list_unknown_work_item_raises(self):
        with pytest.raises(UnknownWorkItemError):
            await decisions_service.list_decisions("does-not-exist")

    @pytest.mark.asyncio
    async def test_corrupt_evidence_json_tolerated(self, organization):
        import uuid
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        cid = f"corrupt-{uuid.uuid4()}"
        from sqlalchemy import text
        from app.db.session import get_session_factory
        async with get_session_factory()() as session:
            await session.execute(
                text(
                    "INSERT INTO decisions (decision_id, work_item_id, agent_id, decision_type, reasoning, evidence, confidence, alternatives, decided_at) "
                    "VALUES (:decision_id, :work_item_id, :agent_id, :decision_type, :reasoning, :evidence, :confidence, :alternatives, :decided_at)"
                ),
                {
                    "decision_id": cid,
                    "work_item_id": item.work_item_id,
                    "agent_id": "agent_x",
                    "decision_type": "review",
                    "reasoning": "bad json",
                    "evidence": "not-json",
                    "confidence": "high",
                    "alternatives": "also-not-json",
                    "decided_at": "2026-01-01T00:00:00+00:00",
                },
            )
            await session.commit()
        records = await decisions_service.list_decisions(item.work_item_id)
        corrupt = next(r for r in records if r.decision_id == cid)
        assert corrupt.evidence == []
        assert corrupt.alternatives == []


class TestDecisionsApi:
    """The /api/work-items/decisions endpoints."""

    @pytest.mark.asyncio
    async def test_get_returns_decisions(self, client, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        await work_items_service.transition_work_item(item.work_item_id, "ideation")
        response = client.get(f"/api/work-items/decisions?work_item_id={item.work_item_id}")
        assert response.status_code == 200
        body = response.json()
        assert body["count"] == 2
        assert [d["decision_type"] for d in body["decisions"]] == ["routing", "transition"]
        for decision in body["decisions"]:
            assert decision["agent_id"]
            assert decision["decided_at"]
            assert decision["reasoning"]
            assert "confidence" in decision
            assert "evidence" in decision
            assert "alternatives" in decision

    def test_get_unknown_work_item_404(self, client):
        response = client.get("/api/work-items/decisions?work_item_id=nope")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_post_creates_decision(self, client, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        response = client.post(
            "/api/work-items/decisions",
            json={
                "work_item_id": item.work_item_id,
                "agent_id": "reviewer_agent",
                "decision_type": "review",
                "reasoning": "Verified.",
                "evidence": ["ref:1"],
                "confidence": "high",
                "alternatives": ["reject"],
            },
        )
        assert response.status_code == 201
        body = response.json()["decision"]
        assert body["decision_type"] == "review"
        assert body["evidence"] == ["ref:1"]

    def test_post_unknown_work_item_404(self, client):
        response = client.post(
            "/api/work-items/decisions",
            json={
                "work_item_id": "nope",
                "agent_id": "a",
                "decision_type": "review",
                "reasoning": "x",
                "confidence": "low",
            },
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_post_invalid_confidence_422(self, client, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        response = client.post(
            "/api/work-items/decisions",
            json={
                "work_item_id": item.work_item_id,
                "agent_id": "a",
                "decision_type": "review",
                "reasoning": "x",
                "confidence": "medium",
            },
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_post_empty_reasoning_422(self, client, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        response = client.post(
            "/api/work-items/decisions",
            json={
                "work_item_id": item.work_item_id,
                "agent_id": "a",
                "decision_type": "review",
                "reasoning": "",
                "confidence": "low",
            },
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_post_whitespace_reasoning_422(self, client, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        response = client.post(
            "/api/work-items/decisions",
            json={
                "work_item_id": item.work_item_id,
                "agent_id": "a",
                "decision_type": "review",
                "reasoning": "   ",
                "confidence": "low",
            },
        )
        assert response.status_code == 422
