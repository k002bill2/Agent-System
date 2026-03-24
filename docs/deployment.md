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
- **LLM API 키** - Google AI (Gemini) 또는 Anthropic (Claude)

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

### 배포 절차

```bash
# 1. 환경 변수 설정
cp .env.example .env
# .env 편집: GOOGLE_API_KEY, SESSION_SECRET_KEY 등 설정

# 2. 전체 서비스 시작 (프로젝트 루트에서 실행)
docker compose up -d

# 3. 상태 확인
docker compose ps

# 4. 로그 확인
docker compose logs -f backend
```

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
LLM_PROVIDER=google
GOOGLE_API_KEY=<your-api-key>
# 또는
# LLM_PROVIDER=anthropic
# ANTHROPIC_API_KEY=<your-api-key>
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
| `LLM_PROVIDER` | LLM 제공자 | `google` 또는 `anthropic` |
| `GOOGLE_API_KEY` | Google AI API 키 | (Google Cloud Console) |

### 선택 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `ANTHROPIC_API_KEY` | Anthropic API 키 | - |
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

#### 3. LLM API 오류

```
Invalid API key
```

**해결책**:
- API 키 유효성 확인
- 결제 정보 확인 (무료 할당량 초과 시)
- `LLM_PROVIDER`와 API 키 일치 확인

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
