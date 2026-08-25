# Architecture

AOS 백엔드 아키텍처 문서입니다.

## LangGraph Nodes

| Node | 역할 |
|------|------|
| `OrchestratorNode` | 상태 분석, 다음 액션 결정, 의존성 기반 태스크 스케줄링 |
| `PlannerNode` | **LLM 기반** 태스크 분해, 서브태스크 생성, **RAG 컨텍스트 조회** |
| `ExecutorNode` | 태스크 실행, **HITL 승인 체크**, **MCP 도구 자동 통합** |
| `ParallelExecutorNode` | **병렬 태스크 실행** (최대 3개 동시), asyncio.gather 사용 |
| `ReviewerNode` | 품질 검증, 결과 집계 |
| `SelfCorrectionNode` | **에러 분석**, 재시도 전략 생성, 최대 3회 자동 재시도 |

## Agent State

```python
class AgentState(TypedDict):
    session_id: str
    user_id: str | None
    organization_id: str | None
    messages: list[dict]
    tasks: dict[str, TaskNode]
    root_task_id: str | None
    current_task_id: str | None
    active_agent_id: str | None
    agents: dict[str, AgentInfo]
    next_action: str | None
    iteration_count: int
    context: dict[str, Any]
    artifacts: dict[str, Any]
    errors: list[dict]
    last_error: str | None
    # HITL (Human-in-the-Loop)
    pending_approvals: dict[str, dict]
    waiting_for_approval: bool
    # Token/Cost Tracking
    token_usage: dict[str, Any]
    total_cost: float
    # Plan Metadata
    plan_metadata: dict[str, Any]
    # Parallel Execution
    batch_task_ids: list[str]  # 병렬 실행 대상 태스크 ID
```

## Task Status Flow

```
pending → in_progress → completed
                     ↘ failed → (retry) → pending
                     ↘ cancelled
                     ↘ paused → (resume) → in_progress
                     ↘ waiting → (unblock) → in_progress
```

## 세션 캐시 경계

`OrchestrationEngine._sessions` 는 `SessionService` 앞의 프로세스 로컬 캐시다.
TTL·삭제·영속화는 전부 서비스가 소유하므로, 캐시가 서비스를 우회하면 그 판정이
통째로 건너뛰어진다.

| 계약 | 위치 | 없으면 |
|------|------|--------|
| 캐시 히트도 만료를 확인한다 | `engine.get_session` → `SessionService.is_session_expired` | 만료된 세션이 캐시에서 무기한 서빙됨 |
| 메타데이터 부재는 **만료**로 본다 | `SessionService.is_session_expired` | `delete_session` 이 메타데이터를 지우므로, 삭제된 세션을 캐시가 계속 내줌 |
| 캐시 갱신은 영속화와 쌍을 이룬다 | `engine.save_session` | 재시작·다른 인스턴스의 캐시 미스 이후 변경이 사라짐 |
| 외부 호출자는 캐시를 직접 순회하지 않는다 | `api/context.py` → `list_sessions()` + `engine.get_session()` | 만료 세션이 걸러지지 않고 응답에 실림 |
| 목록 필터는 저장소 질의에 있다 | `SessionService.list_sessions(project_id=...)` | `limit` 이 필터보다 먼저 적용돼 대상 세션이 상위 N 개 밖으로 밀려남 |
| TTL(`expires_at`)은 저장소가 이긴다 | `SessionService.get_session` 이 매 읽기마다 `state["_metadata"]` 로 재수화 | 다른 인스턴스가 연장한 TTL 을 못 보고 살아 있는 세션을 삭제 |
| 활동 기록(`last_activity`)은 늦은 쪽이 이긴다 | 같은 지점의 high-water mark | DB 모드에서 아직 flush 되지 않은 활동이 지워져 방금 읽힌 세션이 비활성으로 분류됨 |
| 연장 실패는 되돌린다 | `SessionService.refresh_session` (False 반환·예외 양쪽) | 메모리만 연장된 상태로 저장소와 갈라져 재시작·타 인스턴스에서 연장이 사라짐 |

`_session_metadata` 는 프로세스 로컬 캐시이고, `get_session` 은 읽을 때마다 저장소의
`_metadata` 로 재수화한다 — state 를 이미 로드한 뒤라 추가 I/O 가 없다.

재수화는 필드마다 권위가 다르다. **`expires_at` 은 리스**다 — 저장소가 내주는 것이라
저장소가 이긴다(`refresh_session` 이 연장값을 저장소에 쓴다). **`last_activity` 는
high-water mark** 다 — 활동은 누구의 관측이든 실제로 일어난 일이라 더 늦은 쪽이
이긴다. DB 모드에서는 `touch()` 가 영속화되지 않으므로 저장소 값으로 덮으면 방금
읽힌 세션이 비활성으로 분류된다. `created_at` 은 불변이다.

`is_session_expired` 의 빠른 경로는 여전히 낡을 수 있지만 그 결과는 "캐시를 버리고
서비스 경로로 떨어짐" 뿐이고, 거기서 재수화가 올바른 답을 낸다. 비용은 저장소 읽기
한 번이지 데이터 손실이 아니다.

남는 것은 두 인스턴스가 **동시에** 갱신·삭제를 시도하는 진짜 크로스 프로세스
원자성이다. 그 답은 HITL 승인과 같다 — 저장소를 진실의 출처로 쓰는 조건부 `UPDATE`.

## 세션 state 동시 쓰기

`update_state` 는 `state_json` 을 **통째로** 덮어쓴다. 두 프로세스가 read-modify-write
를 겹치면 늦게 쓴 쪽이 앞선 변경을 지운다(lost update). 승인 이중 소비와 세션 TTL
경합은 이 부류의 사례였다.

`sessions.version` 으로 낙관적 동시성을 건다 —
`UPDATE ... SET ..., version = version + 1 WHERE id = ? AND version = ?`.

| 계약 | 위치 | 없으면 |
|------|------|--------|
| 버전은 state 에 실려 다닌다 | `get_session` 이 `state["_version"]` 을 찍는다 | 서비스 수준 dict 로 두면 같은 프로세스의 동시 읽기 둘이 그것을 공유해 늦은 쓰기가 통과 |
| 버전은 저장하지 않는다 | `update_state` 가 직렬화 결과에서 제거 | 컬럼과 JSON 두 벌이 되어 드리프트 |
| 쓰기 성공 시 새 버전을 호출자에게 돌려준다 | `UPDATE ... RETURNING version` | 같은 state 로 다시 쓸 때 아무도 끼어들지 않았는데 충돌 |
| 실패는 "행 없음" 과 "버전 불일치" 를 구분한다 | `StateWriteResult` | 재시도해도 소용없는 경우와 재시도해야 하는 경우가 뭉개짐 |
| read-modify-write 는 `mutate_session` 을 쓴다 | 서비스/엔진 양쪽에 있음 | 직접 get + update 하면 그 사이의 다른 쓰기를 지움 |
| 충돌 시 엔진 캐시를 버린다 | `engine.save_session` | 캐시 히트가 같은 낡은 버전을 계속 내줘 재시도가 영원히 충돌 |
| HTTP 도달 경로에 미처리 충돌을 남기지 않는다 | 승인 API 는 재시도 후 409 | 재시도 가능한 조건이 500 으로 나감 |

**`AgentState` 에 선언되지 않은 키는 그래프를 통과하며 사라진다.** LangGraph 가 노드
출력에서 조용히 버리므로 `_metadata`(TTL)·`_version`(행 버전)은 반드시 선언돼 있어야
한다. 선언이 지워지면 에러 없이 계약만 무너진다 —
`tests/backend/test_agent_state_graph_keys.py` 가 그래프를 왕복시켜 지킨다.

**예외: `engine.run`·`engine.stream` 의 최종 저장은 `check_version=False` 다.**
완료된 그래프 실행의 산물이라 재시도가 도구 재실행을 뜻한다. 대신 실행 중 다른
프로세스가 쓴 것은 유실된다 — 오래된 스냅샷을 통째로 쓰는 구조에서 오는 한계다.

**단, 터미널 승인은 예외의 예외다 (issue #292).** 승인 상태는 단조롭다
(`pending → approved → consumed/denied`). 무조건 쓰기가 `consumed` 를 `approved` 로
되돌리면 그 승인으로 도구가 **다시** 실행될 수 있으므로, `update_state` 는
`expected_version` 이 없을 때 행을 `FOR UPDATE` 로 잠그고 저장소의 터미널 승인을
병합해 넣는다(`_preserve_terminal_approvals`). 병합 규칙은 "나중에 쓴 쪽" 이 아니라
**"더 앞선 쪽"** 이다. 나머지 필드의 필드 단위 병합은 여전히 없다.

**남는 것**: 진 쪽은 재시도가 아니라 task 실패로 처리된다
(`executor._persist_approval_consumption`). 승인은 저장소에 `approved` 로 남아
사람이 다시 시도할 수 있으므로 안전하지만, 자동 재개는 아니다.

## HITL 승인 생명주기

```
pending ──(POST /approve)──> approved ──(executor 가 도구 호출과 대조)──> consumed
   │                                                                        (실행)
   └────(POST /deny)────> denied ──> task FAILED
```

승인은 **task 가 아니라 도구 호출에 바인딩**된다(`tool_name` + `tool_args` 대조).
재진입한 executor 는 LLM 을 다시 호출하므로 승인받은 것과 다른 호출이 나올 수 있고,
status 만 보고 통과시키면 이전 승인의 권한으로 그 호출이 실행된다.

**at-most-once 보장** — 비가역 도구(`execute_bash` 등)가 같은 승인으로 두 번
실행되지 않게 하는 세 가지 계약:

| 계약 | 위치 | 없으면 |
|------|------|--------|
| 전이의 관문은 하나다 (REST·WebSocket 공용) | `api/hitl.py` 의 `resolve_approval` | WebSocket 경로에 PENDING 검사가 없어 소비된 승인이 다시 `approved` 로 열림 |
| 전이는 세션 조회부터 저장까지 직렬화된다 | 같은 함수의 루프별 전이 락 | 캐시 미스 동시 요청 두 건이 각자 사본에서 PENDING 을 보고 둘 다 통과 |
| 전이는 `engine.run` **전에** 영속화된다 | `resolve_approval` → `engine.save_session` | 그래프 실행 실패·프로세스 종료 시 승인이 통째로 사라짐 |
| 소비(`consumed`)는 도구 실행 **전에** 영속화된다 | `orchestrator/nodes/executor.py` 의 `_consume_approval` | 실행 후 저장 전 종료 시 재시작 후 같은 승인으로 재실행 |
| 소비는 락 안에서 상태를 다시 확인하는 compare-and-set 이다 | 같은 함수 (`APPROVAL_STATE_LOCK`) | 병렬 배치에서 낡은 스냅샷이 늦게 커밋돼 다른 소비를 `approved` 로 되돌림 |
| 소비는 승인 레코드를 **제자리에서** 바꾼다 | 같은 함수 | 저장소는 `consumed`, 엔진 캐시는 `approved` 로 갈라져 낡은 캐시가 재승인 |
| 소비 직전에 **저장소의** 승인 상태를 다시 읽는다 | `_approval_is_claimable_in_storage` | 캐시가 빈 상태에서 겹친 두 실행이 각자 `approved` 사본을 들고 둘 다 실행 |
| 영속화가 실패하면 전이를 되돌린다 | `resolve_approval` · `_consume_approval` | 캐시 `approved` / 저장소 `pending` 으로 갈려 재시도가 400 — 승인이 영영 해소 불가 |
| 소비 기록은 엔진이 읽는 저장소에 쓴다 | `ExecutorNode(session_service=...)` (엔진이 주입) | 커스텀 서비스 주입 시 소비가 다른 저장소로 가 재시작 후 승인이 부활 |

소비 기록만 남고 결과가 남지 않은 잔재(실행 도중 종료)는 `OrchestratorNode` 가
`is_task_orphaned_by_consumed_approval` 로 찾아 **실패로 정리**한다. 실행 여부를 알 수
없으므로 자동 재개는 하지 않고, 그렇다고 조용히 멈추지도 않는다.

`pending_approvals` 를 반환하지 않는 노드 결과는 그래프 종료 시의 전체 state 저장이
`consumed` 를 되돌려 놓는다 — executor 의 모든 반환 경로가 이 키를 실어 보내는 이유다.

승인 전이와 소비는 **같은 락**(`models/hitl.py` 의 `APPROVAL_STATE_LOCK`)을 공유한다 —
둘 다 세션 JSON 전체를 덮어쓰므로 따로 잠그면 서로의 쓰기를 되돌린다. 락 안에서
그래프를 돌리면 교착이므로, 승인 API 는 저장까지만 잡고 놓은 뒤 `engine.run` 을 부른다.

승인 후 그래프 실행이 실패해 task 가 `WAITING` + `approved` 로 남으면, 다음 그래프 실행에서
스케줄러가 그 task 를 집어 재개한다(`is_task_resumable_after_approval`). 승인 API 를 다시
호출하는 방식의 재개는 없다 — 중복 승인 요청과 구분할 수 없기 때문이다.

**크로스 프로세스 at-most-once 는 확보돼 있다 (issue #292).** 진실의 출처는
`approvals` 테이블이 아니라 `sessions.state_json` + `sessions.version` 이다 —
소비는 `_persist_approval_consumption` 의 조건부 UPDATE 로 기록되므로, 두 인스턴스가
같은 승인을 동시에 소비하려 하면 진 쪽이 `SessionVersionConflictError` 를 받고
**도구를 실행하지 않는다**(소비 기록이 실행보다 앞선다).

| 계약 | 위치 | 없으면 |
|------|------|--------|
| 소비 경로는 행 버전을 **요구**한다 | `_persist_approval_consumption` 의 `ApprovalConsumptionUnsafeError` | 버전 없는 state 는 무조건 쓰기로 내려가 두 인스턴스가 모두 소비에 성공 — 비가역 도구가 두 번 실행 |
| 무조건 쓰기는 터미널 승인을 되돌리지 않는다 | `SessionRepository._preserve_terminal_approvals` (`FOR UPDATE` 병합) | 그래프 최종 저장이 소비 이전 스냅샷으로 `consumed` 를 `approved` 로 되살려 재실행이 열림 |

`tests/backend/test_hitl_cross_process_atomicity.py` 가 서비스 인스턴스 둘로
(= 프로세스 둘) 지킨다. 그 파일은 이 검증을 무력화하는 거짓 초록 둘도 함께
막는다 — 공유 이벤트 루프의 in-process 락, 그리고 읽기·소비를 함께 띄워
경합이 아니라 순차 실행이 되는 것.

`approvals` 테이블은 현재 **쓰이지 않는다**(`save_approval` 계열 호출부 0건).
정확성에는 불필요하며, 감사·조회용으로 되살리는 것은 별도 작업이다.

## Directory Structure (Backend)

```
src/backend/
├── agents/
│   ├── base.py              # BaseAgent 추상 클래스
│   ├── specialist.py        # Specialist 베이스 클래스
│   ├── lead_orchestrator.py # 리드 오케스트레이터
│   └── specialists/
│       ├── mobile_ui_agent.py
│       ├── backend_agent.py
│       └── test_agent.py
├── orchestrator/
│   ├── engine.py            # 메인 실행 엔진
│   ├── graph.py             # LangGraph 그래프 구성
│   ├── nodes/               # 노드 패키지 — 원래 단일 nodes.py(1,714줄)를 노드별로 분할
│   │                        #   base·orchestrator·planner·executor·reviewer·
│   │                        #   self_correction (6모듈). __init__.py 는 노드 클래스
│   │                        #   6종만 재노출하며 import 경로는 `orchestrator.nodes` 불변.
│   │                        #   optional 의존 블록(try/except ImportError)은 원자 단위라
│   │                        #   쓰는 클래스를 따라간다 — RAG→planner, MCP→executor.
│   │                        #   그 블록이 순환 import 로 조용히 fallback 되는 것은
│   │                        #   tests/backend/test_orchestrator_nodes_optional_deps.py 가 잡는다
│   ├── parallel_executor.py # ParallelExecutorNode (병렬 실행)
│   └── tools.py             # MCP 도구 실행자
├── services/                    # 72개 모듈 + 패키지 3종 (external_usage_service/, terminal_service/, pipeline/)
│   ├── agent_manager.py           # 에이전트 인스턴스 관리
│   ├── agent_registry.py          # 에이전트 등록소
│   ├── alerting_service.py        # 알림/경고 서비스
│   ├── analytics_service.py       # 분석 서비스 (세션 파일 + DB 이중 지원)
│   ├── artifact_service.py        # 워크플로우 아티팩트 관리
│   ├── audit_integrity.py         # 감사 로그 무결성 검증
│   ├── audit_service.py           # 감사 로그 서비스
│   ├── auth_service.py            # OAuth/JWT/Email 인증
│   ├── claude_config_service.py   # Claude OAuth 토큰 관리 (Keychain/env/파일)
│   ├── claude_session_monitor.py  # Claude 세션 파일 스캔/파싱
│   ├── code_entity_extractor.py   # RAG 메타데이터용 코드 엔티티 추출 (AST/Regex)
│   ├── cost_allocation_service.py # 비용 추적/할당 서비스
│   ├── credential_service.py      # 자격증명 암호화/저장
│   ├── encryption_service.py      # AES-256-GCM 암호화 서비스
│   ├── environment_diagnostic_service.py  # 환경 진단 서비스 (Vault Health, 시스템 상태)
│   ├── deployment_usage_credential_service.py  # 배포 단위 usage admin 키(DB) 해석/CRUD/검증
│   ├── external_usage_service/    # 내부 LLM ledger adapter + optional provider billing reconciliation
│   │                              #   원래 단일 932줄 → summaries·collectors·service (3모듈).
│   │                              #   httpx 를 쓰는 것은 collectors 뿐이며 테스트 패치도
│   │                              #   그 경로를 겨냥한다. _service_instance 싱글턴은
│   │                              #   global 재바인딩이라 get_external_usage_service 와
│   │                              #   같은 모듈(service)에 있다
│   ├── llm_access_service.py      # CLI profile/user entitlement 관리
│   ├── llm_usage_ledger_service.py # 내부 LLM 사용량 원장 기록/집계
│   ├── llm_runtime_resolver.py    # user/org/source 기반 runtime provider/mode 결정
│   ├── feedback_service.py        # RLHF 피드백
│   ├── frontmatter_parser.py      # YAML Frontmatter 파싱 (SKILL.md, agent .md)
│   ├── git_service.py             # Git 작업 관리 서비스
│   ├── github_service.py          # GitHub API 통합
│   ├── health_service.py          # 시스템 헬스체크 서비스
│   ├── key_management.py          # HKDF 기반 암호화 키 관리
│   ├── llm_router_service.py      # LLM 라우팅/Failover
│   ├── llm_service.py             # LLM 프로바이더 팩토리
│   ├── logging_service.py         # 구조화된 로깅
│   ├── mcp_config_manager.py      # MCP 설정 파일 관리
│   ├── mcp_manager.py             # MCP 서버 생명주기 관리
│   ├── mcp_service.py             # MCP 서버 관리
│   ├── merge_service.py           # Git 머지/충돌 해결
│   ├── notification_service.py    # 알림 서비스 (Slack, Discord, Email, Webhook)
│   ├── organization_service.py    # 조직/멀티테넌트 서비스
│   ├── playground_service.py      # 에이전트 플레이그라운드
│   ├── playground_tools.py        # 플레이그라운드 도구 정의
│   ├── project_access_service.py  # RBAC 접근제어 서비스
│   ├── project_cleanup_service.py # 프로젝트 삭제/정리
│   ├── project_config_monitor.py  # 프로젝트 설정 파일 모니터링
│   ├── project_discovery.py       # 프로젝트 자동 발견
│   ├── project_invitation_service.py # 프로젝트 멤버 초대 (이메일, 7일 만료)
│   ├── project_runner.py          # 프로젝트 체크 실행 (test/lint/build/typecheck)
│   ├── project_template_service.py # 프로젝트 템플릿 관리
│   ├── quota_service.py           # 사용량 쿼터 서비스
│   ├── rag_service.py             # Vector DB + RAG
│   ├── rate_limit_service.py      # API 속도 제한 서비스
│   ├── sandbox_manager.py         # Docker 격리 실행
│   ├── scheduler_service.py       # APScheduler 기반 Cron 스케줄링
│   ├── secret_service.py          # Fernet 암호화 시크릿 관리
│   ├── session_service.py         # 세션 생명주기 관리
│   ├── skill_manager.py           # SKILL.md 파일 CRUD 관리
│   ├── task_analysis_service.py   # 태스크 복잡도 분석
│   ├── task_service.py            # 태스크 CRUD/상태 관리
│   ├── template_service.py        # 워크플로우 템플릿 관리
│   ├── tmux_service.py            # Tmux 세션 관리
│   ├── variable_expander.py       # ${{ }} 변수 치환 (steps/env/matrix/secrets)
│   ├── version_service.py         # 설정 버전 관리/롤백
│   ├── memory_manager.py          # Claude Code 메모리 파일 CRUD 관리
│   ├── rules_manager.py           # Claude Code 규칙 파일 CRUD 관리 (프로젝트/글로벌)
│   ├── upload_cleanup_service.py  # 업로드 파일 TTL 기반 정리
│   ├── warp_service.py            # Warp 터미널 + MCP 에이전트
│   ├── webhook_service.py         # Webhook 딜리버리 (HMAC-SHA256)
│   ├── workflow_engine.py         # 워크플로우 DAG 실행 엔진
│   ├── workflow_service.py        # 워크플로우 CRUD 서비스
│   ├── workflow_yaml_parser.py    # 워크플로우 YAML 파싱
│   ├── automation_loop_service.py # 주기적 조건 모니터링 + 자동 액션 실행 루프
│   ├── context_compressor.py      # 컨텍스트 압축 서비스
│   ├── terminal_service/          # 터미널 세션 관리 서비스
│   │                              #   원래 단일 867줄 → base·adapters·orca·service (4모듈).
│   │                              #   TERMINAL_INFO 는 읽기 전용 사용이라 모듈을 갈라도
│   │                              #   안전하며 base 에 있다(api/terminal.py 가 직접 import).
│   │                              #   orca 테스트의 MODULE 상수는 이 패키지의 orca 모듈을
│   │                              #   겨냥한다 — shutil·sys·asyncio·_write_exec_script
│   │                              #   패치 타깃이 전부 거기 모여 있다
│   └── pipeline/                  # 모듈형 데이터 파이프라인
│       ├── pipeline_service.py    # 파이프라인 오케스트레이터
│       ├── models.py              # PipelineConfig, PipelineResult 등 모델
│       ├── stage.py               # BaseStage ABC, PipelineContext
│       └── stages/                # 내장 4단계
│           ├── collect_stage.py   # 데이터 수집 단계
│           ├── transform_stage.py # 데이터 변환 단계
│           ├── analyze_stage.py   # 데이터 분석 단계
│           └── output_stage.py    # 결과 출력 단계
├── api/                     # FastAPI 라우터 (42개 모듈 + 패키지 7종, api/*.py 기준 __init__.py 제외)
│   ├── git/                 # Git API 패키지 — 원래 단일 git.py(2,022줄)를 도메인별로 분할
│   │                        #   branches·commits·github·merge·merge_requests·remotes·
│   │                        #   repositories·working_tree (8모듈) + _shared(공용 의존성).
│   │                        #   __init__.py 가 라우터를 집계하며 import 경로는 `api.git` 불변
│   ├── usage/               # Usage API 패키지 — 원래 단일 usage.py(1,244줄)를 분할
│   │                        #   models·jsonl·anthropic·codex·routes (5모듈).
│   │                        #   라우트 7개는 routes.py 한 곳에 원본 선언 순서대로 둔다 —
│   │                        #   include_router 조립이 없어 등록 순서가 완전히 보존된다.
│   │                        #   응답 캐시는 그것을 **재바인딩하는 쪽과 같은 모듈**에 둔다:
│   │                        #   _usage_cache 는 anthropic(_load/_save 와 함께),
│   │                        #   _codex_plan_cache 는 routes(테스트가 dict 를 통째로
│   │                        #   갈아끼우므로 읽는 라우트와 갈리면 한쪽이 옛 dict 를 본다).
│   │                        #   __init__.py 는 router 만 재노출한다 — 이동한 이름까지
│   │                        #   재노출하면 monkeypatch.setattr 이 별칭만 갈아끼워
│   │                        #   테스트가 실물 경로를 읽은 채 조용히 통과한다
│   ├── agents/, projects/, claude_sessions/, project_configs/
│   │                        # Batch 2 도메인 분할 패키지. import 경로는 분할 전과 동일
│   └── v1/                  # v1 API (6개 모듈: agent_monitor, agent_registry, agents, auth_middleware, rate_limiter, stations)
│       ├── agents.py        # 에이전트 CRUD API
│       ├── rate_limiter.py  # API 속도 제한
│       └── stations.py      # 스테이션 관리 API
├── auth/                    # 인증 프로바이더
│   ├── token_service.py     # JWT 토큰 발급/검증 서비스
│   └── providers/
│       ├── base.py          # AuthProvider ABC, UserInfo
│       ├── google.py        # Google OAuth
│       ├── github.py        # GitHub OAuth
│       ├── oidc.py          # OpenID Connect (httpx 기반)
│       └── saml.py          # SAML 2.0 (stdlib XML 기반)
├── db/                      # SQLAlchemy ORM
│   ├── database.py          # 데이터베이스 연결/세션 관리
│   ├── repository.py        # 리포지토리 패턴 구현
│   ├── types.py             # DB 커스텀 타입 정의
│   ├── migrations/          # DB 마이그레이션 스크립트
│   └── models/
│       ├── session.py       # SessionModel, TaskModel, MessageModel, ApprovalModel
│       ├── auth.py          # UserModel, RefreshTokenModel
│       ├── claude_session.py # ClaudeSessionSnapshotModel (세션 스냅샷)
│       ├── feedback.py      # FeedbackModel, TaskEvaluationModel
│       ├── organization.py  # OrganizationModel, OrganizationMemberModel
│       ├── notification.py  # NotificationRuleModel (project_ids JSONB)
│       ├── workflow.py      # WorkflowModel, WorkflowRunModel
│       ├── git.py           # MergeRequestModel, BranchProtectionRuleModel
│       ├── cost.py          # CostAllocationModel
│       ├── llm.py           # LLMModelConfigModel
│       ├── project.py       # ProjectModel
│       ├── activity.py      # SessionActivityModel
│       ├── config_version.py # ConfigVersionModel (설정 버전 스냅샷/롤백)
│       ├── playground.py    # PlaygroundSessionModel (에이전트 테스트 세션)
│       ├── audit.py         # AuditLogModel (감사 로그)
│       ├── model_update.py  # ModelUpdateLogModel (모델 자동 발견/갱신 이력)
│       └── base.py          # Base, TimestampMixin
├── models/                  # Pydantic 데이터 모델 (34개 모듈 + 패키지 1종, models/*.py 기준 __init__.py 제외)
│   └── git/                 # Git 모델 패키지 — 원래 단일 git.py(991줄)를 도메인별로 분할
│                            #   branches·commits·enums·github·merge·merge_requests·
│                            #   permissions·remotes·repository·working_tree (10모듈).
│                            #   __init__.py 가 최상위 이름 81종을 전부 재노출하며
│                            #   import 경로는 `models.git` 불변. 도메인 구획은 api/git/ 과 대칭.
│                            #   GIT_REPOSITORIES(인메모리 레지스트리)와 그것을 읽고 쓰는
│                            #   함수 6종은 repository.py 에 함께 둔다 — 가르면 global
│                            #   재바인딩으로 상태 사본이 분열된다
├── middleware/
│   └── rate_limit.py        # RateLimitMiddleware (per-user/IP, tier-based)
├── utils/
│   └── time.py              # utcnow() - timezone-aware UTC (datetime.utcnow() 대체)
├── phase_runner/            # tasks.md 웨이브 실행기 (runner, migrate, checkbox_sync, schema)
├── data/                    # 데이터 파일 (시드, 설정 등)
├── scripts/                 # 유틸리티 스크립트
├── config.py                # 앱 설정 (환경변수 로드)
└── tools/                   # MCP 도구 구현
    ├── bash_tools.py
    ├── code_tools.py
    ├── file_tools.py
    └── warp_tools.py
```

## Agent Registry

```python
class AgentRegistry:
    def register(self, agent: AgentMetadata) -> bool
    def get_by_category(self, category: AgentCategory) -> list[AgentMetadata]
    def find_by_capability(self, query: str) -> list[tuple[AgentMetadata, int]]
    def select_best_agent(self, task: str) -> AgentMetadata | None
```

**기본 등록 에이전트** (7종):

| Agent ID | 카테고리 | 설명 |
|----------|----------|------|
| `web-ui-specialist` | development | React Web UI/UX |
| `backend-integration-specialist` | development | FastAPI, SQLAlchemy, LangGraph 통합 |
| `test-automation-specialist` | quality | Vitest 테스트 자동화 |
| `aos-orchestrator` | orchestration | 멀티 에이전트 조정 |
| `quality-validator` | quality | 코드 품질 검증 |
| `code-simplifier` | quality | 복잡도 분석 |
| `performance-optimizer` | development | 성능 최적화 |

## AOS Orchestrator

복잡한 태스크를 분석하고 전문 에이전트에게 위임:

```python
class LeadOrchestratorAgent(BaseAgent):
    async def execute(self, task: str, context: dict) -> AgentResult:
        # 1. 태스크 복잡도 분석
        # 2. 서브태스크 분해
        # 3. 에이전트 선택 및 할당
        # 4. 실행 전략 결정 (sequential/parallel/mixed)
```

**노력 스케일링**:
- `quick`: 단순 태스크 (복잡도 1-3)
- `medium`: 중간 복잡도 (4-6)
- `thorough`: 복잡한 태스크 (7-10)

### LeadOrchestrator 분석 결과의 전파 경로

`LeadOrchestratorAgent` 의 태스크 분석 결과는 **두 갈래로 나뉘어 흐르며, 갈래마다 도달 범위가 다르다.**

| 산출물 | 경로 | 도달 지점 |
|--------|------|-----------|
| `execution_plan` | `POST /api/agents/orchestrate/execute-analysis` 가 `plan_metadata.pre_analyzed_execution_plan` 으로 주입(`api/agents/orchestrate.py:467`) | `PlannerNode` 가 읽어 LLM 계획 수립을 건너뛴다(`orchestrator/nodes/planner.py:229`) |
| `safety_flags` | Claude Code CLI 프롬프트의 `## Safety Warnings` 섹션 생성 | `services/tmux_service.py:639 build_claude_prompt` 와 그 프론트엔드 포팅 `src/dashboard/src/stores/agents.ts:205 buildClaudePrompt` |

즉 노드 그래프와 LeadOrchestrator 는 **직접 import 가 없을 뿐**(`grep -rn "LeadOrchestrator" src/backend/orchestrator` → 0건)
`plan_metadata` 를 경유해 이미 결합돼 있다. 심볼 grep 은 이 데이터 경유 결합을 잡지 못하므로
"두 서브시스템은 무관하다"고 결론내지 말 것.

**전파되지 않는 것은 `safety_flags` 하나다.** 주입 코드가 `entry.analysis.get("execution_plan", {})`
만 넘기므로 flags 는 노드 그래프에 도달하지 않는다.

노드 그래프의 위험 판단은 `safety_flags` 가 아니라 HITL 승인 게이트가 담당한다 —
`orchestrator/nodes/executor.py` 의 `_check_approval_required` 가 `models/hitl.py` 의
`assess_operation_risk`(`TOOL_RISK_CONFIG` 기반)를 호출한다. 따라서 **노드 그래프에
`safety_flags` 가 없다는 사실이 승인 게이트 부재를 뜻하지 않는다.**

flags 를 노드에 전파하는 것 자체는 기존 주입 경로에 키를 추가하는 작은 변경이다.
설계가 필요한 부분은 전파가 아니라 **노드가 flags 를 위험 판단에 어떻게 반영할지**다.

## MCP Service

```python
class MCPService:
    async def start_server(self, server_id: str) -> bool
    async def call_tool(self, call: MCPToolCall) -> MCPToolResult
    def find_tool(self, tool_name: str) -> tuple[str, MCPToolSchema] | None
```

**기본 MCP 서버**:

| Server ID | 타입 | 설명 |
|-----------|------|------|
| `filesystem` | FILESYSTEM | 파일 시스템 접근 |
| `github` | GITHUB | GitHub API 연동 |
| `playwright` | PLAYWRIGHT | 브라우저 자동화 |

## Parallel Execution

```python
class ParallelExecutorNode(BaseNode):
    async def run(self, state: AgentState) -> dict:
        semaphore = asyncio.Semaphore(3)  # 최대 3개 동시 실행
        results = await asyncio.gather(
            *[self._execute_with_semaphore(tid, semaphore) for tid in batch_task_ids]
        )
```

**조건**: OrchestratorNode가 ready 상태 태스크가 2개 이상일 때 자동 배치

## Docker Sandbox

```python
container = client.containers.run(
    "aos-sandbox:latest",
    command=["bash", "-c", command],
    network_mode="none",   # 네트워크 차단
    mem_limit="512m",      # 메모리 제한
    user="sandbox",        # non-root 사용자
)
```

**빌드**: `./infra/scripts/build-sandbox.sh`

## Database

### 데이터베이스 스택

| DB | 용도 | 설명 |
|----|------|------|
| **PostgreSQL** | 메인 DB | 관계형 데이터 (사용자, 세션, 태스크 등) |
| **Redis** | 캐시/세션 | 실시간 상태, 세션 스토어 |
| **Qdrant** | 벡터 DB | RAG용 임베딩 검색 (Vector DB) |

### LLM Provider

| Provider | 용도 | 설명 |
|----------|------|------|
| **Codex CLI** | 기본 LLM runtime | `codex exec` 셸 호출, ChatGPT 구독 세션 사용 |
| **Claude CLI** | opt-in LLM runtime | `claude -p` 셸 호출, Claude 구독 세션 사용. 자동 시딩 없이 명시적 profile/entitlement로만 선택 (Task Analyzer/Warp 사용량 계측 경로 포함) |
| **Ollama** | 로컬 LLM | API 과금 없는 로컬 모델 실행 |
| **OpenAI GPT** | fallback/API 예외 경로 | `LLM_API_FALLBACK_ENABLED=true`와 entitlement 허용 필요 |
| **Google Gemini** | fallback/API 예외 경로 | OCR/vision 등 API가 필요한 예외 경로 |
| **Anthropic Claude** | fallback/API 예외 경로 | Claude API 직접 호출이 필요한 경우 |

기본 사용량 source는 provider billing API가 아니라 내부 `llm_usage_ledger`다. provider billing API는 `EXTERNAL_USAGE_INCLUDE_PROVIDER_BILLING=true`일 때 External Usage reconciliation 비교값으로만 포함한다.

> ⚠️ **Firebase가 아닙니다!** PostgreSQL은 오픈소스 DB로 가입이 필요 없습니다.

### 실행 방법

```bash
# shared-infra 공용 스택(PostgreSQL, Redis, Qdrant) 기동
cd infra/scripts && ./dev.sh
```

### Shared Infrastructure (중요)

AOS는 더 이상 자체 DB 스택을 띄우지 않는다. `~/Work/shared-infra/docker-compose.yml` 하나를 다른 프로젝트(ppt-maker, image-maker)와 공유한다.

- `infra/scripts/dev.sh`, `start-all.sh`, `stop-all.sh`, `backup-all.sh`, `restore-all.sh` 모두 shared-infra를 대상으로 동작
- `infra/docker/docker-compose.yml` 은 **DB 스택 소스가 아님** — 빌드/배포 참조용으로만 유지
- `infra/docker/docker-compose.legacy.yml` 은 과거 자체 스택 보관용 (신규 개발 시 사용 금지)
- shared-infra 미설치 시 `dev.sh` 가 `~/Work/shared-infra 를 먼저 클론/생성하세요` 안내 후 중단

**포트 충돌 시**: 프로젝트 `.env` 에서 `PG_PORT`, `REDIS_PORT`, `QDRANT_PORT`, `BACKEND_PORT`, `DASHBOARD_PORT` 오버라이드.

### 환경 변수

```bash
# PostgreSQL 연결 (shared-infra 기본값)
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/aos

# DB 사용 여부 (false면 DB 없이 개발 가능)
USE_DATABASE=false
```

### 프로덕션 배포 옵션

로컬 Docker 외에 관리형 PostgreSQL 사용 가능:
- **Railway** - 간편한 배포
- **Supabase** - PostgreSQL + 인증 통합
- **AWS RDS** - 엔터프라이즈급
- **Neon** - 서버리스 PostgreSQL

### Schema (주요 테이블 - 40개)

| 테이블 | 용도 |
|--------|------|
| `sessions` | 세션 정보 |
| `tasks` | 태스크 트리 |
| `messages` | 대화 메시지 |
| `approvals` | HITL 승인 요청 |
| `users` | 사용자 (OAuth + Email) |
| `organizations` | 멀티테넌트 조직 |
| `organization_members` | 조직 멤버 |
| `organization_invitations` | 조직 멤버 초대 |
| `projects` | DB 기반 프로젝트 레지스트리 |
| `project_access` | 프로젝트 접근 제어 |
| `project_invitations` | 프로젝트 초대 |
| `audit_logs` | 감사 로그 |
| `feedbacks` | RLHF 피드백 |
| `notification_rules` | 알림 규칙 |
| `notification_history` | 알림 발송 이력 |
| `channel_configs` | 알림 채널 설정 |
| `token_blacklist` | 무효화된 JWT 토큰 |
| `saml_configs` | SAML 2.0 SSO 설정 |
| `claude_session_snapshots` | Claude 세션 스냅샷 (모델, 토큰, 비용, 프로젝트별) |
| `workflow_definitions` | 워크플로우 정의 |
| `workflow_runs` | 워크플로우 실행 이력 |
| `workflow_jobs` | 워크플로우 잡 |
| `workflow_steps` | 워크플로우 스텝 |
| `workflow_secrets` | 워크플로우 시크릿 |
| `workflow_webhooks` | 워크플로우 웹훅 |
| `workflow_artifacts` | 워크플로우 아티팩트 |
| `workflow_templates` | 워크플로우 템플릿 |
| `merge_requests` | 머지 요청 |
| `branch_protection_rules` | 브랜치 보호 규칙 |
| `cost_centers` | 비용 센터 |
| `cost_allocations` | 비용 할당 |
| `llm_model_configs` | LLM 모델 설정 |
| `user_llm_credentials` | 사용자 LLM 자격증명 |
| `dataset_entries` | 데이터셋 항목 (RAG/Eval용) |
| `menu_visibility` | UI 메뉴 가시성 |
| `task_evaluations` | 태스크 평가 |
| `session_activities` | 세션 활동 |
| `task_analyses` | 태스크 분석 |
| `config_versions` | 설정 버전 스냅샷 (타입별, diff 추적, 롤백) |
| `playground_sessions` | 에이전트 플레이그라운드 세션 (메시지, 실행, 비용) |

### Database Migration (Alembic)

스키마 변경 관리를 위한 Alembic 설정:

```
src/backend/
├── alembic.ini              # 마이그레이션 설정
└── alembic/
    ├── env.py               # 환경 설정 (SQLAlchemy 연동)
    ├── script.py.mako       # 마이그레이션 템플릿
    └── versions/            # 마이그레이션 스크립트
```

**주요 명령어**:

```bash
# 새 마이그레이션 생성 (모델 변경 감지)
alembic revision --autogenerate -m "Add new table"

# 최신 버전으로 업그레이드
alembic upgrade head

# 한 단계 롤백
alembic downgrade -1

# 현재 버전 확인
alembic current

# 마이그레이션 히스토리
alembic history
```

## Analytics Data Flow

Analytics 대시보드는 Claude 세션 파일에서 직접 데이터를 수집합니다:

```
~/.claude/projects/          Claude 세션 JSONL 파일
         ↓
ClaudeSessionMonitor         세션 파일 스캔/파싱 (mtime+size 캐싱)
         ↓
AnalyticsService             *_from_sessions() 메서드
  ├── get_overview_from_sessions()     # 전체 메트릭
  ├── get_trends_from_sessions()       # 시간별 트렌드 (created_at 기준 버킷)
  ├── get_agent_performance_from_sessions()  # 모델별 성능
  ├── get_cost_analytics_from_sessions()     # 프로젝트별/모델별 비용
  └── get_activity_heatmap_from_sessions()   # 요일/시간 히트맵
         ↓
api/analytics.py             REST API (항상 세션 기반, DB 무관)
         ↓
Dashboard AnalyticsPage      Recharts 차트 시각화
```

> **Note**: `USE_DATABASE=true`여도 analytics 엔드포인트는 세션 파일 기반 메서드를 사용합니다.
> DB 기반 `*_async()` 메서드는 향후 DB에 세션 데이터가 동기화될 때를 위해 유지됩니다.
