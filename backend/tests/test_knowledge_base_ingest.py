"""Tests for multimodal knowledge-base ingestion and observability config."""

import base64
import os
from pathlib import Path

from fastapi.testclient import TestClient

from app.api.app import create_app
PNG_1X1 = base64.b64encode(
    bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c636000000200015d0b2d0b0000000049454e44ae426082"
    )
).decode("utf-8")


def test_multimodal_knowledge_base_ingest(patch_config, monkeypatch):
    kb_root = Path(patch_config).parent / "knowledge-base"
    monkeypatch.setattr("app.config.KNOWLEDGE_BASE_DIR", str(kb_root))
    monkeypatch.setattr("app.storage.knowledge_base.KNOWLEDGE_BASE_DIR", str(kb_root))
    monkeypatch.setattr("app.storage.yaml_io.KNOWLEDGE_BASE_DIR", str(kb_root))

    with TestClient(create_app()) as client:
        pdf_payload = {
            "filename": "sample.pdf",
            "mime_type": "application/pdf",
            "content_base64": base64.b64encode(b"%PDF-1.4\n%%EOF").decode("utf-8"),
            "source": "raw",
        }
        image_payload = {
            "filename": "sample.png",
            "mime_type": "image/png",
            "content_base64": PNG_1X1,
            "source": "raw",
        }

        pdf_res = client.post("/api/knowledge-base/ingest", json=pdf_payload)
        image_res = client.post("/api/knowledge-base/ingest", json=image_payload)

        assert pdf_res.status_code == 200
        assert image_res.status_code == 200
        assert pdf_res.json()["success"] is True
        assert image_res.json()["success"] is True

        kb = client.get("/api/knowledge-base")
        assert kb.status_code == 200
        payload = kb.json()
        filenames = {doc["filename"] for doc in payload["documents"]}
        assert "sample.pdf" in filenames
        assert "sample.png" in filenames


def test_langsmith_observability_config(monkeypatch, patch_config):
    monkeypatch.setattr("app.config.settings.langsmith_enabled", True)
    monkeypatch.setattr("app.config.settings.langsmith_api_key", "test-key")
    monkeypatch.setattr("app.config.settings.langsmith_project", "ideator-test")
    monkeypatch.setattr("app.config.settings.langsmith_endpoint", "https://api.smith.langchain.com")

    with TestClient(create_app()) as client:
        res = client.get("/api/config/observability")
        assert res.status_code == 200
        payload = res.json()
        assert payload["langsmith_enabled"] is True
        assert payload["project"] == "ideator-test"
        assert os.environ["LANGCHAIN_TRACING_V2"] == "true"
