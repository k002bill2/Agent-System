"""RAG routes must be mounted in the application served to the dashboard."""

from api.app import create_app

from .route_table import snapshot


def test_rag_routes_are_mounted() -> None:
    """Avoid silently degrading RAG actions into dashboard-side 404s."""
    app = create_app(title="RAG registration test", debug=True)
    paths = {path for _, path, _ in snapshot(app.router)}

    assert "/api/rag/projects/{project_id}/index" in paths
    assert "/api/rag/projects/{project_id}/stats" in paths
