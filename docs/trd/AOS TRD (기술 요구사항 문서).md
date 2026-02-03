

**작성자:** 개발팀 (Gemini & User)
**마지막 업데이트:** 2026년 2월 4일
**상태:** ✅ Phase 1-3 구현 완료

---

## 📋 문서 개요

> **💡 이 문서는 무엇인가요?**
> LLM 기반 멀티 에이전트 시스템(Orchestrator & Workers)의 기술적 구현 명세, 데이터 흐름, 인프라 구조를 정의합니다.

### 🎯 기술적 목표

- **확장성:** 새로운 에이전트 및 도구(Tool)의 손쉬운 추가 (Plugin Architecture)
- **실시간성:** WebSocket 기반의 지연 없는 로그 스트리밍 (Latency < 200ms)
- **안정성:** LangGraph 기반 상태 관리 및 샌드박스 환경 격리
- **멀티 LLM:** Google Gemini, Anthropic Claude, Ollama 등 다양한 LLM 프로바이더 지원

---

## 🛠 기술 스택

### Core Technologies

| **카테고리**          | **기술**                        | **선정 이유**                              |
| :---------------- | :---------------------------- | :------------------------------------- |
| 🎯 **Frontend**   | React 18.3, Vite 6.0+         | 빠른 개발 환경, 모던 React 기능 활용               |
| 📝 **State Mgmt** | Zustand 5.0                   | 경량 상태 관리, persist 미들웨어로 세션 유지          |
| ⚡ **Backend**     | Python, FastAPI 0.115+        | 비동기 처리, AI 라이브러리 호환성                   |
| 🧠 **LLM Ops**    | LangGraph 0.2+, LangChain     | 복잡한 에이전트 상태 머신 및 순환 그래프 제어             |
| 🗄️ **Database**  | PostgreSQL, ChromaDB          | 태스크 이력(RDB) 및 컨텍스트 검색(Vector DB)       |
| 🚀 **Infra**      | Docker, Redis                 | 샌드박스 실행 환경 및 메시지 큐                     |
| 🤖 **LLM**        | Gemini, Claude, Ollama        | 멀티 프로바이더 지원, 용도별 모델 선택                 |
| 🔗 **Protocol**   | MCP (Model Context Protocol)  | 외부 도구 연동 표준화                           |

---

## 🏗 시스템 아키텍처

### 🔧 주요 구성 요소

> **Client (Dashboard - React + Vite)**
> - **Task Panel:** 태스크 분해/진행도 시각화
> - **Terminal UI:** 실시간 로그 및 코드 Diff 뷰어
> - **Control Panel:** 일시정지, 개입, 재시도 명령 전송
> - **Analytics:** 멀티 프로젝트 비교, 토큰/비용 분석
> - **Git Integration:** 브랜치 관리, PR, 머지 충돌 해결

> **Orchestrator Server (FastAPI)**
> - **Planner Node:** 사용자 의도 파악 및 태스크 분해
> - **Executor Node:** 도구 실행 및 태스크 수행
> - **Reviewer Node:** 실행 결과 검토 및 품질 검증
> - **Self-Correction Node:** 에러 분석 및 자동 재시도
> - **Parallel Executor Node:** 병렬 태스크 실행 조정
> - **Context Manager:** Global/Local Context 관리 및 주입

> **Worker Agents**
> - **CodeAnalystAgent:** 코드 분석 및 리뷰
> - **ResearcherAgent:** 정보 수집 및 분석
> - **WriterAgent:** 기술 문서 작성
> - **LeadOrchestratorAgent:** 복잡한 멀티 에이전트 조정

> **Services Layer (34개 서비스)**
> - **Core:** LLM, RAG, MCP, Agent Registry
> - **Auth:** OAuth (Google, GitHub), Email/Password
> - **Git:** GitPython, GitHub API 통합
> - **Monitoring:** 감사, 알림, 비용 추적

### 🔄 데이터 플로우

```
[User Input] → [API Gateway] → [Orchestrator]
                                    ↓
              ┌─────────────────────┴─────────────────────┐
              ↓                     ↓                     ↓
         [Planner]            [Executor]            [Reviewer]
              ↓                     ↓                     ↓
         [Plan Tasks]     [Tool Call / MCP]      [Quality Check]
              ↓                     ↓                     ↓
              └─────────────────────┼─────────────────────┘
                                    ↓
                        [Self-Correction Loop]
                                    ↓
[Streaming Log] ← [WebSocket] ← [Response Processing]
```

### 📁 프로젝트 구조 (Monorepo Strategy)

<details>
<summary><strong>📂 폴더 구조 보기</strong></summary>

```
📦 Agent-System/
├── 📂 src/
│   ├── 📂 backend/                    # Python FastAPI Server
│   │   ├── 📂 agents/                 # 에이전트 로직
│   │   │   ├── base.py                # BaseAgent 추상 클래스
│   │   │   ├── specialist.py          # CodeAnalyst, Researcher, Writer
│   │   │   ├── lead_orchestrator.py   # 멀티 에이전트 조정자
│   │   │   └── 📂 specialists/        # 도메인별 전문 에이전트
│   │   ├── 📂 orchestrator/           # LangGraph 오케스트레이션
│   │   │   ├── engine.py              # 오케스트레이션 엔진
│   │   │   ├── graph.py               # LangGraph 그래프 정의
│   │   │   ├── nodes.py               # 6개 노드 구현
│   │   │   ├── parallel_executor.py   # 병렬 실행
│   │   │   └── tools.py               # MCP 도구 실행
│   │   ├── 📂 services/               # 34개 비즈니스 서비스
│   │   │   ├── llm_service.py         # 멀티 LLM 프로바이더
│   │   │   ├── rag_service.py         # ChromaDB RAG
│   │   │   ├── mcp_service.py         # MCP 통합
│   │   │   ├── git_service.py         # Git 작업
│   │   │   ├── github_service.py      # GitHub API
│   │   │   ├── auth_service.py        # 인증
│   │   │   └── ...                    # 기타 서비스
│   │   ├── 📂 api/                    # 25개 FastAPI 라우터
│   │   ├── 📂 models/                 # 24개 데이터 모델
│   │   ├── 📂 db/                     # SQLAlchemy ORM
│   │   ├── 📂 tools/                  # File, Code, Bash 도구
│   │   └── 📂 auth/                   # OAuth 프로바이더
│   │
│   └── 📂 dashboard/                  # React + Vite Dashboard
│       ├── 📂 src/
│       │   ├── 📂 pages/              # 19개 페이지
│       │   ├── 📂 components/         # 112개 컴포넌트
│       │   ├── 📂 stores/             # 21개 Zustand 스토어
│       │   └── 📂 types/              # TypeScript 타입
│       └── vite.config.ts
│
├── 📂 infra/                          # Docker, 배포 스크립트
├── 📂 docs/                           # PRD, TRD, 아키텍처 문서
├── 📂 tests/                          # Backend/Dashboard 테스트
└── 📂 .claude/                        # Claude Code 설정
    ├── 📂 skills/                     # 스킬 정의
    ├── 📂 agents/                     # 서브에이전트 정의
    └── 📂 commands/                   # 커스텀 명령어
```

</details>

---

## 🚀 구현 로드맵

### Phase 1: Foundation (PoC) ✅ 완료

<details>
<summary><strong>핵심 기능 구현</strong></summary>

**🔧 백엔드 코어**
- [x] LangGraph 상태 머신 구현 (Plan-Execute 루프)
- [x] 메인 에이전트 프롬프트 엔지니어링 (CoT 적용)
- [x] 기본 Tool 구현 (Read/Write File)
- [x] **LLM 기반 태스크 분해** (PlannerNode)
- [x] **토큰/비용 모니터링** (실시간 추적)

**🖥️ 프론트엔드**
- [x] WebSocket 연결 및 실시간 로그 뷰어
- [x] 간단한 채팅 인터페이스
- [x] **Cost Monitor 컴포넌트** (대시보드)

</details>

### Phase 2: Intelligence & Safety ✅ 완료

<details>
<summary><strong>안정성 및 제어 고도화</strong></summary>

**🧠 지능형 기능**
- [x] 서브 에이전트 역할 세분화 (Planner, Executor, Reviewer)
- [x] **Self-Correction** (에러 분석 및 자동 재시도, 최대 3회)
- [x] **Vector DB 기반 코드 베이스 검색 (RAG)** - ChromaDB 구현

**🛡️ 제어 시스템**
- [x] **HITL (승인 요청) UI/UX 구현** (ApprovalModal)
- [x] Circuit Breaker (무한 루프 방지, max_iterations=100)
- [x] **데이터베이스 지속성** (PostgreSQL, USE_DATABASE)
- [x] **샌드박스 환경** (sandbox_manager.py)

</details>

### Phase 3: Enterprise & Integration ✅ 완료

<details>
<summary><strong>엔터프라이즈 기능 및 외부 통합</strong></summary>

**🔗 외부 통합**
- [x] **MCP (Model Context Protocol)** 서버 관리 (filesystem, github, playwright, sqlite)
- [x] **Git/GitHub 통합** (브랜치, 커밋, PR, 머지 충돌 해결)
- [x] **OAuth 인증** (Google, GitHub, OIDC, SAML)
- [x] **멀티 LLM 프로바이더** (Gemini, Claude, Ollama, GPT-4o)

**📊 분석 & 모니터링**
- [x] 멀티 프로젝트 비교 분석 (AnalyticsPage)
- [x] 프로젝트 건강 모니터링 (테스트, 린트, 타입체크, 빌드)
- [x] Claude Code 세션 추적 및 요약
- [x] 비용 할당 및 토큰 사용량 추적

**🏢 엔터프라이즈 기능**
- [x] 조직 관리 및 멤버 초대
- [x] 감사 로깅 및 무결성 검증
- [x] Rate Limiting
- [x] RLHF 피드백 수집

**🖥️ 대시보드 고도화**
- [x] 19개 페이지, 21개 스토어, 112개 컴포넌트
- [x] 프로젝트 설정 편집기 (Skills, Agents, MCP, Hooks)
- [x] 플레이그라운드 (에이전트 테스트 환경)
- [x] 알림 시스템

</details>

### Phase 4: Scale & Production 📋 예정

<details>
<summary><strong>확장성 및 프로덕션 준비</strong></summary>

**🚀 확장성**
- [ ] Kubernetes 기반 오토스케일링
- [ ] 분산 태스크 큐 (Celery + Redis)
- [ ] 멀티 테넌시 완전 지원

**🔒 보안 강화**
- [ ] E2E 암호화
- [ ] SOC2 컴플라이언스
- [ ] 고급 권한 관리 (RBAC)

**📈 성능 최적화**
- [ ] 캐싱 레이어 (Redis)
- [ ] 데이터베이스 샤딩
- [ ] CDN 통합

</details>

---

## 🎯 LangGraph 노드 구조

### 노드 정의

| 노드 | 역할 | 주요 기능 |
|------|------|----------|
| **OrchestratorNode** | 상태 분석 및 라우팅 | 다음 액션 결정 (plan/execute/review/finish) |
| **PlannerNode** | 태스크 계획 | 복잡한 태스크를 서브태스크로 분해 |
| **ExecutorNode** | 태스크 실행 | 도구 호출, MCP 실행, HITL 승인 요청 |
| **ReviewerNode** | 품질 검증 | 실행 결과 검토, 다음 스텝 결정 |
| **SelfCorrectionNode** | 에러 복구 | 실패 분석, 재시도 로직 (최대 3회) |
| **ParallelExecutorNode** | 병렬 실행 | 동시성 제어, 병렬 그룹 처리 |

### 라우팅 로직

```
OrchestratorNode
    ├── → PlannerNode (plan 필요시)
    ├── → ExecutorNode (실행 필요시)
    ├── → ParallelExecutorNode (배치 실행시)
    ├── → ReviewerNode (검토 필요시)
    └── → END (완료시)

ExecutorNode
    ├── → OrchestratorNode (다음 단계)
    ├── → Waiting (HITL 승인 대기)
    ├── → SelfCorrectionNode (에러 발생시)
    └── → END (완료시)

SelfCorrectionNode
    ├── → ExecutorNode (재시도)
    ├── → OrchestratorNode (다른 접근)
    └── → END (최대 재시도 초과)
```

---

## 📊 핵심 데이터 모델

### AgentState (LangGraph 상태)

```python
AgentState(TypedDict):
    # 세션
    session_id: str
    user_id: str | None

    # 메시지 히스토리
    messages: list[dict]

    # 태스크 트리
    tasks: dict[str, TaskNode]
    current_task_id: str | None

    # 오케스트레이션
    next_action: str
    iteration_count: int
    max_iterations: int  # 기본값: 100

    # 토큰/비용 추적
    token_usage: dict
    total_cost: float

    # HITL 승인
    waiting_for_approval: bool
    approval_request: ApprovalRequest | None
```

### TaskNode

```python
TaskNode:
    id: str
    parent_id: str | None
    title: str
    description: str
    status: TaskStatus  # pending/in_progress/waiting/completed/failed
    assigned_agent: str | None
    children: list[str]

    # Self-correction
    retry_count: int
    max_retries: int  # 기본값: 3
    error_history: list[str]
```

---

## 🎯 통신 프로토콜 (JSON Schema)

### 📡 Agent Message Protocol

```json
{
  "header": {
    "traceId": "uuid-v4",
    "timestamp": "ISO8601",
    "sender": "Agent-Coder"
  },
  "payload": {
    "type": "THOUGHT | ACTION | ERROR",
    "content": "코드를 분석해보니 api.ts에 버그가 있습니다...",
    "tool_use": {
      "name": "read_file",
      "args": { "path": "src/api.ts" }
    }
  }
}
```

### 📡 WebSocket 이벤트

| 이벤트 | 방향 | 설명 |
|--------|------|------|
| `task_created` | Server → Client | 새 태스크 생성됨 |
| `task_updated` | Server → Client | 태스크 상태 변경 |
| `approval_required` | Server → Client | HITL 승인 필요 |
| `approval_response` | Client → Server | 승인/거부 응답 |
| `message` | Both | 채팅 메시지 |

---

## ⚠️ 리스크 관리

### 🔍 기술적 리스크

| **위험 요소** | **영향도** | **완화 전략** | **상태** |
|---|---|---|---|
| **Context Window 초과** | High | 요약(Summarization) 기법 및 중요 파일만 선별 주입 | ✅ 구현됨 |
| **환각(Hallucination)** | High | 실행 전 `Lint/Type Check` 강제, Self-Correction 단계 | ✅ 구현됨 |
| **동시성 제어** | Medium | 파일 쓰기 시 Lock 메커니즘, ParallelExecutor 동시성 제한 | ✅ 구현됨 |
| **무한 루프** | High | Circuit Breaker (max_iterations=100) | ✅ 구현됨 |
| **비용 폭주** | Medium | 토큰/비용 실시간 추적, Rate Limiting | ✅ 구현됨 |

---

## 📈 구현 현황 요약

### 백엔드

| 카테고리 | 수량 | 상태 |
|----------|------|------|
| Services | 34개 | ✅ 완료 |
| API Routers | 25개 | ✅ 완료 |
| Data Models | 24개 | ✅ 완료 |
| LangGraph Nodes | 6개 | ✅ 완료 |
| Agents | 6개 | ✅ 완료 |

### 대시보드

| 카테고리 | 수량 | 상태 |
|----------|------|------|
| Pages | 19개 | ✅ 완료 |
| Zustand Stores | 21개 | ✅ 완료 |
| Components | 112개 | ✅ 완료 |

---

## ✅ 검수 및 승인

### 👥 검토자

- [x] **System Architect**: LangGraph 설계 및 상태 관리 검토
- [x] **Frontend Lead**: 대시보드 성능 및 WebSocket 안정성 검토
- [ ] **Security Officer**: 샌드박스 탈옥 방지 및 권한 관리 검토
