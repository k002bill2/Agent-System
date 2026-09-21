# MCP Admission Gate (공급망 입장 통제)

외부 MCP 서버를 **등록·기동하기 전에** 검증 가능한 승인 결정을 요구한다.
기본값은 fail closed — 증빙이 없으면 등록도 기동도 되지 않는다.

- 구현: `src/backend/services/mcp_admission.py`
- 배선: `src/backend/services/mcp_manager.py`
- 스캐너 어댑터: `src/backend/services/skillspector_adapter.py` (SkillSpector CLI v2.5.1)
- 테스트: `tests/backend/test_mcp_admission.py`, `tests/backend/test_mcp_manager_admission.py`,
  `tests/backend/test_skillspector_adapter.py`

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

앵커는 `DEFAULT_MCP_SERVERS` 에서 **파생되지 않는다**. `BUILTIN_TRUST_ANCHORS`
(`services/mcp_manager.py`) 에 검토된 fingerprint 를 소스로 못 박아 둔다 — 파생하면
기본 목록에 한 줄 추가하는 것만으로 무증빙 실행 권한이 생기고, 커버리지 테스트는 양변이
같은 소스를 읽어 영원히 통과한다.

**기본 서버 목록에 무언가를 추가하는 것은 곧 무증빙 실행 허용이다** — 앵커를 함께
갱신해야만 신뢰되므로 그 diff 가 리뷰 지점이다. 목록만 바꾸고 앵커를 두지 않으면
`test_pinned_trust_anchors_match_the_current_default_servers` 가 RED 가 되고, 그 서버는
증빙을 요구받는다(fail closed). 앵커 갱신 명령은 상수 주석에 있다.

## 증빙 저장과 보존

| 저장소 | 용도 |
|--------|------|
| `InMemoryEvidenceStore` | 기본값. 프로세스 수명. 증빙 0건 = 외부 MCP 전부 거부 |
| `FileEvidenceStore(path)` | JSON 파일. 환경변수 `AOS_MCP_ADMISSION_EVIDENCE` 에 경로를 주면 활성 |

DB 테이블을 쓰지 않는다 — 이 저장소는 운영 중 변경이 드물고, 저장소 고장 시 **fail
closed** 여야 하며(깨진 JSON·스키마 불일치·파일 없음은 모두 "증빙 없음"), 이 저장소를
위해 스키마를 늘리는 것은 회수 절차만 복잡하게 만든다.

`FileEvidenceStore` 의 무결성 기전:

- 증빙 파일은 **0600(소유자 전용)** 으로 만들어진다. 그룹/기타 권한 비트가 하나라도
  켜진 파일은 읽지 않고 "증빙 없음" 으로 접는다 — 다른 사용자가 고칠 수 있는 파일은
  승인 근거가 될 수 없다. 권한을 되돌리려면 `chmod 600` 후 다시 시도한다.
- 경로가 **심링크면 따라가지 않는다**. 읽기는 "증빙 없음", 쓰기는 거부다.
- 쓰기·회수는 같은 디렉터리의 0600 임시 파일에 쓴 뒤 `os.replace` 로 갈아끼운다.
  제자리 truncate 를 하지 않으므로 도중에 실패해도 기존 증빙이 잘리지 않는다.
- 읽기 실패는 조용히 "증빙 없음" 이지만, **쓰기 실패는 `EvidenceStoreError` 로 드러난다**
  — 기록한 척하면 운영자가 증빙이 등록됐다고 믿게 된다. `revoke()` 는 안전하지 않은
  파일에 쓰지 않고 `False` 를 돌려준다("항목이 없었다" 가 아니라 "제거하지 않았다").
- **경계**: 같은 OS 사용자 권한의 변조는 막지 못한다. 이 계층은 암호학적 승인 무결성이
  아니라 다른 사용자·심링크 유도·부분 기록을 막는다. 부모 디렉터리 권한도 함께
  좁혀야 의미가 있다(권장 `0700`).

보존 원칙:
- 증빙 파일은 **감사 기록**이다. 승인 이력이 남도록 버전 관리 대상 밖의 안정적 경로에 두고
  백업 대상에 포함한다.
- 만료된 증빙을 자동 갱신하지 않는다. 재승인은 사람이 다시 스캔·검토해 새로 발급한다.
- `notes` 에 승인 근거(티켓 번호, 검토 범위)를 남긴다.

## 스캐너 어댑터 — SkillSpector CLI (실측 연결됨)

구현: `src/backend/services/skillspector_adapter.py` ·
테스트: `tests/backend/test_skillspector_adapter.py` ·
실측 산출물: `tests/backend/fixtures/skillspector/*.json`

연결 대상은 로컬에 설치된 NVIDIA SkillSpector CLI **v2.5.1** 이다. 아래는 추측이 아니라
그 바이너리를 직접 실행하고 설치된 소스를 읽어 확인한 값이다.

### 실측한 CLI 경계

| 항목 | 실측값 |
|------|--------|
| 명령 형태 | `skillspector scan <target> --no-llm --format json --output <file>` |
| exit 0 | 스캔 성공, `risk_score <= RISK_THRESHOLD` |
| exit 1 | 스캔 성공, `risk_score > RISK_THRESHOLD` (리포트는 정상 기록됨) |
| exit 2 | 실행 실패 — 입력 오류·예외·`execution_successful=false` |
| `RISK_THRESHOLD` | **50** (`skillspector/constants.py`) |
| 위험 밴드 | LOW 0–20 = `SAFE` · MEDIUM 21–50 = `CAUTION` · HIGH/CRITICAL = `DO_NOT_INSTALL` |
| 리포트 최상위 키 | `skill` · `risk_assessment` · `components` · `issues` · `metadata` · `execution_successful` · `analysis_completeness` |
| 스캐너 버전 | `metadata.skillspector_version` (리포트 **안에** 실린다) |

이 표에서 나오는 함정 세 가지:

1. **exit 0 은 "안전" 이 아니다.** 임계치가 50 이므로 exit 0 은 `SAFE`(0–20)와
   `CAUTION`(21–50)을 **함께** 덮는다. exit code 로 판정하면 CAUTION 이 조용히 통과한다.
   판정은 `risk_assessment.recommendation` 에서만 온다.
2. **exit 2 인데 리포트가 멀쩡할 수 있다.** `cli.py` 는 `execution_successful=false` 인
   경우에도 **리포트를 먼저 쓴 뒤** exit 2 를 낸다. 즉 "구조적으로 유효한 SAFE 리포트 +
   실패한 실행" 이 실재한다. 어댑터는 리포트를 해석하기 **전에** exit code 를 본다.
3. **`analysis_completeness.is_complete` 는 `--no-llm` 에서 항상 `false` 다** (깨끗한
   스킬도 그렇다). 이 값을 통과 조건에 넣으면 영원히 거부하는 게이트가 된다. 대신
   SkillSpector 자신이 degraded/fatal/미검사 파일이 있으면 `SAFE` 를 `CAUTION` 으로
   강등하므로(`nodes/report.py`), `SAFE` 검사가 완전성 검사를 이미 포함한다.

### PASS 판정 조건

아래를 **모두** 만족할 때만 `ScanStatus.PASS` 다. 하나라도 어긋나면 `FAIL`(스캐너가
불합격 판정) 또는 `ERROR`(판정을 얻지 못함)이며, 둘 다 증빙을 만들지 않는다.

```
exit code == 0
execution_successful == true
risk_assessment.recommendation == "SAFE"
risk_assessment.severity      == "LOW"
metadata.llm_requested        == false        # 정적 전용 정책을 데이터 경계에서도 확인
report.skill.source (resolve) == 요청한 스캔 대상 (resolve)
```

마지막 줄이 소스 결속이다. 스캐너가 우리가 지정한 곳이 아닌 대상을 봤다면 그 판정은 이
후보의 것이 아니다. 양쪽 모두 `resolve()` 한다 — macOS 는 `/tmp` 를 `/private/tmp` 로
정규화하지만 Linux 는 하지 않아 문자열 비교는 로컬에서만 통과한다.

### LLM 계층을 켜지 않는 이유

`--no-llm` 은 정적 분석만 쓴다. LLM 분석에는 `ANTHROPIC_API_KEY` /`OPENAI_API_KEY` /
`NVIDIA_INFERENCE_KEY` 중 하나가 필요하고, 그 자격증명을 스캐너 자식 프로세스에 넘기는
것 자체가 새 노출 경로다. 이 정책은 argv 뿐 아니라 **리포트의 `metadata.llm_requested`**
로도 확인한다 — 누가 플래그를 빼도 파싱에서 거부된다. LLM 분석을 켜려면 자격증명 취급을
포함한 별도 정책 결정이 필요하다.

### 자식 프로세스 위생

- 셸을 쓰지 않는다(`shell=True` 없음). argv 는 문자열 리스트다.
- **후보의 `env` 값은 argv 에도 자식 env 에도 실리지 않는다.** 후보 env 는 fingerprint
  입력이지 스캐너 입력이 아니다.
- 자식 환경은 화이트리스트(`PATH`·`HOME`·`LANG`·`LC_ALL`·`TMPDIR`)뿐이다. 부모 환경을
  통째로 물려주면 위 LLM 자격증명이 스캐너로 넘어간다 — `--no-llm` 으로 쓰지도 않을 값을.
- 리포트는 임시 디렉터리에 쓰고 읽은 뒤 버린다. 저장소에 산출물을 남기지 않는다.
- 타임아웃(기본 300초) 초과는 `ERROR` 다. 매달린 스캐너는 통과가 아니다.

### 증빙이 추가로 묶는 것

스캐너를 거친 증빙은 기존 필드에 더해 다음을 싣는다. 수동 검토 기록(`manual-review`)은
이 자리를 비워 두므로 소스 결속을 **주장하지 않으며**, 따라서 소스 검사의 대상도 아니다.

| 필드 | 의미 |
|------|------|
| `report_sha256` | 스캐너 리포트 **원본 바이트** 의 sha256 — 어떤 리포트가 근거였는가 |
| `scan_target` | 실제로 스캔된 대상의 정규화 경로 (표시 이름이 아니라 소스 신원) |
| `scan_target_digest` | 스캔 시점 대상 내용의 digest — 이후 변경 판정의 기준 |

### 소스 드리프트

fingerprint 는 "무엇을 실행하는가"(`command`/`args`/`env`)만 묶는다. **같은 명령이 실행할
내용**이 승인 이후 바뀐 경우는 fingerprint 가 그대로라 fingerprint 검사를 통과한다.
`verify_evidence_binding(evidence)` 가 그 구멍을 닫는다 — 기록된 대상을 다시 digest 해
불일치·소실이면 사유를 돌려준다.

배선 지점은 `MCPManager.start_server()` **한 곳**이다 (`subprocess.Popen` 직전).
`AdmissionGate.decide()` 에 넣지 않은 이유: `decide` 는 등록 루프에서 후보마다 불리는
순수 판정이고, 파일시스템 순회는 프로세스를 띄우기 직전에만 값을 한다.

## 운영 절차

### 신규 외부 MCP 승인

1. **후보 설정을 확정한다** (`command`/`args`/`env`/`transport`). 이후 한 글자라도 바뀌면
   새 승인이 필요하다.
2. **스캔할 로컬 사본을 확보한다.** 어댑터는 로컬 경로만 스캔한다(외부 URL 을 받지
   않는다). `npx -y some-mcp` 처럼 실행 시점에 원격에서 받아오는 후보라면, 그 패키지를
   먼저 안정적인 경로에 내려놓고 그것을 대상으로 삼는다. 이 사본이 런타임 아티팩트와
   같다는 보장은 없다 — 아래 잔여 위험 참조.
3. **스캔한다.** 대상은 fingerprint 로 색인한다 — id 는 가변 표시값이라 소스 신원이
   될 수 없다.

   ```python
   from pathlib import Path
   from services.mcp_admission import ReviewDecision, compute_candidate_fingerprint
   from services.skillspector_adapter import SkillSpectorScanner, mint_admission_evidence
   from utils.time import utcnow

   target = Path("/srv/aos/vendored/some-mcp")           # 2번에서 확보한 로컬 사본
   scanner = SkillSpectorScanner({compute_candidate_fingerprint(config): target})
   report = scanner.scan(config)
   print(report.status, report.raw_summary)              # PASS 가 아니면 여기서 끝이다
   ```

4. **사람이 검토해 승인/거부한다.** 스캐너의 PASS 는 자동 승인이 아니다.
5. **증빙을 만든다.** PASS + APPROVED 가 아니면 `None` 이 나오고, 저장할 객체 자체가
   생기지 않는다.

   ```python
   evidence = mint_admission_evidence(
       config,
       report,
       reviewer="security@example.test",
       review_decision=ReviewDecision.APPROVED,
       reviewed_at=utcnow(),
       notes="AOS-123 검토: 네트워크 호출 없음, 파일 쓰기 ./cache 한정",
   )
   assert evidence is not None                            # None = 자격 없음
   manager.admission.store.put(evidence)
   ```

6. **등록한다** — `manager.register_server(config)`.

스캔만 따로 눈으로 확인하고 싶으면 CLI 를 직접 돌려도 된다(어댑터와 같은 인자다):

```bash
skillspector scan /srv/aos/vendored/some-mcp --no-llm --format json --output /tmp/r.json
echo "exit=$?"   # 0=임계치 이하, 1=임계치 초과, 2=실행 실패
```

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

1. **스캔한 사본 ≠ 실행되는 아티팩트** — 어댑터가 검사하는 것은 운영자가 지정한
   **로컬 경로**다. `npx -y some-mcp` 처럼 실행 시점에 레지스트리에서 내려받는 후보는,
   승인 시 스캔한 사본과 런타임에 실제로 실행될 코드가 같다는 보장이 이 계층에 없다.
   이 간극을 좁히려면 후보를 버전 고정된 로컬 사본으로 벤더링하고 `command` 가 그
   사본을 직접 가리키게 해야 한다(그러면 `scan_target_digest` 가 실행 아티팩트를 묶는다).
2. **같은 OS 사용자 권한의 변조** — 증빙 파일도, 스캔 대상 트리도, 이 백엔드와 같은
   사용자로 도는 프로세스는 자유롭게 고칠 수 있다. `scan_target_digest` 는 사고와
   제3자 변경을 잡지만, 같은 사용자 권한의 공격자는 소스를 바꾼 뒤 증빙의 digest 도
   함께 고쳐 쓸 수 있다. **암호학적 서명이 아니다.** 서명 기반 승인과 DB 백엔드 승인
   저장소는 의도적으로 범위 밖이며, 그때까지 이 계층의 보증은 "같은 사용자 권한 밖"
   까지다. 증빙 파일과 스캔 대상의 부모 디렉터리 권한을 함께 좁혀야(권장 `0700`) 의미가 있다.
3. **정적 분석만** — `--no-llm` 이라 LLM 의미 분석 계층은 꺼져 있다. 정적 패턴은 오탐도
   미탐도 낸다. `SAFE` 는 "이 스캐너의 정적 규칙에 걸리지 않았다" 는 뜻이지 "안전하다" 는
   증명이 아니다 — 사람 검토(`review_decision`)가 여전히 필수인 이유다.
4. **`.claude/mcp.json` 실행 경로** — 위 절 참조. 외부 런타임이 실행하므로 이 게이트
   밖이다. 통제하려면 그 런타임 쪽 훅이나 파일 쓰기 시점의 정책이 따로 필요하다.
5. **현재 프로덕션 호출자 없음** — `register_server` 는 `src/backend` 안에 호출자가
   없고 `initialize()` 는 인자 없이만 호출된다(기본 3종). 따라서 이 게이트는 **예방적**
   이며 지금 런타임 동작을 바꾸지 않는다. 외부 MCP 등록 기능을 붙이는 쪽이 이 게이트를
   통과하도록 설계해야 한다.
6. **API 표면** — `api/agents/mcp.py` 의 start/restart 는 거부를 500 으로 돌려준다.
   403 으로 구분하려면 `start_server` 의 bool 계약 대신 raising 진입점을 추가해야 한다.

## 관련 문서

- `docs/architecture.md` — MCP Service 절
- `.claude/agents/eval-grader.md` — 평가 쪽 hard gate (`services/eval_hard_gate.py`)
