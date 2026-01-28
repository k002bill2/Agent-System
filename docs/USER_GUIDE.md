# Agent Orchestration System (AOS) 사용자 가이드

## 목차

1. [개요](#개요)
2. [시스템 시작하기](#시스템-시작하기)
3. [대시보드 사용법](#대시보드-사용법)
4. [기능 설명](#기능-설명)
5. [API 사용법](#api-사용법)
6. [고급 기능](#고급-기능)
7. [문제 해결](#문제-해결)

---

## 개요

Agent Orchestration System (AOS)은 **LangGraph 기반 멀티 에이전트 오케스트레이션 시스템**입니다. 복잡한 작업을 여러 전문 에이전트가 협력하여 처리합니다.

### 핵심 개념

| 개념 | 설명 |
|------|------|
| **Orchestrator** | 전체 작업을 조율하고 다음 단계를 결정하는 총괄 에이전트 |
| **Planner** | 복잡한 작업을 작은 서브태스크로 분해하는 계획 에이전트 |
| **Executor** | 실제 작업을 수행하는 실행 에이전트 |
| **Reviewer** | 완료된 작업을 검토하고 품질을 확인하는 검토 에이전트 |
| **Task Tree** | 작업의 계층 구조 (부모-자식 관계) |
| **Session** | 하나의 대화/작업 세션 |

### 작동 흐름

```
사용자 입력
    ↓
[Orchestrator] ─── 상태 분석, 다음 액션 결정
    ↓
[Planner] ─────── 작업 분해, 서브태스크 생성
    ↓
[Executor] ────── 각 태스크 실행
    ↓
[Reviewer] ────── 결과 검토, 품질 확인
    ↓
완료/반복
```

---

## 시스템 시작하기

### 사전 요구사항

- Python 3.11+
- Node.js 20+
- Docker & Docker Compose (선택사항)
- Anthropic API Key

### 1단계: 환경 설정

```bash
# 프로젝트 디렉토리로 이동
cd "/Users/younghwankang/Work/Agent System"

# .env 파일 생성 (아직 없다면)
cp .env.example .env

# ANTHROPIC_API_KEY 설정
echo "ANTHROPIC_API_KEY=your_api_key_here" > src/backend/.env
```

### 2단계: Backend 실행

```bash
cd src/backend

# 가상환경 활성화
source .venv/bin/activate

# 서버 실행
uvicorn api.app:app --reload --port 8000
```

### 3단계: Dashboard 실행 (새 터미널)

```bash
cd src/dashboard

# 의존성 설치 (최초 1회)
npm install

# 개발 서버 실행
npm run dev
```

### 4단계: 접속

- **Dashboard**: http://localhost:5173
- **API 문서**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/api/health

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
│ Tasks    │    └ Subtask 1   │  THINKING: 처리 중...         │
│ Agents   │    └ Subtask 2   │  SYSTEM: 완료                 │
│ Projects │                  │                               │
│ Activity │                  │                               │
│          ├──────────────────┴───────────────────────────────┤
│          │  [입력창: Describe the task...]        [Send]    │
│ Settings │  Press Enter to send              ● Connected    │
└──────────┴──────────────────────────────────────────────────┘
```

### 주요 영역

#### 1. Sidebar (왼쪽)
- **Dashboard**: 메인 화면
- **Tasks**: 태스크 목록 (예정)
- **Agents**: 에이전트 관리 (예정)
- **Projects**: 프로젝트 관리 (예정)
- **Activity**: 활동 로그 (예정)
- **Settings**: 설정 (예정)

#### 2. Task Tree (중앙 왼쪽)
작업의 계층 구조를 트리 형태로 표시합니다.

| 상태 | 아이콘 | 설명 |
|------|--------|------|
| Pending | ○ 회색 | 대기 중 |
| In Progress | ◐ 파란색 (회전) | 실행 중 |
| Completed | ✓ 녹색 | 완료 |
| Failed | ✗ 빨간색 | 실패 |

#### 3. Agent Activity (중앙 오른쪽)
에이전트의 실시간 활동을 표시합니다.

| 타입 | 색상 | 설명 |
|------|------|------|
| USER | 파란색 | 사용자 입력 메시지 |
| THINKING | 노란색 | 에이전트 사고 과정 |
| ACTION | 녹색 | 에이전트 실행 액션 |
| SYSTEM | 회색 | 시스템 메시지 |
| ERROR | 빨간색 | 에러 메시지 |

#### 4. 입력창 (하단)
- 텍스트 입력 후 **Enter** 또는 **Send 버튼**으로 전송
- **Shift+Enter**: 줄바꿈
- 연결 상태: `● Connected` / `○ Disconnected`

---

## 기능 설명

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

### 2. 실시간 진행 상황 모니터링

- **Task Tree**: 작업 분해 및 진행 상황 시각화
- **Agent Activity**: 각 에이전트의 사고 과정 실시간 확인
- **상태 카운터**: Pending / Active / Done 개수 표시

### 3. 세션 관리

- 각 브라우저 탭은 고유한 세션 ID를 가짐
- 세션 ID는 헤더에 표시됨 (예: `Session: abc12345`)
- 페이지 새로고침 시 새 세션 시작

### 4. 작업 취소

- 실행 중인 작업을 취소하려면 **Stop 버튼** (빨간색) 클릭
- 취소된 작업은 `Cancelled` 상태로 표시

### 5. HITL (Human-in-the-Loop) 승인

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
4. 승인 시 작업 실행, 거부 시 작업 건너뜀

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

### 6. 토큰/비용 모니터링

실시간으로 LLM 사용량과 비용을 추적합니다.

**대시보드 위치:**
- **헤더 배지**: 세션 총 비용 표시
- **Cost Monitor 패널**: 에이전트별 상세 사용량

**표시 정보:**
| 항목 | 설명 |
|------|------|
| Input Tokens | 입력 토큰 수 |
| Output Tokens | 출력 토큰 수 |
| Total Cost | 누적 비용 (USD) |
| Call Count | LLM 호출 횟수 |

### 7. Self-Correction (자동 재시도)

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

---

## API 사용법

### REST API 엔드포인트

#### Health Check
```bash
GET /api/health

# 응답
{"status": "healthy", "service": "agent-orchestrator"}
```

#### 세션 생성
```bash
POST /api/sessions

# 응답
{
  "session_id": "abc12345-...",
  "message": "Session created successfully"
}
```

#### 세션 상태 조회
```bash
GET /api/sessions/{session_id}

# 응답
{
  "session_id": "abc12345",
  "tasks": {...},
  "agents": {...},
  "current_task_id": "task123",
  "iteration_count": 5
}
```

#### 태스크 제출
```bash
POST /api/sessions/{session_id}/tasks
Content-Type: application/json

{
  "title": "Analyze text",
  "description": "Please analyze the following text..."
}

# 응답
{
  "session_id": "abc12345",
  "root_task_id": "task789",
  "message": "Task submitted for orchestration"
}
```

#### 태스크 취소
```bash
POST /api/sessions/{session_id}/cancel

# 응답
{"message": "Orchestration cancelled"}
```

### WebSocket API

#### 연결
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/{session_id}');
```

#### 메시지 전송
```javascript
// 태스크 생성
ws.send(JSON.stringify({
  type: 'task_create',
  payload: {
    title: 'My Task',
    description: 'Task description here'
  }
}));

// 사용자 메시지
ws.send(JSON.stringify({
  type: 'user_message',
  payload: {
    content: 'Hello, please help me with...'
  }
}));

// 태스크 취소
ws.send(JSON.stringify({
  type: 'task_cancel',
  payload: {}
}));

// Ping (연결 확인)
ws.send(JSON.stringify({
  type: 'ping',
  payload: {}
}));
```

#### 메시지 수신
```javascript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'task_started':
      console.log('Task started');
      break;
    case 'task_progress':
      console.log('Progress:', data.payload.progress);
      break;
    case 'agent_thinking':
      console.log('Agent thinking:', data.payload.thought);
      break;
    case 'agent_action':
      console.log('Agent action:', data.payload.action);
      break;
    case 'state_update':
      console.log('State updated:', data.payload);
      break;
    case 'task_completed':
      console.log('Task completed:', data.payload.result);
      break;
    case 'task_failed':
      console.log('Task failed:', data.payload.reason);
      break;
    case 'error':
      console.error('Error:', data.payload.message);
      break;
    case 'pong':
      console.log('Connection alive');
      break;
    // HITL 승인 관련
    case 'approval_required':
      console.log('Approval needed:', data.payload);
      break;
    case 'approval_granted':
      console.log('Approved:', data.payload.approval_id);
      break;
    case 'approval_denied':
      console.log('Denied:', data.payload.approval_id);
      break;
    // 토큰 사용량
    case 'token_update':
      console.log('Tokens:', data.payload);
      break;
  }
};
```

---

## 고급 기능

### 커스텀 에이전트 추가

새로운 전문 에이전트를 추가하려면:

```python
# src/backend/agents/specialist.py

class MyCustomAgent(BaseAgent):
    """커스텀 에이전트"""

    def __init__(self):
        config = AgentConfig(
            name="MyAgent",
            description="나만의 전문 에이전트",
            system_prompt="""당신은 특정 분야의 전문가입니다.

            역할:
            1. 특정 작업 수행
            2. 결과 반환
            """,
            temperature=0.7,
        )
        super().__init__(config)

    async def execute(self, task: str, context: dict | None = None) -> AgentResult:
        result = await self._invoke_llm(task, context)
        return AgentResult(success=True, output=result)
```

### LangGraph 노드 확장

새로운 처리 노드를 추가하려면:

```python
# src/backend/orchestrator/nodes.py

class CustomProcessorNode(BaseNode):
    """커스텀 처리 노드"""

    async def run(self, state: AgentState) -> dict[str, Any]:
        # 커스텀 로직 구현
        return {
            "custom_field": "result",
            "messages": [self._create_message("system", "처리 완료")],
        }
```

### 그래프 수정

```python
# src/backend/orchestrator/graph.py

# 새 노드 추가
graph.add_node("custom_processor", custom_node.run)

# 라우팅 규칙 추가
graph.add_conditional_edges(
    "orchestrator",
    route_function,
    {"custom": "custom_processor", ...}
)
```

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
증상: "ANTHROPIC_API_KEY environment variable is not set"
해결:
1. src/backend/.env 파일 확인
2. ANTHROPIC_API_KEY 값이 올바른지 확인
3. Backend 서버 재시작
```

#### 3. Import 에러
```
증상: "ModuleNotFoundError" 또는 "ImportError"
해결:
1. 가상환경이 활성화되어 있는지 확인
2. pip install -r requirements.txt 실행
3. Python 버전 확인 (3.11+)
```

#### 4. Task 실패
```
증상: Task Tree에서 "Failed" 표시
해결:
1. Agent Activity에서 에러 메시지 확인
2. Backend 로그 확인
3. API 요청/응답 확인
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
# Backend 재시작
# Ctrl+C로 중지 후
uvicorn api.app:app --reload --port 8000

# Dashboard 재시작
# Ctrl+C로 중지 후
npm run dev
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
| ANTHROPIC_API_KEY | Anthropic API 키 | (필수) |
| LLM_PROVIDER | LLM 제공자 (ollama/anthropic) | ollama |
| OLLAMA_MODEL | Ollama 모델명 | qwen2.5:7b |
| DATABASE_URL | PostgreSQL 연결 URL | postgresql://... |
| USE_DATABASE | DB 영구 저장 활성화 | false |
| REDIS_URL | Redis 연결 URL | redis://localhost:6379 |
| DEBUG | 디버그 모드 | false |
| PORT | 서버 포트 | 8000 |

### 참고 링크

- [LangGraph 문서](https://langchain-ai.github.io/langgraph/)
- [FastAPI 문서](https://fastapi.tiangolo.com/)
- [React 문서](https://react.dev/)
- [Tailwind CSS 문서](https://tailwindcss.com/)

---

*이 가이드는 Agent Orchestration System v0.1.0 기준으로 작성되었습니다.*
