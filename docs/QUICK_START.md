# Quick Start Guide

## 사전 요구사항

- **Docker** + **Docker Compose** (인프라 서비스용)
- **Python 3.11+** + **uv** (백엔드, pip도 가능)
- **Node.js 18+** + **npm** (대시보드)
- **LLM API 키** - Google AI (기본) 또는 Anthropic

---

## 설치 순서

### 1. 저장소 클론

```bash
git clone https://github.com/your-org/Agent-System.git
cd Agent-System
```

### 2. 환경 변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 편집하여 최소한 다음을 설정합니다:

```bash
# 기본 LLM Provider는 Google Gemini
LLM_PROVIDER=google
GOOGLE_API_KEY=your_google_api_key_here

# Anthropic Claude 사용 시
# LLM_PROVIDER=anthropic
# ANTHROPIC_API_KEY=your_anthropic_api_key_here

# 로컬 Ollama 사용 시 (Docker 내부에서는 host.docker.internal 필요)
# LLM_PROVIDER=ollama
# OLLAMA_BASE_URL=http://host.docker.internal:11434
```

> **참고**: `OLLAMA_BASE_URL`은 로컬 직접 실행 시 `http://localhost:11434`, Docker 컨테이너 내부에서 호스트의 Ollama에 접근할 때는 `http://host.docker.internal:11434`를 사용합니다.

### 3. 인프라 실행 (PostgreSQL, Redis, Qdrant)

```bash
# 프로젝트 루트에서 실행
docker compose up -d postgres redis qdrant
```

또는 dev.sh 스크립트 사용:

```bash
./infra/scripts/dev.sh
```

> **참고**: Qdrant는 컨테이너 내부에 curl/wget이 없어 Docker healthcheck을 지원하지 않습니다. `service_started` 조건으로 시작되며, 보통 수 초 내에 준비됩니다. PostgreSQL과 Redis는 healthcheck이 설정되어 있습니다.

### 4. Backend 실행

```bash
cd src/backend

# uv 사용 (권장)
uv pip install -e .

# 또는 pip 사용
# pip install -e .

# 서버 시작
uvicorn api.app:app --reload --port 8000
```

### 5. Dashboard 실행 (새 터미널)

```bash
cd src/dashboard
npm install
npm run dev
```

### 6. 브라우저에서 접속

http://localhost:5173

---

## 사용하기

1. 하단 입력창에 작업 내용 입력
2. Enter 키로 전송
3. Task Tree와 Agent Activity에서 진행 상황 확인

---

## 주요 URL

| 서비스 | URL |
|--------|-----|
| Dashboard | http://localhost:5173 |
| API Docs (Swagger) | http://localhost:8000/docs |
| Health Check | http://localhost:8000/health |
| Health Ready | http://localhost:8000/health/ready |
| Health Detailed | http://localhost:8000/health/detailed |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |
| Qdrant | http://localhost:6333 |

---

## 환경 변수 요약

전체 환경 변수는 `.env.example` 파일을 참조하세요.

| 변수 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `LLM_PROVIDER` | O | `google` | LLM 제공자 (google, anthropic, ollama) |
| `GOOGLE_API_KEY` | △ | - | Google Gemini API 키 (google 사용 시 필수) |
| `ANTHROPIC_API_KEY` | △ | - | Anthropic Claude API 키 (anthropic 사용 시 필수) |
| `USE_DATABASE` | - | `true` | DB 사용 여부 (false면 인메모리) |
| `DATABASE_URL` | - | `postgresql+asyncpg://aos:aos@localhost:5432/aos` | PostgreSQL 연결 |
| `REDIS_URL` | - | `redis://localhost:6379/0` | Redis 연결 |
| `SESSION_SECRET_KEY` | - | (기본값 있음) | JWT 서명 키 (프로덕션에서는 반드시 변경) |
| `FRONTEND_URL` | - | `http://localhost:5173` | 대시보드 URL (CORS, OAuth 콜백) |

---

## 예시 명령어

```
# 텍스트 분석
"다음 텍스트를 분석해줘: Hello World"

# 코드 리뷰
"이 함수를 리뷰해줘: function add(a, b) { return a + b; }"

# 계획 수립
"TODO 앱을 만들기 위한 계획을 세워줘"
```

---

## 문제 발생 시

1. **연결 안됨**: Backend 서버가 실행 중인지 확인 (`uvicorn` 프로세스)
2. **API 에러**: `.env` 파일의 LLM API 키 확인 (`LLM_PROVIDER`와 해당 키가 일치하는지)
3. **CORS 에러**: `CORS_ORIGINS` 형식 확인 (쉼표 구분: `a.com,b.com` 또는 JSON 배열)
4. **UI 에러**: `npm install` 후 재시작
5. **DB 에러**: `USE_DATABASE=false`로 설정하거나 `docker compose up -d postgres redis qdrant` 실행
6. **Qdrant 연결 안됨**: 컨테이너 시작 후 수 초 대기 필요 (healthcheck 없이 `service_started`로 시작됨)

자세한 내용은 [USER_GUIDE.md](./USER_GUIDE.md) 참조
