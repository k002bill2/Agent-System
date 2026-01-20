"""WebSocket endpoint for real-time updates."""

import asyncio
import json
import os
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from models.message import (
    Message,
    MessageType,
    TaskCreatePayload,
    ApprovalResponsePayload,
    ApprovalRequiredPayload,
    ApprovalGrantedPayload,
    ApprovalDeniedPayload,
)
from models.hitl import ApprovalStatus
from api.deps import get_engine

# Heartbeat configuration
WS_HEARTBEAT_INTERVAL = int(os.getenv("WS_HEARTBEAT_INTERVAL", "20"))


websocket_router = APIRouter()


class ConnectionManager:
    """WebSocket connection manager."""

    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        """Accept and register a new connection."""
        await websocket.accept()
        self.active_connections[session_id] = websocket

    def disconnect(self, session_id: str):
        """Remove a connection."""
        self.active_connections.pop(session_id, None)

    async def send_message(self, session_id: str, message: Message):
        """Send a message to a specific session."""
        websocket = self.active_connections.get(session_id)
        if websocket:
            await websocket.send_json(message.model_dump(mode="json"))

    async def broadcast(self, message: Message):
        """Broadcast a message to all connections."""
        for session_id, websocket in self.active_connections.items():
            await websocket.send_json(message.model_dump(mode="json"))


manager = ConnectionManager()


async def heartbeat_task(session_id: str, websocket: WebSocket, interval: int = WS_HEARTBEAT_INTERVAL):
    """
    Server-side heartbeat task.
    Sends periodic PING messages to keep the connection alive.
    """
    try:
        while True:
            await asyncio.sleep(interval)
            if websocket.client_state.name == "CONNECTED":
                await websocket.send_json({
                    "type": "ping",
                    "session_id": session_id,
                })
    except asyncio.CancelledError:
        pass  # Task was cancelled, clean exit
    except Exception:
        pass  # Connection closed or other error


async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for orchestration streaming.

    Protocol:
    - Client sends: { "type": "task_create", "payload": { "title": "...", "description": "..." } }
    - Server sends: { "type": "task_started|task_progress|agent_thinking|...", "payload": {...} }
    """
    await manager.connect(session_id, websocket)

    # Start server-side heartbeat task
    heartbeat = asyncio.create_task(heartbeat_task(session_id, websocket))

    try:
        engine = get_engine()

        # Verify session exists or create one
        existing_session = await engine.get_session(session_id)
        if not existing_session:
            # Create session through the engine (handles both memory and DB)
            await engine.create_session(session_id=session_id)

        while True:
            # Receive message from client
            data = await websocket.receive_json()

            try:
                message = Message(**data)
            except ValidationError:
                await manager.send_message(
                    session_id,
                    Message(
                        type=MessageType.ERROR,
                        payload={"code": "INVALID_MESSAGE", "message": "Invalid message format"},
                        session_id=session_id,
                    ),
                )
                continue

            # Handle different message types
            if message.type == MessageType.PING:
                # Refresh session TTL on ping (heartbeat)
                from services.session_service import get_session_service
                session_service = get_session_service()
                await session_service.refresh_session(session_id)

                await manager.send_message(
                    session_id,
                    Message(type=MessageType.PONG, session_id=session_id),
                )

            elif message.type == MessageType.TASK_CREATE:
                try:
                    payload = TaskCreatePayload(**message.payload)

                    # Stream orchestration events
                    async for event in engine.stream(session_id, payload.description):
                        await manager.send_message(session_id, event)

                except Exception as e:
                    await manager.send_message(
                        session_id,
                        Message(
                            type=MessageType.ERROR,
                            payload={
                                "code": "ORCHESTRATION_ERROR",
                                "message": str(e),
                            },
                            session_id=session_id,
                        ),
                    )

            elif message.type == MessageType.TASK_CANCEL:
                await engine.cancel(session_id)
                await manager.send_message(
                    session_id,
                    Message(
                        type=MessageType.TASK_FAILED,
                        payload={"reason": "Cancelled by user"},
                        session_id=session_id,
                    ),
                )

            elif message.type == MessageType.USER_MESSAGE:
                user_input = message.payload.get("content", "")

                # Stream response
                async for event in engine.stream(session_id, user_input):
                    await manager.send_message(session_id, event)

            elif message.type == MessageType.APPROVAL_RESPONSE:
                # Handle HITL approval/denial from client
                try:
                    payload = ApprovalResponsePayload(**message.payload)
                    state = await engine.get_session(session_id)

                    if state:
                        pending_approvals = state.get("pending_approvals", {})
                        if payload.approval_id in pending_approvals:
                            approval = pending_approvals[payload.approval_id]

                            if payload.approved:
                                # Approve and resume
                                approval["status"] = ApprovalStatus.APPROVED.value
                                approval["resolver_note"] = payload.note
                                state["waiting_for_approval"] = False

                                # Send confirmation
                                await manager.send_message(
                                    session_id,
                                    Message(
                                        type=MessageType.APPROVAL_GRANTED,
                                        payload=ApprovalGrantedPayload(
                                            approval_id=payload.approval_id,
                                            task_id=approval["task_id"],
                                        ).model_dump(),
                                        session_id=session_id,
                                    ),
                                )

                                # Resume execution
                                async for event in engine.stream(session_id, ""):
                                    await manager.send_message(session_id, event)

                            else:
                                # Deny
                                approval["status"] = ApprovalStatus.DENIED.value
                                approval["resolver_note"] = payload.note or "Denied by user"
                                state["waiting_for_approval"] = False

                                # Update task status
                                task_id = approval["task_id"]
                                tasks = state.get("tasks", {})
                                if task_id in tasks:
                                    from models.agent_state import TaskStatus
                                    task = tasks[task_id]
                                    task.status = TaskStatus.FAILED
                                    task.error = f"Denied: {approval['resolver_note']}"
                                    task.pending_approval_id = None

                                # Send denial confirmation
                                await manager.send_message(
                                    session_id,
                                    Message(
                                        type=MessageType.APPROVAL_DENIED,
                                        payload=ApprovalDeniedPayload(
                                            approval_id=payload.approval_id,
                                            task_id=approval["task_id"],
                                            note=approval["resolver_note"],
                                        ).model_dump(),
                                        session_id=session_id,
                                    ),
                                )
                        else:
                            await manager.send_message(
                                session_id,
                                Message(
                                    type=MessageType.ERROR,
                                    payload={
                                        "code": "APPROVAL_NOT_FOUND",
                                        "message": f"Approval {payload.approval_id} not found",
                                    },
                                    session_id=session_id,
                                ),
                            )

                except Exception as e:
                    await manager.send_message(
                        session_id,
                        Message(
                            type=MessageType.ERROR,
                            payload={
                                "code": "APPROVAL_ERROR",
                                "message": str(e),
                            },
                            session_id=session_id,
                        ),
                    )

    except WebSocketDisconnect:
        pass  # Normal disconnection
    except Exception as e:
        try:
            await manager.send_message(
                session_id,
                Message(
                    type=MessageType.ERROR,
                    payload={"code": "INTERNAL_ERROR", "message": str(e)},
                    session_id=session_id,
                ),
            )
        except Exception:
            pass  # Connection already closed
    finally:
        # Cancel heartbeat task and disconnect
        heartbeat.cancel()
        try:
            await heartbeat
        except asyncio.CancelledError:
            pass
        manager.disconnect(session_id)


@websocket_router.websocket("/ws/{session_id}")
async def ws_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket route handler."""
    await websocket_endpoint(websocket, session_id)
