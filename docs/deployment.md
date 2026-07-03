# AOS 배포 가이드

이 문서는 Agent Orchestration Service (AOS)를 Docker Compose(Self-hosted), Railway, 또는 Render에 배포하는 방법을 설명합니다.

## 목차

1. [사전 요구사항](#사전-요구사항)
2. [Docker Compose 배포 (Self-hosted)](#docker-compose-배포-self-hosted)
3. [Railway 배포](#railway-배포)
4. [Render 배포](#render-배포)
5. [환경 변수 설정](#환경-변수-설정)
6. [CI/CD 파이프라인](#cicd-파이프라인)
7. [모니터링 설정](#모니터링-설정)
8. [트러블슈팅](#트러블슈팅)
9. [롤백 절차](#롤백-절차)

---

## 사전 요구사항

### 필수 계정
- **GitHub** - 소스 코드 저장소
- **Railway** 또는 **Render** - 호스팅 플랫폼
- **LLM 실행 자격** - Self-host Docker는 CLI 구독 로그인, 헤드리스 PaaS는 명시적 fallback API 키

### 선택 사항
- **Slack/Discord** - 알림 웹훅
- **Sentry** - 에러 추적
- **AWS S3 또는 GCS** - 백업 저장소

---

## Docker Compose 배포 (Self-hosted)

### Docker 서비스 구성

프로젝트 루트의 `docker-compose.yml`에 전체 서비스가 정의되어 있습니다.

| 서비스 | 이미지 | 포트 | healthcheck |
|--------|--------|------|-------------|
| postgres | postgres:16-alpine | 5432 | `pg_isready -U aos -d aos` |
| redis | redis:7-alpine | 6379 | `redis-cli ping` |
| qdrant | qdrant/qdrant:latest | 6333, 6334 | 없음 (`service_started`) |
| backend | aos-backend (FastAPI) | 8000 | `curl -f http://localhost:8000/health` |
| dashboard | aos-dashboard (Nginx) | 5173→80 | backend healthy 이후 시작 |

> **Qdrant healthcheck 관련**: Qdrant 공식 이미지에는 `curl`/`wget`이 포함되어 있지 않아 Docker healthcheck을 설정할 수 없습니다. `docker-compose.yml`에서는 `condition: service_started`로 Qdrant 시작만 확인합니다. Qdrant의 `/healthz` 엔드포인트는 호스트에서 `curl http://localhost:6333/healthz`로 외부 확인 가능합니다.

> **사내/팀 self-host라면** 원격 접속·첫 관리자 부트스트랩·백업·**보안 주의사항**을 정리한
> [self-host 퀵스타트](./self-host-quickstart.md)를 먼저 참고하세요.

### 배포 절차

```bash
# 1. 환경 변수 설정 (CLI-first 정책 — 시크릿은 setup.sh가 자동 생성)
cp .env.example .env
# .env 편집: 기본은 LLM_PROVIDER=codex_cli, LLM_API_FALLBACK_ENABLED=false 유지
# self-host 머신에서 Codex CLI를 먼저 로그인하고, 필요 시 CLI profile mount 설정

# 2. 셋업 — 시크릿 자동 생성 + 빌드 + 전체 기동
./setup.sh
#    (또는 .env에 강한 SESSION_SECRET_KEY·POSTGRES_PASSWORD를 직접 넣었다면:
#     docker compose up -d --build )

# 3. 상태 확인
docker compose ps

# 4. 로그 확인
docker compose logs -f backend
```

> **보안**: `docker-compose.yml`은 `SESSION_SECRET_KEY`·`POSTGRES_PASSWORD`가 비어 있으면
> 즉시 실패합니다(약한 기본 시크릿 배포 방지). `setup.sh`가 강한 값을 자동 생성하므로
> 이 스크립트를 사용하세요.

### 개발 환경 (인프라만)

로컬 개발 시에는 인프라(DB)만 Docker로, Backend/Dashboard는 직접 실행합니다:

```bash
# 인프라만 시작 (프로젝트 루트에서)
docker compose up -d postgres redis qdrant

# 또는 dev.sh 스크립트 사용
./infra/scripts/dev.sh
```

> **참고**: `infra/docker/docker-compose.yml`은 개발용 compose 파일로, Backend/Dashboard를 `profiles: [full]`로 포함합니다. 프로덕션/Self-hosted 배포에는 루트의 `docker-compose.yml`을 사용하세요.

### Ollama 연동 (Docker 환경)

Docker 컨테이너 내부에서 호스트의 Ollama에 접근하려면 `localhost` 대신 `host.docker.internal`을 사용해야 합니다. 루트 `docker-compose.yml`에서는 이 값이 하드코딩되어 있어 `.env`의 `OLLAMA_BASE_URL` 설정과 무관하게 올바르게 동작합니다.

### CLI 구독권과 사용자별 profile 격리

AOS의 기본 LLM 운영은 API 과금 키가 아니라 CLI 구독권을 사용합니다. Settings의 LLM Access와 External Usage는 provider billing API가 아니라 AOS 내부 `llm_usage_ledger`를 같은 source of truth로 봅니다.

현재 구현된 API, UI, 운영 절차는 [CLI 구독권 기반 LLM 운영 안내](guides/llm-cli-subscription-usage-guide.md)를 함께 참고하세요.

기본 정책은 다음 값을 유지합니다.

```bash
LLM_PROVIDER=codex_cli
LLM_DEFAULT_MODE=cli
LLM_USAGE_SOURCE=internal_ledger
LLM_API_FALLBACK_ENABLED=false
LLM_USAGE_PREFLIGHT_QUOTA_ENABLED=false
EXTERNAL_USAGE_INCLUDE_PROVIDER_BILLING=false
```

운영 모드는 두 가지로 나눕니다.

| 모드 | 사용 상황 | CLI profile 소유권 | 사용량 해석 |
|------|-----------|--------------------|-------------|
| 단일 기본 profile | 개인 Docker, 소규모 신뢰 팀 | 배포 운영자 1개 profile | provider 계정은 하나지만 ledger는 AOS user/org별로 분리 |
| 사용자별 profile | 개인/회사 사용자를 같은 인스턴스에서 분리 | `owner_user_id` 또는 `organization_id`별 profile | provider 계정과 AOS ledger를 모두 사용자/조직 단위로 분리 |

단일 기본 profile은 가장 단순하지만 provider 입장에서는 하나의 CLI 계정으로 실행됩니다. 여러 독립 사용자나 회사 조직을 수용하려면 사용자별 또는 조직별 profile을 분리하세요.

권장 디렉터리 구조:

```text
runtime/llm-profiles/
  codex/default/
  codex/users/<user-id>/
  codex/orgs/<organization-id>/
```

Docker에는 전체 host home을 마운트하지 말고 CLI 인증/설정에 필요한 profile 디렉터리만 마운트합니다. CLI가 실행 중 쓰기 캐시를 만들지 않는 구성이면 read-only mount를 우선하고, 쓰기가 필요하면 사용자별 전용 디렉터리만 read-write로 둡니다.

예시 override:

```yaml
services:
  backend:
    volumes:
      # 컨테이너 실행 사용자 HOME 경로에 맞게 대상 경로를 조정하세요.
      - ./runtime/llm-profiles/codex/default:/home/aos/.codex:ro
```

운영 절차:

1. Self-host 머신에서 각 CLI 계정을 로그인하고 profile 디렉터리를 분리합니다.
2. Settings -> LLM Access에서 CLI profile을 생성합니다.
   - 개인 profile: `owner_user_id` 지정
   - 조직 공용 profile: `organization_id` 지정, `owner_user_id` 비움
   - command: `codex`
   - args: `exec --sandbox read-only --color never`
   - working directory: 해당 사용자/조직이 접근해도 되는 workspace
3. profile health check를 실행합니다. API 경로는 `POST /api/llm-access/profiles/{profile_id}/health-check`입니다.
4. 사용자 또는 조직 entitlement에 해당 profile을 매핑합니다.
5. org monthly quota를 호출 전에 막아야 하는 운영 환경에서만 `LLM_USAGE_PREFLIGHT_QUOTA_ENABLED=true`를 켭니다.

API fallback은 운영자가 명시적으로 승인한 예외 경로입니다. 전역 `LLM_API_FALLBACK_ENABLED=true`와 entitlement의 `allow_api_fallback=true`가 모두 필요하며, 이때도 사용량은 `mode=api`로 내부 ledger에 기록됩니다.

Railway/Render 같은 헤드리스 PaaS는 대화형 CLI 로그인을 유지하기 어렵습니다. CLI profile을 안전하게 마운트할 수 없는 배포에서는 Self-host Docker를 사용하거나, 비용 발생을 감수하고 fallback API 정책을 별도로 승인해야 합니다.

---

## Railway 배포

### 원클릭 배포

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

### 수동 배포

#### 1. Railway 프로젝트 생성

```bash
# Railway CLI 설치
npm install -g @railway/cli

# 로그인
railway login

# 프로젝트 생성
railway init
```

#### 2. 서비스 추가

Railway 대시보드에서 다음 서비스를 추가합니다:

| 서비스 | 타입 | 설명 |
|--------|------|------|
| backend | Custom Dockerfile | FastAPI 백엔드 |
| dashboard | Custom Dockerfile | React 대시보드 |
| postgres | 관리형 | PostgreSQL 16 |
| redis | 관리형 | Redis 7 |

#### 3. Backend 설정

1. "New Service" → "GitHub Repo" 선택
2. Repository 연결
3. Settings:
   - **Root Directory**: `src/backend`
   - **Dockerfile Path**: `Dockerfile.full`
   - **Health Check Path**: `/health` (기본) 또는 `/health/ready` (DB 연결 포함 확인)

#### 4. Dashboard 설정

1. "New Service" → "GitHub Repo" 선택
2. Settings:
   - **Root Directory**: `src/dashboard`
   - **Dockerfile Path**: `Dockerfile.prod`

#### 5. 환경 변수 설정

Backend 서비스에서 Variables 탭으로 이동:

```bash
# 자동 연결 (Railway Reference Variables)
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

# 필수 설정
USE_DATABASE=true
SESSION_SECRET_KEY=<32자 이상 랜덤 문자열>
FRONTEND_URL=https://<dashboard-service>.railway.app

# LLM 설정
# CLI profile을 안전하게 마운트할 수 없는 헤드리스 PaaS에서는 fallback API 정책이 필요합니다.
# API 사용은 비용이 발생하므로 Self-host CLI-first 운영을 우선 검토하세요.
LLM_API_FALLBACK_ENABLED=true
LLM_PROVIDER=google
GOOGLE_API_KEY=<your-api-key>
# 또는
# LLM_PROVIDER=openai
# OPENAI_API_KEY=<your-api-key>
# 또는
# LLM_PROVIDER=anthropic
# ANTHROPIC_API_KEY=<your-api-key>
# 참고: codex_cli는 CLI 설치 + ChatGPT 로그인 세션 또는 profile mount가 필요합니다.
# 이 조건을 만족하지 못하는 헤드리스 배포에서는 동작하지 않습니다.
```

#### 6. 커스텀 도메인 (선택)

1. Settings → Domains
2. "Generate Domain" 또는 커스텀 도메인 연결

---

## Render 배포

### Blueprint 배포

1. [Render Dashboard](https://dashboard.render.com) 접속
2. "New" → "Blueprint"
3. Repository 연결
4. `render.yaml`이 자동 감지됨
5. 환경 변수 입력 후 배포

### 수동 배포

#### 1. Web Service (Backend) 생성

1. "New" → "Web Service"
2. Docker 선택
3. Settings:
   - **Name**: aos-backend
   - **Dockerfile Path**: `./src/backend/Dockerfile.full`
   - **Docker Context**: `./src/backend`
   - **Health Check Path**: `/health` (기본) 또는 `/health/ready` (DB 연결 포함 확인)

#### 2. Static Site (Dashboard) 생성

1. "New" → "Static Site"
2. Settings:
   - **Build Command**: `npm ci && npm run build`
   - **Publish Directory**: `dist`

#### 3. PostgreSQL 생성

1. "New" → "PostgreSQL"
2. Plan 선택 (Starter 이상 권장)

#### 4. Redis 생성

1. "New" → "Redis"
2. Plan 선택

---

## 환경 변수 설정

### 필수 환경 변수

| 변수 | 설명 | 예시 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 | `postgresql+asyncpg://...` |
| `REDIS_URL` | Redis 연결 문자열 | `redis://...` |
| `USE_DATABASE` | 데이터베이스 사용 여부 | `true` |
| `SESSION_SECRET_KEY` | JWT 서명 키 | (32자 이상 랜덤) |
| `FRONTEND_URL` | 대시보드 URL | `https://aos.example.com` |
| `LLM_PROVIDER` | LLM 제공자 | `codex_cli`, `openai`, `google`, `anthropic`, `ollama` |
| `LLM_DEFAULT_MODE` | 기본 LLM 실행 모드 | `cli` |
| `LLM_USAGE_SOURCE` | 사용량 기준 source | `internal_ledger` |
| `LLM_API_FALLBACK_ENABLED` | API fallback 전역 허용 여부 | `false` |
| `CODEX_CLI_COMMAND` | Codex CLI 실행 파일 | `codex` |

### 선택 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `CODEX_CLI_ARGS` | Codex CLI 비대화식 실행 인자 | `exec --sandbox read-only --color never` |
| `CODEX_CLI_TIMEOUT_SECONDS` | Codex CLI timeout | `300` |
| `OPENAI_API_KEY` | fallback 전용 OpenAI API 키 | - |
| `GOOGLE_API_KEY` | fallback 전용 Google AI API 키 | - |
| `ANTHROPIC_API_KEY` | fallback 전용 Anthropic API 키 | - |
| `EXTERNAL_USAGE_INCLUDE_PROVIDER_BILLING` | provider billing reconciliation 포함 여부 | `false` |
| `GOOGLE_CLIENT_ID` | Google OAuth 클라이언트 ID | - |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 시크릿 | - |
| `GITHUB_CLIENT_ID` | GitHub OAuth 클라이언트 ID | - |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth 시크릿 | - |
| `CORS_ORIGINS` | 추가 CORS 허용 오리진 (쉼표 구분 또는 JSON 배열) | - |
| `LOG_LEVEL` | 로그 레벨 | `INFO` |
| `ENV` | 환경 (production/staging) | `production` |

### Claude Code Usage 환경 변수

Plan Usage Limits 대시보드에서 사용하는 설정입니다. 로컬 개발 시에는 macOS Keychain에서 자동으로 토큰을 추출하지만, 배포 환경에서는 환경 변수로 설정해야 합니다.

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `CLAUDE_OAUTH_TOKEN` | Anthropic Usage API OAuth 토큰 | macOS Keychain 자동 추출 |
| `CLAUDE_STATS_CACHE_PATH` | Claude Code stats-cache.json 경로 | `~/.claude/stats-cache.json` |
| `CLAUDE_USAGE_CACHE_PATH` | Usage API 응답 캐시 경로 | `~/.claude/aos-usage-cache.json` |

> **Note**: `CLAUDE_OAUTH_TOKEN`은 non-macOS 환경(Linux 서버, Docker 등)에서 필수입니다. macOS에서는 설정하지 않으면 Keychain에서 자동 추출됩니다.

### 모니터링 환경 변수

| 변수 | 설명 |
|------|------|
| `SLACK_WEBHOOK_URL` | Slack 알림 웹훅 URL |
| `DISCORD_WEBHOOK_URL` | Discord 알림 웹훅 URL |
| `SENTRY_DSN` | Sentry DSN |
| `ALERT_THRESHOLD` | 알림 발송 전 실패 횟수 (기본: 3) |

---

## CI/CD 파이프라인

### GitHub Secrets 설정

Repository Settings → Secrets and variables → Actions:

```
# Railway
RAILWAY_TOKEN=<railway-token>
RAILWAY_PROJECT_ID=<project-id>

# 환경 URL
STAGING_BACKEND_URL=https://aos-staging.railway.app
STAGING_DASHBOARD_URL=https://aos-dashboard-staging.railway.app
PRODUCTION_BACKEND_URL=https://aos.railway.app
PRODUCTION_DASHBOARD_URL=https://aos-dashboard.railway.app

# 알림 (선택)
SLACK_WEBHOOK_URL=<webhook-url>

# 백업 (선택)
DATABASE_HOST=<db-host>
DATABASE_PORT=5432
DATABASE_USER=<db-user>
DATABASE_PASSWORD=<db-password>
DATABASE_NAME=aos
AWS_ACCESS_KEY_ID=<aws-key>
AWS_SECRET_ACCESS_KEY=<aws-secret>
BACKUP_S3_BUCKET=<bucket-name>
```

### 워크플로우

| 워크플로우 | 트리거 | 설명 |
|------------|--------|------|
| `ci.yml` | PR, push to main | 린트, 타입체크, 테스트 |
| `build.yml` | push to main, tag | Docker 이미지 빌드 & GHCR 푸시 |
| `deploy-staging.yml` | build 성공 후 | 스테이징 자동 배포 |
| `deploy-production.yml` | 릴리스 또는 수동 | 프로덕션 수동 배포 |
| `backup.yml` | 매일 2AM UTC | DB 백업 |

---

## 모니터링 설정

### 헬스체크 엔드포인트

| 엔드포인트 | 용도 | 성공 응답 | 실패 응답 |
|------------|------|-----------|-----------|
| `/health` | 기본 헬스체크 (로드밸런서) | 200 `{"status": "healthy", "version": "...", "uptime_seconds": ...}` | 503 |
| `/health/ready` | K8s readiness probe (DB 등 외부 의존성 확인) | 200 `Ready` | 503 `Not Ready` |
| `/health/live` | K8s liveness probe (프로세스 생존만 확인) | 200 `OK` | 503 `Not OK` |
| `/health/detailed` | 상세 상태 (컴포넌트별) | 200 SystemHealth JSON | 503 |
| `/health/database` | DB 연결 상태 | 200 | 503 또는 404 |
| `/health/redis` | Redis 연결 상태 | 200 | 503 또는 404 |
| `/health/llm` | LLM Provider 상태 | 200 | 503 또는 404 |
| `/health/services` | 인프라 서비스 포트 상태 | 200 서비스 목록 | - |

> **참고**: Docker Compose의 backend healthcheck은 `/health`를 사용합니다. Railway/Render에서는 용도에 따라 `/health` (기본) 또는 `/health/ready` (DB 포함 확인)를 선택하세요.
>
> health 엔드포인트는 prefix 없이 (`/health`)와 prefix 포함 (`/api/health`) 모두에 마운트되어 있습니다.

### Slack 알림 설정

1. Slack App 생성 또는 Incoming Webhook 추가
2. Webhook URL 복사
3. `SLACK_WEBHOOK_URL` 환경 변수 설정

알림 발송 조건:
- 헬스체크 3회 연속 실패
- 헬스체크 복구
- 서비스 시작/종료
- 배포 성공/실패

### Sentry 설정

1. [Sentry](https://sentry.io) 프로젝트 생성
2. DSN 복사
3. `SENTRY_DSN` 환경 변수 설정

---

## 트러블슈팅

### 일반적인 문제

#### 1. 데이터베이스 연결 실패

```
Connection refused to PostgreSQL
```

**해결책**:
- `DATABASE_URL` 형식 확인: `postgresql+asyncpg://user:pass@host:port/db`
- Railway/Render 내부 네트워크 주소 사용 확인
- 방화벽 설정 확인

#### 2. Redis 연결 실패

```
Redis connection error
```

**해결책**:
- `REDIS_URL` 형식 확인: `redis://host:port/0`
- TLS 필요 시: `rediss://...`

#### 3. LLM 실행/API fallback 오류

```
Invalid API key
```

**해결책**:
- 기본 CLI-first 운영이면 API key가 아니라 `codex` CLI 설치, 로그인, profile mount 상태를 먼저 확인
- API fallback을 의도한 경우에만 `LLM_API_FALLBACK_ENABLED=true` 확인
- fallback entitlement의 `allow_api_fallback=true` 확인
- fallback API 키 유효성 및 provider 일치 확인
- External Usage provider billing 값만 확인하려는 경우 `EXTERNAL_USAGE_INCLUDE_PROVIDER_BILLING=true`와 reconciliation key 상태 확인

#### 4. CORS 오류

```
CORS policy: No 'Access-Control-Allow-Origin'
```

**해결책**:
- `FRONTEND_URL` 설정 확인
- `CORS_ORIGINS`에 추가 도메인 설정 (쉼표 구분: `http://a.com,http://b.com` 또는 JSON 배열: `'["http://a.com","http://b.com"]'`)
- `source .env` 사용 시 JSON 배열 값은 반드시 single-quote로 감싸야 셸이 내부 따옴표를 보존함

### 로그 확인

```bash
# Railway
railway logs --service backend

# Render
# 대시보드 → Service → Logs 탭
```

---

## 롤백 절차

### Railway 롤백

```bash
# 이전 배포로 롤백
railway rollback --service backend

# 특정 버전으로 배포
gh workflow run deploy-production.yml -f version=v1.0.0 -f skip_tests=true
```

### Render 롤백

1. 대시보드 → Service → Deploys
2. 이전 성공한 배포 선택
3. "Rollback to this deploy" 클릭

### 데이터베이스 복원

자세한 내용은 [복구 절차](./recovery.md) 문서를 참조하세요.

---

## 참고 자료

- [Railway Documentation](https://docs.railway.app)
- [Render Documentation](https://render.com/docs)
- [FastAPI Deployment](https://fastapi.tiangolo.com/deployment/)
- [Docker Best Practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
