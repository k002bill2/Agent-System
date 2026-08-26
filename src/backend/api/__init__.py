"""FastAPI application and routes."""

import os

from api.app import create_app

if os.getenv("RAILWAY", "false").lower() == "true":
    # Railway uses the dependency-light app branch and must not import the full
    # route graph while uvicorn resolves ``api.app:app``.
    router = None
    websocket_endpoint = None
else:
    from api.routes import router
    from api.websocket import websocket_endpoint

__all__ = [
    "create_app",
    "router",
    "websocket_endpoint",
]
