# AOS Dashboard Quick Reference
> Agent Orchestration Service - React Web + Python Backend

## Tech Stack 요약

| Layer | Tech | Version |
|-------|------|---------|
| **Frontend** | React + Vite + Tailwind | 18.3.1 / 6.0+ / 3.4.16 |
| **State** | Zustand | 5.0.0 |
| **Backend** | FastAPI + LangGraph | 0.115+ / 0.2.0+ |
| **Database** | PostgreSQL + Redis | 15+ / 7+ |
| **Vector DB** | ChromaDB | 0.4+ |
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
        ├── stores/       # Zustand 스토어 (12개)
        └── hooks/        # 커스텀 훅
```

---

## 주요 명령어

### 검증 및 품질
```bash
/check-health      # 타입체크 + 린트 + 테스트 + 빌드
/verify-app        # Boris Cherny 스타일 검증 루프
/test-coverage     # 테스트 커버리지 분석
/simplify-code     # 코드 복잡도 분석
/review            # 변경 파일 코드 리뷰
```

### 세션 관리
```bash
/dev-docs          # Dev Docs 3-파일 생성
/update-dev-docs   # Dev Docs 업데이트
/save-and-compact  # 저장 + /compact
/resume            # 이전 세션 컨텍스트 복원
```

### Git 워크플로우
```bash
/commit-push-pr    # 커밋 → 푸시 → PR 자동화
```

### 인프라
```bash
/start-all         # 전체 서비스 시작
/stop-all          # 전체 서비스 중지
```

---

## Sub-agents

| Agent | Domain | Model |
|-------|--------|-------|
| `web-ui-specialist` | React Web UI | Sonnet |
| `backend-integration-specialist` | FastAPI/Firebase | Sonnet |
| `test-automation-specialist` | Vitest/Pytest | Sonnet |
| `lead-orchestrator` | 멀티 에이전트 조정 | Sonnet |
| `performance-optimizer` | 성능 최적화 | Sonnet |
| `code-simplifier` | 코드 복잡도 분석 | Haiku |
| `quality-validator` | 품질 검증 | Sonnet |

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
        # 노드 로직
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

### Claude Sessions (외부 모니터링)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/claude-sessions` | 세션 목록 |
| GET | `/api/claude-sessions/{id}` | 세션 상세 |
| GET | `/api/claude-sessions/{id}/stream` | SSE 스트림 |

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
USE_DATABASE=true                # DB 영구 저장

# Redis
REDIS_URL=redis://localhost:6379/0

# OAuth
GOOGLE_CLIENT_ID=xxx
GITHUB_CLIENT_ID=xxx
JWT_ALGORITHM=HS256
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

## 테스트 커버리지 목표

| Metric | Target |
|--------|--------|
| Statements | 75% |
| Functions | 70% |
| Branches | 60% |

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
mypy .                # 타입 체크
ruff check .          # 린트
pytest tests/backend  # 테스트
```

---

## 문제 해결

| 증상 | 해결 |
|------|------|
| Skill 미작동 | skill-rules.json + Hook 확인 |
| 타입 에러 | `npm run type-check` 실행 |
| 테스트 실패 | 커버리지 확인, 의존성 체크 |
| API 에러 | Backend 로그 확인, DB 연결 체크 |
| Context 부족 | `/update-dev-docs` → `/compact` |

---

## Dev Docs 워크플로우

1. **계획 승인** → `/dev-docs` 실행
2. **구현 진행** → 주기적으로 tasks.md 업데이트
3. **Context 20% 이하** → `/update-dev-docs` 실행
4. **세션 재개** → `/resume` 또는 dev/active/ 읽기

---

*Last Updated: 2025-01-26*
