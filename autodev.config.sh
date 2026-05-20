# AOS autodev 설정.
GATE_TYPECHECK='cd src/dashboard && npx tsc --noEmit'
GATE_LINT='ruff check src/backend && (cd src/dashboard && npm run lint)'
GATE_TEST='pytest tests/backend && (cd src/dashboard && npm test -- --run)'
GATE_BUILD='cd src/dashboard && npm run build'
GATE_COVERAGE_CMD='pytest tests/backend --cov=src/backend --cov-report=term-missing'
COVERAGE_THRESHOLD=80

MAX_ITERATIONS=30
MAX_TURNS=60
ITERATION_TIMEOUT=3600
STALL_LIMIT=3
COST_CAP_USD=50
AUTODEV_MODEL=opus
EXTRA_ALLOWED_DOMAINS=''
RES_MEMORY=8g
RES_CPUS=4
RES_PIDS=512
GIT_REMOTE=origin
BASE_BRANCH=main
