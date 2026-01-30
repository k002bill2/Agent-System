

**작성자:** 개발팀 (Gemini & User)
**마지막 업데이트:** 2026년 1월 17일
**상태:** ✅ Phase 1-2 구현 완료

---

## 📋 문서 개요

> **💡 이 문서는 무엇인가요?**
> LLM 기반 멀티 에이전트 시스템(Orchestrator & Workers)의 기술적 구현 명세, 데이터 흐름, 인프라 구조를 정의합니다.

### 🎯 기술적 목표

- **확장성:** 새로운 에이전트 및 도구(Tool)의 손쉬운 추가 (Plugin Architecture)
- **실시간성:** WebSocket 기반의 지연 없는 로그 스트리밍 (Latency < 200ms)
- **안정성:** LangGraph 기반 상태 관리 및 샌드박스 환경 격리

---

## 🛠 기술 스택

### Core Technologies

| **카테고리**          | **기술**               | **선정 이유**                        |
| :---------------- | :------------------- | :------------------------------- |
| 🎯 **Frontend**   | Next.js, React Flow  | 대시보드 시각화, 태스크 그래프 렌더링            |
| 📝 **State Mgmt** | Zustand, React Query | 실시간 스트리밍 데이터 및 서버 상태 관리          |
| ⚡ **Backend**     | Python, FastAPI      | 비동기 처리, AI 라이브러리 호환성             |
| 🧠 **LLM Ops**    | LangGraph, LangChain | 복잡한 에이전트 상태 머신 및 순환 그래프 제어       |
| 🗄️ **Database**  | PostgreSQL, Pinecone | 태스크 이력(RDB) 및 컨텍스트 검색(Vector DB) |
| 🚀 **Infra**      | Docker, Redis        | 샌드박스 실행 환경 및 메시지 큐               |

---

## 🏗 시스템 아키텍처

### 🔧 주요 구성 요소

> **Client (Dashboard)**
> - **Task Graph:** 태스크 분해/진행도 시각화 (DAG)
> - **Terminal UI:** 실시간 로그 및 코드 Diff 뷰어
> - **Control Panel:** 일시정지, 개입, 재시도 명령 전송

> **Orchestrator Server (FastAPI)**
> - **Planner Agent:** 사용자 의도 파악 및 태스크 분해
> - **Dispatcher:** 서브 에이전트에게 작업 할당 및 리소스 배분
> - **Context Manager:** Global/Local Context 관리 및 주입

> **Worker Nodes (Sandbox)**
> - **Coder:** 코드 생성 및 수정
> - **Tester:** 테스트 코드 실행 및 결과 리포트
> - **File System:** 가상/실제 파일 시스템 접근 제어 (Safe I/O)

### 🔄 데이터 플로우

[User Input] → [API Gateway] → [Orchestrator]

↓ (Plan & Context)

[Worker Agents (LangGraph)]

↓ (Action: Tool Call)

[Sandbox / External API]

↓ (Observation)

[Streaming Log] ← [WebSocket] ← [Response Processing]

```

### 📁 프로젝트 구조 (Monorepo Strategy)

<details>
<summary><strong>📂 폴더 구조 보기</strong></summary>

```

📦 agent-system-root/

├── 📂 backend/ # Python FastAPI Server

│ ├── 📂 agents/ # 에이전트 로직

│ │ ├── orchestrator.py # 메인 플래너

│ │ └── workers/ # 서브 에이전트 (Coder, Reviewer)

│ ├── 📂 core/ # 설정 및 보안

│ ├── 📂 tools/ # Function Calling Tools (File, Git, Terminal)

│ ├── 📂 prompts/ # 프롬프트 템플릿 (.yaml)

│ └── main.py

├── 📂 frontend/ # Next.js Dashboard

│ ├── 📂 components/ # LogViewer, TaskTree

│ ├── 📂 hooks/ # useWebSocket, useAgentState

│ └── 📂 store/ # Zustand Store

├── 📂 workspace/ # 🛡️ 에이전트 작업 공간 (Sandbox)

│ └── .agentignore # 접근 제한 설정

└── 📂 infrastructure/ # Docker Compose, K8s 설정

````

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
- [ ] Vector DB 기반 코드 베이스 검색 (RAG) - 예정

**🛡️ 제어 시스템**
- [x] **HITL (승인 요청) UI/UX 구현** (ApprovalModal)
- [x] Circuit Breaker (무한 루프 방지, max_iterations)
- [x] **데이터베이스 지속성** (PostgreSQL, USE_DATABASE)
- [ ] Docker 기반 샌드박스 환경 구축 - 예정

</details>

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
````

---

## ⚠️ 리스크 관리

### 🔍 기술적 리스크

|**위험 요소**|**영향도**|**완화 전략**|
|---|---|---|
|**Context Window 초과**|High|요약(Summarization) 기법 및 중요 파일만 선별 주입|
|**환각(Hallucination)**|High|실행 전 `Lint/Type Check` 강제, 자기 비판(Reflexion) 단계 추가|
|**동시성 제어**|Medium|파일 쓰기 시 Lock 메커니즘 적용, Atomic Write 준수|

---

## ✅ 검수 및 승인

### 👥 검토자

- [ ] **System Architect**: LangGraph 설계 및 상태 관리 검토
    
- [ ] **Frontend Lead**: 대시보드 성능 및 WebSocket 안정성 검토
    
- [ ] **Security Officer**: 샌드박스 탈옥 방지 및 권한 관리 검토