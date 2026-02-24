# Quick Start Guide

## 30초 시작하기

### 0. 인프라 실행 (선택사항)
```bash
# PostgreSQL, Redis, Qdrant 실행 (DB 사용 시)
cd infra/scripts && ./dev.sh
```

### 1. Backend 실행
```bash
cd src/backend
source .venv/bin/activate
uvicorn api.app:app --reload --port 8000
```

### 2. Dashboard 실행 (새 터미널)
```bash
cd src/dashboard
npm run dev
```

### 3. 브라우저에서 접속
http://localhost:5173

### 4. 사용하기
1. 하단 입력창에 작업 내용 입력
2. Enter 키로 전송
3. Task Tree와 Agent Activity에서 진행 상황 확인

---

## 주요 URL

| 서비스 | URL |
|--------|-----|
| Dashboard | http://localhost:5173 |
| API Docs | http://localhost:8000/docs |
| Health Check | http://localhost:8000/api/health |

---

## 환경 변수 설정

```bash
# .env 파일 생성 (src/backend/)
# LLM Provider 선택 (google, anthropic, ollama)
LLM_PROVIDER=google

# Google Gemini 사용 시
GOOGLE_API_KEY=your-google-api-key

# Anthropic Claude 사용 시
ANTHROPIC_API_KEY=your-anthropic-api-key

# 로컬 Ollama 사용 시
OLLAMA_BASE_URL=http://localhost:11434

# 데이터베이스 (선택사항)
USE_DATABASE=false
DATABASE_URL=postgresql+asyncpg://aos:aos@localhost:5432/aos
```

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

1. **연결 안됨**: Backend 서버 실행 확인
2. **API 에러**: `.env` 파일의 LLM API 키 확인 (GOOGLE_API_KEY 또는 ANTHROPIC_API_KEY)
3. **UI 에러**: `npm install` 후 재시작
4. **DB 에러**: `USE_DATABASE=false`로 설정하거나 `./infra/scripts/dev.sh` 실행

자세한 내용은 [USER_GUIDE.md](./USER_GUIDE.md) 참조
