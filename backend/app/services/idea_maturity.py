"""Idea maturity stages — forward-only, human-attested progression.

Persistence is a per-idea ``maturity.yaml`` inside the idea workspace folder.
The history list is the single source of truth: the current stage is always
derived from the last history entry, so N records ⇔ stage N and the trail is
trivially auditable.
"""

from datetime import UTC, datetime

from ..storage.idea_workspace import load_idea_yaml, save_idea_yaml

MATURITY_STAGES: tuple[str, ...] = ("raw", "refined", "validated", "ready-for-planning")

STAGE_CRITERIA: dict[str, list[str]] = {
    "raw": [],
    "refined": [
        "Problem statement names the problem and who is affected",
        "Solution concept is concrete",
        "Original signal is captured",
    ],
    "validated": [
        "Claims are backed by research artifacts or KB references",
        "Artifact revisions with provenance exist (e.g. artifact:research:v2)",
    ],
    "ready-for-planning": [
        "Feasibility and business impact assessed",
        "Remaining risks and open questions documented",
    ],
}

_MATURITY_FILENAME = "maturity.yaml"
_TERMINAL = MATURITY_STAGES[-1]


class UnknownIdeaError(Exception):
    """Raised when the idea folder/idea.yaml does not exist."""


class InvalidTransitionError(Exception):
    """Raised when a transition is not exactly one step forward from current."""


def _load(idea_id: str) -> dict:
    data = load_idea_yaml(idea_id, _MATURITY_FILENAME)
    if not isinstance(data, dict):
        return {"stage": "raw", "history": []}
    history = data.get("history")
    if not isinstance(history, list):
        history = []
    history = [entry for entry in history if isinstance(entry, dict)]
    return {"stage": _derive_stage(history), "history": history}


def _derive_stage(history: list[dict]) -> str:
    if not history:
        return MATURITY_STAGES[0]
    return str(history[-1].get("stage", MATURITY_STAGES[0]))


def _next_stage(stage: str) -> str | None:
    """Return the stage after ``stage``, or None for terminal/unknown stages.

    Unknown persisted stages (corruption, a future stage rename) are treated
    as transition-locked rather than raising, so a corrupt file degrades to
    a 409 on write instead of a 500.
    """
    try:
        index = MATURITY_STAGES.index(stage)
    except ValueError:
        return None
    if index + 1 >= len(MATURITY_STAGES):
        return None
    return MATURITY_STAGES[index + 1]


def get_maturity(idea_id: str) -> dict:
    """Read an idea's maturity record, deriving stage from history.

    Args:
        idea_id: The idea to inspect.

    Returns:
        Dict with ``stage``, ``current``, ``history``, and ``next_stage``.
        Missing file reads as ``raw`` with empty history (no write on read).

    Raises:
        UnknownIdeaError: If the idea does not exist.
    """
    idea = load_idea_yaml(idea_id, "idea.yaml")
    if not isinstance(idea, dict):
        raise UnknownIdeaError(f"Idea {idea_id} not found")
    record = _load(idea_id)
    history = record["history"]
    return {
        "stage": record["stage"],
        "current": history[-1] if history else None,
        "history": history,
        "next_stage": _next_stage(record["stage"]),
    }


def transition_stage(idea_id: str, request: dict) -> dict:
    """Record a one-step forward stage transition for an idea.

    Args:
        idea_id: The idea to advance.
        request: Dict with ``stage`` (target), non-empty ``criteria`` and
            ``evidence_refs`` lists of non-blank strings, and ``recorded_by``.

    Returns:
        Dict with ``stage`` and the appended ``record``.

    Raises:
        UnknownIdeaError: If the idea does not exist.
        InvalidTransitionError: If the target is not the immediate next stage
            (skip, backward, or terminal).
    """
    if not isinstance(load_idea_yaml(idea_id, "idea.yaml"), dict):
        raise UnknownIdeaError(f"Idea {idea_id} not found")

    current = _load(idea_id)["stage"]
    target = request["stage"]
    if target not in MATURITY_STAGES:
        raise InvalidTransitionError(f"Unknown stage '{target}'. Stages: {MATURITY_STAGES}")
    if current not in MATURITY_STAGES:
        raise InvalidTransitionError(
            f"Cannot transition from unknown stage '{current}'; refusing to advance"
        )
    if _next_stage(current) != target:
        if current == _TERMINAL:
            raise InvalidTransitionError(
                f"Cannot transition from terminal stage '{current}' to '{target}'"
            )
        raise InvalidTransitionError(
            f"Cannot transition from '{current}' to '{target}'; "
            f"next allowed stage is '{_next_stage(current)}'"
        )

    record = {
        "stage": target,
        "criteria": [str(item) for item in request["criteria"]],
        "evidence_refs": [str(item) for item in request["evidence_refs"]],
        "recorded_by": request.get("recorded_by") or "user",
        "recorded_at": datetime.now(UTC).isoformat(),
    }
    save_idea_yaml(
        idea_id, _MATURITY_FILENAME,
        {"stage": target, "history": _load(idea_id)["history"] + [record]},
    )
    return {"stage": target, "record": record}
