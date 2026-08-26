# Security 담당 인계 패킷

- **인계 일시:** 2026-08-26 00:50 KST
- **담당 조직:** Security
- **대상 시스템:** AOS, shared-infra, 외부·클라우드 자산
- **상태:** 고위험 API 보호 및 독립 리뷰 blocker 보완 완료. 최신 제한 범위 독립 Security 재리뷰 **PASS**; AOS 및 Open WebUI live 적용 검증 완료. 영환님 확인 기준 외부 자산은 Git 연동 Vercel만 사용.

## 인계 범위

1. Oracle HTTP Server/WebLogic Proxy Plug-in 취약점 `CVE-2026-21962`
2. AOS 에이전트·터미널 실행 권한과 감사 로그
3. PostgreSQL·Redis·Qdrant·AOS 외부 노출
4. PQC 전환 대상 및 KISA 교육 검토
5. Siemens S7 PLC/ICS AI-assisted 공격 경고 후속 검토
6. Fasset stablecoin/tokenization 인프라 모니터링 및 규제 이슈

## 확인된 사실

- 로컬 Docker 실행 컨테이너에서는 Oracle/WebLogic 컨테이너가 확인되지 않았습니다.
- 클라우드 자산은 gcloud 프로젝트·인증 범위가 확인되지 않아 외부 VM 전체를 판정할 수 없습니다.
- 로컬 `AOS_web/vercel.json`은 확인했으나 Vercel CLI 인증이 없고 `.vercel/project.json`도 없어 실제 Vercel 프로젝트 목록은 확인하지 못했습니다.
- Railway는 linked project가 없고, GCP는 활성 계정이 없으며, AWS/Azure CLI는 설치되어 있지 않아 해당 provider 자산은 미확인입니다.
- 영환님 확인: 외부 서비스는 Git 연동 Vercel만 사용 중이며 로컬 AOS에는 영향이 없습니다. 이 운영 범위를 외부 자산 범위의 최종 기준으로 승인했습니다.
- 기존 AOS API에는 인증 없이 접근 가능한 고위험 경로가 있었으며, 이번 작업에서 보호했습니다.
- AOS DB 기준 최근 7일 감사 로그는 88건이며, 권한 변경 이벤트 실발생은 확인되지 않았습니다.
- AOS에는 전체 사용자 1명이 있고, 그 사용자가 admin이며 조직 owner입니다.

## 반영 완료한 긴급 완화

### API 인증·역할 제한

- WebSocket `/ws/{session_id}`: query token 또는 Authorization bearer 인증; session owner/admin 검증; 없는 session 자동 생성 제거
- 일반 `/api/sessions` 생성·조회·refresh·삭제·task 조작: 인증 필수; session owner 또는 admin/manager만 접근
- `/api/playground/*`: 로그인 필수; session object는 소유자 또는 admin/manager만 접근
- `/api/warp/*`: admin/manager만 접근
- `/api/sessions/{session_id}/approvals` 및 approve/deny: 로그인 필수; 세션 소유자 또는 admin/manager만 접근
- Claude external session metadata·list/read/stream/transcript/activity/summary 전체: admin/manager만 접근; process/source 및 정리·삭제 mutation도 동일 정책
- `/api/audit/*`: admin/manager만 접근
- 프로젝트 registry/filesystem mutation(create·link·reorder): admin/manager만 접근
- `/api/project-registry` 조회: 인증 필수; 수정·활성화·삭제·복원: admin/manager만 접근
- 프로젝트 조회·수정·삭제·deletion preview: 인증 및 project role 검사
- `/api/project-configs/*`: 인증 필수
- `/api/sessions/{session_id}/permissions`: 인증 필수
- `/api/terminal/*`: 인증 필수
- `POST /api/terminal/execute`: 관리자·매니저만 실행 가능
- `/api/projects`: 인증 필수
- `/api/claude-sessions/projects`: 인증 필수
- `/api/playground/sessions`: 인증 필수
- audit cleanup·retention·seed: 관리자만 실행 가능
- 운영 AOS의 `/docs`, `/redoc`, `/openapi.json`: 비활성화
- 프로젝트 접근제어 DB 오류 시 프로젝트 목록을 반환하지 않고 `503`으로 fail-closed
- `/api/project-configs` DB 오류 시 filesystem fallback 없이 `503`으로 fail-closed
- DB 모드의 빈 프로젝트 registry도 접근제어 불능으로 간주해 `503` 반환
- DB 모드 project discovery/config/access는 DB registry만 사용하며 monitor-wide filesystem discovery와 startup filesystem registry 초기화를 수행하지 않음
- project-config authorization은 실제 path parameter만 사용하며 query-string `project_id`로 global route scope를 바꿀 수 없음
- DB mode의 global project-config filesystem enumeration은 privileged 사용자 포함 `503`으로 차단
- DB mode project-config child filesystem handlers는 등록·권한 확인 후 DB-backed 구현 전까지 `503`으로 fail-closed
- project-config copy target은 별도 active registry 및 org/direct access 검사를 통과해야 함
- `/api/projects/{project_id}` health/check/diagnostic/context/claude-md route에 인증 및 project RBAC 적용
- DB mode legacy project operational handler는 RBAC 이후 filesystem 실행 전 `503`으로 차단
- global exception response에서 raw exception type/text 제거; correlation ID와 generic detail만 반환
- DB session dependency 진입 실패는 generic `503`으로 변환하며 endpoint 예외는 원래 exception으로 보존
- DB session factory 진입 시 발생한 `HTTPException`도 generic `503`으로 변환
- DB project deletion/preview는 DB-backed cleanup 구현 전까지 cleanup service·filesystem mutation 전에 `503`으로 fail-closed
- project RBAC ACL 조회 실패는 generic `503`으로 변환
- standard/Railway debug mode에서도 HTTP response에 traceback·raw exception을 노출하지 않음
- 세션 권한 조회·변경은 세션 소유자 또는 admin/manager만 허용
- 터미널 audit의 adapter·execution 오류는 원문·예외 타입 대신 고정 category만 저장
- Railway 실제 Docker entrypoint(`api.app_railway:app`)에도 동일한 `ENABLE_API_DOCS`/`DEBUG` 문서 노출 정책 적용
- Railway 이미지에 `utils/time.py`와 `pydantic[email]`을 포함해 clean-container import 가능하도록 보완
- DB 모드에서 registry가 비어 있으면 filesystem 프로젝트 목록을 반환하지 않고 `503`으로 fail-closed

### 감사 로깅

- 세션 권한 변경: `PERMISSION_CHANGED`
- 터미널 실행: `TOOL_EXECUTED`
- 터미널 명령 원문은 저장하지 않고 터미널 종류, 명령 길이, Claude CLI 사용 여부, 브랜치 지정 여부와 결과 상태만 기록
- 터미널 service·adapter resolution/availability·unavailable·execution 예외·malformed adapter result는 실패 이벤트로 기록하고 고정 category만 남김

### 네트워크 기본값

다음 Compose 파일의 published port 기본 바인딩을 `127.0.0.1`로 변경했습니다.

- `/Users/younghwankang/Work/Agent-System/docker-compose.yml`
- `/Users/younghwankang/Work/Agent-System/docker-compose.dev.yml`
- `/Users/younghwankang/Work/shared-infra/docker-compose.yml`

외부 공개가 필요한 배포는 `BACKEND_BIND_HOST`, `PG_BIND_HOST`, `REDIS_BIND_HOST`, `QDRANT_BIND_HOST`, `DASHBOARD_BIND_HOST`를 명시적으로 설정해야 합니다.

## 검증 근거

- security-hardening 회귀 테스트: **51 passed**
- DB fail-closed·WebSocket·HITL 영향 범위 테스트 포함
- DB fail-closed·WebSocket·Claude isolation 포함 clean backend: **1,501 passed / 22 skipped**
- 전체 backend 테스트: **1,536 passed / 22 skipped / 1 failed**
- 유일한 실패: `tests/backend/test_rag_verification.py:469`의 임베딩 모델 기대값 불일치
  - 기대: `BAAI/bge-m3`
  - 실제: `intfloat/multilingual-e5-base`
  - 본 인계 작업 변경 파일과 무관
- 변경 범위 Ruff: 통과
- 변경 범위 compileall: 통과
- Git diff whitespace 검사: 통과
- AOS·shared-infra Compose 구문 검사 및 configurable PostgreSQL URL 검증: 통과
- 실제 Railway Docker image build 및 clean-container `from api.app_railway import app` 검증: 통과
- project/project-config 관련 OpenAPI security metadata 전수 점검: **78 operations protected**
- 실행 중 AOS 무인증 요청 검증:
  - `/api/audit/stats` → `401`
  - `/api/warp/open` POST without token → `401`
  - `/api/sessions/test/approvals` → `401`
  - `/api/sessions/test/approve/a` 및 deny route → `401`
  - `/api/project-configs` → `401`
  - `/api/terminal/available` → `401`
  - `/api/terminal/execute` → `401`
  - `/api/projects` 및 project mutation routes → `401`
  - `/api/claude-sessions/projects` 및 Claude session routes → `401`
  - `/api/playground/sessions` 및 Playground session routes → `401`
  - `/docs`, `/redoc`, `/openapi.json` → `404`
- 이번 추가 변경(`/api/project-registry`, WebSocket, DB-only discovery, centralized project-config guard, Claude isolation, Railway image 등)은 AOS 재기동 후 live 적용을 확인했으며, Open WebUI도 `127.0.0.1:3000`으로 재생성·healthcheck 검증 완료
- 최신 독립 Security review `deleg_e2c74668`: **passed=true**, concerns/errors 없음. DB deletion fail-closed, debug traceback redaction, DB session/RBAC error handling, project-config monitor/target ACL을 확인함.

## Security가 이어서 확인할 항목

### P0

- [x] 클라우드·호스팅·외부 VM 자산 목록 확보 — 영환님 확인 기준 Vercel Git 연동 서비스만 사용
- [x] Oracle HTTP Server/WebLogic 및 Proxy Plug-in 사용 여부 재검색 — AOS 로컬 및 확인된 Vercel 운영 범위에서 비영향
- [x] `CVE-2026-21962` 영향 자산의 외부 노출 여부 확인 — 확인된 운영 범위에 해당 자산 없음
- [x] AOS·shared-infra 실제 published port 변경 적용
- [ ] 서비스 계정·DB 계정·에이전트별 권한 매트릭스 작성

### P1

- [ ] audit cleanup·retention·seed에 대한 비관리자 `403` 회귀 테스트 추가
- [ ] 외부 호출·쓰기 작업의 감사 이벤트 커버리지 확인
- [ ] 터미널 명령 allowlist 및 별도 승인(HITL) 정책 결정
- [x] `*_BIND_HOST` 환경변수를 `env.example` 및 배포 문서에 반영
- [x] open-webui `3000` LAN 노출 정책 결정 및 localhost 제한 적용
- [ ] macOS Application Firewall 활성화 여부 결정
- [ ] project config의 중복 optional-user dependency 정리

### P2

- [ ] PQC 암호자산 인벤토리와 전환 우선순위 작성
- [ ] KISA 교육 신청 여부 결정 후 승인받아 외부 제출
- [ ] Siemens S7/ICS 관련 자산·원격접속·공급망 점검
- [ ] Fasset stablecoin/tokenization 및 국내 규제 이벤트 모니터링 범위 결정

## 제약 및 승인 필요

- shared-infra는 `docker compose up -d`로 볼륨 유지 재생성했으며 `down -v`·volume 삭제는 실행하지 않았습니다.
- 현재 shared-infra published port는 `127.0.0.1`에 적용됐습니다.
- 패치, 권한 축소, 외부 제출, cron 등록은 Security 검토 및 영환님 승인이 필요합니다.
- 비밀값·인증정보는 이 문서에 포함하지 않았습니다.

## 관련 파일

- `docs/security/REQUIRED_SECURITY_ACTIONS_2026-08-26.md` — 필수 조치 범위·권한 매트릭스·로컬 live probe 결과
- `/Users/younghwankang/Work/Agent-System/src/backend/api/audit.py`
- `/Users/younghwankang/Work/Agent-System/src/backend/api/app.py`
- `/Users/younghwankang/Work/Agent-System/src/backend/api/app_railway.py`
- `/Users/younghwankang/Work/Agent-System/src/backend/api/sessions.py`
- `/Users/younghwankang/Work/Agent-System/src/backend/api/websocket.py`
- `/Users/younghwankang/Work/Agent-System/src/backend/api/warp.py`
- `/Users/younghwankang/Work/Agent-System/src/backend/api/hitl.py`
- `/Users/younghwankang/Work/Agent-System/src/backend/api/playground.py`
- `/Users/younghwankang/Work/Agent-System/src/backend/api/claude_sessions/core.py`
- `/Users/younghwankang/Work/Agent-System/src/backend/api/deps.py`
- `/Users/younghwankang/Work/Agent-System/src/backend/api/routes.py`
- `/Users/younghwankang/Work/Agent-System/src/backend/api/permission_toggles.py`
- `/Users/younghwankang/Work/Agent-System/src/backend/api/project_configs/core.py`
- `/Users/younghwankang/Work/Agent-System/src/backend/api/terminal.py`
- `/Users/younghwankang/Work/Agent-System/setup.sh`
- `/Users/younghwankang/Work/Agent-System/tests/backend/test_security_hardening.py`
- `/Users/younghwankang/Work/Agent-System/tests/backend/test_e2e_hitl.py`
- `/Users/younghwankang/Work/Agent-System/tests/backend/test_hitl_approval_atomicity.py`
- `/Users/younghwankang/Work/Agent-System/tests/backend/test_audit_stats.py`

## 원문 출처

- OpenAI GPT-5.6 / AWS Kiro: https://openai.com/index/gpt-5-6-in-kiro/
- CISA KEV / CVE-2026-21962: https://www.cisa.gov/news-events/alerts/2026/08/24/cisa-adds-one-known-exploited-vulnerability-catalog
- KISA PQC 교육: https://www.kisa.or.kr/402/form?postSeq=2627
- Fasset Series C: https://fasset.com/blog/fasset-raises-68m-series-c-led-by-sbi-group/
- CISA·NSA·FBI Siemens S7 경고: https://www.cisa.gov/news-events/cybersecurity-advisories/aa26-231a
