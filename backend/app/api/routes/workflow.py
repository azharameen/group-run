"""Workflow, pipeline, stats, and knowledge-base endpoints."""

import asyncio
import base64
from pydantic import BaseModel

from fastapi import APIRouter
from ...application.queries.workflow_status import build_stats, build_workflow_status
from ...models.idea import PHASE_GROUPS
from ...orchestrator.workflow import (
    run_full_pipeline,
    run_generation_cycle,
    seed_ideas,
)
from ...storage.knowledge_base import save_knowledge_base_upload
from ...storage.yaml_io import load_knowledge_base


router = APIRouter(prefix="/api", tags=["workflow"])


class PipelineRequest(BaseModel):
    input_text: str = ""
    max_ideas: int = 3
    topic_id: int = 0
    topic_name: str = ""
    idea_category: str = "New Product Idea"
    project_id: int = 0
    project_name: str = ""


class PipelineResponse(BaseModel):
    pipeline_complete: bool
    timestamp: str
    user_input: str
    ideas_count: int
    ideas: list[dict]


class StatsResponse(BaseModel):
    total_ideas: int = 0
    by_phase: dict[str, int] = {}
    by_state: dict[str, int] = {}
    average_score: float = 0.0
    ideas_above_threshold: int = 0
    ideas_at_threshold: int = 0


class KnowledgeBaseUploadRequest(BaseModel):
    filename: str
    mime_type: str = ""
    content_base64: str
    source: str = "raw"


@router.post("/workflow/cycle")
async def trigger_cycle() -> dict:
    return run_generation_cycle()


@router.post("/workflow/seed")
async def trigger_seed(payload: dict | None = None) -> dict:
    count = payload.get("count", 3) if payload else 3
    created = seed_ideas(count)
    return {"seeded": created, "count": len(created)}


@router.get("/phases")
async def get_phases() -> dict:
    return {
        "phases": {name: [state.value for state in states] for name, states in PHASE_GROUPS.items()}
    }


@router.get("/knowledge-base")
async def get_knowledge_base() -> dict:
    docs = load_knowledge_base()
    return {
        "documents": docs,
        "count": len(docs),
        "sources": {
            "raw": len([doc for doc in docs if doc["source"] == "raw"]),
            "processed": len([doc for doc in docs if doc["source"] == "processed"]),
        },
    }


@router.post("/knowledge-base/ingest")
async def ingest_knowledge_base(req: KnowledgeBaseUploadRequest) -> dict:
    try:
        content = base64.b64decode(req.content_base64.encode("utf-8"))
    except Exception as exc:
        return {"success": False, "error": f"Invalid base64 content: {exc}"}
    record = save_knowledge_base_upload(
        req.filename,
        content,
        mime_type=req.mime_type,
        source=req.source,
    )
    docs = load_knowledge_base()
    return {
        "success": True,
        "record": record,
        "documents": docs,
        "count": len(docs),
    }


@router.get("/workflow/status")
async def workflow_status() -> dict:
    return build_workflow_status()


@router.post("/submit-pipeline", response_model=PipelineResponse)
async def submit_pipeline(req: PipelineRequest) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        run_full_pipeline,
        req.input_text,
        req.max_ideas,
        req.topic_name,
        req.idea_category,
        req.project_name,
    )


@router.post("/workflow/autonomous", response_model=PipelineResponse)
async def autonomous_pipeline(req: PipelineRequest) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, run_full_pipeline, "", req.max_ideas)


@router.post("/auto-pipeline")
async def auto_pipeline(req: PipelineRequest) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        run_full_pipeline,
        req.input_text,
        req.max_ideas,
        req.topic_name,
        req.idea_category,
        req.project_name,
    )


@router.get("/stats", response_model=StatsResponse)
async def get_stats() -> StatsResponse:
    return StatsResponse(**build_stats())
