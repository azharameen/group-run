import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.api.app import create_app
from app.storage.idea_workspace import create_idea_folder, save_idea_yaml
from app.storage.registry import save_idea_registry


@pytest.fixture
def client():
    return TestClient(create_app())


class TestIdeasCrud:
    def test_list_empty(self, client, patch_config):
        res = client.get("/api/ideas")
        assert res.status_code == 200
        assert res.json() == {"ideas": [], "count": 0}

    def test_list_with_data(self, client, patch_config):
        create_idea_folder("IDEA-0001")
        save_idea_yaml(
            "IDEA-0001",
            "idea.yaml",
            {
                "idea_id": "IDEA-0001",
                "title": "First idea",
                "created_at": "2026-08-07T00:00:00",
                "updated_at": "2026-08-07T01:00:00",
            },
        )
        save_idea_registry({"ideas": [{"idea_id": "IDEA-0001", "title": "First idea"}], "next_id": 2})
        res = client.get("/api/ideas")
        assert res.status_code == 200
        assert res.json()["count"] == 1

    def test_get_valid(self, client, patch_config):
        create_idea_folder("IDEA-0002")
        save_idea_yaml("IDEA-0002", "idea.yaml", {"idea_id": "IDEA-0002", "title": "Hello"})
        res = client.get("/api/ideas/IDEA-0002")
        assert res.status_code == 200

    def test_get_nonexistent(self, client, patch_config):
        assert client.get("/api/ideas/IDEA-9999").status_code == 404

    def test_get_invalid_format(self, client, patch_config):
        assert client.get("/api/ideas/idea-0001").status_code == 400

    def test_create_with_title(self, client, patch_config):
        assert client.post("/api/ideas", json={"title": "My Idea", "signal_text": "Signal"}).status_code == 200

    def test_create_auto_untitled(self, client, patch_config):
        idea_id = client.post("/api/ideas", json={}).json()["idea_id"]
        assert client.get(f"/api/ideas/{idea_id}").json()["idea"]["title"] == "Untitled"

    def test_update_valid_field(self, client, patch_config):
        create_idea_folder("IDEA-0003")
        save_idea_yaml("IDEA-0003", "idea.yaml", {"idea_id": "IDEA-0003", "title": "Old"})
        assert client.post("/api/ideas/IDEA-0003/update", json={"field": "title", "value": "New"}).status_code == 200

    def test_update_invalid_field(self, client, patch_config):
        create_idea_folder("IDEA-0004")
        save_idea_yaml("IDEA-0004", "idea.yaml", {"idea_id": "IDEA-0004", "title": "Old"})
        assert client.post("/api/ideas/IDEA-0004/update", json={"field": "bad", "value": "x"}).status_code == 400

    def test_delete_existing(self, client, patch_config):
        create_idea_folder("IDEA-0005")
        save_idea_yaml("IDEA-0005", "idea.yaml", {"idea_id": "IDEA-0005", "title": "Delete"})
        assert client.delete("/api/ideas/IDEA-0005").status_code == 200

    def test_delete_nonexistent(self, client, patch_config):
        assert client.delete("/api/ideas/IDEA-9998").status_code == 404

    def test_archive_existing(self, client, patch_config):
        create_idea_folder("IDEA-0006")
        save_idea_yaml("IDEA-0006", "idea.yaml", {"idea_id": "IDEA-0006", "title": "Archive"})
        assert client.post("/api/ideas/IDEA-0006/archive").status_code == 200

    def test_comment_valid(self, client, patch_config):
        create_idea_folder("IDEA-0007")
        save_idea_yaml("IDEA-0007", "idea.yaml", {"idea_id": "IDEA-0007", "title": "Comment"})
        assert client.post("/api/ideas/IDEA-0007/comment", json={"text": "Nice idea"}).status_code == 200

    def test_comment_empty_text(self, client, patch_config):
        create_idea_folder("IDEA-0008")
        save_idea_yaml("IDEA-0008", "idea.yaml", {"idea_id": "IDEA-0008", "title": "Comment"})
        assert client.post("/api/ideas/IDEA-0008/comment", json={"text": ""}).status_code == 422

    @pytest.mark.parametrize("idea_id", ["idea-1", "IDEA_1", "Idea-1", "IDEA!1"])
    def test_idea_id_format_validation(self, client, patch_config, idea_id):
        assert client.get(f"/api/ideas/{idea_id}").status_code == 400

    @patch("app.api.routes.ideas.delete_idea_folder")
    def test_archive_cleanup_failure_is_non_fatal(self, mock_delete, client, patch_config):
        mock_delete.side_effect = Exception("Simulated failure")
        create_idea_folder("IDEA-0009")
        save_idea_yaml("IDEA-0009", "idea.yaml", {"idea_id": "IDEA-0009", "title": "Archive Cleanup"})
        res = client.post("/api/ideas/IDEA-0009/archive")
        assert res.status_code == 200
        assert res.json()["archived"] is True

    @patch("app.api.routes.ideas.delete_idea_folder")
    def test_delete_cleanup_failure_is_non_fatal(self, mock_delete, client, patch_config):
        mock_delete.side_effect = Exception("Simulated failure")
        create_idea_folder("IDEA-0010")
        save_idea_yaml("IDEA-0010", "idea.yaml", {"idea_id": "IDEA-0010", "title": "Delete Cleanup"})
        res = client.delete("/api/ideas/IDEA-0010")
        assert res.status_code == 200
        assert res.json()["deleted"] is True

    def test_concurrent_creates(self, patch_config):
        import asyncio
        from httpx import ASGITransport, AsyncClient

        app = create_app()

        async def run_concurrent():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                tasks = [
                    ac.post(
                        "/api/ideas",
                        json={"title": f"Idea {i}"},
                        headers={"Authorization": "Bearer test-id-token"},
                    )
                    for i in range(10)
                ]
                results = await asyncio.gather(*tasks)
                return results

        responses = asyncio.run(run_concurrent())
        assert all(r.status_code == 200 for r in responses)
        idea_ids = [r.json()["idea_id"] for r in responses]
        assert len(idea_ids) == 10
        assert len(set(idea_ids)) == 10  # All unique

    def test_concurrent_updates(self, patch_config):
        import asyncio
        from httpx import ASGITransport, AsyncClient

        create_idea_folder("IDEA-0020")
        save_idea_yaml("IDEA-0020", "idea.yaml", {"idea_id": "IDEA-0020", "title": "Initial Title"})
        save_idea_registry({"ideas": [{"idea_id": "IDEA-0020", "title": "Initial Title"}], "next_id": 21})

        app = create_app()

        async def run_concurrent_updates():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                tasks = [
                    ac.post(
                        "/api/ideas/IDEA-0020/update",
                        json={"field": "title", "value": f"Title {i}"},
                        headers={"Authorization": "Bearer test-id-token"},
                    )
                    for i in range(10)
                ]
                results = await asyncio.gather(*tasks)
                return results

        responses = asyncio.run(run_concurrent_updates())
        assert all(r.status_code == 200 for r in responses)

        # Check that idea state exists and holds one of the final values cleanly
        res = TestClient(app).get("/api/ideas/IDEA-0020")
        assert res.status_code == 200
        final_title = res.json()["idea"]["title"]
        assert final_title.startswith("Title ")

    def test_non_blocking_event_loop(self, patch_config):
        import asyncio
        import time
        from httpx import ASGITransport, AsyncClient

        app = create_app()

        async def run_test():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                loop_ticks = 0

                async def monitor_event_loop():
                    nonlocal loop_ticks
                    for _ in range(10):
                        await asyncio.sleep(0.01)
                        loop_ticks += 1

                def slow_list():
                    time.sleep(0.1)
                    return {"ideas": [], "count": 0}

                with patch("app.api.routes.ideas._list_ideas_sync", side_effect=slow_list):
                    monitor_task = asyncio.create_task(monitor_event_loop())
                    req_task = asyncio.create_task(
                        ac.get(
                            "/api/ideas",
                            headers={"Authorization": "Bearer test-id-token"},
                        )
                    )

                    res, _ = await asyncio.gather(req_task, monitor_task)
                    assert res.status_code == 200
                    assert loop_ticks >= 5

        asyncio.run(run_test())
