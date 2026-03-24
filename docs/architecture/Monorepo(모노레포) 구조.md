# AOS 모노레포 구조

AOS (Agent Orchestration Service) 프로젝트의 실제 디렉토리 구조입니다.
Claude Code 설정과 시스템 소스 코드를 함께 관리하는 하이브리드 모노레포입니다.

---

## Root Directory

```
Agent-System/
├── .claude/              # Claude Code 설정 (skills, agents, commands, hooks)
├── src/
│   ├── backend/          # Python (LangGraph + FastAPI) 백엔드
│   └── dashboard/        # React 대시보드 (Vite + Tailwind + Zustand)
├── infra/                # Docker, K8s, Helm, 스크립트
├── docs/                 # PRD, TRD, 아키텍처 문서
├── tests/                # Backend/Dashboard 테스트
├── dev/                  # 개발 작업 컨텍스트 (dev-docs 시스템)
└── CLAUDE.md             # Claude Code 프로젝트 지침
```

---

## 1. Backend (`src/backend/`)

LangGraph 기반 멀티 에이전트 오케스트레이션 서버입니다.

```
src/backend/
├── agents/                    # 에이전트 정의
│   ├── base.py                # BaseAgent 추상 클래스
│   ├── specialist.py          # Specialist 베이스 클래스
│   ├── lead_orchestrator.py   # 리드 오케스트레이터 (태스크 분석/위임)
│   └── specialists/           # 전문 에이전트
│       ├── mobile_ui_agent.py # React Web UI/UX 전문
│       ├── backend_agent.py   # FastAPI/SQLAlchemy/LangGraph 전문
│       └── test_agent.py      # 테스트 자동화 전문
│
├── orchestrator/              # LangGraph 오케스트레이션 엔진
│   ├── engine.py              # 메인 실행 엔진
│   ├── graph.py               # LangGraph StateGraph 구성
│   ├── nodes.py               # 6가지 노드 (Orchestrator, Planner, Executor 등)
│   ├── parallel_executor.py   # 병렬 태스크 실행 (asyncio.gather)
│   └── tools.py               # MCP 도구 실행자
│
├── services/                  # 비즈니스 로직 (67개 모듈)
│   ├── adapters/              # 어댑터 패턴 구현
│   ├── cache/                 # 캐싱 레이어
│   ├── pipeline/              # 모듈형 데이터 파이프라인
│   │   ├── pipeline_service.py
│   │   ├── models.py
│   │   ├── stage.py           # BaseStage ABC, PipelineContext
│   │   └── stages/            # 내장 4단계 (collect, transform, analyze, output)
│   ├── automation_loop_service.py  # 주기적 조건 모니터링 + 액션
│   ├── llm_router_service.py      # LLM 라우팅/Failover
│   ├── rag_service.py             # Qdrant 기반 RAG
│   ├── warp_service.py            # Warp 터미널 통합
│   ├── workflow_engine.py         # CI/CD 워크플로우 DAG 엔진
│   └── ...                        # 60+ 서비스 모듈
│
├── api/                       # FastAPI 라우터
│   ├── app.py                 # FastAPI 앱 진입점
│   ├── routes.py              # 집합 라우터 (서브라우터 통합)
│   ├── deps.py                # 의존성 주입 (인증, DB 세션)
│   ├── automation.py          # 자동화 루프 API
│   ├── pipelines.py           # 파이프라인 API
│   ├── warp.py                # Warp 터미널 API
│   ├── v1/                    # v1 API (agent_monitor, agent_registry 등)
│   └── ...                    # 40+ 라우터 모듈
│
├── auth/                      # 인증 프로바이더
│   ├── token_service.py       # JWT 토큰 서비스
│   └── providers/
│       ├── base.py            # AuthProvider ABC
│       ├── google.py          # Google OAuth 2.0
│       ├── github.py          # GitHub OAuth
│       ├── oidc.py            # OpenID Connect
│       └── saml.py            # SAML 2.0
│
├── db/                        # SQLAlchemy ORM
│   ├── database.py            # async_sessionmaker 설정
│   ├── repository.py          # 범용 리포지토리
│   ├── models/                # DB 모델 (14개)
│   └── migrations/            # SQL 마이그레이션
│
├── models/                    # Pydantic 데이터 모델 (33개)
├── middleware/                # 미들웨어
│   └── rate_limit.py          # RateLimitMiddleware
├── tools/                     # MCP 도구 구현
│   ├── bash_tools.py
│   ├── code_tools.py
│   ├── file_tools.py
│   └── warp_tools.py
├── utils/                     # 유틸리티
│   └── time.py                # utcnow() timezone-aware UTC
├── alembic/                   # DB 마이그레이션 (Alembic)
├── config.py                  # 환경 변수 설정
└── main.py                    # 서버 진입점
```

**설계 포인트**:
- `agents/`(에이전트 정의)와 `orchestrator/`(실행 엔진)를 분리하여 독립적 확장 가능
- `services/`에 비즈니스 로직 집중, API 레이어는 라우팅만 담당
- `pipeline/` 서브패키지로 파이프라인 관련 코드 응집

---

## 2. Dashboard (`src/dashboard/`)

React 기반 모니터링/관리 대시보드입니다.

```
src/dashboard/
├── src/
│   ├── components/        # UI 컴포넌트 (도메인별 구성)
│   ├── pages/             # 라우팅 페이지
│   ├── stores/            # Zustand 상태 관리
│   ├── hooks/             # 커스텀 훅
│   ├── services/          # API 호출 함수
│   ├── lib/               # 유틸리티 라이브러리
│   ├── types/             # TypeScript 타입 정의
│   ├── config/            # 앱 설정
│   ├── utils/             # 범용 유틸리티
│   ├── routes.tsx         # 라우트 정의
│   ├── App.tsx            # 루트 컴포넌트
│   └── main.tsx           # 진입점
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

**기술 스택**: React 18.3, Zustand 5.0, Tailwind CSS 3.4, Vite 6.0+, TypeScript 5.6+

---

## 3. Claude Code 설정 (`.claude/`)

Claude Code CLI 통합 설정입니다.

```
.claude/
├── agents/            # 서브에이전트 정의 (.md)
├── commands/          # Slash 커맨드 정의
├── skills/            # 스킬 정의 (SKILL.md)
├── rules/             # 프로젝트 규칙 (.md)
├── hooks.json         # 훅 설정 (이벤트 핸들러)
├── mcp.json           # MCP 서버 설정
├── settings.json      # Claude Code 설정
├── evals/             # AI 에이전트 평가 시스템
│   ├── tasks/         # 평가 태스크 (.yaml)
│   ├── rubrics/       # 채점 루브릭
│   └── results/       # 평가 결과
└── coordination/      # 멀티 에이전트 협업 설정
```

---

## 4. 인프라 (`infra/`)

```
infra/
├── docker/            # Docker Compose, Dockerfile
├── k8s/               # Kubernetes 매니페스트
├── helm/              # Helm Chart (aos/)
├── scripts/           # 개발/운영 스크립트 (dev.sh 등)
└── tls/               # TLS 인증서 설정
```

---

## 5. 테스트 (`tests/`)

```
tests/
├── backend/           # Backend pytest 테스트
└── (dashboard 테스트는 src/dashboard/src/test/ 내장)
```

---

## 구조의 특징

1. **하이브리드 모노레포**: Claude Code 설정(`.claude/`)과 실제 시스템 소스(`src/`)를 한 레포에서 관리
2. **도메인별 구성**: 기능별이 아닌 도메인별로 파일 구성 (agents, orchestrator, services)
3. **레이어 분리**: API(라우팅) -> Services(비즈니스 로직) -> DB(영속화) 3계층
4. **확장 가능**: 에이전트 추가는 `agents/specialists/`에 파일 추가, 스테이지 추가는 `services/pipeline/stages/`에 파일 추가
