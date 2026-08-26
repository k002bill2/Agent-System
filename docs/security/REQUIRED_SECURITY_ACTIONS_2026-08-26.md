# 필수 보안 조치 상태 보고서

- 기준일: 2026-08-26
- 범위: AOS 로컬·저장소·현재 실행 중인 로컬 컨테이너
- 외부 제출·클라우드 로그인·능동 스캔: 수행하지 않음
- 서비스 재기동: AOS 및 Open WebUI 재기동 완료

## 결론

AOS 애플리케이션 코드 하드닝과 독립 Security review는 PASS 상태다. 영환님 확인 기준 외부 서비스는 Git 연동 Vercel만 사용하며, 필수 범위의 local/live 적용 확인도 완료했다. 재기동 후 PostgreSQL·Redis·Qdrant가 loopback이며, `open-webui:3000`도 `127.0.0.1`에 제한되었다.

## 필수 조치 상태

| 조치 | 상태 | 근거 및 제한 |
|---|---|---|
| 최신 보안 코드 live 적용 | 완료 | AOS 재기동 후 `/health` 200, `/health/ready` 200, `/docs` 404, `/redoc` 404, `/openapi.json` 404, `/api/projects` 401 확인. |
| Open WebUI LAN 노출 제한 | 완료 | `open-webui` 컨테이너를 기존 환경변수·`open-webui` volume 보존 상태로 재생성하고 `127.0.0.1:3000->8080` 및 health `healthy` 확인. |
| 외부 자산 목록 확보 | 통과 | 영환님 확인: 외부 서비스는 Git 연동 Vercel만 사용하며 AOS 로컬에는 영향이 없음. Vercel CLI 인증 없이도 이 운영 범위를 기준으로 확정. |
| CVE-2026-21962 영향 여부 | 통과 | AOS 로컬 서비스·Compose·실행 컨테이너에 Oracle HTTP Server/WebLogic/Proxy Plug-in이 없고, Git 연동 Vercel 서비스는 해당 자산 범위에 포함되지 않음. 추가 AOS 조치 없음. |
| 서비스·DB·에이전트 권한 매트릭스 | 초안 완료 | 아래 매트릭스 참조. 실제 배포 계정·클라우드 IAM은 미확인. |
| Terminal allowlist/HITL | 보수적 정책 초안 | 현재 endpoint는 admin/manager로 제한되지만 command 실행 capability가 있으므로 운영 정책 결정이 필요. 아래 초안 참조. |

## 로컬 자산·노출 확인

### 실행 컨테이너

- `shared-postgres`: `127.0.0.1:5432` published, healthy
- `shared-redis`: `127.0.0.1:6379` published, healthy
- `shared-qdrant`: `127.0.0.1:6333-6334` published
- `open-webui`: `127.0.0.1:3000->8080`, healthy

### 로컬 API 읽기 전용 probe

- `GET http://127.0.0.1:8000/health` → `200`
- `GET http://127.0.0.1:8000/health/ready` → `200`
- `GET http://127.0.0.1:8000/docs` → `404`
- `GET http://127.0.0.1:8000/redoc` → `404`
- `GET http://127.0.0.1:8000/openapi.json` → `404`
- `GET http://127.0.0.1:8000/api/projects` → `401`
- `GET http://127.0.0.1:3000/` → `200` (Open WebUI)

### 구성 상태

- `docker-compose.yml`의 backend/dashboard 기본 bind host: `127.0.0.1`
- `docker-compose.dev.yml`의 backend/dashboard/PostgreSQL/Redis 기본 bind host: `127.0.0.1`
- 실행 중 `open-webui`는 `127.0.0.1:3000->8080`으로 재생성되었고 healthcheck `healthy` 확인
- AOS 및 Open WebUI 재기동을 완료했으며 shared PostgreSQL·Redis·Qdrant는 재기동하지 않음

### Provider inventory 상태

| Provider | 읽기 전용 확인 결과 | 판정 |
|---|---|---|
| Vercel | `AOS_web/vercel.json` 존재; 영환님 확인상 Git 연동으로 서비스 중; CLI 인증 없음 | 운영 외부 자산으로 통과 처리 |
| Railway | `railway status` → linked project 없음 | 연결된 프로젝트 미확인 |
| GCP | 활성 계정 없음; project/resource 조회 불가 | 자산 없음으로 판정하지 않음 |
| AWS | CLI 미설치 | 미확인 |
| Azure | CLI 미설치 | 미확인 |

이 표는 로컬 확인 결과와 영환님이 확인한 운영 배포 구조를 결합한 것이다. 로그인·토큰 입력·배포·외부 자산 능동 스캔은 수행하지 않았다.

## 권한 매트릭스 초안

| 주체/역할 | 허용 범위 | 근거 |
|---|---|---|
| 시스템 admin | 전체 프로젝트 접근 및 관리자 기능 | `api/deps.py`: `get_current_admin_user`, `require_project_role` |
| manager | 관리자·운영 범위, terminal execute, Warp, audit 및 privileged session surface | `api/deps.py`: `get_current_admin_or_manager_user`; 관련 router dependencies |
| 일반 인증 사용자 | 인증이 필요한 일반 조회 및 본인 소유 session/resource | `api/deps.py`: `get_current_user`; session/resource authorization |
| project viewer | project 상태·context·diagnostics 등 viewer 조회 | `require_project_role(..., min_role="viewer")` |
| project editor | viewer 범위 + editor 이상 작업 | `require_project_role(..., min_role="editor")` |
| project owner | project owner 이상 작업 및 project access 관리 | `require_project_role(..., min_role="owner")` |
| 비인증 사용자 | 민감 API 접근 불가 | live `/api/projects` → `401`; OpenAPI security metadata 검증 |
| DB/PostgreSQL·Redis·Qdrant 서비스 | 애플리케이션 내부 서비스 계정으로만 접근, published port loopback 기본 | Compose 환경변수·bind 설정. 실제 credential 값은 기록하지 않음 |

### 확인 필요

- Railway/Vercel/클라우드 IAM의 실제 service account와 role binding
- 운영 환경에서 Codex/Claude CLI가 접근 가능한 filesystem·network 범위
- 관리자·매니저 계정의 실제 업무상 최소 권한

## Terminal allowlist/HITL 보수적 초안

정책을 확정·강제하지 않은 상태다. 현재 코드상 `POST /api/terminal/execute`는 admin/manager로 제한되어도 command capability 자체는 존재하므로, 운영 사용 전 다음을 최소 기준으로 결정해야 한다.

1. 기본값은 read-only/plan 모드.
2. 파일 쓰기·삭제, shell pipeline, credential/secret 접근, network write, Git push/deploy는 항상 HITL 승인.
3. production·shared-infra 경로는 별도 승인 없이는 실행 금지.
4. 허용 terminal·project path·branch 범위를 allowlist로 제한.
5. audit에는 actor, project, terminal, command length, safe flags, result category만 기록하고 command·stderr·secret은 기록하지 않음.
6. 승인 전환은 현재 구현처럼 세션 소유자 또는 명시적 privileged role만 허용.

위 초안의 실제 enforce 여부는 운영 정책 결정과 별도 승인 사항이다. 이번 점검에서는 코드·권한·설정을 변경하지 않았다.

## 다음 조치

1. 필수 보안 조치는 완료. 영환님 확인 기준 Vercel-only 외부 자산 범위로 CVE 영향 없음 처리.
2. 선택적 후속으로 Terminal allowlist/HITL 정책을 확정한 뒤 별도 구현·테스트·Security 재검토.

## 검증 및 미실행 범위

- 실행: 로컬 파일·Compose·컨테이너·listener·안전한 GET probe 확인
- 미실행: mutating API 호출, 외부 자산 능동 스캔, 클라우드 로그인, credential 조회, 방화벽 변경, 외부 제출
- 민감정보: credential·token·password·connection string을 기록하지 않음
