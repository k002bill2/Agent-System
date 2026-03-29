# Agent Teams 가이드 (AOS)

> 실험적 기능: 여러 Claude Code 인스턴스를 팀으로 조율합니다.

## 개요

Agent Teams는 복수의 Claude Code 인스턴스가 협업하여 대규모 작업을 병렬로 처리하는 기능입니다. AOS 프로젝트의 React/FastAPI/LangGraph 스택에 맞춰 팀 패턴을 정의합니다.

## 활성화

```bash
# settings.local.json 또는 환경변수
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"
```

## 표시 모드

| 모드 | 설명 | 사용법 |
|------|------|--------|
| **In-process** (기본) | 메인 터미널 내 실행 | Shift+Up/Down으로 팀원 선택 |
| **분할 창** | tmux 기반 분할 | `claude --teammate-mode tmux` |

---

## AOS 팀 구성 패턴

### 1. 기능 개발 팀 (Feature Development)

풀스택 기능 구현 시 사용. 프론트엔드/백엔드/테스트를 병렬 진행.

```
Create an agent team for developing the [기능명] feature:
- Frontend teammate: React/TypeScript/Tailwind UI 구현 (src/dashboard)
- Backend teammate: FastAPI/LangGraph 엔드포인트 구현 (src/backend)
- Test teammate: pytest + Vitest 테스트 작성 및 검증
Require plan approval before making changes.
Use Sonnet for each teammate.
```

**파일 소유권 분리**:
- Frontend: `src/dashboard/src/` 영역
- Backend: `src/backend/` 영역
- Test: `tests/` 영역

### 2. 코드 리뷰 팀 (Code Review)

변경사항의 다각도 품질 검증.

```
Create an agent team to review recent changes:
- Security reviewer: FastAPI 인증/인가, SQL 인젝션, XSS 검증
- Performance reviewer: N+1 쿼리, asyncpg 최적화, React 렌더링 확인
- Quality reviewer: Python 타입 힌트, TypeScript 타입 안전성, CLAUDE.md 규칙 준수
Have them each review and report findings.
```

**검증 포인트**:
- Security: `src/backend/services/auth_service.py`, CORS 설정, 토큰 검증
- Performance: SQLAlchemy 쿼리 효율, React `useMemo`/`useCallback`, Zustand 구독
- Quality: ruff 규칙 준수, tsc 에러 0, 테스트 커버리지

### 3. 버그 조사 팀 (Bug Investigation)

복잡한 버그의 다면적 원인 분석.

```
[에러 설명] 현상이 발생합니다.
Spawn 3 agent teammates to investigate different hypotheses:
- LangGraph 노드/상태 문제 가설 조사
- FastAPI 엔드포인트/미들웨어 문제 가설 조사
- React 컴포넌트/상태 관리 문제 가설 조사
Have them talk to each other to disprove theories.
```

**AOS 디버깅 영역**:
- LangGraph: `src/backend/orchestrator/` - 노드 실행, 상태 전이
- FastAPI: `src/backend/api/` - 라우터, 미들웨어, CORS
- React: `src/dashboard/src/` - 컴포넌트, Zustand 스토어
- DB: asyncpg prepared statement 캐시 충돌 (우선 확인)

### 4. 다크테마 적용 팀 (Dark Theme)

Tailwind CSS 기반 다크테마 구현.

```
Create an agent team for dark theme on [페이지명]:
- Tailwind specialist: dark: 프리픽스 스타일 작성 (색상만, 레이아웃 변경 금지)
- Validator: 라이트/다크 전환 시 깨지는 요소 검증
- A11y checker: WCAG 2.1 AA 대비 비율 검증
```

**Tailwind 다크모드 패턴**:
```tsx
// tailwind.config.ts에서 darkMode: 'class' 설정
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
```

### 5. 크로스 모듈 리팩토링 팀

AOS 모듈 간 종속성을 고려한 리팩토링.

```
Create an agent team with 4 teammates to refactor [대상]:
- Each teammate owns a separate module:
  - agents (src/backend/agents/)
  - orchestrator (src/backend/orchestrator/)
  - services (src/backend/services/)
  - api (src/backend/api/)
- Ensure backward-compatible API changes
- Require plan approval before making changes.
Wait for your teammates to complete their tasks before proceeding.
```

---

## 팀 운영 규칙

| 규칙 | 설명 |
|------|------|
| **파일 소유권 분리** | 팀원 간 동일 파일 편집 금지 (덮어쓰기 방지) |
| **위임 모드** | 리더가 직접 코딩하지 않게 하려면 Shift+Tab으로 위임 모드 |
| **계획 승인** | 위험한 작업은 `Require plan approval` 사용 |
| **팀원당 5-6 작업** | 적절한 작업 분배로 병렬성 극대화 |
| **정리** | 완료 후 반드시 `Clean up the team` 실행 |

## 팀 제어 명령

```bash
# 팀원과 직접 대화 (In-process 모드)
Shift+Up/Down    → 팀원 선택
Enter            → 팀원 세션 보기
Escape           → 현재 턴 중단
Ctrl+T           → 작업 목록 전환

# 팀 관리
Ask the [name] teammate to shut down    → 팀원 종료
Clean up the team                        → 팀 정리
Wait for your teammates to complete      → 리더 대기
```

## 사용하지 말아야 할 경우

| 상황 | 대안 |
|------|------|
| 단일 파일 수정, 간단한 버그 수정 | 기본 세션 사용 |
| 순차적 종속성이 많은 작업 | `parallel-coordinator` 스킬 또는 subagent 사용 |
| 동일 파일 동시 편집 필요 | 단일 세션 사용 |
| 3개 미만의 독립 작업 | 직접 구현 또는 subagent |

## AOS 팀 vs Subagent 비교

| 기능 | Agent Teams | Subagents (Agent 도구) |
|------|------------|----------------------|
| **실행 방식** | 별도 Claude Code 인스턴스 | 같은 세션 내 하위 작업 |
| **파일 접근** | 전체 프로젝트 | 전체 또는 제한된 도구 |
| **상호 소통** | 팀원 간 직접 대화 | 결과만 상위로 반환 |
| **적합 작업** | 대규모 병렬 작업 (풀스택) | 집중적 단일 영역 작업 |
| **위험도** | 높음 (파일 충돌 가능) | 낮음 (격리된 컨텍스트) |

---

## 관련 문서

- `.claude/agents/shared/` - 에이전트 공유 프로토콜
- `docs/architecture.md` - 시스템 아키텍처
