# AOS autodev 설정 — autodev 스크립트들이 source 한다.

# --- 품질 게이트 명령 (각각 exit 0이어야 통과) ---
GATE_TYPECHECK='cd src/dashboard && npx tsc --noEmit'
GATE_LINT='ruff check src/backend && (cd src/dashboard && npm run lint)'
GATE_TEST='pytest tests/backend && (cd src/dashboard && npm test -- --run)'
GATE_BUILD='cd src/dashboard && npm run build'
GATE_COVERAGE_CMD='pytest tests/backend --cov=src/backend --cov-report=term-missing'
COVERAGE_THRESHOLD=80

# --- 루프 한도 ---
MAX_ITERATIONS=30
MAX_TURNS=60
ITERATION_TIMEOUT=3600      # iteration당 최대 초
STALL_LIMIT=3              # 연속 무커밋 iteration 수 → BLOCKED
COST_CAP_USD=50            # 누적 사용량 상한 (토큰 비용 환산)

# --- 모델 ---
AUTODEV_MODEL=opus

# --- 네트워크: 추가 허용 도메인 (공백 구분) ---
EXTRA_ALLOWED_DOMAINS=''

# --- 컨테이너 리소스 ---
RES_MEMORY=8g
RES_CPUS=4
RES_PIDS=512

# --- git ---
GIT_REMOTE=origin
BASE_BRANCH=main
