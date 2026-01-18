# Agent Orchestration Service (AOS)

LangGraph 기반 멀티 에이전트 오케스트레이션 서비스입니다.

## Features

- 🤖 **LangGraph 기반 에이전트 오케스트레이션**: Orchestrator → Planner → Executor → Reviewer 그래프
- 📊 **실시간 대시보드**: WebSocket 기반 태스크 트리 및 에이전트 활동 시각화
- 🔄 **자동 태스크 분해**: 복잡한 작업을 서브태스크로 분해
- 📝 **완전한 추적성**: 모든 에이전트 활동 및 태스크 이력 저장

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker & Docker Compose
- Anthropic API Key

### 1. 환경 설정

```bash
cp .env.example .env
# .env 파일에 ANTHROPIC_API_KEY 입력
```

### 2. 인프라 실행

```bash
cd infra/scripts
./dev.sh
```

### 3. Backend 실행

```bash
cd src/backend
uv pip install -e .
uvicorn api.app:app --reload
```

### 4. Dashboard 실행

```bash
cd src/dashboard
npm install
npm run dev
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Dashboard (React)                        │
│                      http://localhost:5173                       │
└─────────────────────────────────────────────────────────────────┘
                                 │
                         WebSocket/REST
                                 │
┌─────────────────────────────────────────────────────────────────┐
│                        FastAPI Backend                           │
│                      http://localhost:8000                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   LangGraph Engine                       │    │
│  │                                                          │    │
│  │   ┌──────────┐    ┌─────────┐    ┌──────────┐           │    │
│  │   │Orchestrator│──▶│ Planner │──▶│ Executor │           │    │
│  │   └──────────┘    └─────────┘    └──────────┘           │    │
│  │         │              │              │                  │    │
│  │         └──────────────┴──────────────┘                  │    │
│  │                        │                                 │    │
│  │                   ┌─────────┐                           │    │
│  │                   │Reviewer │                           │    │
│  │                   └─────────┘                           │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
           ┌────────┴────────┐       ┌───────┴───────┐
           │    PostgreSQL    │       │     Redis     │
           │   localhost:5432 │       │ localhost:6379│
           └─────────────────┘       └───────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.11, LangGraph, FastAPI, SQLAlchemy |
| Frontend | React 18, TypeScript, Tailwind CSS, Zustand |
| Database | PostgreSQL 16 |
| Cache/Queue | Redis 7 |
| AI | Claude (via LangChain) |

## API

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sessions` | Create new session |
| GET | `/api/sessions/{id}` | Get session state |
| POST | `/api/sessions/{id}/tasks` | Submit task |
| DELETE | `/api/sessions/{id}` | Delete session |

### WebSocket

```javascript
// Connect
const ws = new WebSocket('ws://localhost:8000/ws/{session_id}')

// Send task
ws.send(JSON.stringify({
  type: 'task_create',
  payload: { title: 'My Task', description: 'Task description' }
}))

// Receive events
ws.onmessage = (event) => {
  const { type, payload } = JSON.parse(event.data)
  // type: task_started, task_progress, agent_thinking, ...
}
```

## Development

### Backend Tests

```bash
cd src/backend
pytest ../../tests/backend -v
```

### Dashboard Tests

```bash
cd src/dashboard
npm test
```

### Type Checking

```bash
# Backend
cd src/backend
mypy .

# Dashboard
cd src/dashboard
npx tsc --noEmit
```

## License

MIT
