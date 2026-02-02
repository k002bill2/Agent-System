# Agent Orchestration Service (AOS)

LangGraph 기반 멀티 에이전트 오케스트레이션 서비스입니다.

[![CI](https://github.com/k002bill2/Agent-Orchestrator/actions/workflows/ci.yml/badge.svg)](https://github.com/k002bill2/Agent-Orchestrator/actions/workflows/ci.yml)
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template)

## Features

- 🤖 **LangGraph 기반 에이전트 오케스트레이션**: Orchestrator → Planner → Executor → Reviewer 그래프
- 📊 **실시간 대시보드**: WebSocket 기반 태스크 트리 및 에이전트 활동 시각화
- 🔄 **자동 태스크 분해**: 복잡한 작업을 서브태스크로 분해
- 📝 **완전한 추적성**: 모든 에이전트 활동 및 태스크 이력 저장

## 🚀 Quick Start (Docker)

**권장 방법** - Docker만 있으면 한 줄로 실행:

```bash
# 1. 저장소 클론
git clone https://github.com/k002bill2/Agent-Orchestrator.git
cd Agent-Orchestrator

# 2. 환경변수 설정
cp .env.example .env
# .env 파일 편집하여 API 키 설정

# 3. 실행 (미리 빌드된 이미지 사용, 빌드 불필요)
docker compose up -d

# 4. 접속
open http://localhost:5173
```

### 필수 환경변수

```bash
# LLM 프로바이더 선택 (하나만 필요)
LLM_PROVIDER=google          # google, anthropic, ollama 중 선택
GOOGLE_API_KEY=your_key      # Google Gemini
# 또는
ANTHROPIC_API_KEY=your_key   # Claude
# 또는
# Ollama는 API 키 불필요 (로컬 실행)
```

### 서비스 URLs

| 서비스 | URL |
|--------|-----|
| Dashboard | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

### Docker 명령어

```bash
# 상태 확인
docker compose ps

# 로그 보기
docker compose logs -f backend

# 중지
docker compose down

# 데이터 포함 완전 삭제
docker compose down -v
```

### 시스템 요구사항

| 항목 | 최소 요구 |
|------|-----------|
| Docker | 24.0+ |
| Docker Compose | 2.20+ |
| RAM | 4GB |
| 디스크 | 10GB |

---

## 🛠️ Development Setup (로컬 개발)

Docker 없이 개발 환경을 직접 구성하려면:

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker & Docker Compose (PostgreSQL, Redis용)
- LLM API Key (Google, Anthropic, 또는 Ollama)

### 1. 환경 설정

```bash
cp .env.example .env
# .env 파일에 API 키 입력
```

### 2. 인프라 실행 (DB, Redis)

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

## Deployment

프로덕션 배포는 Railway 또는 Render를 권장합니다:

### Railway (권장)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template)

### Render

1. [Render Dashboard](https://dashboard.render.com)에서 "New Blueprint" 선택
2. 이 저장소 연결
3. `render.yaml`이 자동으로 감지되어 배포됨

자세한 배포 가이드는 [docs/deployment.md](docs/deployment.md)를 참조하세요.

## License

MIT
