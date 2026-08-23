"""Accuracy review service (Story 10.3).

Records human accuracy reviews against a work item, deriving the
``flagged_for_review`` state at write time (score < 90) and persisting a
companion ``DecisionRecord`` (decision_type="review") in the same
transaction so the review carries full provenance. Kept as its own
module so ``service.py`` stays under the file-size limit.
"""

import uuid
from datetime import UTC, datetime

from . import repository
from .mapping import row_to_review
from .models import AccuracyReview, AccuracyReviewRequest
from .service import UnknownWorkItemError

#: Accuracy score below this threshold flags the review for human attention
#: (PRD counter-metric SM-C1: 90% accuracy floor).
FLAG_THRESHOLD = 90


def record_review(request: AccuracyReviewRequest, work_item_id: str) -> AccuracyReview:
    """Record a human accuracy review and its companion decision.

    Args:
        request: The validated review submission.
        work_item_id: The work item being reviewed.

    Returns:
        The persisted ``AccuracyReview``.

    Raises:
        UnknownWorkItemError: If no work item with ``work_item_id`` exists.
    """
    if repository.get_work_item_rows(work_item_id) is None:
        raise UnknownWorkItemError(f"Work item {work_item_id} not found")

    review_id = str(uuid.uuid4())
    flagged = request.accuracy_score < FLAG_THRESHOLD
    reviewed_at = datetime.now(UTC).isoformat()
    review = AccuracyReview(
        review_id=review_id,
        work_item_id=work_item_id,
        reviewer=request.reviewer,
        accuracy_score=request.accuracy_score,
        summary=request.summary,
        flagged_for_review=flagged,
        reviewed_at=reviewed_at,
    )
    decision = {
        "decision_id": str(uuid.uuid4()),
        "work_item_id": work_item_id,
        "agent_id": request.reviewer,
        "decision_type": "review",
        "reasoning": request.summary,
        "evidence": [f"accuracy_review:{review_id}"],
        "confidence": "high" if request.accuracy_score >= FLAG_THRESHOLD else "low",
        "alternatives": [],
        "decided_at": reviewed_at,
    }
    repository.insert_review(review.model_dump(), decision)
    return review


def list_reviews(work_item_id: str) -> list[AccuracyReview]:
    """Return accuracy reviews for one item, oldest first.

    Raises:
        UnknownWorkItemError: If no work item with ``work_item_id`` exists.
    """
    if repository.get_work_item_rows(work_item_id) is None:
        raise UnknownWorkItemError(f"Work item {work_item_id} not found")
    return [row_to_review(row) for row in repository.list_reviews(work_item_id)]


def latest_review(work_item_id: str) -> AccuracyReview | None:
    """Return the most recently submitted review, or None if there are none."""
    reviews = list_reviews(work_item_id)
    return reviews[-1] if reviews else None
