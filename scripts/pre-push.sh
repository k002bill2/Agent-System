#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Pre-Push CI Verification
# CI와 동일한 체크를 로컬에서 실행하여 push 전 실패를 차단합니다.
#
# 환경변수:
#   QUICK_PUSH=1  - lint + typecheck만 실행 (test, build 스킵)
#   NO_BACKEND=1  - backend 체크 스킵
#   NO_FRONTEND=1 - frontend 체크 스킵
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
TMPDIR_BASE="${TMPDIR:-/tmp}/pre-push-$$"
mkdir -p "$TMPDIR_BASE"
trap 'rm -rf "$TMPDIR_BASE"' EXIT

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

PASS="${GREEN}PASS${NC}"
FAIL="${RED}FAIL${NC}"
WARN="${YELLOW}WARN${NC}"
SKIP="${CYAN}SKIP${NC}"

# ─── Detect changed files from pre-push hook stdin ───────────────────────────
CHANGED_FILES=""
while read -r local_ref local_oid remote_ref remote_oid; do
    if [ "$remote_oid" = "0000000000000000000000000000000000000000" ]; then
        # New branch: compare against remote main
        RANGE="origin/main..${local_oid}"
    elif [ "$local_oid" = "0000000000000000000000000000000000000000" ]; then
        # Deleting branch: skip checks
        exit 0
    else
        RANGE="${remote_oid}..${local_oid}"
    fi
    FILES="$(git diff --name-only "$RANGE" 2>/dev/null || git diff --name-only "origin/main..HEAD")"
    CHANGED_FILES="${CHANGED_FILES}${FILES}"$'\n'
done

# Fallback: if stdin was empty (manual invocation), diff against origin/main
if [ -z "$CHANGED_FILES" ]; then
    CHANGED_FILES="$(git diff --name-only origin/main..HEAD 2>/dev/null || echo "")"
fi

# ─── Determine what to check ─────────────────────────────────────────────────
RUN_BACKEND=false
RUN_FRONTEND=false

if echo "$CHANGED_FILES" | grep -q '^src/backend/' || echo "$CHANGED_FILES" | grep -q '^tests/backend/'; then
    RUN_BACKEND=true
fi
if echo "$CHANGED_FILES" | grep -q '^src/dashboard/'; then
    RUN_FRONTEND=true
fi

# Override with environment variables
[ "${NO_BACKEND:-}" = "1" ] && RUN_BACKEND=false
[ "${NO_FRONTEND:-}" = "1" ] && RUN_FRONTEND=false

if [ "$RUN_BACKEND" = false ] && [ "$RUN_FRONTEND" = false ]; then
    echo -e "\n${CYAN}━━━ Pre-Push Verification ━━━${NC}\n"
    echo -e "  No backend/frontend changes detected. ${GREEN}Skipping checks.${NC}\n"
    exit 0
fi

QUICK="${QUICK_PUSH:-0}"

echo -e "\n${BOLD}${CYAN}━━━ Pre-Push Verification ━━━${NC}\n"
[ "$QUICK" = "1" ] && echo -e "  ${YELLOW}QUICK mode: test & build skipped${NC}\n"

# ─── Check runner functions ──────────────────────────────────────────────────

run_check() {
    local name="$1"
    local cmd="$2"
    local blocking="$3"  # "block" or "warn"
    local outfile="$TMPDIR_BASE/${name}.log"

    if eval "$cmd" > "$outfile" 2>&1; then
        echo "PASS" > "$TMPDIR_BASE/${name}.status"
    else
        if [ "$blocking" = "block" ]; then
            echo "FAIL" > "$TMPDIR_BASE/${name}.status"
        else
            echo "WARN" > "$TMPDIR_BASE/${name}.status"
        fi
    fi
}

# ─── Backend checks ─────────────────────────────────────────────────────────

run_backend() {
    local result_file="$TMPDIR_BASE/backend.result"
    echo "0" > "$result_file"

    if [ "$RUN_BACKEND" = false ]; then
        return 0
    fi

    cd "$REPO_ROOT/src/backend"

    # Ruff lint
    run_check "ruff-lint" "uv run ruff check ." "block"

    # Ruff format
    run_check "ruff-format" "uv run ruff format --check ." "block"

    # MyPy (non-blocking, mirrors CI's || true)
    run_check "mypy" "uv run mypy . --ignore-missing-imports --no-error-summary" "warn"

    # Pytest (skip in QUICK mode)
    if [ "$QUICK" != "1" ]; then
        run_check "pytest" "uv run pytest ${REPO_ROOT}/tests/backend --tb=short -q" "block"
    fi

    # Check for failures
    local has_failure=0
    for check in ruff-lint ruff-format; do
        [ -f "$TMPDIR_BASE/${check}.status" ] && [ "$(cat "$TMPDIR_BASE/${check}.status")" = "FAIL" ] && has_failure=1
    done
    if [ "$QUICK" != "1" ] && [ -f "$TMPDIR_BASE/pytest.status" ] && [ "$(cat "$TMPDIR_BASE/pytest.status")" = "FAIL" ]; then
        has_failure=1
    fi

    echo "$has_failure" > "$result_file"
}

# ─── Frontend checks ────────────────────────────────────────────────────────

run_frontend() {
    local result_file="$TMPDIR_BASE/frontend.result"
    echo "0" > "$result_file"

    if [ "$RUN_FRONTEND" = false ]; then
        return 0
    fi

    cd "$REPO_ROOT/src/dashboard"

    # ESLint
    run_check "eslint" "npm run lint" "block"

    # TypeScript
    run_check "tsc" "npx tsc --noEmit" "block"

    # Vitest (skip in QUICK mode)
    if [ "$QUICK" != "1" ]; then
        run_check "vitest" "npx vitest run" "block"
    fi

    # Build (skip in QUICK mode)
    if [ "$QUICK" != "1" ]; then
        run_check "build" "npm run build" "block"
    fi

    # Check for failures
    local has_failure=0
    for check in eslint tsc; do
        [ -f "$TMPDIR_BASE/${check}.status" ] && [ "$(cat "$TMPDIR_BASE/${check}.status")" = "FAIL" ] && has_failure=1
    done
    if [ "$QUICK" != "1" ]; then
        for check in vitest build; do
            [ -f "$TMPDIR_BASE/${check}.status" ] && [ "$(cat "$TMPDIR_BASE/${check}.status")" = "FAIL" ] && has_failure=1
        done
    fi

    echo "$has_failure" > "$result_file"
}

# ─── Run checks in parallel ─────────────────────────────────────────────────

run_backend &
BACKEND_PID=$!

run_frontend &
FRONTEND_PID=$!

wait $BACKEND_PID 2>/dev/null || true
wait $FRONTEND_PID 2>/dev/null || true

# ─── Print results ───────────────────────────────────────────────────────────

print_status() {
    local name="$1"
    local label="$2"
    local status_file="$TMPDIR_BASE/${name}.status"

    if [ ! -f "$status_file" ]; then
        printf "  ${SKIP}  %-20s (skipped)\n" "$label"
        return
    fi

    local status
    status=$(cat "$status_file")
    case "$status" in
        PASS) printf "  ${PASS}  %s\n" "$label" ;;
        FAIL) printf "  ${FAIL}  %s\n" "$label" ;;
        WARN) printf "  ${WARN}  %s (non-blocking)\n" "$label" ;;
    esac
}

HAS_FAILURE=0

if [ "$RUN_BACKEND" = true ]; then
    echo -e "  ${BOLD}Backend${NC}"
    print_status "ruff-lint"   "ruff-lint"
    print_status "ruff-format" "ruff-format"
    print_status "mypy"        "mypy"
    if [ "$QUICK" != "1" ]; then
        print_status "pytest" "pytest"
    else
        printf "  ${SKIP}  %-20s (quick mode)\n" "pytest"
    fi
    echo ""

    [ -f "$TMPDIR_BASE/backend.result" ] && [ "$(cat "$TMPDIR_BASE/backend.result")" = "1" ] && HAS_FAILURE=1
fi

if [ "$RUN_FRONTEND" = true ]; then
    echo -e "  ${BOLD}Frontend${NC}"
    print_status "eslint" "eslint"
    print_status "tsc"    "tsc"
    if [ "$QUICK" != "1" ]; then
        print_status "vitest" "vitest"
        print_status "build"  "build"
    else
        printf "  ${SKIP}  %-20s (quick mode)\n" "vitest"
        printf "  ${SKIP}  %-20s (quick mode)\n" "build"
    fi
    echo ""

    [ -f "$TMPDIR_BASE/frontend.result" ] && [ "$(cat "$TMPDIR_BASE/frontend.result")" = "1" ] && HAS_FAILURE=1
fi

# ─── Final verdict ───────────────────────────────────────────────────────────

if [ "$HAS_FAILURE" = "1" ]; then
    echo -e "${RED}${BOLD}━━━ PUSH BLOCKED ━━━${NC}\n"

    # Print failed check details
    for check in ruff-lint ruff-format pytest eslint tsc vitest build; do
        if [ -f "$TMPDIR_BASE/${check}.status" ] && [ "$(cat "$TMPDIR_BASE/${check}.status")" = "FAIL" ]; then
            echo -e "${RED}--- ${check} errors ---${NC}"
            cat "$TMPDIR_BASE/${check}.log" | tail -30
            echo ""
        fi
    done

    echo -e "  ${YELLOW}Bypass: git push --no-verify${NC}"
    echo -e "  ${YELLOW}Quick:  QUICK_PUSH=1 git push${NC}\n"
    exit 1
else
    echo -e "${GREEN}${BOLD}━━━ ALL CHECKS PASSED ━━━${NC}\n"
    exit 0
fi
