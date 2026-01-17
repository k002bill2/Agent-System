
다음은 **Python(Backend/AI) + React/Next.js(Frontend)** 기반의 권장 폴더 구조입니다.

---

### **📂 Root Directory (Project Root)**

최상위 레벨은 전체 시스템의 생명주기를 관리합니다.

Plaintext

```
/my-agent-system
├── /backend             # AI 로직 및 오케스트레이션 서버 (Python/FastAPI)
├── /frontend            # 대시보드 및 모니터링 UI (Next.js/React)
├── /infrastructure      # Docker, K8s, Terraform 등 배포 설정
├── /workspace           # (중요) 에이전트가 실제로 작업을 수행하는 샌드박스 공간
├── /docs                # 아키텍처 문서 및 사용 가이드
├── docker-compose.yml   # 로컬 개발용 통합 실행 설정
└── README.md
```

---

### **1. 📂 Backend Structure (`/backend`)**

LangGraph, LLM 연동, 에이전트 로직이 포함된 핵심 영역입니다. **'코어 로직'**과 **'설정(Configuration)'**을 분리하는 것이 중요합니다.

Plaintext

```
/backend
├── /app
│   ├── /api                 # API 엔드포인트 (REST, WebSocket)
│   │   ├── /v1
│   │   │   ├── endpoints.py
│   │   │   └── websocket.py # 실시간 로그 스트리밍 처리
│   │   └── deps.py          # 의존성 주입
│   │
│   ├── /core                # 시스템 핵심 설정
│   │   ├── config.py        # Env 변수, 모델 설정
│   │   ├── database.py      # DB 연결
│   │   └── security.py      # 인증/인가
│   │
│   ├── /agents              # [핵심] 에이전트 정의
│   │   ├── /orchestrator    # 메인 에이전트 (Planner) 로직
│   │   │   ├── graph.py     # LangGraph 상태 머신 정의
│   │   │   └── nodes.py     # 그래프의 각 노드 실행 함수
│   │   ├── /workers         # 서브 에이전트들 (Workers)
│   │   │   ├── coder.py     # 코딩 담당
│   │   │   ├── reviewer.py  # 코드 리뷰 담당
│   │   │   └── tester.py    # 테스트 담당
│   │   └── state.py         # 에이전트 간 공유되는 State Schema (TypedDict)
│   │
│   ├── /tools               # 에이전트가 사용하는 도구 모음 (Function Calling)
│   │   ├── file_system.py   # 파일 읽기/쓰기 (샌드박스 적용)
│   │   ├── terminal.py      # 명령어 실행
│   │   ├── git_ops.py       # Git 관련 작업
│   │   └── search.py        # 웹 검색 또는 벡터 DB 검색
│   │
│   ├── /prompts             # 프롬프트 템플릿 (코드로 하드코딩 하지 않음)
│   │   ├── system           # 시스템 프롬프트 (.yaml 또는 .txt)
│   │   │   ├── orchestrator.yaml
│   │   │   └── coder_worker.yaml
│   │   └── templates        # 동적 프롬프트 템플릿
│   │
│   ├── /services            # 외부 서비스 연동
│   │   ├── llm_provider.py  # OpenAI/Anthropic 클라이언트 래퍼
│   │   └── vector_store.py  # Pinecone/ChromaDB 연동
│   │
│   └── main.py              # FastAPI 앱 진입점
│
├── /tests                   # 백엔드 테스트 코드
├── requirements.txt
└── pyproject.toml
```

**💡 설계 포인트:**

- **`/agents` vs `/tools`:** 에이전트(뇌)와 도구(손/발)를 철저히 분리하여, 나중에 'Coder' 에이전트에게 'Git' 도구를 줬다 뺏었다 할 수 있게 설계합니다.
    
- **`/prompts`:** 프롬프트를 `.yaml` 파일로 관리하면, 코드를 배포하지 않고도 에이전트의 성격을 튜닝할 수 있습니다.
    

---

### **2. 📂 Frontend Structure (`/frontend`)**

대시보드 UI입니다. 복잡한 상태 관리가 필요하므로 **데이터 흐름 위주**로 구조화합니다.

Plaintext

```
/frontend
├── /src
│   ├── /components          # UI 컴포넌트
│   │   ├── /dashboard       # 대시보드 전용 (Graph, Logs)
│   │   │   ├── TaskTree.tsx
│   │   │   ├── LogViewer.tsx
│   │   │   └── AgentStatus.tsx
│   │   ├── /common          # 버튼, 인풋 등 공용 컴포넌트
│   │   └── /layout          # 사이드바, 헤더 등
│   │
│   ├── /hooks               # 커스텀 훅
│   │   ├── useSocket.ts     # WebSocket 연결 및 메시지 파싱
│   │   └── useAgentStore.ts # Zustand/Redux 스토어 (전역 상태)
│   │
│   ├── /services            # API 호출 함수
│   │   ├── api.ts           # Axios/Fetch 인스턴스
│   │   └── types.ts         # 백엔드와 공유하는 TS 타입 정의 (JSON Schema)
│   │
│   ├── /pages (or /app)     # 라우팅
│   ├── /styles              # Tailwind CSS 설정 등
│   └── /utils               # 날짜 포맷팅, 로그 파싱 등 유틸리티
│
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

---

### **3. 📂 Workspace Structure (`/workspace`)**

이것은 소스 코드가 아니라, **에이전트가 "뛰어노는" 운동장**입니다.

- **역할:** 에이전트가 파일을 생성하고, 수정하고, 지우는 타겟 디렉토리입니다.
    
- **안전장치:** 에이전트는 `/backend` 코드를 건드리면 안 됩니다. 오직 `/workspace` 내부만 접근하도록 `FileSandbox` 클래스에서 경로를 제한해야 합니다.
    

Plaintext

```
/workspace
├── /project_a           # 에이전트가 작업 중인 프로젝트 A
├── /project_b           # 에이전트가 작업 중인 프로젝트 B
└── .agentignore         # 에이전트가 건드리면 안 되는 파일 목록 (.gitignore와 유사)
```

---

### **이 구조의 장점**

1. **범용성 (General Purpose):**
    
    - 새로운 종류의 에이전트(예: 디자이너 에이전트)를 추가하고 싶다면 `/backend/agents/workers/designer.py`만 추가하면 됩니다.
        
    - 새로운 도구(예: 슬랙 알림)를 추가하고 싶다면 `/backend/tools/slack.py`만 만들면 됩니다.
        
2. **유지보수성 (Maintainability):**
    
    - 프롬프트가 코드가 아닌 별도 파일로 관리되므로, 비개발자(프롬프트 엔지니어)도 로직 수정 없이 프롬프트를 개선할 수 있습니다.
        
3. **안전성 (Safety):**
    
    - `/workspace`를 분리함으로써 에이전트가 자기 자신의 시스템 코드를 실수로 삭제하는 대참사를 방지합니다.
        

### **추가 팁: 설정 파일 관리**

`config.yaml` 같은 파일을 루트에 두어 시스템 전체 동작을 제어하면 더욱 범용적으로 쓸 수 있습니다.

YAML

```
# config.yaml 예시
orchestrator_model: "claude-3-5-sonnet"
max_iterations: 50
workspace_root: "./workspace"
allowed_tools:
  - read_file
  - write_file
  - terminal_run
```

이 구조로 시작하시면 향후 기능이 확장되어도(예: 에이전트가 100개가 되거나, MSA로 분리되더라도) 유연하게 대응할 수 있습니다.