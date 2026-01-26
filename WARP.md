# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Overview

This repo contains the **Agent Orchestration System (AGS)**, a LangGraph-based multi-agent orchestration backend with a React dashboard, plus configuration and helpers for AI tools (Claude Code, MCP) and connected projects under `projects/`.

High level:
- **Backend** (`src/backend`): FastAPI + LangGraph orchestrator, RAG, sandboxed tool execution, optional PostgreSQL persistence, Redis.
- **Dashboard** (`src/dashboard`): Vite + React + TypeScript UI for monitoring sessions, tasks, agents, approvals, diffs, and usage.
- **Infra** (`infra`): Docker Compose and scripts for local Postgres/Redis and optional full stack.
- **AI tool config** (`.claude`, `CLAUDE.md`): Claude Code rules, sub-agents, slash commands, and MCP servers; AGS uses these concepts via its own backend (`services/warp_service.py`, MCP APIs, RAG).
- **Projects** (`projects/`): Additional apps wired into AGS via symlinks (e.g. `projects/ppt-maker`, `projects/image-maker`).

When in doubt, prefer the commands and architecture described here and in `README.md` / `CLAUDE.md` over guessing.

## Key Commands

### 1. Infrastructure / Local Stack

Most development assumes Postgres + Redis are running via Docker.

- **Start core infra (Postgres, Redis)**
  ```bash
  cd infra/scripts
  ./dev.sh
  ```
  This script:
  - Ensures `.env` exists (copies from `.env.example` if missing).
  - Checks for Docker + Docker Compose.
  - Runs `docker-compose up -d postgres redis` in `infra/docker`.

- **Docker Compose (manual control)**
  ```bash
  cd infra/docker
  # Infra only
  docker-compose up -d postgres redis

  # Full stack (Backend + Dashboard + infra), if configured
  docker-compose --profile full up -d
  ```

### 2. Backend (FastAPI + LangGraph)

Working directory: `src/backend`.

- **Install dependencies (including dev tools)**
  ```bash
  cd src/backend
  # Runtime only
  uv pip install -e .

  # Runtime + dev dependencies (pytest, ruff, mypy, etc.)
  uv pip install -e .[dev]
  ```

- **Run the API server (for development)**
  ```bash
  cd src/backend
  uvicorn api.app:app --reload
  ```

- **Run all backend tests**
  Test configuration is defined in `pyproject.toml` (`[tool.pytest.ini_options]`, `testpaths = ["../../tests/backend"]`).
  ```bash
  cd src/backend
  pytest ../../tests/backend -v
  ```

- **Run a single backend test file / test**
  Use standard `pytest` patterns, pointing into `tests/backend`:
  ```bash
  cd src/backend
  # Single file
  pytest ../../tests/backend/test_<module>.py -v

  # Single test within a file
  pytest ../../tests/backend/test_<module>.py -k "test_name_substring" -v
  ```

- **Lint + type check backend**
  Ruff and mypy are configured in `pyproject.toml`.
  ```bash
  cd src/backend
  # Lint
  ruff .

  # Type check
  mypy .
  ```

### 3. Dashboard (React + Vite)

Working directory: `src/dashboard`.

- **Install dependencies**
  ```bash
  cd src/dashboard
  npm install
  ```

- **Run dev server** (proxied to backend at `http://localhost:8000`)
  ```bash
  cd src/dashboard
  npm run dev
  ```
  Vite dev server listens on `http://localhost:5173` and proxies `/api` and `/ws` to the backend (see `vite.config.ts`).

- **Build dashboard**
  ```bash
  cd src/dashboard
  npm run build
  ```
  This runs TypeScript project references (`tsc -b`) and then `vite build`.

- **Lint dashboard**
  ```bash
  cd src/dashboard
  npm run lint
  ```

- **Dashboard tests / type checking**
  The root `README.md` documents the following conventions:
  ```bash
  # Jest or equivalent tests
  cd src/dashboard
  npm test

  # Type checking only
  cd src/dashboard
  npx tsc --noEmit
  ```

### 4. Sandbox / Secure Execution

A Docker-based sandbox is used for isolated execution of risky commands (see `services/sandbox_manager.py`).

- **Build sandbox image and verify**
  ```bash
  # Build sandbox image
  ./infra/scripts/build-sandbox.sh

  # Example sanity checks (from CLAUDE.md)
  docker run --rm ags-sandbox:latest whoami
  docker run --rm ags-sandbox:latest pwd
  docker run --rm ags-sandbox:latest python --version
  ```

### 5. Connected Projects

프로젝트 심볼릭 링크를 통해 여러 외부 프로젝트를 연결할 수 있습니다:

- **image-maker** (`projects/image-maker`) - 이미지 생성 프로젝트
- **ppt-maker** (`projects/ppt-maker`) - PPT 생성 프로젝트
- **youtube-maker** (`projects/youtube-maker`) - YouTube 콘텐츠 프로젝트
- **obsidian** (`projects/obsidian`) - Obsidian vault 연결

## Architecture and Structure

### 1. Repository Layout (big picture)

The most important top-level directories (see `CLAUDE.md` for a more exhaustive tree):

- `.claude/` – Claude Code configuration for skills, sub-agents, commands, hooks, and MCP servers.
- `src/backend/` – Python backend (LangGraph orchestrator + FastAPI API + tools/services).
- `src/dashboard/` – React dashboard UI.
- `infra/` – Docker + scripts for local infra and sandbox images.
- `tests/` – Backend and dashboard tests.
- `projects/` – Additional projects integrated with the orchestration system.

### 2. Backend Architecture (`src/backend`)

The backend is structured around a LangGraph-based orchestration engine with FastAPI endpoints on top.

Key packages:

- `api/`
  - `app.py` – Creates and configures the FastAPI application (routers, middleware, WebSocket endpoints).
  - `routes.py` – Session and task REST endpoints (`/api/sessions`, `/api/sessions/{id}/tasks`, etc.).
  - `websocket.py` – WebSocket entrypoint for streaming orchestration events to the dashboard (`/ws/{session_id}`).
  - `rag.py` – RAG/vector DB endpoints (indexing, query, stats, delete) for project code.
  - `mcp.py`, `usage.py`, `deps.py` – Integration points for MCP-style tools and API dependencies (e.g., injecting services, tracking usage).

- `orchestrator/`
  - `graph.py` – Defines the LangGraph computation graph and wiring between nodes.
  - `engine.py` – Orchestration runtime: stepping through the graph, managing state transitions.
  - `nodes.py` – LangGraph nodes such as `OrchestratorNode`, `PlannerNode`, `ExecutorNode`, `ReviewerNode`, `SelfCorrectionNode`.
  - `parallel_executor.py` – `ParallelExecutorNode` for concurrent execution of independent tasks using `asyncio.gather` and a concurrency semaphore.

- `models/`
  - `agent_state.py` – Central `AgentState` TypedDict holding session messages, tasks, agents, HITL approvals, token/cost tracking, plan metadata, and parallel execution metadata.
  - `task.py`, `task_plan.py` – Task representation and LLM-generated task plans (analysis, `is_complex`, `subtasks`, etc.).
  - `hitl.py` – Human-in-the-loop configuration, including tool risk levels and approval requirements.
  - `cost.py` – Token and cost accounting configuration.
  - `project.py`, `message.py`, `monitoring.py`, `mcp.py` – Project metadata, message formats, observability types, MCP-related schemas.

- `services/`
  - `session_service.py` – High-level session lifecycle operations: creating sessions, updating state, fetching status.
  - `rag_service.py` – Vector DB integration (Chroma) for project indexing and semantic search (`ProjectVectorStore`).
  - `project_runner.py`, `project_template_service.py` – Running and templating projects within AGS.
  - `sandbox_manager.py` – Docker-based sandbox for executing risky commands with network isolation, resource limits, and non-root users.
  - `mcp_service.py`, `warp_service.py` – Bridges to MCP servers and Warp/Claude-style tooling.

- `db/`
  - `database.py` – SQLAlchemy engine/session configuration (PostgreSQL).
  - `models.py` – Persistence models for sessions, tasks, and related entities.
  - `repository.py` – Repository layer abstracting DB operations.

- `tools/`
  - `bash_tools.py` – Shell command execution helpers (using sandbox where needed).
  - `code_tools.py` – Code-level utilities (e.g., reading/writing files, applying diffs).
  - `file_tools.py` – Filesystem helpers.
  - `warp_tools.py` – Tools specifically designed to integrate with Warp/Claude workflows.

- `config.py` – Environment/configuration loading (API keys, DB URLs, feature flags like `USE_DATABASE`).
- `main.py` – Often used as a CLI or dev entrypoint; look here if you need a scriptable runner for the orchestrator.

#### Orchestration Flow (conceptual)

The typical flow for a user-submitted task is:

1. **Session creation** – Client (dashboard or external tool) calls `POST /api/sessions`.
2. **Task submission** – Client posts to `/api/sessions/{id}/tasks` and opens a WebSocket to `/ws/{session_id}`.
3. **OrchestratorNode** – Inspects `AgentState`, chooses next action and schedules tasks.
4. **PlannerNode** – Uses LLM + RAG (`rag_service.py`) to break complex tasks into subtasks (`TaskPlanResult`) with metadata.
5. **ExecutorNode / ParallelExecutorNode** – Executes tasks sequentially or in parallel (up to 3 concurrent tasks), calling tools (bash, file, code, MCP, etc.).
6. **HITL checks** – For risky operations (e.g., `execute_bash`), `hitl.py` and `AgentState.pending_approvals` require explicit approval via dedicated endpoints.
7. **ReviewerNode / SelfCorrectionNode** – Aggregates results, validates quality, analyzes errors, and may retry failed tasks up to a configured limit.
8. **Persistence & monitoring** – State can be persisted in Postgres (controlled by `USE_DATABASE`) and observed via token/cost tracking (`cost.py`, monitoring models) and dashboard views.

### 3. Dashboard Architecture (`src/dashboard`)

The dashboard is a Vite + React 18 + TypeScript SPA that communicates with the backend via REST and WebSockets.

Key areas (see `tsconfig.json` and `vite.config.ts` for configuration):

- `main.tsx` – Entry point mounting `App`.
- `App.tsx` – Top-level layout and routing between pages.

- `pages/`
  - `DashboardPage.tsx` – High-level overview of active sessions, tasks, and agents.
  - `MonitorPage.tsx` – Health and monitoring view (backed by monitoring stores and components under `components/monitor`).
  - `ActivityPage.tsx`, `AgentsPage.tsx`, `ProjectsPage.tsx`, `SettingsPage.tsx`, `TasksPage.tsx` – Themed views into orchestration state, agents, project configuration, and task history.

- `components/`
  - Core orchestration UI: `AgentPanel`, `TaskPanel`, `Sidebar`, `VerticalSplitPanel`, `ProjectFilter`, `ProjectFormModal`, `ApprovalModal`, etc.
  - Monitoring UI: `components/monitor/*` (e.g., `HealthOverview`, `ProjectsPanel`, `OutputLog`, resizable panels).
  - Diff visualization: `DiffViewer.tsx` (uses `react-diff-view`, `diff`, `unidiff`) to show file changes and statuses.
  - Loading skeletons: `components/skeletons/*` for perceived performance while data loads.
  - Usage UI: `components/usage/*` for Claude/LLM usage dashboards and progress bars.
  - `components/ui/Skeleton.tsx` – Shared skeleton component.

- `stores/` (Zustand state)
  - `orchestration.ts` – Central store for orchestration/session/task state from the backend (WebSocket and REST).
  - `projects.ts` – Project list and configuration (including RAG-indexed projects).
  - `monitoring.ts` – Health/monitor metrics state.
  - `claudeUsage.ts` – Aggregated usage and cost metrics (aligned with backend monitoring models).
  - `settings.ts`, `navigation.ts` – UI and navigation preferences/state.

- `types/`
  - TypeScript interfaces for monitoring, usage, and domain-specific entities; keep these in sync with backend models.

- `lib/utils.ts`
  - Shared helpers (e.g., `cn` for className composition) used throughout components.

- `services/notificationService.ts`
  - Provides a simple abstraction around user notifications/toasts; used to surface orchestration events, errors, and approvals.

- **Path alias & proxy**
  - TypeScript and Vite configure `@/*` to map to `src/*` (see `tsconfig.json` and `vite.config.ts`).
  - Vite dev server proxies:
    - `/api` → `http://localhost:8000`
    - `/ws` → `ws://localhost:8000`

### 4. Tests and Quality Gates

- **Backend tests** live under `tests/backend` and are executed via `pytest` from the `src/backend` directory (see `pyproject.toml`).
- **Dashboard tests** live under `tests/dashboard` (as referenced in `CLAUDE.md` and directory structure); follow the npm scripts described above.
- **Static analysis**:
  - Python: `ruff` and `mypy` configured in `pyproject.toml`.
  - TypeScript/React: Strict TS (`strict: true`) and ESLint (`npm run lint`).

### 5. Claude / MCP / Warp-Specific Notes

This repo is designed to be used with Claude Code and MCP, and AGS itself exposes APIs and services that align with those tools.

Important pieces from `CLAUDE.md` and `.claude/README.md`:

- **Claude Code commands** (run from within Claude Code, not the shell):
  - `/check-health` – Run a combined suite of type checks, lint, tests, and build.
  - `/verify-app` – Verification/feedback loop on changes.
  - `/test-coverage` – Analyze test coverage.
  - `/simplify-code` – Complexity analysis and refactoring suggestions.
  - `/review` – Review changed files.
  - `/commit-push-pr` – Commit, push, and open a PR.

- **Sub-agents and skills**
  - `.claude/agents/` and `.claude/skills/` define specialized agents (e.g., performance optimizer, test automation specialist) and meta-skills (skill/hook/command creators, verification loops).
  - `shared/` frameworks (`ace-framework.md`, `quality-gates.md`, `effort-scaling.md`, `delegation-template.md`) define cross-agent protocols and quality gates.

- **MCP servers**
  - `.claude/mcp.json` configures servers like `context7` for semantic search, `codex-cli` for code snippets, and optional web/automation providers.

For Warp:
- Be aware that some workflows and expectations (e.g., health checks, verification loops) are encoded in these Claude configs and mirrored in the backend services (`warp_service.py`, MCP endpoints, usage tracking).
- When making non-trivial backend or dashboard changes, prefer to:
  - Update corresponding models/types in both backend (`models/*`) and frontend (`types/*`, `stores/*`).
  - Consider how changes affect RAG (`rag_service.py`, RAG endpoints) and sandboxed tools (`tools/*`, `sandbox_manager.py`).

## Environment and Configuration

Key environment variables (see `.env.example` and `CLAUDE.md`):

- **LLM / AI**
  - `ANTHROPIC_API_KEY` – Required for Claude.
  - `LLM_PROVIDER` – e.g. `anthropic` or `ollama`.
  - `OLLAMA_MODEL`, `OLLAMA_BASE_URL` – For running via Ollama.

- **Database and cache**
  - `DATABASE_URL` – Async SQLAlchemy DSN for Postgres.
  - `USE_DATABASE` – Toggle for enabling persistent session/task storage.
  - `REDIS_URL` – Redis endpoint for caching/queueing.

When changing configuration-dependent code, check `config.py` and infra files under `infra/docker` and `infra/scripts` to keep application behavior and Docker setup aligned.
