# Warp Terminal - AOS MCP Integration

AOS(Agent Orchestration System)를 MCP 서버로 노출하여 Warp 터미널의 Agent Mode에서 사용하는 방법입니다.

## 아키텍처

```
┌─────────────────┐     MCP Protocol      ┌─────────────────┐
│  Warp Terminal  │ ◄──────────────────► │   AOS Backend   │
│  (MCP Client)   │     SSE/HTTP          │  (MCP Server)   │
└─────────────────┘                       └─────────────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │  LangGraph      │
                                          │  Orchestrator   │
                                          └─────────────────┘
```

## 사전 요구사항

1. **AOS Backend 실행**
   ```bash
   cd src/backend
   source .venv/bin/activate
   uvicorn api.app:app --reload --port 8000
   ```

2. **MCP 엔드포인트 확인**
   ```bash
   curl http://localhost:8000/mcp/health
   ```

## Warp 설정

### 1. MCP 서버 추가

Warp 설정에서 MCP Servers를 추가합니다:

**Settings > AI > MCP Servers > Add Server**

```json
{
  "mcpServers": {
    "aos": {
      "url": "http://localhost:8000/mcp/sse"
    }
  }
}
```

### 2. 연결 확인

Warp에서 MCP 서버 상태가 "Connected"로 표시되는지 확인합니다.

## 사용 가능한 도구

| 도구 | 설명 |
|------|------|
| `aos_create_task` | AOS에서 새 태스크 생성 |
| `aos_get_status` | 세션/태스크 상태 조회 |
| `aos_list_agents` | 사용 가능한 에이전트 목록 |
| `aos_run_check` | 프로젝트 검증 (typecheck, lint, test, build) |
| `aos_list_projects` | 등록된 프로젝트 목록 |

## 사용 예시

### Warp Agent Mode에서:

```
> ppt-maker 프로젝트 타입체크 실행해줘

[AOS aos_run_check 도구 호출]
→ project_id: "ppt-maker"
→ check_type: "typecheck"

결과:
✅ typecheck: success (1234ms)
Overall: ✅ All passed
```

```
> AOS에서 사용 가능한 에이전트 보여줘

[AOS aos_list_agents 도구 호출]

결과:
- web-ui-specialist: Web UI/UX
- backend-integration-specialist: Firebase, API
- performance-optimizer: 성능 최적화
- lead-orchestrator: 멀티 에이전트 조정
```

## API 엔드포인트

| Endpoint | Method | 설명 |
|----------|--------|------|
| `/mcp/sse` | GET | SSE 연결 (Warp 연결용) |
| `/mcp/messages` | POST | MCP JSON-RPC 메시지 |
| `/mcp/health` | GET | 헬스체크 |
| `/mcp/tools` | GET | 도구 목록 (편의용) |

## 문제 해결

### 연결 실패
1. AOS Backend가 실행 중인지 확인
2. 포트 8000이 사용 가능한지 확인
3. `/mcp/health` 엔드포인트 테스트

### 도구 호출 실패
1. 프로젝트가 `projects/` 디렉토리에 등록되어 있는지 확인
2. `/mcp/tools`에서 도구 목록 확인

---

## Dashboard → Warp 연동

AOS 대시보드에서 직접 Warp 터미널을 열 수 있는 기능입니다.

### 기능

1. **프로젝트 경로에서 Warp 열기** - 선택한 프로젝트 디렉토리에서 새 Warp 창 실행
2. **명령어 실행** - Launch Configuration을 사용한 명령어 자동 실행 (선택)

### 사용 방법

1. 대시보드 ChatInput에서 프로젝트 선택
2. **Warp** 버튼 클릭 → 해당 프로젝트 경로에서 Warp 창 열림

### API 엔드포인트

| Endpoint | Method | 설명 |
|----------|--------|------|
| `/api/warp/open` | POST | 프로젝트에서 Warp 열기 |
| `/api/warp/status` | GET | Warp 설치 상태 확인 |
| `/api/warp/cleanup` | POST | 오래된 Launch Config 정리 |

### API 사용 예시

```bash
# Warp 설치 상태 확인
curl http://localhost:8000/api/warp/status

# 프로젝트에서 Warp 열기
curl -X POST http://localhost:8000/api/warp/open \
  -H "Content-Type: application/json" \
  -d '{"project_id": "ppt-maker"}'

# 명령어와 함께 열기
curl -X POST http://localhost:8000/api/warp/open \
  -H "Content-Type: application/json" \
  -d '{"project_id": "ppt-maker", "command": "npm run type-check"}'
```

### 기술 구현

- **URI Scheme**: `warp://action/new_window?path=<path>` - 경로에서 새 창
- **Launch Configuration**: 명령어 실행 시 `~/.warp/launch_configurations/`에 YAML 설정 생성

---

## 참고

- [Warp MCP 문서](https://docs.warp.dev/knowledge-and-collaboration/mcp)
- [Warp URI Scheme](https://docs.warp.dev/features/uri-scheme)
- [Warp Launch Configurations](https://docs.warp.dev/terminal/sessions/launch-configurations)
- [MCP 프로토콜 스펙](https://modelcontextprotocol.io)
