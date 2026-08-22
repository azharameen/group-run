"""Tests for route validation and input bounds enforcement."""

import pytest
from fastapi.testclient import TestClient

from app.api.app import create_app

client = TestClient(create_app())


def test_create_thread_validation():
    # Title exceeds 200 chars
    res = client.post("/api/threads", json={"title": "a" * 201})
    assert res.status_code == 422

    # Tags list exceeds 50 items
    res = client.post("/api/threads", json={"tags": ["tag"] * 51})
    assert res.status_code == 422


def test_list_threads_query_validation():
    # Invalid limit (< 1)
    res = client.get("/api/threads?limit=0")
    assert res.status_code == 422

    # Invalid limit (> 500)
    res = client.get("/api/threads?limit=501")
    assert res.status_code == 422

    # Invalid offset (< 0)
    res = client.get("/api/threads?offset=-1")
    assert res.status_code == 422


def test_send_message_validation():
    # Empty text
    res = client.post("/api/threads/test-id/stream", json={"text": ""})
    assert res.status_code == 422

    # Overlong text
    res = client.post("/api/threads/test-id/stream", json={"text": "a" * 10001})
    assert res.status_code == 422


def test_chat_stream_validation():
    # Empty text
    res = client.post("/api/chat/stream", json={"text": ""})
    assert res.status_code == 422

    # Overlong text
    res = client.post("/api/chat/stream", json={"text": "a" * 10001})
    assert res.status_code == 422


def test_ideas_validation():
    # Overlong title
    res = client.post("/api/ideas", json={"title": "a" * 201})
    assert res.status_code == 422

    # Overlong comment author
    res = client.post("/api/ideas/IDEA-0001/comment", json={"text": "Valid comment", "author": "a" * 101})
    assert res.status_code == 422

    # Empty comment text
    res = client.post("/api/ideas/IDEA-0001/comment", json={"text": ""})
    assert res.status_code == 422


def test_work_items_validation():
    # Empty title
    res = client.post("/api/work-items", json={"title": ""})
    assert res.status_code == 400

    # Overlong title
    res = client.post("/api/work-items", json={"title": "a" * 201})
    assert res.status_code == 400

    # Overlong description
    res = client.post("/api/work-items", json={"title": "Valid", "description": "a" * 5001})
    assert res.status_code == 422


def test_organization_validation():
    # Empty name
    res = client.post("/api/organizations", json={"name": ""})
    assert res.status_code == 400

    # Overlong name
    res = client.post("/api/organizations", json={"name": "a" * 201})
    assert res.status_code == 400


def test_interrupt_validation():
    # Missing required fields
    res = client.post("/api/interrupts/", json={"thread_id": "t1"})
    assert res.status_code == 422

    # Overlong message
    res = client.post("/api/interrupts/", json={
        "thread_id": "t1",
        "tool_name": "tool",
        "message": "a" * 2001
    })
    assert res.status_code == 422


def test_knowledge_base_search_validation():
    # Empty query q
    res = client.get("/api/knowledge-base/search?q=")
    assert res.status_code == 422

    # Overlong query q (> 500)
    res = client.get(f"/api/knowledge-base/search?q={'a' * 501}")
    assert res.status_code == 422
