#!/usr/bin/env bash
# autodev 컨테이너 호스트측 런처. 대상 레포 루트에서 실행한다.
set -euo pipefail

ADDON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(pwd)"
DRY_RUN=0
CONFIG="$REPO_DIR/autodev.config.sh"
SPEC="$REPO_DIR/SPEC.md"
ENV_FILE="$REPO_DIR/.autodev.env"

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)   DRY_RUN=1 ;;
    --config)    [ -n "${2-}" ] || { echo "FATAL: --config 에 경로 인자 필요" >&2; exit 1; }; CONFIG="$2"; shift ;;
    --spec)      [ -n "${2-}" ] || { echo "FATAL: --spec 에 경로 인자 필요" >&2; exit 1; }; SPEC="$2"; shift ;;
    --env-file)  [ -n "${2-}" ] || { echo "FATAL: --env-file 에 경로 인자 필요" >&2; exit 1; }; ENV_FILE="$2"; shift ;;
    *) echo "알 수 없는 인자: $1" >&2; exit 1 ;;
  esac
  shift
done

# --- 사전 점검 ---
[ -d "$REPO_DIR/.git" ] || { echo "FATAL: 현재 디렉토리가 git 레포가 아님"; exit 1; }
[ -f "$CONFIG" ]   || { echo "FATAL: 설정 없음: $CONFIG (autodev.config.sh.example 복사)"; exit 1; }
[ -f "$SPEC" ]     || { echo "FATAL: SPEC 없음: $SPEC (자율 개발 작업 명세 작성)"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "FATAL: env 파일 없음: $ENV_FILE (CLAUDE_CODE_OAUTH_TOKEN, GH_TOKEN)"; exit 1; }

# --- 과금 가드: env 파일에 종량제 키가 있으면 중단 ---
if grep -qE '^[[:space:]]*(export[[:space:]]+)?ANTHROPIC_API_KEY=' "$ENV_FILE"; then
  echo "FATAL: $ENV_FILE 에 ANTHROPIC_API_KEY 가 있음 — 제거하라 (종량제 과금 전환됨)" >&2
  exit 1
fi
if ! grep -qE '^[[:space:]]*(export[[:space:]]+)?CLAUDE_CODE_OAUTH_TOKEN=' "$ENV_FILE"; then
  echo "FATAL: $ENV_FILE 에 CLAUDE_CODE_OAUTH_TOKEN 이 없음 (claude setup-token 으로 발급)" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$CONFIG"
: "${RES_MEMORY:=8g}" "${RES_CPUS:=4}" "${RES_PIDS:=512}"

# --- 실행 디렉토리 준비 ---
RUN_DIR="$REPO_DIR/.autodev-runs/$(date -u +%Y%m%d-%H%M%S)-$$"
mkdir -p "$RUN_DIR/logs" "$RUN_DIR/state"
cp "$SPEC" "$RUN_DIR/state/SPEC.md"
cp "$CONFIG" "$RUN_DIR/autodev.config.sh"
echo "실행 디렉토리: $RUN_DIR"

# --- 이미지 빌드 ---
echo "이미지 빌드 중..."
docker build -f "$ADDON_DIR/Dockerfile.autodev" -t autodev:latest "$ADDON_DIR"

# --- 컨테이너 실행 ---
# cap 세트: 방화벽(NET_ADMIN/NET_RAW) + 권한강등 gosu(SETUID/SETGID) +
# 클론 파일 소유권 변경(CHOWN/DAC_OVERRIDE/FOWNER). 위험 cap(SYS_ADMIN 등)은 drop 유지.
echo "컨테이너 실행 중 (dry-run=$DRY_RUN)..."
docker run --rm \
  --name "autodev-$(date -u +%H%M%S)" \
  --env-file "$ENV_FILE" \
  -e AUTODEV_DRY_RUN="$DRY_RUN" \
  --cap-drop ALL \
  --cap-add NET_ADMIN --cap-add NET_RAW \
  --cap-add SETUID --cap-add SETGID --cap-add CHOWN \
  --cap-add DAC_OVERRIDE --cap-add FOWNER \
  --memory "$RES_MEMORY" --cpus "$RES_CPUS" --pids-limit "$RES_PIDS" \
  -v "$REPO_DIR:/host-repo:ro" \
  -v "$RUN_DIR/logs:/workspace/logs" \
  -v "$RUN_DIR/state:/workspace/state" \
  -v "$RUN_DIR/autodev.config.sh:/workspace/autodev.config.sh:ro" \
  autodev:latest

echo "완료. 로그: $RUN_DIR/logs  상태: $RUN_DIR/state"
[ -f "$RUN_DIR/state/COMPLETED" ] && echo "✅ 자율 개발 완료 — PR 확인" \
  || echo "⚠️  완료되지 않음 — $RUN_DIR/state/ 의 BLOCKED/PROGRESS 확인"
