#!/usr/bin/env bash
# gemini-review.sh — Maker-Checker Pipeline
# Claude(Maker)의 Edit/Write 후 Gemini(Checker)가 자동 리뷰
# PostToolUse 훅에서 호출됨. stdin으로 도구 이벤트 JSON 수신.
#
# 동작 흐름:
#   1. stdin에서 file_path 추출
#   2. 코드 파일만 필터링 (.py, .ts, .tsx, .js, .jsx)
#   3. 쿨다운 체크 (동일 파일 60초 내 재리뷰 방지)
#   4. git diff 추출 (unstaged → staged → HEAD)
#   5. Gemini CLI로 리뷰 요청
#   6. 결과를 stdout으로 출력 (Claude 컨텍스트에 주입)

set -euo pipefail

# ── Config ──────────────────────────────────────
# 타임아웃은 훅 설정(settings.local.json)에서 제어 (40s)
COOLDOWN_SECONDS=60        # 동일 파일 재리뷰 방지 (초)
COOLDOWN_DIR="/tmp/gemini-review-cooldown"
MIN_DIFF_LINES=3           # 이보다 적은 변경은 스킵
MAX_RETRIES=3              # 동일 파일 needs-attention 최대 횟수
RETRY_DIR="/tmp/gemini-review-retries"
MAX_FILE_SIZE_KB=500       # 이보다 큰 파일은 스킵

# ── 1. stdin에서 file_path 추출 ─────────────────
INPUT=$(cat 2>/dev/null) || exit 0

FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except Exception:
    print('')
" 2>/dev/null) || exit 0

[[ -z "$FILE_PATH" ]] && exit 0

# ── 2. 코드 파일만 리뷰 ────────────────────────
case "${FILE_PATH##*.}" in
    py|ts|tsx|js|jsx) ;;
    *) exit 0 ;;
esac

# ── 2.5 대용량/자동생성 파일 스킵 ─────────────────
if [[ -f "$FILE_PATH" ]]; then
    FILE_SIZE_KB=$(du -k "$FILE_PATH" 2>/dev/null | cut -f1)
    if (( FILE_SIZE_KB > MAX_FILE_SIZE_KB )); then
        exit 0
    fi
fi

case "$FILE_PATH" in
    */node_modules/*|*/dist/*|*/.next/*|*/build/*|*/__pycache__/*) exit 0 ;;
    *.min.js|*.min.css|*-lock.json|*.lock) exit 0 ;;
    */vendor/*|*/generated/*|*_generated.*) exit 0 ;;
esac

# ── 3. 쿨다운 체크 ─────────────────────────────
mkdir -p "$COOLDOWN_DIR" 2>/dev/null || true
# macOS: md5, Linux: md5sum
HASH=$(echo -n "$FILE_PATH" | md5 2>/dev/null || echo -n "$FILE_PATH" | md5sum 2>/dev/null | cut -d' ' -f1)
COOLDOWN_FILE="$COOLDOWN_DIR/$HASH"

if [[ -f "$COOLDOWN_FILE" ]]; then
    LAST_REVIEW=$(cat "$COOLDOWN_FILE" 2>/dev/null || echo "0")
    NOW=$(date +%s)
    if (( NOW - LAST_REVIEW < COOLDOWN_SECONDS )); then
        exit 0
    fi
fi

# ── 3.5 Retry 체크 (무한 리뷰-수정 루프 방지) ────
mkdir -p "$RETRY_DIR" 2>/dev/null || true
RETRY_FILE="$RETRY_DIR/$HASH"

if [[ -f "$RETRY_FILE" ]]; then
    RETRY_COUNT=$(cat "$RETRY_FILE" 2>/dev/null || echo "0")
    if (( RETRY_COUNT >= MAX_RETRIES )); then
        BASENAME=$(basename "$FILE_PATH")
        echo ""
        echo "GEMINI DEADLOCK PREVENTION [$BASENAME]"
        echo "이 파일은 ${MAX_RETRIES}회 연속 needs-attention 판정을 받았습니다."
        echo "자동 리뷰를 중단합니다. 사람에게 확인을 요청하세요."
        echo "ACTION REQUIRED: 이 파일의 변경사항을 직접 검토해주세요."
        exit 0
    fi
fi

# ── 4. diff 추출 (tracked → staged → HEAD → new file) ──
DIFF=$(git diff -- "$FILE_PATH" 2>/dev/null || true)
[[ -z "$DIFF" ]] && DIFF=$(git diff --cached -- "$FILE_PATH" 2>/dev/null || true)
[[ -z "$DIFF" ]] && DIFF=$(git diff HEAD -- "$FILE_PATH" 2>/dev/null || true)

# 새 파일(untracked): diff 대신 파일 내용을 리뷰 (크기 적응형)
IS_NEW_FILE=false
if [[ -z "$DIFF" && -f "$FILE_PATH" ]]; then
    FILE_LINES=$(wc -l < "$FILE_PATH" 2>/dev/null || echo "0")
    if (( FILE_LINES <= 150 )); then
        CONTENT=$(cat "$FILE_PATH" 2>/dev/null || true)
    else
        CONTENT=$(head -80 "$FILE_PATH" 2>/dev/null || true)
        CONTENT="${CONTENT}
... (${FILE_LINES} lines total, showing first 80) ..."
    fi
    if [[ -n "$CONTENT" ]]; then
        DIFF="[NEW FILE] $FILE_PATH (${FILE_LINES} lines)
$CONTENT"
        IS_NEW_FILE=true
    fi
fi
[[ -z "$DIFF" ]] && exit 0

# 변경량이 너무 적으면 스킵 (새 파일은 라인 수로 체크)
if [[ "$IS_NEW_FILE" == "false" ]]; then
    CHANGED_LINES=$(echo "$DIFF" | grep -c '^[+-]' 2>/dev/null || echo "0")
    if (( CHANGED_LINES < MIN_DIFF_LINES )); then
        exit 0
    fi
fi

# 쿨다운 기록 갱신
date +%s > "$COOLDOWN_FILE" 2>/dev/null || true

# ── 5. Gemini CLI 리뷰 ─────────────────────────
BASENAME=$(basename "$FILE_PATH")
PROMPT="Review this diff. Only flag critical/warning issues (security vulnerabilities, bugs, logic errors, missing error handling). Skip style/formatting.

\`\`\`diff
${DIFF}
\`\`\`

Respond in this exact format:
ISSUES:
- [critical|warning|info] file:line - description

VERDICT: approve | needs-attention
SUMMARY: (1 sentence)"

REVIEW=$(gemini -p "$PROMPT" 2>/dev/null) || {
    echo "Gemini review: failed for $BASENAME"
    exit 0
}

# ── 6. 결과 출력 + 리트라이 카운터 갱신 ──────────
# Gemini 시작 노이즈 제거 (Loaded cached credentials 등)
CLEAN=$(echo "$REVIEW" | sed -n '/^ISSUES\|^VERDICT\|^SUMMARY\|^- \[/p')
if [[ -z "$CLEAN" ]]; then
    # 구조화된 출력이 없으면 전체 출력 (마지막 15줄)
    CLEAN=$(echo "$REVIEW" | tail -15)
fi

# VERDICT 파싱하여 리트라이 카운터 갱신
VERDICT=$(echo "$CLEAN" | grep -i '^VERDICT:' | head -1 | tr '[:upper:]' '[:lower:]')
if echo "$VERDICT" | grep -q 'needs-attention'; then
    # needs-attention: 카운터 증가
    CURRENT=$(cat "$RETRY_FILE" 2>/dev/null || echo "0")
    echo $(( CURRENT + 1 )) > "$RETRY_FILE" 2>/dev/null || true
elif echo "$VERDICT" | grep -q 'approve'; then
    # approve: 카운터 리셋
    rm -f "$RETRY_FILE" 2>/dev/null || true
fi

echo ""
echo "Gemini Checker [$BASENAME]"
echo "$CLEAN"
