# AOS Dashboard Quick Reference
> Agent Orchestration Service - React Web + Python Backend

## Tech Stack 요약

| Layer | Tech | Version |
|-------|------|---------|
| **Frontend** | React + Vite + Tailwind | 18.3.1 / 6.0+ / 3.4.16 |
| **State** | Zustand | 5.0.0 |
| **Backend** | FastAPI + LangGraph | 0.115+ / 0.2.0+ |
| **Database** | PostgreSQL + Redis | 15+ / 7+ |
| **Vector DB** | Qdrant | |
| **LLM** | Gemini / Claude / Ollama | 다중 프로바이더 |

---

## 디렉토리 구조

```
src/
├── backend/              # Python Backend
│   ├── api/              # FastAPI 라우터
│   ├── orchestrator/     # LangGraph (nodes.py, graph.py)
│   ├── services/         # 비즈니스 로직
│   └── models/           # Pydantic 모델
└── dashboard/            # React Web
    └── src/
        ├── components/   # UI 컴포넌트
        ├── pages/        # 페이지
        ├── stores/       # Zustand 스토어
        └── hooks/        # 커스텀 훅
```

---

## 주요 명령어

### 검증 및 품질
```bash
/check-health        # 타입체크 + 린트 + 테스트 + 빌드
/verification-loop   # Boris Cherny 스타일 검증 루프 (skill)
/test-coverage       # 테스트 커버리지 분석
/run-eval            # AI 에이전트 평가 및 pass@k 계산 (skill)
```

### 서비스 관리
```bash
/start-all         # 전체 서비스 시작
/start-dashboard   # Dashboard 단독 시작
/stop-all          # 전체 서비스 중지
```

---

## Sub-agents

| Agent | Domain | Model |
|-------|--------|-------|
| `web-ui-specialist` | React Web UI | inherit |
| `backend-integration-specialist` | FastAPI/LangGraph | inherit |
| `test-automation-specialist` | Vitest/Pytest | haiku |
| `eval-grader` | 평가 채점 | inherit |
| `eval-task-runner` | 평가 실행 | inherit |

---

## 코드 패턴

### React Component (Tailwind)
```tsx
import { cn } from '@/lib/utils';

export const MyComponent = ({ className, ...props }) => (
  <div className={cn('p-4 rounded-lg', className)} {...props}>
    {/* content */}
  </div>
);
```

### Zustand Store
```typescript
export const useStore = create<State>((set, get) => ({
  data: null,
  fetchData: async () => {
    const response = await api.get('/data');
    set({ data: response.data });
  },
}));
```

### FastAPI Endpoint
```python
@router.get("/items/{id}", response_model=ItemResponse)
async def get_item(id: str, db: AsyncSession = Depends(get_db)):
    item = await db.get(Item, id)
    if not item:
        raise HTTPException(status_code=404)
    return item
```

### LangGraph Node
```python
class MyNode(BaseNode):
    async def run(self, state: AgentState) -> dict:
        return {"next_action": "continue"}
```

---

## API Endpoints 요약

### 세션/태스크
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sessions` | 세션 생성 |
| GET | `/api/sessions/{id}` | 세션 조회 |
| POST | `/api/sessions/{id}/tasks` | 태스크 제출 |
| WS | `/ws/{session_id}` | 실시간 스트리밍 |

### HITL 승인
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sessions/{id}/approvals` | 대기 승인 목록 |
| POST | `/api/sessions/{id}/approve/{aid}` | 승인 |
| POST | `/api/sessions/{id}/deny/{aid}` | 거부 |

### RAG (Vector DB)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/rag/projects/{id}/index` | 인덱싱 |
| POST | `/api/rag/projects/{id}/query` | 검색 |

---

## 환경 변수

```bash
# LLM Provider
LLM_PROVIDER=google              # google | anthropic | ollama
GOOGLE_API_KEY=xxx
ANTHROPIC_API_KEY=xxx

# Database
DATABASE_URL=postgresql+asyncpg://...
USE_DATABASE=true

# Redis
REDIS_URL=redis://localhost:6379/0

# OAuth
GOOGLE_CLIENT_ID=xxx
GITHUB_CLIENT_ID=xxx
```

---

## 서비스 URL

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

---

## 자주 쓰는 검증 명령

```bash
# Frontend
cd src/dashboard
npm run type-check    # TypeScript
npm run lint          # ESLint
npm test              # Vitest
npm run build         # 빌드

# Backend
cd src/backend
ruff check .          # 린트
pytest tests/backend  # 테스트
```

---

*Last Updated: 2026-03-21*
