#!/usr/bin/env bash
# verify-frontend: React/TypeScript/Tailwind 패턴 검증 스크립트
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SRC="$REPO_ROOT/src/dashboard/src"
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
echo "━━━ Frontend Pattern Verification ━━━"
echo ""

# 1. memo() 없는 export 컴포넌트
check "memo() wrapping" \
  "grep -rn 'export default function\|export const.*= (' \"$SRC/components/\" \"$SRC/pages/\" --include='*.tsx' | grep -v 'memo(' | grep -v '__tests__' | grep -v '.test.' | grep -v '.spec.'"

# 2. TypeScript any 사용
check "TypeScript any usage" \
  "grep -rn ': any\b\|as any\b\|<any>' \"$SRC\" --include='*.ts' --include='*.tsx' | grep -v '__tests__' | grep -v '.test.' | grep -v '.spec.' | grep -v '.d.ts'"

# 3. 인라인 스타일
check "Inline styles" \
  "grep -rn 'style={{' \"$SRC\" --include='*.tsx' | grep -v '__tests__' | grep -v '.test.' | grep -v '.spec.'"

# 4. aria-label 누락 button
check "Accessibility (aria)" \
  "grep -rn '<button\b' \"$SRC\" --include='*.tsx' | grep -v 'aria-label' | grep -v '__tests__' | grep -v '.test.' | grep -v '.spec.'"

# 5. dark: 대응 없는 라이트 색상
check "Dark mode support" \
  "grep -rn 'bg-white\|bg-gray-50' \"$SRC\" --include='*.tsx' | grep -v 'dark:' | grep -v '__tests__' | grep -v '.test.' | grep -v '.spec.'"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "  Total: %d  Pass: %d  Fail: %d\n" "$TOTAL" "$PASS" "$FAIL"
echo ""

[ "$FAIL" -eq 0 ] && echo "  ALL CHECKS PASSED" || echo "  $FAIL CHECK(S) FAILED"
echo ""
