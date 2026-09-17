# MCP Admission Gate (공급망 입장 통제)

외부 MCP 서버를 **등록·기동하기 전에** 검증 가능한 승인 결정을 요구한다.
기본값은 fail closed — 증빙이 없으면 등록도 기동도 되지 않는다.

- 구현: `src/backend/services/mcp_admission.py`
- 배선: `src/backend/services/mcp_manager.py`
- 테스트: `tests/backend/test_mcp_admission.py`, `tests/backend/test_mcp_manager_admission.py`

## 왜 등록이 곧 실행 권한인가

`MCPManager.start_server()` 는 설정의 `command`/`args`/`env` 로 subprocess 를 띄운다
(`services/mcp_manager.py`). 즉 외부 MCP 서버를 등록한다는 것은 그 설정이 지정한 임의
명령을 이 호스트에서 실행할 권한을 주는 것이다.

기존의 HITL 승인(`models/hitl.py`, `mcp_*` 도구 = HIGH + 승인 필요)은 **도구 호출 시점**의
통제다. 서버가 이미 떠 있다는 전제 위에서 동작하므로, 등록·기동 단계의 공급망 통제를
대체하지 못한다. 두 통제는 직렬로 쌓인다.

## 게이트가 걸리는 지점

| 경로 | 동작 |
|------|------|
| `MCPManager.register_server(config)` | 거부 시 `MCPAdmissionError` **발생**. 서버는 `_servers` 에 남지 않는다 |
| `MCPManager.initialize(configs)` | 거부된 설정은 등록하지 않고 건너뛰며 사유를 `get_rejected_candidates()` 로 노출 + WARNING 로그 |
| `MCPManager.start_server(server_id)` | `subprocess.Popen` **이전에** 재판정. 거부 시 `False` 반환 + `status=ERROR`, `last_error` 에 사유 |
| `restart_server` / `call_tool` 자동 시작 / `initialize` 의 `auto_start` | 위 `start_server` 를 거치므로 동일하게 차단 |

`start_server` 가 예외 대신 `False` 를 돌려주는 것은 의도된 것이다 — 호출자 5곳
(`api/agents/mcp.py`, `orchestrator/tools.py`, `restart_server`, `call_tool`,
`initialize`)이 모두 bool 계약에 기대고 있고, 예외로 바꾸면 보안 이득 없이 기존 동작만
깨진다. 사유는 `last_error` 와 로그에 남는다.

### 게이트가 **덮지 않는** 범위: `.claude/mcp.json`

이 게이트의 적용 범위는 **AOS 의 `MCPManager` 가 직접 띄우는 MCP 서버**뿐이다.

`services/mcp_config_manager.py` 는 `.claude/mcp.json` / `~/.claude.json` 을 읽고 쓴다.
그 모듈이 다루는 `MCPServerConfig` 는 `models/project_config.py` 의 **다른 클래스**이며
(`server_id`·`disabled`·`source` 필드, `MCPManager` 쪽은 `id`·`transport`·`auto_start`),
둘을 잇는 변환 코드는 없다. 소비자는 대시보드용 project-config API
(`api/project_configs/mcp.py`)와 `project_config_monitor` 뿐이다.

즉 그 파일에 선언된 MCP 서버를 실행하는 주체는 AOS 가 아니라 **그 프로젝트에서 도는
외부 에이전트 런타임**(Claude Code 등)이다. AOS 는 그 파일의 편집자이지 실행자가 아니며,
이 게이트는 그 실행을 막지 못한다. 해당 표면의 통제는 별도 과제다(아래 "남은 통합 경계").

## 증빙(evidence) 이 묶는 것

`AdmissionEvidence` 는 다음을 한 덩어리로 결속한다.

| 필드 | 의미 |
|------|------|
| `server_id` | 색인 키. 남의 증빙을 빌려올 수 없다 |
| `candidate_fingerprint` | `id`+`command`+`args`+`env`+`transport` 의 sha256 |
| `scanner_id` / `scanner_version` | 어떤 도구의 어떤 버전이 검사했는가 |
| `scan_status` | `pass` 만 통과. `fail`·`error`·`skipped` 는 전부 거부 |
| `scanned_at` | 검사 시각 (만료 계산의 기준) |
| `reviewer` / `review_decision` / `reviewed_at` | 누가 승인했는가. `pending` 은 승인이 아니다 |
| `expires_at` | 없으면 `scanned_at + 90일`(`DEFAULT_EVIDENCE_MAX_AGE`) |

### fingerprint 와 시크릿

fingerprint **입력**에는 `env` 값이 포함된다. `NODE_OPTIONS=--require /tmp/evil.js`,
`LD_PRELOAD`, `PYTHONSTARTUP` 같은 주입은 command/args 를 건드리지 않고 실행을 바꾸므로,
env 를 키만 해싱하면 이전 PASS 를 그대로 재사용하는 구멍이 생긴다.

**저장·로그·예외 메시지에는 digest 만 남는다.** 원본 값은 메모리를 벗어나지 않는다
(`test_file_store_does_not_persist_raw_env_values`,
`test_authorize_error_does_not_leak_env_values` 가 잠근다).
등록 시점의 env 값은 대개 `${GITHUB_TOKEN}` 같은 **치환 전 placeholder** 이며, 실제
시크릿 치환은 `start_server` 내부에서 일어난다.

### 거부 코드

| 코드 | 상황 |
|------|------|
| `no_evidence` | 증빙이 없음 (기본값) |
| `fingerprint_mismatch` | 승인 이후 후보가 바뀜 (candidate drift) |
| `scan_not_passed` | 스캔이 `fail`/`error`/`skipped` |
| `review_not_approved` | 검토가 `denied`/`pending` |
| `evidence_expired` | `expires_at` 도달 (정각 포함) 또는 기본 수명 초과 |

## built-in 신뢰 경계

기본 서버 3종(`filesystem`·`github`·`playwright`)은 증빙 없이 등록·기동된다 — 기존 동작
보존을 위해서다. 단 **신뢰는 id 가 아니라 fingerprint 에 걸린다**
(`builtin_trusted_fingerprints()`). `id="filesystem"` 을 달고 `command="curl"` 로 바꾼
후보는 앵커에 걸리지 않아 일반 외부 서버와 똑같이 증빙을 요구받는다.

`DEFAULT_MCP_SERVERS` 가 바뀌면 신뢰 앵커도 함께 바뀐다
(`test_builtin_trust_covers_every_default_server` 가 드리프트를 잡는다).
**기본 서버 목록에 무언가를 추가하는 것은 곧 무증빙 실행 허용이다** — 그 PR 은 공급망
변경으로 취급하고 리뷰해야 한다.

## 증빙 저장과 보존

| 저장소 | 용도 |
|--------|------|
| `InMemoryEvidenceStore` | 기본값. 프로세스 수명. 증빙 0건 = 외부 MCP 전부 거부 |
| `FileEvidenceStore(path)` | JSON 파일. 환경변수 `AOS_MCP_ADMISSION_EVIDENCE` 에 경로를 주면 활성 |

DB 테이블을 쓰지 않는다 — 이 저장소는 운영 중 변경이 드물고, 저장소 고장 시 **fail
closed** 여야 하며(깨진 JSON·스키마 불일치·파일 없음은 모두 "증빙 없음"), 이 저장소를
위해 스키마를 늘리는 것은 회수 절차만 복잡하게 만든다.

보존 원칙:
- 증빙 파일은 **감사 기록**이다. 승인 이력이 남도록 버전 관리 대상 밖의 안정적 경로에 두고
  백업 대상에 포함한다.
- 만료된 증빙을 자동 갱신하지 않는다. 재승인은 사람이 다시 스캔·검토해 새로 발급한다.
- `notes` 에 승인 근거(티켓 번호, 검토 범위)를 남긴다.

## 스캐너 어댑터 계약 — 실제 도입 전 확인 사항

현재 코드는 어댑터의 **계약만** 정의한다. 실제 CLI 는 연결돼 있지 않다.

```python
class SupplyChainScanner(Protocol):
    def scan(self, candidate: MCPCandidate) -> ScanReport: ...
```

`ScanReport`: `scanner_id`, `scanner_version`, `status`, `scanned_at`, `findings`, `raw_summary`.

실제 도구(예: NVIDIA SkillSpector)를 붙이기 전에 다음을 **실측**해야 한다. 추측으로
실행하지 않는다 — 인자를 잘못 넣은 스캐너는 조용히 "지적 0건" 을 돌려줄 수 있고, 그것은
검사 실패와 구분되지 않는다.

1. **CLI 인자 표면**: 대상 지정 방식(경로/패키지명), JSON 출력 플래그, exit code 의 의미.
   exit code 가 "발견 있음" 과 "실행 실패" 를 구분하지 않으면 `status` 를 exit code 로
   유도하면 안 된다.
2. **출력 스키마**: 실제 실행 결과 1건 이상을 캡처해 `ScanReport` 로의 매핑을 고정한다.
   합성 fixture 만으로 만든 파서는 실데이터에서 전부 `unknown` 이 되는 사례가 있었다.
3. **버전 고정**: `scanner_version` 은 증빙의 일부다. 버전이 바뀌면 이전 판정을 그대로
   신뢰할지 정책으로 정한다.
4. **실행 환경**: 스캐너 자체가 네트워크·설치를 요구하는지. 요구한다면 그 설치 경로도
   공급망이므로 별도 승인 대상이다.
5. **타임아웃·실패 처리**: 실패는 `ScanStatus.ERROR` 로 접히고 게이트는 거부한다
   (fail open 금지).

이 5건이 확인되기 전까지 어댑터 구현은 fixture 기반으로만 테스트한다.

## 운영 절차

### 신규 외부 MCP 승인

1. 후보 설정을 확정한다(`command`/`args`/`env`/`transport`). 이후 한 글자라도 바뀌면
   새 승인이 필요하다.
2. 스캐너를 돌려 `ScanReport` 를 얻는다. (도구 연결 전까지는 수동 검토 기록으로 대체하고
   `scanner_id="manual-review"` 로 남긴다.)
3. 사람이 검토해 승인/거부한다. 승인자는 `reviewer` 에 식별자로 기록된다.
4. `build_evidence(config, ...)` 로 증빙을 만들어 저장소에 넣는다 — fingerprint 는
   후보에서 자동 계산되므로 손으로 옮겨 적지 않는다.
5. `register_server(config)` 로 등록한다.

### 승인 책임

- **스캔 결과 해석**과 **승인 결정**은 분리된 행위다. `scan_status=pass` 만으로 등록되지
  않으며 `review_decision=approved` 가 함께 있어야 한다.
- 승인자는 자기가 만든 후보를 스스로 승인하지 않는다(자기 결과 자기 승인 금지).
- 만료 기본값 90일은 상한이지 목표가 아니다. 위험도가 높은 서버는 `expires_at` 을 짧게 준다.

### 롤백 / 비활성화

```python
manager.revoke_admission(server_id)   # 증빙 회수 → 이후 기동 전부 차단
await manager.stop_server(server_id)  # 이미 떠 있는 프로세스 종료
manager.unregister_server(server_id)  # 목록에서 제거
```

증빙 회수만으로는 **이미 실행 중인 프로세스가 멈추지 않는다** — `stop_server` 를 함께
호출해야 한다. 회수 후 기동이 다시 막히는지는
`test_revoking_evidence_blocks_subsequent_starts` 가 잠근다.

긴급 차단이 필요하면 `AOS_MCP_ADMISSION_EVIDENCE` 를 비우고(또는 파일을 치우고) 재기동한다 —
증빙이 0건이면 built-in 을 제외한 모든 외부 MCP 가 거부된다.

## 남은 통합 경계 (미커버)

1. **스캐너 CLI 미연결** — 위 "스캐너 어댑터 계약" 의 5개 확인 사항이 끝나기 전까지
   `scanner_id` 는 수동 검토 기록(`manual-review`)으로만 채워진다.
2. **`.claude/mcp.json` 실행 경로** — 위 절 참조. 외부 런타임이 실행하므로 이 게이트
   밖이다. 통제하려면 그 런타임 쪽 훅이나 파일 쓰기 시점의 정책이 따로 필요하다.
3. **현재 프로덕션 호출자 없음** — `register_server` 는 `src/backend` 안에 호출자가
   없고 `initialize()` 는 인자 없이만 호출된다(기본 3종). 따라서 이 게이트는 **예방적**
   이며 지금 런타임 동작을 바꾸지 않는다. 외부 MCP 등록 기능을 붙이는 쪽이 이 게이트를
   통과하도록 설계해야 한다.
4. **API 표면** — `api/agents/mcp.py` 의 start/restart 는 거부를 500 으로 돌려준다.
   403 으로 구분하려면 `start_server` 의 bool 계약 대신 raising 진입점을 추가해야 한다.

## 관련 문서

- `docs/architecture.md` — MCP Service 절
- `.claude/agents/eval-grader.md` — 평가 쪽 hard gate (`services/eval_hard_gate.py`)
