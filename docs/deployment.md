# AOS 배포 가이드

이 문서는 Agent Orchestration Service (AOS)를 Railway 또는 Render에 배포하는 방법을 설명합니다.

## 목차

1. [사전 요구사항](#사전-요구사항)
2. [Railway 배포](#railway-배포)
3. [Render 배포](#render-배포)
4. [환경 변수 설정](#환경-변수-설정)
5. [CI/CD 파이프라인](#cicd-파이프라인)
6. [모니터링 설정](#모니터링-설정)
7. [트러블슈팅](#트러블슈팅)
8. [롤백 절차](#롤백-절차)

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
   - **Health Check Path**: `/health/ready`

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
   - **Health Check Path**: `/health/ready`

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
| `CORS_ORIGINS` | 추가 CORS 허용 오리진 | - |
| `LOG_LEVEL` | 로그 레벨 | `INFO` |
| `ENV` | 환경 (production/staging) | `production` |

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

| 엔드포인트 | 용도 | 응답 |
|------------|------|------|
| `/health` | 기본 헬스체크 | `{"status": "healthy"}` |
| `/health/ready` | 준비 상태 (K8s readiness) | Ready / 503 |
| `/health/live` | 생존 상태 (K8s liveness) | OK / 503 |
| `/health/detailed` | 상세 상태 | 컴포넌트별 상태 |

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
- `CORS_ORIGINS`에 추가 도메인 설정

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
