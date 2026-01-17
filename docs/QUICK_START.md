# Quick Start Guide

## 30초 시작하기

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
2. **API 에러**: `.env` 파일의 `ANTHROPIC_API_KEY` 확인
3. **UI 에러**: `npm install` 후 재시작

자세한 내용은 [USER_GUIDE.md](./USER_GUIDE.md) 참조
