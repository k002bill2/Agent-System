# Agent Orchestration System (AOS) 사용자 가이드

## 목차

1. [개요](#개요)
2. [시스템 시작하기](#시스템-시작하기)
3. [대시보드 사용법](#대시보드-사용법)
4. [핵심 기능](#핵심-기능)
5. [프로젝트 설정 관리](#프로젝트-설정-관리)
6. [조직 관리](#조직-관리)
7. [Git 협업](#git-협업)
8. [모니터링 및 분석](#모니터링-및-분석)
9. [API 사용법](#api-사용법)
10. [고급 기능](#고급-기능)
11. [문제 해결](#문제-해결)

---

## 개요

Agent Orchestration System (AOS)은 **LangGraph 기반 멀티 에이전트 오케스트레이션 시스템**입니다. 복잡한 작업을 여러 전문 에이전트가 협력하여 처리합니다.

### 핵심 개념

| 개념 | 설명 |
|------|------|
| **Orchestrator** | 전체 작업을 조율하고 다음 단계를 결정하는 총괄 에이전트 |
| **Planner** | 복잡한 작업을 작은 서브태스크로 분해하는 계획 에이전트 |
| **Executor** | 실제 작업을 수행하는 실행 에이전트 (병렬 실행 지원) |
| **Reviewer** | 완료된 작업을 검토하고 품질을 확인하는 검토 에이전트 |
| **SelfCorrection** | 실패한 작업을 분석하고 자동 재시도하는 노드 |
| **Task Tree** | 작업의 계층 구조 (부모-자식 관계) |
| **Session** | 하나의 대화/작업 세션 |
| **Organization** | 멀티테넌트 조직 단위 |

### 작동 흐름

```
사용자 입력
    ↓
[Orchestrator] ─── 상태 분석, 다음 액션 결정
    ↓
[Planner] ─────── 작업 분해, 서브태스크 생성
    ↓
[Executor] ────── 각 태스크 실행 (병렬 가능)
    ↓
[Reviewer] ────── 결과 검토, 품질 확인
    ↓
실패 시 → [SelfCorrection] → 재시도 (최대 3회)
    ↓
완료
```

### 지원 LLM 프로바이더

| 프로바이더 | 모델 | Context 한도 |
|-----------|------|-------------|
| **Google Gemini** | gemini-2.0-flash (기본) | 1M tokens |
| **Anthropic Claude** | claude-3.5-sonnet, claude-4-opus | 200K tokens |
| **Ollama** | 로컬 모델 (qwen2.5:7b 등) | 모델별 상이 |
| **OpenAI** | gpt-4o, o1 | 128K~200K tokens |

---

## 시스템 시작하기

### 사전 요구사항

- Python 3.11+
- Node.js 20+
- Docker & Docker Compose
- LLM API Key (Google/Anthropic/OpenAI 중 하나)

### 방법 1: 스크립트로 전체 시작

```bash
# 전체 서비스 시작 (인프라 + Backend + Dashboard)
cd infra/scripts && ./start-all.sh

# 전체 서비스 중지
./stop-all.sh
```

### 방법 2: 수동 시작

#### 1단계: 환경 설정

```bash
# 프로젝트 디렉토리로 이동
cd "/Users/younghwankang/Work/Agent-System"

# .env 파일 생성
cat > src/backend/.env << EOF
# LLM Provider (google/anthropic/ollama)
LLM_PROVIDER=google
GOOGLE_API_KEY=your_google_api_key

# Database (선택)
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/agent_orchestrator
USE_DATABASE=false

# Auth
SESSION_SECRET_KEY=your_secret_key
FRONTEND_URL=http://localhost:5173

# OAuth (선택)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
EOF
```

#### 2단계: 인프라 실행

```bash
cd infra/scripts && ./dev.sh
```

#### 3단계: Backend 실행

```bash
cd src/backend
uv pip install -e .
uvicorn api.app:app --reload --port 8000
```

#### 4단계: Dashboard 실행 (새 터미널)

```bash
cd src/dashboard
npm install
npm run dev
```

### 접속 URL

| 서비스 | URL |
|--------|-----|
| **Dashboard** | http://localhost:5173 |
| **API 문서** | http://localhost:8000/docs |
| **Health Check** | http://localhost:8000/api/health |

---

## 대시보드 사용법

### 화면 구성

```
┌─────────────────────────────────────────────────────────────┐
│  [AO] Orchestrator          Agent Orchestrator    Session: xxx │
├──────────┬──────────────────┬───────────────────────────────┤
│          │                  │                               │
│ Sidebar  │   Task Tree      │      Agent Activity           │
│          │                  │                               │
│ Dashboard│  ▶ Root Task     │  USER: 메시지 입력            │
│ Projects │    └ Subtask 1   │  THINKING: 처리 중...         │
│ Tasks    │    └ Subtask 2   │  SYSTEM: 완료                 │
│ Agents   │                  │                               │
│ Activity │                  │                               │
│ Monitor  │                  │                               │
│ Claude   ├──────────────────┴───────────────────────────────┤
│ Sessions │  [입력창: Describe the task...]        [Send]    │
│ Git      │  Press Enter to send              ● Connected    │
│ Settings │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

### 페이지 목록

| 페이지 | 경로 | 설명 |
|--------|------|------|
| **Dashboard** | `/` | 메인 대시보드 (세션 상태, 태스크 요약) |
| **Projects** | `/projects` | 프로젝트 목록 및 관리, RAG 검색 |
| **Project Configs** | `/project-configs` | Skills, Agents, MCP, Hooks 관리 |
| **Tasks** | `/tasks` | 태스크 트리 뷰, 상세 정보 |
| **Agents** | `/agents` | 에이전트 레지스트리, MCP, RLHF |
| **Activity** | `/activity` | 실시간 활동 로그 |
| **Monitor** | `/monitor` | 프로젝트 헬스 체크 (test, lint, build) |
| **Claude Sessions** | `/claude-sessions` | Claude Code 세션 모니터링 |
| **Git** | `/git` | 브랜치/머지/PR 관리 |
| **Analytics** | `/analytics` | 사용 통계 및 분석 |
| **Audit** | `/audit` | 감사 로그 뷰어 |
| **Notifications** | `/notifications` | 알림 규칙/채널 설정 |
| **Playground** | `/playground` | 에이전트 테스트 환경 |
| **Organizations** | `/organizations` | 조직 관리 (멤버, 역할, 통계) |
| **Settings** | `/settings` | 시스템 설정 |

### Task Tree 상태

| 상태 | 아이콘 | 설명 |
|------|--------|------|
| Pending | ○ 회색 | 대기 중 |
| In Progress | ◐ 파란색 (회전) | 실행 중 |
| Paused | ⏸ 노란색 | 일시 정지 |
| Completed | ✓ 녹색 | 완료 |
| Failed | ✗ 빨간색 | 실패 |
| Cancelled | ⊘ 회색 | 취소됨 |

### Agent Activity 타입

| 타입 | 색상 | 설명 |
|------|------|------|
| USER | 파란색 | 사용자 입력 메시지 |
| THINKING | 노란색 | 에이전트 사고 과정 |
| ACTION | 녹색 | 에이전트 실행 액션 |
| SYSTEM | 회색 | 시스템 메시지 |
| ERROR | 빨간색 | 에러 메시지 |

---

## 핵심 기능

### 1. 태스크 오케스트레이션

**사용 방법:**
1. 입력창에 수행하고 싶은 작업을 자연어로 입력
2. Enter 키 또는 Send 버튼 클릭
3. 에이전트들이 자동으로 작업을 분해하고 실행

**예시 입력:**
```
# 간단한 분석 요청
"이 텍스트를 분석해줘: Hello World"

# 코드 리뷰 요청
"다음 코드를 리뷰하고 개선점을 찾아줘"

# 복잡한 작업
"사용자 인증 시스템을 설계해줘"
```

### 2. HITL (Human-in-the-Loop) 승인

위험한 작업 실행 전 사용자 승인을 요청합니다.

**승인이 필요한 작업:**

| 위험 수준 | 작업 예시 |
|----------|----------|
| HIGH | Bash 명령 실행, 파일 삭제 |
| MEDIUM | 파일 쓰기, Git 작업 |

**승인 워크플로우:**
1. 위험 작업 감지 시 **Approval Modal**이 표시됨
2. 작업 내용, 위험 수준, 이유 확인
3. **Approve** (승인) 또는 **Deny** (거부) 선택

```
┌─────────────────────────────────────────┐
│  ⚠️ 승인 필요                            │
│                                         │
│  작업: execute_bash                      │
│  명령: rm -rf ./temp                     │
│  위험: HIGH - 파일 시스템 변경            │
│                                         │
│          [Deny]  [Approve]              │
└─────────────────────────────────────────┘
```

### 3. 병렬 태스크 실행

독립적인 태스크들을 동시 실행합니다.

- **조건**: ready 상태 태스크가 2개 이상일 때
- **최대 동시 실행**: 3개
- **UI 표시**: Task Tree에서 병렬 실행 중인 태스크 그룹 표시

### 4. Self-Correction (자동 재시도)

태스크 실패 시 자동으로 에러를 분석하고 재시도합니다.

**작동 방식:**
1. 태스크 실패 감지
2. SelfCorrectionNode가 에러 분석
3. 수정 전략 생성 및 태스크 설명 업데이트
4. 최대 3회까지 자동 재시도

**Task Tree 표시:**
```
▶ Root Task
  └ Subtask 1 ✓
  └ Subtask 2 (retry 2/3) ◐  ← 재시도 중
  └ Subtask 3 ○
```

### 5. 토큰/비용 모니터링

실시간으로 LLM 사용량과 비용을 추적합니다.

**표시 정보:**

| 항목 | 설명 |
|------|------|
| Input Tokens | 입력 토큰 수 |
| Output Tokens | 출력 토큰 수 |
| Total Cost | 누적 비용 (USD) |
| Call Count | LLM 호출 횟수 |
| Context Usage | Context Window 사용률 |

### 6. RAG (의미론적 검색)

프로젝트 코드를 ChromaDB에 인덱싱하여 의미론적 검색을 수행합니다.

**사용 방법:**
1. Projects 페이지에서 프로젝트 선택
2. RAG 검색 버튼 클릭
3. 자연어로 검색 (예: "인증 로직", "에러 처리 패턴")

**기능:**
- 전체 프로젝트 컨텍스트 검색
- 결과 수 조절 (3~20개)
- 우선순위 필터링 (High/Normal)
- 인덱스 상태 확인, 재인덱싱, 삭제

---

## 프로젝트 설정 관리

Project Configs 페이지에서 Claude Code 프로젝트의 스킬, 에이전트, MCP 서버, Hook을 웹 UI에서 관리합니다.

### Skills 관리

**Skill이란?** Claude Code가 특정 작업에 특화된 동작을 수행할 수 있도록 하는 설정입니다.

**탭 기능:**
- 스킬 목록 조회 (검색, 필터)
- 스킬 생성/수정/삭제
- YAML Frontmatter 편집
- 스킬 내용 미리보기

**스킬 생성:**
1. Skills 탭에서 "New Skill" 버튼 클릭
2. 이름, 설명, 트리거 조건 입력
3. 스킬 내용 (프롬프트) 작성
4. 저장

### Agents 관리

**Agent란?** Claude Code의 서브에이전트로, 특정 전문 분야의 작업을 수행합니다.

**탭 기능:**
- 에이전트 목록 조회
- 에이전트 생성/수정/삭제
- 시스템 프롬프트 편집
- 도구 구성 설정

### MCP (Model Context Protocol) 관리

**MCP란?** 외부 도구와 Claude를 연결하는 프로토콜입니다.

**지원 MCP 서버:**
- `filesystem`: 파일 시스템 접근
- `github`: GitHub API 통합
- `playwright`: 브라우저 자동화
- `sqlite`: 데이터베이스 접근
- 커스텀 MCP 서버

**탭 기능:**
- MCP 서버 목록
- 서버 추가/수정/삭제
- 서버 시작/중지
- 연결 상태 확인
- 도구 목록 조회
- 도구 직접 호출 테스트

### Hooks 관리

**Hook이란?** Claude Code의 특정 이벤트에 반응하여 자동으로 실행되는 셸 명령입니다.

**Hook 이벤트 타입:**

| 이벤트 | 설명 |
|--------|------|
| `PreToolUse` | 도구 사용 전 실행 |
| `PostToolUse` | 도구 사용 후 실행 |
| `Notification` | 알림 발생 시 실행 |
| `Stop` | Claude Code 중지 시 실행 |

**탭 기능:**
- Hook 목록 조회
- Hook 생성/수정/삭제
- 이벤트 타입 선택
- 매처 패턴 설정 (도구명, 파일 패턴 등)
- 명령어 편집
- 타임아웃 설정

### 프로젝트 간 복사

다른 프로젝트의 설정 항목을 현재 프로젝트로 복사할 수 있습니다.

**복사 가능 항목:**
- Skills
- Agents
- MCP Servers
- Hooks

**사용 방법:**
1. 각 탭에서 "Copy from Project" 버튼 클릭
2. 소스 프로젝트 선택
3. 복사할 항목 선택
4. 복사 실행

---

## 조직 관리

Organizations 페이지에서 멀티테넌트 조직을 관리합니다.

### 조직 생성

1. Organizations 페이지에서 "Create Organization" 클릭
2. 조직 이름, 슬러그, 설명 입력
3. 플랜 선택 (Free/Starter/Professional/Enterprise)
4. 생성

### 플랜별 제한

| 플랜 | 멤버 | 프로젝트 | 일일 세션 | 월간 토큰 |
|------|------|---------|----------|----------|
| Free | 5 | 3 | 100 | 100K |
| Starter | 10 | 10 | 500 | 500K |
| Professional | 50 | 50 | 2,000 | 2M |
| Enterprise | ∞ | ∞ | ∞ | ∞ |

### 멤버 관리

**역할:**

| 역할 | 권한 |
|------|------|
| owner | 모든 권한 (조직 삭제 포함) |
| admin | 멤버 관리, 설정 변경 |
| member | 프로젝트 읽기/쓰기 |
| viewer | 읽기 전용 |

**멤버 초대:**
1. 조직 상세에서 "Invite Member" 클릭
2. 이메일 주소 입력
3. 역할 선택
4. 초대 발송

### 조직 통계

- 총 멤버 수
- 총 프로젝트 수
- 토큰 사용량
- 비용 현황

---

## Git 협업

Git 페이지에서 팀 협업을 위한 브랜치 관리 및 머지 시스템을 사용합니다.

### Working Directory

현재 작업 디렉토리의 변경 사항을 관리합니다.

**상태 표시:**
- Staged: 커밋할 파일
- Unstaged: 변경되었지만 스테이징 안 된 파일
- Untracked: 새 파일

**사용 방법:**
1. 파일 선택 후 "Stage" 버튼으로 스테이징
2. 커밋 메시지 입력
3. "Commit" 버튼으로 커밋 생성

### 브랜치 관리

**기능:**
- 로컬/리모트 브랜치 목록 조회
- 브랜치 생성/삭제
- Ahead/Behind 커밋 수 확인
- 현재 브랜치 표시

**보호 브랜치:** `main`, `master`는 직접 삭제 불가

### Merge Request (내부 MR)

팀 내부 머지 요청 시스템입니다.

**MR 워크플로우:**
1. "New MR" 버튼 클릭
2. 소스/타겟 브랜치 선택
3. 제목, 설명 입력
4. MR 생성
5. 리뷰어 승인
6. 머지 실행

**MR 상태:**
- `draft`: 작성 중
- `open`: 리뷰 대기
- `merged`: 머지됨
- `closed`: 닫힘

### 충돌 감지

머지 전 충돌을 미리 확인합니다.

**사용 방법:**
1. "Preview Merge" 버튼 클릭
2. 충돌 파일 목록 확인
3. 충돌 해결 후 머지 진행

### GitHub 통합

GitHub Pull Request를 대시보드에서 관리합니다.

**기능:**
- PR 목록 조회
- PR 상세 정보 확인
- PR 리뷰 생성/조회
- PR 머지 (merge/squash/rebase)

---

## 모니터링 및 분석

### Monitor 페이지

프로젝트의 헬스 상태를 실시간으로 확인합니다.

**체크 항목:**

| 체크 | 설명 |
|------|------|
| Test | npm test 실행 결과 |
| Lint | ESLint 검사 결과 |
| Build | 프로덕션 빌드 결과 |
| Type Check | TypeScript 타입 검사 |

**상태:**
- ✓ Pass: 성공
- ✗ Fail: 실패
- ⏳ Running: 실행 중
- ○ Pending: 대기 중

### Analytics 페이지

사용 통계 및 분석 대시보드입니다.

**메트릭:**
- 총 세션 수
- 총 태스크 수
- 성공률
- 평균 실행 시간
- 비용 추이

**트렌드 차트:**
- 일간/주간/월간 사용량
- 에이전트별 성능
- 에러 분석
- 활동 히트맵

### Audit 페이지

모든 시스템 액션을 기록하고 추적합니다.

**기록 항목:**
- 세션 생성/종료
- 태스크 생성/완료/실패
- 승인 허가/거부
- 도구 실행
- 권한 변경

**필터:**
- 날짜 범위
- 액션 타입
- 리소스 타입
- 사용자/세션

**내보내기:** JSON, CSV 형식 지원

### Claude Sessions 페이지

외부에서 실행 중인 Claude Code 세션을 모니터링합니다.

**기능:**
- 활성 세션 목록
- 세션 상세 정보
- 실시간 트랜스크립트 뷰
- 토큰 사용량 추적
- 프로세스 정리

---

## API 사용법

### REST API 기본

```bash
# Base URL
http://localhost:8000

# Health Check
curl http://localhost:8000/api/health

# 인증 (Bearer Token)
curl -H "Authorization: Bearer {token}" http://localhost:8000/api/sessions
```

### 주요 엔드포인트

#### 세션 관리
```bash
# 세션 생성
POST /api/sessions

# 세션 상태 조회
GET /api/sessions/{session_id}

# 태스크 제출
POST /api/sessions/{session_id}/tasks
Content-Type: application/json
{
  "title": "Analyze text",
  "description": "Please analyze the following text..."
}

# 태스크 취소
POST /api/sessions/{session_id}/cancel
```

#### 인증
```bash
# Google OAuth
GET /api/auth/google

# 이메일 로그인
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password"
}

# 토큰 갱신
POST /api/auth/refresh
```

#### 프로젝트 설정
```bash
# 프로젝트 목록
GET /api/project-configs

# 스킬 목록
GET /api/project-configs/{project_id}/skills

# 스킬 생성
POST /api/project-configs/{project_id}/skills
{
  "name": "my-skill",
  "description": "My custom skill",
  "content": "Skill prompt content..."
}
```

### WebSocket API

```javascript
// 연결
const ws = new WebSocket('ws://localhost:8000/ws/{session_id}');

// 태스크 생성
ws.send(JSON.stringify({
  type: 'task_create',
  payload: {
    title: 'My Task',
    description: 'Task description here'
  }
}));

// 메시지 수신
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'task_started':
    case 'task_progress':
    case 'agent_thinking':
    case 'agent_action':
    case 'state_update':
    case 'task_completed':
    case 'task_failed':
    case 'approval_required':
    case 'token_update':
      // 처리
      break;
  }
};
```

---

## 고급 기능

### LLM Auto-Switch

여러 LLM 프로바이더 간 자동 전환 및 Failover를 지원합니다.

**라우팅 전략:**

| 전략 | 설명 |
|------|------|
| `priority` | 우선순위 기반 (기본) |
| `round_robin` | 순차 분배 |
| `least_cost` | 비용 최소화 |
| `least_latency` | 지연 최소화 |
| `fallback_chain` | 장애 시 순차 시도 |

### Docker 샌드박스

위험한 bash 명령을 격리된 Docker 컨테이너에서 실행합니다.

**보안 특성:**
- `network_mode: none` - 네트워크 격리
- `mem_limit: 512m` - 메모리 제한
- `user: sandbox` - non-root 실행
- `security_opt: no-new-privileges` - 권한 상승 차단

### Agent Playground

에이전트를 대화형으로 테스트하는 환경입니다.

**기능:**
- 세션 기반 대화
- 모델/온도/도구 설정
- 스트리밍 응답
- 에이전트 비교 (2-5개)

### 버전 관리

설정 변경사항을 버전 관리하고 롤백할 수 있습니다.

**버전 상태:**
- `draft`: 작성 중
- `active`: 활성
- `archived`: 보관됨
- `rolled_back`: 롤백됨

---

## 문제 해결

### 자주 발생하는 문제

#### 1. WebSocket 연결 실패
```
증상: "○ Disconnected" 표시
해결:
1. Backend 서버가 실행 중인지 확인
2. 포트 8000이 사용 중인지 확인
3. CORS 설정 확인
```

#### 2. API Key 에러
```
증상: "API_KEY environment variable is not set"
해결:
1. src/backend/.env 파일 확인
2. LLM_PROVIDER와 해당 API_KEY 설정 확인
3. Backend 서버 재시작
```

#### 3. MCP 서버 연결 실패
```
증상: MCP 서버 상태가 "disconnected"
해결:
1. MCP 서버 설정 확인 (command, args)
2. 필요한 패키지 설치 확인
3. 서버 로그 확인
```

#### 4. Git 작업 실패
```
증상: Git 명령 실행 에러
해결:
1. 프로젝트 경로에 Git 저장소가 있는지 확인
2. Git credentials 설정 확인
3. 원격 저장소 접근 권한 확인
```

### 로그 확인

#### Backend 로그
```bash
# 터미널에서 실행 중인 uvicorn 출력 확인
# 또는
tail -f logs/backend.log
```

#### Dashboard 로그
```javascript
// 브라우저 개발자 도구 (F12) > Console 탭
```

### 서버 재시작

```bash
# 전체 재시작
cd infra/scripts && ./stop-all.sh && ./start-all.sh

# Backend만 재시작
# Ctrl+C로 중지 후
cd src/backend && uvicorn api.app:app --reload --port 8000

# Dashboard만 재시작
# Ctrl+C로 중지 후
cd src/dashboard && npm run dev
```

---

## 부록

### 키보드 단축키

| 단축키 | 기능 |
|--------|------|
| Enter | 메시지 전송 |
| Shift+Enter | 줄바꿈 |
| Esc | 입력 취소 |

### 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| LLM_PROVIDER | LLM 제공자 | google |
| GOOGLE_API_KEY | Google API 키 | - |
| ANTHROPIC_API_KEY | Anthropic API 키 | - |
| DATABASE_URL | PostgreSQL URL | - |
| USE_DATABASE | DB 영구 저장 | false |
| REDIS_URL | Redis URL | redis://localhost:6379 |
| SESSION_SECRET_KEY | 세션 암호화 키 | - |
| FRONTEND_URL | 프론트엔드 URL | http://localhost:5173 |
| DEBUG | 디버그 모드 | false |

### Claude Code 슬래시 명령어

| 명령어 | 설명 |
|--------|------|
| `/check-health` | 타입체크, 린트, 테스트, 빌드 종합 검증 |
| `/verify-app` | Boris Cherny 스타일 검증 루프 |
| `/test-coverage` | 테스트 커버리지 분석 |
| `/commit-push-pr` | Git 워크플로우 자동화 |
| `/start-all` | 전체 서비스 시작 |
| `/stop-all` | 전체 서비스 중지 |
| `/save-and-compact` | 컨텍스트 저장 후 /compact |
| `/resume` | 이전 세션 컨텍스트 복원 |

### 참고 링크

- [LangGraph 문서](https://langchain-ai.github.io/langgraph/)
- [FastAPI 문서](https://fastapi.tiangolo.com/)
- [React 문서](https://react.dev/)
- [Tailwind CSS 문서](https://tailwindcss.com/)
- [Zustand 문서](https://docs.pmnd.rs/zustand/getting-started/introduction)

---

*이 가이드는 Agent Orchestration System v1.0 기준으로 작성되었습니다.*
