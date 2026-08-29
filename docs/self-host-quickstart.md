# AOS Self-Host 퀵스타트 (사내/신뢰된 팀용)

이 문서는 **각 팀이 자신의 독립 인스턴스로** AOS를 운영하는 self-host 배포를 다룹니다.
한 대의 머신(또는 사내 서버)에 Docker로 전체 스택(앱 + PostgreSQL + Redis + Qdrant)을
띄우고, 같은 팀원들이 브라우저로 접속해 사용하는 형태입니다.

> ⚠️ **보안 경고 — 반드시 읽으세요**
>
> 현재 버전(1단계)은 **일부 API 엔드포인트가 무인증·소유권 미검사** 상태입니다
> (`GET/PUT/DELETE /projects/{id}`, `GET/DELETE /sessions/{id}`,
> `GET/PATCH /playground/sessions/{id}` 등). 따라서:
>
> - ✅ **신뢰된 내부망 / VPN / 사내 LAN 안에서만** 사용하세요.
> - ❌ **공개 인터넷에 포트포워딩하거나 노출하지 마세요.** 외부 공개가 필요하면
>   2단계(공유 SaaS용 auth 강화)가 완료된 뒤에 진행해야 합니다.
>
> 여러 사용자가 **하나의 인스턴스를 공유**하는 SaaS 형태는 아직 지원되지 않습니다.
> 팀별 독립 인스턴스(이 문서의 방식)는 DB가 물리적으로 분리되어 안전합니다.

---

## 사전 요구사항

| 항목 | 최소 |
|------|------|
| Docker | 24.0+ |
| Docker Compose | 2.20+ (플러그인 `docker compose`) |
| RAM | 4GB |
| 디스크 | 10GB |
| LLM 실행 자격 | 기본은 Codex CLI 구독 로그인, fallback API는 명시적으로 켠 경우에만 필요 |

`python3` 또는 `openssl` 중 하나가 있으면 `setup.sh`가 시크릿을 자동 생성합니다
(대부분의 macOS/Linux에 기본 포함).

---

## 1. 설치 (로컬 / 단일 머신)

```bash
# 1) 클론
git clone https://github.com/k002bill2/Agent-System.git
cd Agent-System

# 2) 환경변수: CLI-first 정책 확인 (시크릿은 setup.sh가 자동 생성)
cp .env.example .env
#    기본값은 LLM_PROVIDER=codex_cli, LLM_API_FALLBACK_ENABLED=false
#    시작 전 self-host 머신에서 codex CLI 로그인 또는 profile mount 준비

# 3) 셋업: 시크릿 자동 생성 + 이미지 빌드 + 전체 기동 + 헬스 대기
./setup.sh

# 4) 접속
open http://localhost:5173   # Linux: xdg-open
```

`setup.sh`가 자동으로 수행하는 것:

- `.env`가 없으면 `.env.example`에서 생성
- `SESSION_SECRET_KEY`·`POSTGRES_PASSWORD`가 비어있거나 약한 기본값이면
  **강한 랜덤 값으로 자동 생성**(멱등 — 이미 강한 값이면 그대로 둠)
- 포트 충돌 감지
- `docker compose up -d --build`로 전체 스택 기동
- 백엔드 `/health`가 healthy가 될 때까지 대기

> **왜 `docker compose up -d`를 직접 쓰지 않나?**
> `docker-compose.yml`은 시크릿이 비어있으면 즉시 실패합니다
> (`POSTGRES_PASSWORD is missing a value`). 이는 약한 기본 시크릿으로 배포되는
> 사고를 막기 위한 의도적 안전장치입니다. `setup.sh`가 시크릿을 먼저 생성하므로
> 이 스크립트를 쓰세요. (이미 `.env`에 강한 시크릿을 직접 넣었다면
> `docker compose up -d --build`를 써도 됩니다.)

---

## 2. 원격 접속 (다른 팀원이 사내 서버로 접속)

대시보드를 서버 IP나 사내 도메인으로 접속하게 하려면, `.env`에서 외부에서
**실제로 접근 가능한 URL**을 지정한 뒤 재기동해야 합니다.

```bash
# .env 편집
FRONTEND_URL=http://10.0.1.20:5173        # 또는 https://aos.사내도메인
CORS_ORIGINS=http://10.0.1.20:5173        # FRONTEND_URL과 동일하게

# 재기동
docker compose up -d
```

> 프론트엔드는 상대경로(`/api`)로 백엔드를 호출하고 nginx가 프록시하므로,
> 대시보드 포트(기본 5173)만 열면 됩니다. 백엔드(8000)를 따로 노출할 필요 없습니다.
> `FRONTEND_URL`/`CORS_ORIGINS`는 OAuth 콜백과 CORS 허용을 위해 필요합니다.

HTTPS가 필요하면 리버스 프록시(nginx/Caddy/Traefik) 뒤에 두고 `FRONTEND_URL`을
`https://...`로 설정하세요. 쿠키 `secure` 플래그는 프로덕션 빌드에서 자동 적용됩니다.

---

## 3. 첫 관리자(admin) 계정 만들기

최초 관리자는 `.env`의 `SUPER_ADMIN_EMAILS`로 부트스트랩합니다 (쉼표 구분).

```bash
# .env
SUPER_ADMIN_EMAILS=you@example.com,teammate@example.com
docker compose up -d   # 변경 반영
```

| 가입 방식 | admin 승격 시점 |
|-----------|-----------------|
| **OAuth (Google/GitHub)** | 첫 로그인 시 **즉시** 승격 |
| **이메일/비밀번호** | 가입(register)이 아니라 **그 다음 로그인** 시 승격 |

> 이메일 경로는 "가입 → 로그인" 두 단계를 거쳐야 admin이 됩니다. 더 매끄러운
> 첫 관리자 경험은 2단계에서 개선될 예정입니다. 그때까지는 OAuth를 권장합니다.

---

## 4. 데이터 영속성과 백업

| 데이터 | 저장 위치 | `down` | `down -v` |
|--------|-----------|--------|-----------|
| PostgreSQL | 호스트 바인드 마운트 `infra/docker/data/postgres/` | 보존 | 보존(바인드라 볼륨 삭제 영향 적음) |
| Redis / Qdrant / ChromaDB | named 볼륨 | 보존 | **삭제됨** |

```bash
docker compose ps                 # 상태
docker compose logs -f backend    # 로그
docker compose down               # 중지(데이터 보존)
docker compose down -v            # ⚠️ named 볼륨까지 삭제 — 신중히
```

AOS는 백업·복원 자동화를 제공하지 않습니다. 데이터 보호가 필요하면
운영자가 선택한 프로바이더 또는 인프라 백업 정책을 별도로 구성하고, 그 정책의
복원 절차를 검증한 뒤 업그레이드하세요. AOS 저장소에는 이를 실행할 백업 명령이 없습니다.

```bash
git pull && ./setup.sh            # setup.sh는 강한 시크릿을 덮어쓰지 않음(멱등)
```

> 기존 DB가 이미 있는 상태에서 `setup.sh`를 다시 돌려도 `POSTGRES_PASSWORD`는
> 재생성하지 않습니다(기존 DB와 불일치 방지). 비밀번호를 바꾸려면 DB를 초기화하거나
> `ALTER ROLE`로 수동 변경해야 합니다.

---

## 5. 유지보수자(maintainer) 전용 — Claude Code 연동

저장소를 유지보수하는 머신에서 호스트의 `~/.claude`(Claude Code 사용량 모니터링)와
`~/.warp`(Warp 연동)를 컨테이너에 마운트하려면, 자동 로드되는
`docker-compose.override.yml`이 그 역할을 합니다. 이 파일은 **git-ignore**되어
다른 사용자 체크아웃에는 포함되지 않습니다(신규 사용자 머신엔 해당 경로가 없으므로).
연동이 필요 없으면 이 파일을 삭제하면 됩니다.

LLM runtime으로 Codex CLI 구독권을 사용할 때도 전체 host home을 공유하지 말고,
사용자/조직별 CLI profile 디렉터리만 분리해 마운트하세요. profile ownership과
entitlement 매핑 절차는 [배포 가이드의 CLI profile 격리 섹션](./deployment.md#cli-구독권과-사용자별-profile-격리)을 따릅니다.

---

## 트러블슈팅

| 증상 | 원인 / 해결 |
|------|-------------|
| `POSTGRES_PASSWORD is missing a value` | `docker compose up`을 직접 실행함 → `./setup.sh` 사용 |
| `SESSION_SECRET_KEY ... insecure default` (백엔드 종료) | 시크릿 미설정 → `./setup.sh`로 생성 |
| 원격 접속 시 로그인 실패 / CORS 에러 | `.env`의 `FRONTEND_URL`/`CORS_ORIGINS`를 외부 접근 URL로 설정 후 `docker compose up -d` |
| 포트 충돌 | `.env`에서 `PG_PORT`/`REDIS_PORT`/`BACKEND_PORT`/`DASHBOARD_PORT`/`QDRANT_PORT` 오버라이드 |
| LLM 실행 실패 | `LLM_PROVIDER=codex_cli`, CLI 로그인/profile mount, Settings LLM Access health check 확인. API fallback은 명시적으로 켠 경우에만 키 확인 |

더 자세한 배포 옵션(Railway/Render, CI/CD, 모니터링, 롤백)은
[docs/deployment.md](./deployment.md)를 참조하세요.
