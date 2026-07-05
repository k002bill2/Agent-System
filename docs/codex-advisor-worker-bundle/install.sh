#!/usr/bin/env bash
#
# 조언자-작업자-Codex 검증 번들 · 프로젝트별 설치기
# - 현재 프로젝트의 .claude/CLAUDE.md 및 .claude/agents/{architect,worker,analyzer}.md 생성
# - 현재 프로젝트의 .codex/config.toml 검증 기본값 템플릿 생성(없을 때만)
# - 기존 프로젝트 파일은 덮어쓰기 전 백업
# - --dry-run 또는 --diff 로 기존 파일 대비 변경 내용을 확인
# - Codex CLI 전역 설치는 기본으로 하지 않으며, --install-codex-cli 지정 시에만 시도
#
# 사용법:
#   bash docs/codex-advisor-worker-bundle/install.sh
#   bash docs/codex-advisor-worker-bundle/install.sh --project /path/to/project
#   bash docs/codex-advisor-worker-bundle/install.sh --project /path/to/project --dry-run
#   bash docs/codex-advisor-worker-bundle/install.sh --project /path/to/project --diff --yes
#   bash install.sh --project /path/to/project --install-codex-cli
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR=""
INSTALL_CODEX_CLI=0
DRY_RUN=0
SHOW_DIFF=0
ASSUME_YES=0
BACKUP_SUFFIX="$(date +%Y%m%d%H%M%S)"

usage() {
  cat <<'USAGE'
사용법:
  bash install.sh [--project PROJECT_DIR] [--dry-run] [--diff] [--yes] [--install-codex-cli]

옵션:
  --project DIR          설치 대상 프로젝트 루트. 생략하면 현재 작업 디렉터리를 사용한다.
                         단, 스크립트를 docs/codex-advisor-worker-bundle 안에서 직접 실행하면
                         자동으로 docs의 부모 디렉터리를 프로젝트 루트로 사용한다.
  --install-codex-cli    Codex CLI가 없을 때 npm install -g @openai/codex 를 시도한다.
                         기본값은 설치하지 않고 안내만 출력한다.
  --dry-run              생성/갱신 예정 파일의 diff를 출력하고 실제 파일은 쓰지 않는다.
  --diff                 기존 파일 대비 diff를 출력한 뒤 적용한다. 기존 파일 변경은 확인을 요구한다.
  --yes                  --diff 모드의 확인 질문을 자동 승인한다. 비대화형 환경에서 필요하다.
  -h, --help             도움말을 출력한다.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project)
      if [ "$#" -lt 2 ]; then
        echo "오류: --project 뒤에 경로가 필요합니다." >&2
        exit 2
      fi
      PROJECT_DIR="$2"
      shift 2
      ;;
    --install-codex-cli)
      INSTALL_CODEX_CLI=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      SHOW_DIFF=1
      shift
      ;;
    --diff)
      SHOW_DIFF=1
      shift
      ;;
    --yes)
      ASSUME_YES=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "오류: 알 수 없는 옵션입니다: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "${PROJECT_DIR}" ]; then
  if [ "$(basename "${SCRIPT_DIR}")" = "codex-advisor-worker-bundle" ] &&
     [ "$(basename "$(dirname "${SCRIPT_DIR}")")" = "docs" ] &&
     [ "${PWD}" = "${SCRIPT_DIR}" ]; then
    PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
  else
    PROJECT_DIR="${PWD}"
  fi
fi

PROJECT_DIR="$(cd "${PROJECT_DIR}" && pwd)"
CLAUDE_DIR="${PROJECT_DIR}/.claude"
AGENTS_DIR="${CLAUDE_DIR}/agents"
CODEX_DIR="${PROJECT_DIR}/.codex"

confirm_action() {
  local target="$1"
  if [ "${ASSUME_YES}" -eq 1 ]; then
    return 0
  fi

  if [ ! -t 0 ]; then
    echo "오류: 비대화형 환경에서 ${target} 변경 확인이 필요합니다. 적용하려면 --yes 를 함께 사용하세요." >&2
    return 2
  fi

  local answer
  printf "  적용할까요? %s [y/N] " "${target}"
  read -r answer
  case "${answer}" in
    y|Y|yes|YES)
      return 0
      ;;
    *)
      echo "  건너뜀: ${target}"
      return 1
      ;;
  esac
}

backup_if_exists() {
  local target="$1"
  if [ -e "${target}" ]; then
    local backup="${target}.backup-${BACKUP_SUFFIX}"
    cp -p "${target}" "${backup}"
    echo "  기존 파일 백업: ${backup}"
  fi
}

write_file() {
  local target="$1"
  local tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/codex-advisor-install.XXXXXX")"
  cat > "${tmp}"

  if [ -e "${target}" ] && cmp -s "${target}" "${tmp}"; then
    echo "  변경 없음: ${target}"
    rm -f "${tmp}"
    return 0
  fi

  if [ "${SHOW_DIFF}" -eq 1 ]; then
    echo "  diff 확인: ${target}"
    if [ -e "${target}" ]; then
      diff -u "${target}" "${tmp}" || true
    else
      diff -u /dev/null "${tmp}" || true
    fi
  fi

  if [ "${DRY_RUN}" -eq 1 ]; then
    echo "  dry-run: 작성하지 않음: ${target}"
    rm -f "${tmp}"
    return 0
  fi

  if [ "${SHOW_DIFF}" -eq 1 ] && [ -e "${target}" ]; then
    local confirm_status
    if confirm_action "${target}"; then
      confirm_status=0
    else
      confirm_status="$?"
    fi
    if [ "${confirm_status}" -ne 0 ]; then
      rm -f "${tmp}"
      if [ "${confirm_status}" -eq 2 ]; then
        exit 3
      fi
      return 0
    fi
  fi

  backup_if_exists "${target}"
  mkdir -p "$(dirname "${target}")"
  mv "${tmp}" "${target}"
  chmod 0644 "${target}"
  echo "  작성 완료: ${target}"
}

echo "▶ 설치 대상 프로젝트: ${PROJECT_DIR}"
if [ "${DRY_RUN}" -eq 1 ]; then
  echo "▶ dry-run 모드: 파일과 디렉터리를 생성하지 않습니다."
else
  mkdir -p "${AGENTS_DIR}" "${CODEX_DIR}"
fi

echo "▶ 프로젝트 .claude/CLAUDE.md 작성"
write_file "${CLAUDE_DIR}/CLAUDE.md" <<'CLAUDEMD'
# 프로젝트 작업 원칙

> 이 파일은 현재 프로젝트의 `./.claude/CLAUDE.md` 이다. 전역 `~/.claude/CLAUDE.md`를 바꾸지 않는다.
> 이 지침은 프로젝트 컨텍스트이며, 모델 고정은 `./.claude/agents/` 서브에이전트의 `model:` 필드가 담당한다.
> 검증은 Codex 플러그인이 담당한다.

## 핵심: 조언자-작업자-검증 (Advisor-Worker-Codex)
- 조언자(Advisor · 상위 모델 Fable 5): 설계·판단·위임·최종 결정. 직접 코딩하지 않는다.
- 작업자(Worker · Opus): 조언자의 브리프대로 구현·테스트만. 범위 확장·무한 리팩터링 금지.
- 검증(Codex): 작업자 결과는 조언자가 직접 보지 않고 Codex 리뷰로 검증한다.
  - 표준 검증: `/codex:review`
  - 설계·트레이드오프 도전: `/codex:adversarial-review`
- 저렴한 모델은 스스로 멈추지 못하므로, 조언자가 완료 기준·시도 상한을 주고 Codex 검증으로 관문을 만든다.

## 검증은 무조건
작업자의 "완료" 보고를 그대로 믿지 않는다. `/codex:review` 또는 `/codex:adversarial-review`를 실행해
diff를 실제로 검토한 뒤, 조언자가 지적사항 반영을 지시하고 통과했을 때만 승인한다.

## 작업 순서 기본형
1. `architect`(조언자) - 설계 + 브리프(완료 기준·검증 방법·시도 상한)
2. `worker`(작업자·Opus) - 구현 + diff/테스트 보고
3. Codex 검증 - `/codex:review` (설계 도전 필요 시 `/codex:adversarial-review`)
4. 조언자 - Codex 지적 반영 지시 -> 통과 시 승인

## 운용 모드
- 모드 A(기본): 메인 세션 = 조언자(Fable 5). 구현은 `worker`(Opus), 검증은 `/codex:review`.
- 모드 B(비용 최소): 메인은 Sonnet. 설계는 `architect` 버스트(Fable 5), 구현은 `worker`(Opus), 검증은 Codex.
- 자동 검증은 필요한 프로젝트에서만 켠다: `/codex:setup --enable-review-gate`

## 모델 폴백
어드바이저는 `fable` 별칭을 쓴다. 한도 소진 또는 접근 문제가 있으면 세션에서 `/model opus`로 전환하거나,
프로젝트/셸 환경에서 사용 가능한 모델 별칭으로 `architect`의 `model:` 값을 조정한다.

## Reasoning effort
- Claude 기본은 high 권장. `xhigh`/`max`는 아키텍처급 판단에만 쓴다.
- Codex 검증 effort는 프로젝트 `./.codex/config.toml`의 `model_reasoning_effort`로 조절한다.
  프로젝트 설정은 Codex가 해당 프로젝트를 trusted로 인식할 때 반영된다.

## 토큰 무거운 작업은 분리
코드베이스 분석·긴 로그·대량 요약은 `analyzer`(Haiku)에 먼저 위임하고 압축 결론만 넘긴다.
규모가 큰 구현·버그 조사는 `/codex:rescue`로 Codex에 위임할 수 있다.

## 출력 규약
요약 -> 근거 -> 주의/가정 -> 다음 단계. 근거 수준 L1/L2/L3, 불확실성 High/Medium/Low 표시.
CLAUDEMD

echo "▶ 프로젝트 .claude/agents/architect.md 작성"
write_file "${AGENTS_DIR}/architect.md" <<'ARCHMD'
---
name: architect
description: 설계, 아키텍처 결정, 기술 선택, 트레이드오프 분석, 작업 위임 설계에 사용한다. 코드를 직접 작성하지 않고 계획·판단·위임 지시만 산출한다. 새 기능·모듈 시작, 리팩터링 방향 결정, ADR 작성 시 선제적으로 사용한다.
tools: Read, Grep, Glob, WebSearch, WebFetch
model: fable
---

너는 이 프로젝트의 조언자(Advisor) 설계 역할이다. 구현이 아니라 판단·설계, 그리고 작업 위임 설계를 한다.

원칙:
- 요구사항을 먼저 명확히 한다. 애매하면 가정을 명시하고 진행한다.
- 2~3개의 대안 경로를 비교하고 트레이드오프를 표로 제시한다.
- 결정에는 근거·리스크·되돌리기 비용을 함께 적는다.
- 코드는 필요한 최소한의 스켈레톤/인터페이스만. 전체 구현은 작업자(`worker`)에게 넘긴다.
- 브리프에는 완료 기준 + 검증 방법 + 시도 상한을 반드시 포함한다.
- 검증은 Codex가 실행하므로 무엇을 통과해야 하는지 명시한다(예: `/codex:review` 무결점, 지정 테스트 통과).
- 근거 수준(L1/L2/L3)과 불확실성(High/Medium/Low)을 표시한다.

산출물 형식: 요약 -> 대안 비교 -> 권고안 -> 리스크·가정 -> 작업자 브리프(명세 + 완료 기준 + 검증 방법 + 시도 상한).
ARCHMD

echo "▶ 프로젝트 .claude/agents/worker.md 작성"
write_file "${AGENTS_DIR}/worker.md" <<'WORKERMD'
---
name: worker
description: 조언자가 작성한 브리프를 바탕으로 실제 코드를 구현·테스트한다. 기능 구현, 반복 수정, 버그 픽스에 사용한다. 아키텍처 결정은 하지 않고 주어진 명세·완료 기준대로만 작업한다.
tools: Read, Write, Edit, Grep, Glob, Bash
model: opus
---

# 워커(Worker) 에이전트 지침
너는 조언자(Advisor)가 작성한 브리프를 바탕으로 실제 코드를 구현하고 테스트하는 작업자다.

## 핵심 규칙
1. 조언자가 설계한 아키텍처와 명세서를 엄격하게 준수하여 코드를 작성한다.
2. 임의로 구조를 변경하거나 불필요한 리팩터링을 스스로 진행하지 않는다.
3. 작업이 완료되면 조언자에게 보고한다. 검증은 조언자가 Codex(`/codex:review`)로 실행하므로 스스로 "완료"로 확정하지 않는다.

## 작업 원칙
- 브리프의 완료 기준까지만 작업한다. 범위 확장 금지.
- 방향·기준이 불명확하면 추측하지 말고 멈추고 조언자에게 확인한다.
- 기존 코드 컨벤션과 패턴을 따른다. 작은 단위로 구현하고 테스트·실행으로 스스로 1차 검증한다.
- 정해진 시도 횟수 안에 해결이 안 되면 억지로 끌지 말고 막힌 지점을 보고하고 멈춘다.

## 완료 보고 형식
변경 파일 목록 + diff 요약 + 실행/테스트 결과만 전달한다(원본 전체 덤프 금지).
조언자가 이 diff를 Codex 리뷰(`/codex:review`)로 검증한다는 것을 전제로 정직하게 보고한다.

참고: 대규모 자동 구현·버그 조사는 `/codex:rescue`로 Codex에 위임 가능.
WORKERMD

echo "▶ 프로젝트 .claude/agents/analyzer.md 작성"
write_file "${AGENTS_DIR}/analyzer.md" <<'ANALYZERMD'
---
name: analyzer
description: 토큰이 많이 드는 조사 작업 전담. 전체 코드베이스 탐색, 긴 로그·스택트레이스 분석, 대량 문서·파일 요약에 사용한다. 원문을 삼키고 압축된 결론만 반환해 상위 모델의 컨텍스트를 아낀다.
tools: Read, Grep, Glob, Bash
model: haiku
---

너는 조사·요약 담당이다. 대량 입력을 처리하고 핵심만 압축해 돌려준다.

원칙:
- 원문을 그대로 옮기지 않는다. 사실·수치·위치(파일:라인)만 추린다.
- 결론 -> 근거(위치) -> 불확실한 부분 순으로 짧게 보고한다.
- 판단이나 설계는 하지 않는다. 관찰만 전달한다.

참고: 분석 대상이 매우 크거나 정밀도가 중요하면 `model: sonnet`으로 올린다.
ANALYZERMD

if [ -f "${AGENTS_DIR}/reviewer.md" ]; then
  disabled_reviewer="${AGENTS_DIR}/reviewer.md.disabled-${BACKUP_SUFFIX}"
  echo "▶ 프로젝트 구버전 reviewer.md 비활성화 예정: ${disabled_reviewer}"
  if [ "${DRY_RUN}" -eq 1 ]; then
    echo "  dry-run: 비활성화하지 않음"
  else
    if [ "${SHOW_DIFF}" -eq 0 ]; then
      backup_if_exists "${AGENTS_DIR}/reviewer.md"
      mv "${AGENTS_DIR}/reviewer.md" "${disabled_reviewer}"
      echo "  비활성화 완료: ${disabled_reviewer}"
    else
      if confirm_action "${AGENTS_DIR}/reviewer.md 비활성화"; then
        confirm_status=0
      else
        confirm_status="$?"
      fi
      if [ "${confirm_status}" -eq 0 ]; then
        backup_if_exists "${AGENTS_DIR}/reviewer.md"
        mv "${AGENTS_DIR}/reviewer.md" "${disabled_reviewer}"
        echo "  비활성화 완료: ${disabled_reviewer}"
      elif [ "${confirm_status}" -eq 2 ]; then
        exit 3
      fi
    fi
  fi
fi

echo "▶ Node.js 확인"
if command -v node >/dev/null 2>&1; then
  echo "  node $(node -v)"
else
  echo "  경고: Node.js 18.18+ 가 필요합니다. Codex 플러그인 사용 전 설치하세요."
fi

echo "▶ Codex CLI 확인"
if command -v codex >/dev/null 2>&1; then
  echo "  codex 설치됨: $(codex --version 2>/dev/null || echo ok)"
else
  if [ "${INSTALL_CODEX_CLI}" -eq 1 ]; then
    if command -v npm >/dev/null 2>&1; then
      echo "  Codex 미설치 -> npm install -g @openai/codex 시도"
      npm install -g @openai/codex || echo "  경고: 자동 설치 실패. 수동: npm install -g @openai/codex"
    else
      echo "  경고: npm 이 없어 Codex를 설치할 수 없습니다. 수동: npm install -g @openai/codex"
    fi
  else
    echo "  Codex 미설치. 전역 설치를 원하면 다시 실행: bash install.sh --install-codex-cli"
    echo "  또는 수동 설치: npm install -g @openai/codex"
  fi
fi

echo "▶ 프로젝트 .codex/config.toml 검증 기본값 템플릿"
if [ ! -f "${CODEX_DIR}/config.toml" ]; then
  write_file "${CODEX_DIR}/config.toml" <<'CODEXCFG'
# Codex 검증 기본값 (프로젝트 범위)
# 프로젝트 설정은 Codex가 이 프로젝트를 trusted로 인식할 때 반영된다.
# model = "gpt-5.4-mini"
model_reasoning_effort = "high"
CODEXCFG
else
  echo "  이미 존재 -> 건드리지 않음: ${CODEX_DIR}/config.toml"
fi

cat <<DONE

────────────────────────────────────────────────────────────
프로젝트별 설치 완료.

설치 대상:
  ${PROJECT_DIR}

생성/갱신:
  .claude/CLAUDE.md
  .claude/agents/architect.md
  .claude/agents/worker.md
  .claude/agents/analyzer.md
  .codex/config.toml (없을 때만)

이제 이 프로젝트의 Claude Code 세션 안에서 필요 시 실행하세요.

  /plugin marketplace add openai/codex-plugin-cc
  /plugin install codex@openai-codex
  /reload-plugins
  /codex:setup
  !codex login

확인:
  /agents   -> architect, worker, analyzer, codex:codex-rescue 표시
  /model    -> 사용 가능한 별칭 확인

검증 실행:
  /codex:review
  /codex:adversarial-review
  /codex:review --background
────────────────────────────────────────────────────────────
DONE
