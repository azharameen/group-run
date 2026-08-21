"""Deterministic work-item lifecycle state machine."""

LIFECYCLE_PHASES = (
    "new",
    "ideation",
    "product_definition",
    "development",
    "testing",
    "deployment",
    "monitoring",
)

PHASE_DEPARTMENT = {
    "new": "ideation",
    "ideation": "ideation",
    "product_definition": "ideation",
    "development": "technology",
    "testing": "technology",
    "deployment": "technology",
    "monitoring": "technology",
}


def next_phase(status: str) -> str | None:
    """Return the next phase, or ``None`` when the item is complete."""
    try:
        return LIFECYCLE_PHASES[LIFECYCLE_PHASES.index(status) + 1]
    except (ValueError, IndexError):
        return None
