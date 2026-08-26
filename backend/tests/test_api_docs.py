from app.api.app import create_app
from fastapi.testclient import TestClient


class TestApiDocumentation:
    def test_openapi_schema_remains_available(self):
        with TestClient(create_app()) as client:
            response = client.get("/openapi.json")

        assert response.status_code == 200
        assert response.json()["info"]["title"] == "Agentic Organization Platform"

    def test_legacy_interactive_documentation_routes_are_disabled(self):
        with TestClient(create_app()) as client:
            docs_response = client.get("/docs")
            redoc_response = client.get("/redoc")

        assert docs_response.status_code == 404
        assert redoc_response.status_code == 404

    def test_openapi_schema_allows_the_published_scalar_origin(self):
        with TestClient(create_app()) as client:
            response = client.get(
                "/openapi.json",
                headers={"Origin": "https://azharameen.github.io"},
            )

        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == "https://azharameen.github.io"
