"""MCP (Model Context Protocol) router for Warp terminal integration."""

import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from models.mcp import MCPRequest
from services.mcp_service import get_mcp_service

router = APIRouter(prefix="/mcp", tags=["MCP"])


@router.get("/sse")
async def mcp_sse_endpoint(request: Request) -> StreamingResponse:
    """
    SSE endpoint for MCP client connection.

    Warp connects to this endpoint to receive server info and establish
    bidirectional communication via SSE + POST.
    """
    mcp_service = get_mcp_service()

    async def event_generator() -> AsyncIterator[str]:
        """Generate SSE events for MCP."""
        # Send initial endpoint info
        async for event in mcp_service.generate_sse_stream():
            yield event

        # Keep connection alive with periodic pings
        import asyncio

        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                break

            # Send keepalive ping every 30 seconds
            yield f"event: ping\ndata: {json.dumps({'timestamp': __import__('time').time()})}\n\n"
            await asyncio.sleep(30)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@router.post("/messages")
async def mcp_messages_endpoint(request: Request) -> Response:
    """
    Handle MCP JSON-RPC messages.

    This endpoint receives tool calls and other MCP messages from Warp.
    """
    mcp_service = get_mcp_service()

    try:
        body = await request.json()
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Parse MCP request
    try:
        mcp_request = MCPRequest(**body)
    except Exception as e:
        return Response(
            content=json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": body.get("id"),
                    "error": {"code": -32700, "message": f"Parse error: {str(e)}"},
                }
            ),
            media_type="application/json",
            status_code=200,
        )

    # Handle request
    response = await mcp_service.handle_request(mcp_request)

    return Response(
        content=response.model_dump_json(), media_type="application/json", status_code=200
    )


@router.get("/health")
async def mcp_health() -> dict:
    """Health check for MCP endpoint."""
    mcp_service = get_mcp_service()
    tools = mcp_service.get_tool_definitions()

    return {
        "status": "ok",
        "protocol": "MCP",
        "version": "2024-11-05",
        "tools_count": len(tools),
        "tools": [t.name for t in tools],
    }


@router.get("/tools")
async def list_mcp_tools() -> dict:
    """List available MCP tools (convenience endpoint)."""
    mcp_service = get_mcp_service()
    tools = mcp_service.get_tool_definitions()

    return {"tools": [tool.model_dump() for tool in tools]}
