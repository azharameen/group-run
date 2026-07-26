"""APScheduler integration for autonomous workflow cycles."""

import asyncio
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from .config import settings
from .orchestrator.workflow import run_generation_cycle, is_cycle_running


scheduler: Optional[AsyncIOScheduler] = None


def start_scheduler():
    """Start the background scheduler for autonomous workflow cycles."""
    global scheduler

    if scheduler and scheduler.running:
        return

    scheduler = AsyncIOScheduler()

    # Run every N minutes
    interval = max(1, settings.workflow_interval_minutes)
    scheduler.add_job(
        _run_cycle_task,
        IntervalTrigger(minutes=interval),
        id="generation_cycle",
        replace_existing=True,
        max_instances=1,
    )

    scheduler.start()


def stop_scheduler():
    """Stop the background scheduler."""
    global scheduler
    if scheduler and scheduler.running:
        scheduler.shutdown(wait=False)
        scheduler = None


def _run_cycle_task():
    """Task wrapper that runs the generation cycle (called by APScheduler)."""
    if is_cycle_running():
        return  # Don't overlap cycles

    try:
        result = run_generation_cycle()
        print(f"[Scheduler] Cycle completed: {result.get('ideas_processed', 0)} ideas processed")
    except Exception as e:
        print(f"[Scheduler] Cycle error: {e}")
