#!/usr/bin/env bash
# verify-backend: Python/FastAPI/LangGraph 패턴 검증 스크립트
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SRC="$REPO_ROOT/src/backend"
PASS=0
FAIL=0
TOTAL=0

check() {
  local name="$1" cmd="$2"
  TOTAL=$((TOTAL + 1))
  local count
  count=$(eval "$cmd" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$count" -eq 0 ]; then
    printf "  ✓ %-25s PASS\n" "$name"
    PASS=$((PASS + 1))
  else
    printf "  ✗ %-25s FAIL (%s issues)\n" "$name" "$count"
    eval "$cmd" 2>/dev/null | head -5
    echo ""
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "━━━ Backend Pattern Verification ━━━"
echo ""

# 1. 반환 타입 힌트 누락
check "Type hints (return)" \
  "grep -rn 'def .*(.*):' \"$SRC\" --include='*.py' | grep -v '\->' | grep -v '__pycache__' | grep -v 'test_' | grep -v '__init__'"

# 2. bare except
check "Bare except" \
  "grep -rn 'except:' \"$SRC\" --include='*.py' | grep -v 'except Exception' | grep -v '__pycache__'"

# 3. 하드코딩된 시크릿
check "Hardcoded secrets" \
  "grep -rn 'password\s*=\s*[\"'\''].\+[\"'\'']\|api_key\s*=\s*[\"'\''].\+[\"'\'']\|secret\s*=\s*[\"'\''].\+[\"'\'']' \"$SRC\" --include='*.py' | grep -v '__pycache__' | grep -v 'test_' | grep -v '\.env' | grep -v 'config'"

# 4. sync I/O 호출
check "Sync I/O calls" \
  "grep -rn 'requests\.\(get\|post\|put\|delete\)\|time\.sleep\b' \"$SRC\" --include='*.py' | grep -v '__pycache__' | grep -v 'test_'"

# 5. print() 사용
check "Print statements" \
  "grep -rn '^\s*print(' \"$SRC\" --include='*.py' | grep -v '__pycache__' | grep -v 'test_' | grep -v 'cli'"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "  Total: %d  Pass: %d  Fail: %d\n" "$TOTAL" "$PASS" "$FAIL"
echo ""

[ "$FAIL" -eq 0 ] && echo "  ALL CHECKS PASSED" || echo "  $FAIL CHECK(S) FAILED"
echo ""
