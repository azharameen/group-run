import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.app import create_app
from app import config
from app.api.routes.knowledge_base import router as kb_router
from app.api.routes import knowledge_base
from app.storage import knowledge_base as kb_storage


@pytest.fixture
def temp_kb(tmp_path, monkeypatch):
    """Create a temporary knowledge base directory structure."""
    kb_dir = tmp_path / "knowledge-base"
    (kb_dir / "raw" / "uploads").mkdir(parents=True)
    (kb_dir / "processed").mkdir(parents=True)
    (kb_dir / "siemens").mkdir(parents=True)
    
    # Add some test files
    (kb_dir / "raw" / "test.md").write_text("# Test Document\nContent with keyword: apple", encoding="utf-8")
    (kb_dir / "processed" / "info.txt").write_text("Information about orange", encoding="utf-8")
    
    # Mock KNOWLEDGE_BASE_DIR in all relevant modules
    kb_dir_str = str(kb_dir)
    monkeypatch.setattr("app.config.KNOWLEDGE_BASE_DIR", kb_dir_str)
    monkeypatch.setattr("app.api.routes.knowledge_base.KNOWLEDGE_BASE_DIR", kb_dir_str)
    monkeypatch.setattr("app.storage.knowledge_base.KNOWLEDGE_BASE_DIR", kb_dir_str)
    
    return kb_dir


def test_list_knowledge_base(temp_kb):
    client = TestClient(create_app())
    response = client.get("/api/knowledge-base")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] >= 2
    filenames = [d["filename"] for d in data["documents"]]
    assert "test.md" in filenames
    assert "info.txt" in filenames


def test_upload_document(temp_kb):
    client = TestClient(create_app())
    content = b"Upload test content"
    files = {"file": ("upload.txt", content, "text/plain")}
    response = client.post("/api/knowledge-base/upload", files=files)
    assert response.status_code == 201
    data = response.json()
    assert data["filename"] == "upload.txt"
    
    # Verify file exists on disk
    stored_path = Path(config.KNOWLEDGE_BASE_DIR) / data["path"]
    assert stored_path.exists()
    assert stored_path.read_bytes() == content


def test_search_documents(temp_kb):
    client = TestClient(create_app())
    
    # Search for "apple"
    response = client.get("/api/knowledge-base/search?q=apple")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 1
    assert data["documents"][0]["filename"] == "test.md"
    
    # Search for "orange"
    response = client.get("/api/knowledge-base/search?q=orange")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 1
    assert data["documents"][0]["filename"] == "info.txt"


def test_get_document_file(temp_kb):
    client = TestClient(create_app())
    
    # Get test.md
    response = client.get("/api/knowledge-base/file/raw/test.md")
    assert response.status_code == 200
    # Normalize newlines
    assert response.text.replace("\r\n", "\n").strip() == "# Test Document\nContent with keyword: apple"
    
    # Get non-existent
    response = client.get("/api/knowledge-base/file/raw/missing.md")
    assert response.status_code == 404


def test_path_traversal_protection(temp_kb):
    client = TestClient(create_app())
    response = client.get("/api/knowledge-base/file/../../.env")
    assert response.status_code in (403, 404)


def test_upload_unsupported_type(temp_kb):
    client = TestClient(create_app())
    content = b"Binary executable content"
    files = {"file": ("malicious.exe", content, "application/octet-stream")}
    response = client.post("/api/knowledge-base/upload", files=files)
    assert response.status_code == 400
    assert "Unsupported file type" in response.json()["detail"]


def test_search_special_characters(temp_kb):
    client = TestClient(create_app())
    
    # Add a file with special characters
    (temp_kb / "raw" / "special.md").write_text("Content with @#$%^&* symbols", encoding="utf-8")
    
    response = client.get("/api/knowledge-base/search?q=@#$%")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 1
    assert data["documents"][0]["filename"] == "special.md"


def test_upload_large_file(temp_kb):
    client = TestClient(create_app())
    content = b"x" * (1024 * 1024) 
    files = {"file": ("large.txt", content, "text/plain")}
    response = client.post("/api/knowledge-base/upload", files=files)
    assert response.status_code == 201
    data = response.json()
    assert data["filename"] == "large.txt"
    
    stored_path = Path(config.KNOWLEDGE_BASE_DIR) / data["path"]
    assert stored_path.stat().st_size == len(content)
