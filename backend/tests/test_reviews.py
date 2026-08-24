"""Tests for Story 10.3 — support accuracy review and confidence flagging.

Covers the I/O & edge-case matrix from the spec:
- record_review happy path (not flagged) and flag boundary (89 vs 90)
- companion DecisionRecord written with type "review" and matching confidence
- list ordering oldest-first, latest review drives the flag
- 404 unknown item, 422 invalid score/blank summary
- empty list
- POST/GET /api/work-items/{id}/reviews endpoints
"""

import pytest
from app.api.app import create_app
from app.organization import service as org_service
from app.work_items import decisions as decisions_service
from app.work_items import reviews as reviews_service
from app.work_items import service as work_items_service
from app.work_items.models import AccuracyReviewRequest
from app.work_items.service import UnknownWorkItemError
from fastapi.testclient import TestClient


@pytest.fixture
def client(org_db, work_item_db):
    """TestClient over the full app with isolated in-memory org + work item DBs."""
    return TestClient(create_app())


@pytest.fixture
async def organization(org_db):
    """A default-structure organization to submit work items into."""
    return await org_service.create_organization("Acme Robotics")


class TestRecordReview:
    """Recording a review computes the flag and writes a decision."""

    @pytest.mark.asyncio
    async def test_record_review_happy_path_not_flagged(self, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        review = await reviews_service.record_review(
            AccuracyReviewRequest(reviewer="user", accuracy_score=95, summary="Looks accurate."),
            item.work_item_id,
        )
        assert review.review_id
        assert review.work_item_id == item.work_item_id
        assert review.accuracy_score == 95
        assert review.flagged_for_review is False
        assert review.reviewed_at

    @pytest.mark.asyncio
    async def test_flag_boundary_89_flagged_90_not(self, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        low = await reviews_service.record_review(
            AccuracyReviewRequest(reviewer="user", accuracy_score=89, summary="Borderline."),
            item.work_item_id,
        )
        high = await reviews_service.record_review(
            AccuracyReviewRequest(reviewer="user", accuracy_score=90, summary="Passing."),
            item.work_item_id,
        )
        assert low.flagged_for_review is True
        assert high.flagged_for_review is False

    @pytest.mark.asyncio
    async def test_decision_record_written_with_type_review(self, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        review = await reviews_service.record_review(
            AccuracyReviewRequest(reviewer="reviewer_1", accuracy_score=70, summary="Weak sourcing."),
            item.work_item_id,
        )
        records = await decisions_service.list_decisions(item.work_item_id)
        review_decisions = [d for d in records if d.decision_type == "review"]
        assert len(review_decisions) == 1
        decision = review_decisions[0]
        assert decision.agent_id == "reviewer_1"
        assert decision.reasoning == "Weak sourcing."
        assert decision.confidence == "low"
        assert decision.evidence == [f"accuracy_review:{review.review_id}"]
        assert decision.alternatives == []

    @pytest.mark.asyncio
    async def test_decision_confidence_high_when_not_flagged(self, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        await reviews_service.record_review(
            AccuracyReviewRequest(reviewer="user", accuracy_score=95, summary="Solid."),
            item.work_item_id,
        )
        records = await decisions_service.list_decisions(item.work_item_id)
        review_decisions = [d for d in records if d.decision_type == "review"]
        assert review_decisions[0].confidence == "high"

    @pytest.mark.asyncio
    async def test_record_review_unknown_item_raises(self):
        with pytest.raises(UnknownWorkItemError):
            await reviews_service.record_review(
                AccuracyReviewRequest(reviewer="user", accuracy_score=80, summary="Orphan."),
                "does-not-exist",
            )


class TestListReviews:
    """Ordering, latest-drives-flag, and empty-list behavior."""

    @pytest.mark.asyncio
    async def test_list_returns_oldest_first(self, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        await reviews_service.record_review(
            AccuracyReviewRequest(reviewer="user", accuracy_score=95, summary="First."),
            item.work_item_id,
        )
        await reviews_service.record_review(
            AccuracyReviewRequest(reviewer="user", accuracy_score=70, summary="Second."),
            item.work_item_id,
        )
        records = await reviews_service.list_reviews(item.work_item_id)
        assert [r.summary for r in records] == ["First.", "Second."]
        assert records[0].reviewed_at <= records[1].reviewed_at

    @pytest.mark.asyncio
    async def test_latest_review_drives_the_flag(self, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        await reviews_service.record_review(
            AccuracyReviewRequest(reviewer="user", accuracy_score=95, summary="First."),
            item.work_item_id,
        )
        await reviews_service.record_review(
            AccuracyReviewRequest(reviewer="user", accuracy_score=70, summary="Second."),
            item.work_item_id,
        )
        latest = await reviews_service.latest_review(item.work_item_id)
        assert latest is not None
        assert latest.summary == "Second."
        assert latest.flagged_for_review is True

    @pytest.mark.asyncio
    async def test_empty_list_when_no_reviews(self, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        assert await reviews_service.list_reviews(item.work_item_id) == []
        assert await reviews_service.latest_review(item.work_item_id) is None

    @pytest.mark.asyncio
    async def test_list_unknown_work_item_raises(self):
        with pytest.raises(UnknownWorkItemError):
            await reviews_service.list_reviews("does-not-exist")


class TestReviewsApi:
    """The /api/work-items/{id}/reviews endpoints."""

    @pytest.mark.asyncio
    async def test_post_creates_review(self, client, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        response = client.post(
            f"/api/work-items/{item.work_item_id}/reviews",
            json={"reviewer": "user", "accuracy_score": 95, "summary": "Verified against source."},
        )
        assert response.status_code == 201
        body = response.json()["review"]
        assert body["accuracy_score"] == 95
        assert body["flagged_for_review"] is False
        assert body["review_id"]

    @pytest.mark.asyncio
    async def test_post_flags_low_score(self, client, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        response = client.post(
            f"/api/work-items/{item.work_item_id}/reviews",
            json={"reviewer": "user", "accuracy_score": 70, "summary": "Weak."},
        )
        assert response.status_code == 201
        assert response.json()["review"]["flagged_for_review"] is True

    def test_post_unknown_work_item_404(self, client):
        response = client.post(
            "/api/work-items/nope/reviews",
            json={"reviewer": "user", "accuracy_score": 80, "summary": "x"},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_post_invalid_score_over_100_422(self, client, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        response = client.post(
            f"/api/work-items/{item.work_item_id}/reviews",
            json={"reviewer": "user", "accuracy_score": 101, "summary": "x"},
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_post_invalid_score_negative_422(self, client, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        response = client.post(
            f"/api/work-items/{item.work_item_id}/reviews",
            json={"reviewer": "user", "accuracy_score": -1, "summary": "x"},
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_post_blank_summary_422(self, client, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        response = client.post(
            f"/api/work-items/{item.work_item_id}/reviews",
            json={"reviewer": "user", "accuracy_score": 80, "summary": "   "},
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_get_returns_reviews_oldest_first(self, client, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        client.post(
            f"/api/work-items/{item.work_item_id}/reviews",
            json={"reviewer": "user", "accuracy_score": 95, "summary": "First."},
        )
        client.post(
            f"/api/work-items/{item.work_item_id}/reviews",
            json={"reviewer": "user", "accuracy_score": 70, "summary": "Second."},
        )
        response = client.get(f"/api/work-items/{item.work_item_id}/reviews")
        assert response.status_code == 200
        body = response.json()
        assert body["count"] == 2
        assert [r["summary"] for r in body["reviews"]] == ["First.", "Second."]

    @pytest.mark.asyncio
    async def test_get_empty_when_no_reviews(self, client, organization):
        item = await work_items_service.submit_work_item("Scanner", org_id=organization.org_id)
        response = client.get(f"/api/work-items/{item.work_item_id}/reviews")
        assert response.status_code == 200
        assert response.json() == {"reviews": [], "count": 0}

    def test_get_unknown_work_item_404(self, client):
        response = client.get("/api/work-items/nope/reviews")
        assert response.status_code == 404
