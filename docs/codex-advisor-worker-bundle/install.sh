#!/usr/bin/env bash
#
# 조언자–작업자–Codex 검증 번들 · 원샷 설치기
# ─ ~/.claude/CLAUDE.md 의 번들 마커 블록 갱신 (블록 밖 개인 내용은 보존)
# ─ ~/.claude/agents/{architect,worker,analyzer}.md 생성 (내용 동일 시 건너뜀)
# ─ 구버전 reviewer.md 백업 후 제거(검증은 Codex로 대체)
# ─ Node/Codex CLI 확인 및 설치 시도
# ─ ~/.codex/config.toml 검증 기본값 템플릿(없을 때만)
# ─ 마지막에 Claude Code 안에서 실행할 플러그인 명령 안내
#
# 사용법:  bash install.sh
#
set -euo pipefail

CLAUDE_DIR="${HOME}/.claude"
AGENTS_DIR="${CLAUDE_DIR}/agents"
CODEX_DIR="${HOME}/.codex"

# CLAUDE.md 번들 블록 마커 — 이 블록 안만 설치기가 관리한다.
# 개인 추가 내용은 반드시 블록 밖에 작성할 것 (재설치 시 보존됨).
MARK_START='<!-- codex-advisor-worker-bundle:start — 이 블록은 install.sh가 관리. 개인 내용은 블록 밖에 -->'
MARK_END='<!-- codex-advisor-worker-bundle:end -->'

mkdir -p "${AGENTS_DIR}"

# 백업된 파일 경로 누적 (bash 3.2 호환: 배열 대신 개행 구분 문자열)
BACKED_UP=""

# 대상 파일이 존재하고 비어 있지 않으면 <파일>.bak.<UTC타임스탬프> 로 복사 후 진행.
# 존재하지 않거나 0바이트면 백업 없이 진행.
backup_if_exists() {
  target="$1"
  if [ -s "${target}" ]; then
    ts="$(date -u +%Y%m%dT%H%M%SZ)"
    backup="${target}.bak.${ts}"
    cp -p "${target}" "${backup}"
    echo "  ↳ 기존 파일 백업: ${backup}"
    BACKED_UP="${BACKED_UP}${backup}
"
  fi
}

# 새 내용(tmp 파일)이 기존과 동일하면 건너뛰고, 다르면 백업 후 교체.
install_file() {
  target="$1"
  tmpfile="$2"
  if [ -f "${target}" ] && cmp -s "${tmpfile}" "${target}"; then
    echo "  변경 없음 → 건너뜀"
    rm -f "${tmpfile}"
  else
    backup_if_exists "${target}"
    mv "${tmpfile}" "${target}"
    echo "  설치 완료: ${target}"
  fi
}

echo "▶ ~/.claude/CLAUDE.md 번들 블록 갱신"
TMP_BLOCK="$(mktemp)"
cat > "${TMP_BLOCK}" <<'CLAUDEMD'
# 글로벌 작업 원칙 (모든 프로젝트 공통)

> `~/.claude/CLAUDE.md`. 이 지침은 권고(context)이며, 실제 모델 고정은
> `~/.claude/agents/` 서브에이전트의 `model:` 필드로 강제한다. 검증은 Codex 플러그인이 담당한다.

## 핵심: 조언자–작업자–검증 (Advisor–Worker–Codex)
- 조언자(Advisor · 상위 모델 Fable 5): 설계·판단·위임·최종 결정. 직접 코딩하지 않는다.
- 작업자(Worker · Opus): 조언자의 브리프대로 구현·테스트만. 범위 확장·무한 리팩터링 금지.
- 검증(Codex): 작업자 결과는 조언자가 직접 보지 않고 Codex 리뷰로 검증한다.
  - 표준 검증: /codex:review
  - 설계·트레이드오프 도전(적대적 검증): /codex:adversarial-review
- 저렴한 모델은 스스로 멈추지 못하므로, 조언자가 완료 기준·시도 상한을 주고 Codex 검증으로 관문을 만든다.

## 검증은 무조건 (가장 중요)
작업자의 "완료" 보고를 그대로 믿지 않는다. /codex:review(또는 /codex:adversarial-review)를 실행해
diff를 실제로 검토한 뒤, 조언자가 지적사항 반영을 지시하고 통과했을 때만 승인한다.

## 조언자 직접 코딩 금지의 범위
- 구현은 worker 위임이 기본값. "브리프 작성 비용이 구현과 비슷하다"는 위임 회피 사유가 아니다.
- 예외(조언자 직접 처리 허용): 단일 파일이며 30줄 이내의 문서·설정 수정. 예외여도 Codex 검증은 동일하게 적용한다.

## 작업 순서 기본형
1. architect(조언자) — 설계 + 브리프(완료 기준·검증 방법·시도 상한)
2. worker(작업자·Opus) — 구현 + diff/테스트 보고
3. Codex 검증 — /codex:review (설계 도전 필요 시 /codex:adversarial-review)
4. 조언자 — Codex 지적 반영 지시 → 통과 시 승인
5. 조언자 — 승인 후 서브에이전트 정리(TaskStop) — idle 상주 에이전트를 남기지 않는다

worker 보고 수신: 가능하면 동기 실행으로 결과를 직접 받는다. 백그라운드 실행 시 완료 보고
텍스트가 조언자에게 전달되지 않을 수 있으므로, 보고를 기다리지 말고 산출물(staged diff·테스트
실행)을 직접 검증한다.

## 운용 모드
- 모드 A(기본): 메인 세션 = 조언자(Fable 5). 구현은 worker(Opus), 검증은 /codex:review.
- 모드 B(비용 최소): 메인은 Sonnet. 설계는 architect 버스트(Fable 5), 구현은 worker(Opus), 검증은 Codex.
- (옵션) 자동 검증: /codex:setup --enable-review-gate — 종료 전 Codex 자동 리뷰. 사용량 소모 큼, 감시하며 사용.

## 모델 폴백 (Fable 한도 소진 → Opus)
어드바이저는 fable 별칭 사용. 소진 시: /model opus (모드 A) 또는 셸에 export ANTHROPIC_DEFAULT_FABLE_MODEL=claude-opus-4-8 (모드 무관).
--fallback-model 은 과부하(503)에만 발동, 한도 소진(429)에는 안 됨.

## Reasoning effort
- Claude 기본 high. Codex 검증 effort는 ~/.codex/config.toml 의 model_reasoning_effort 로 조절(high 권장).

## 토큰 무거운 작업은 분리
코드베이스 분석·긴 로그·대량 요약은 analyzer(Haiku)에 먼저 위임하고 압축 결론만 넘긴다.
규모가 큰 구현·버그 조사는 /codex:rescue 로 Codex에 위임할 수 있다.

## 출력 규약
요약 → 근거 → 주의/가정 → 다음 단계. 근거 수준 L1/L2/L3, 불확실성 High/Medium/Low 표시.
CLAUDEMD

CLAUDE_TARGET="${CLAUDE_DIR}/CLAUDE.md"
# 마커 구조 검증: 정확히 start 1개 + end 1개, start가 end보다 앞이어야 교체 경로 진입.
# 비정상 구조(중복·순서 역전)면 개인 내용 유실 위험이 있으므로 파일을 건드리지 않는다.
N_START=0; N_END=0; LINE_START=0; LINE_END=0
if [ -f "${CLAUDE_TARGET}" ]; then
  N_START="$(grep -cF "${MARK_START}" "${CLAUDE_TARGET}" || true)"
  N_END="$(grep -cF "${MARK_END}" "${CLAUDE_TARGET}" || true)"
  LINE_START="$(grep -nF "${MARK_START}" "${CLAUDE_TARGET}" | head -1 | cut -d: -f1 || true)"
  LINE_END="$(grep -nF "${MARK_END}" "${CLAUDE_TARGET}" | head -1 | cut -d: -f1 || true)"
fi
if [ "${N_START}" -eq 1 ] && [ "${N_END}" -eq 1 ] && [ "${LINE_START}" -lt "${LINE_END}" ]; then
  # 마커 블록만 교체, 블록 밖(개인 내용)은 그대로 보존
  TMP_OUT="$(mktemp)"
  awk -v start="${MARK_START}" -v end="${MARK_END}" -v blockfile="${TMP_BLOCK}" '
    $0 == start { print; while ((getline line < blockfile) > 0) print line; close(blockfile); inblock=1; next }
    $0 == end   { inblock=0; print; next }
    inblock { next }
    { print }
  ' "${CLAUDE_TARGET}" > "${TMP_OUT}"
  # 사후 확인: 교체 결과에 두 마커가 그대로 남아 있어야 한다
  if grep -qF "${MARK_START}" "${TMP_OUT}" && grep -qF "${MARK_END}" "${TMP_OUT}"; then
    install_file "${CLAUDE_TARGET}" "${TMP_OUT}"
  else
    rm -f "${TMP_OUT}"
    echo "  ⚠ 교체 결과 검증 실패 → CLAUDE.md 를 변경하지 않았습니다. 수동 확인 필요."
  fi
elif [ "${N_START}" -gt 0 ] || [ "${N_END}" -gt 0 ]; then
  echo "  ⚠ 마커 구조 비정상(start=${N_START}, end=${N_END}) → CLAUDE.md 를 변경하지 않았습니다."
  echo "    마커가 정확히 1쌍(start가 end보다 앞)이 되도록 수동 정리 후 재실행하세요."
else
  # 마커 없음(최초 설치 또는 구버전) → 백업 후 마커 포함 전체 생성
  backup_if_exists "${CLAUDE_TARGET}"
  {
    echo "${MARK_START}"
    cat "${TMP_BLOCK}"
    echo "${MARK_END}"
  } > "${CLAUDE_TARGET}"
  echo "  전체 생성(마커 포함). 이후 재설치는 마커 블록만 교체하며 블록 밖 내용은 보존됩니다."
  if [ -n "${BACKED_UP}" ]; then
    echo "  ⚠ 기존 파일에 개인 추가 섹션이 있었다면 백업본에서 마커 블록 밖으로 옮겨 두세요."
  fi
fi
rm -f "${TMP_BLOCK}"

echo "▶ ~/.claude/agents/architect.md 작성"
TMP_AGENT="$(mktemp)"
cat > "${TMP_AGENT}" <<'ARCHMD'
---
name: architect
description: 설계, 아키텍처 결정, 기술 선택, 트레이드오프 분석, 작업 위임 설계에 사용(조언자의 설계 역할). 코드를 직접 작성하지 않고 계획·판단·위임 지시만 산출한다. 새 기능·모듈 시작, 리팩터링 방향 결정, ADR 작성 시 선제적으로 사용한다.
tools: Read, Grep, Glob, WebSearch, WebFetch
# 어드바이저 모델. 'fable' 별칭 = Fable 5. 한도 소진 시 env ANTHROPIC_DEFAULT_FABLE_MODEL=claude-opus-4-8 로 Opus 리맵, 또는 /model opus
model: fable
---

너는 조언자(Advisor)의 설계 역할이다. 구현이 아니라 판단·설계, 그리고 작업 위임 설계를 한다.

원칙:
- 요구사항을 먼저 명확히 한다. 애매하면 가정을 명시하고 진행한다.
- 2~3개의 대안 경로를 비교하고 트레이드오프를 표로 제시한다.
- 결정에는 근거·리스크·되돌리기 비용을 함께 적는다.
- 코드는 필요한 최소한의 스켈레톤/인터페이스만. 전체 구현은 작업자(worker)에게 넘긴다.
- 브리프(작업 지시서)에는 완료 기준 + 검증 방법 + 시도 상한을 반드시 포함한다. 검증은 Codex가 실행하므로 무엇을 통과해야 하는지 명시한다(예: /codex:review 무결점, 지정 테스트 통과).
- 근거 수준(L1/L2/L3)과 불확실성(High/Medium/Low)을 표시한다.

산출물 형식: 요약 → 대안 비교 → 권고안 → 리스크·가정 → 작업자 브리프(명세 + 완료 기준 + 검증 방법 + 시도 상한).
ARCHMD
install_file "${AGENTS_DIR}/architect.md" "${TMP_AGENT}"

echo "▶ ~/.claude/agents/worker.md 작성"
TMP_AGENT="$(mktemp)"
cat > "${TMP_AGENT}" <<'WORKERMD'
---
name: worker
description: 조언자가 작성한 브리프(작업 지시서)를 바탕으로 실제 코드를 구현·테스트한다(조언자–작업자 전략의 Worker). 기능 구현, 반복 수정, 버그 픽스에 사용. 아키텍처 결정은 하지 않고 주어진 명세·완료 기준대로만 작업한다.
tools: Read, Write, Edit, Grep, Glob, Bash
# 워커로 사용할 하위 모델을 명시(고정)한다 — 기본: opus(구현 품질) / 비용 우선 시: sonnet
model: opus
---

# 워커(Worker) 에이전트 지침
너는 조언자(Advisor)가 작성한 브리프(작업 지시서)를 바탕으로 실제 코드를 구현하고 테스트하는 작업자다.

## 핵심 규칙
1. 조언자가 설계한 아키텍처와 명세서를 엄격하게 준수하여 코드를 작성한다.
2. 임의로 구조를 변경하거나 불필요한 리팩토링을 스스로 진행하지 않는다.
3. 작업이 완료되면 조언자에게 보고한다. 검증은 조언자가 Codex(/codex:review)로 실행하므로 스스로 "완료"로 확정하지 않는다.

## 작업 원칙
- 브리프의 완료 기준까지만 작업한다. 범위 확장 금지.
- 방향·기준이 불명확하면 추측하지 말고 멈추고 조언자에게 확인한다.
- 기존 코드 컨벤션과 패턴을 따른다. 작은 단위로 구현하고 테스트·실행으로 스스로 1차 검증한다.
- 정해진 시도 횟수 안에 해결이 안 되면 억지로 끌지 말고 막힌 지점을 보고하고 멈춘다.

## 완료 보고 형식
변경 파일 목록 + diff 요약 + 실행/테스트 결과 만 전달한다(원본 전체 덤프 금지).
조언자가 이 diff를 Codex 리뷰(/codex:review)로 검증한다는 것을 전제로 정직하게 보고한다.

참고: 대규모 자동 구현·버그 조사는 /codex:rescue 로 Codex에 위임 가능.
WORKERMD
install_file "${AGENTS_DIR}/worker.md" "${TMP_AGENT}"

echo "▶ ~/.claude/agents/analyzer.md 작성"
TMP_AGENT="$(mktemp)"
cat > "${TMP_AGENT}" <<'ANALYZERMD'
---
name: analyzer
description: 토큰이 많이 드는 조사 작업 전담. 전체 코드베이스 탐색, 긴 로그·스택트레이스 분석, 대량 문서·파일 요약에 사용. 원문을 삼키고 압축된 결론만 반환해 상위 모델의 컨텍스트를 아낀다.
tools: Read, Grep, Glob, Bash
model: haiku
---

너는 조사·요약 담당이다. 대량 입력을 처리하고 핵심만 압축해 돌려준다.

원칙:
- 원문을 그대로 옮기지 않는다. 사실·수치·위치(파일:라인)만 추린다.
- 결론 → 근거(위치) → 불확실한 부분 순으로 짧게 보고한다.
- 판단이나 설계는 하지 않는다. 관찰만 전달한다.

참고: 분석 대상이 매우 크거나 정밀도가 중요하면 model: sonnet 으로 올린다.
ANALYZERMD
install_file "${AGENTS_DIR}/analyzer.md" "${TMP_AGENT}"

# 구버전 reviewer.md 백업 후 제거 (검증은 Codex로 대체)
if [ -f "${AGENTS_DIR}/reviewer.md" ]; then
  backup_if_exists "${AGENTS_DIR}/reviewer.md"
  rm -f "${AGENTS_DIR}/reviewer.md"
  echo "▶ 구버전 reviewer.md 백업 후 제거 (검증은 Codex로 대체)"
fi

echo "▶ Node.js 확인"
if command -v node >/dev/null 2>&1; then
  echo "  node $(node -v)"
else
  echo "  ⚠ Node.js 18.18+ 가 필요합니다. 설치 후 Codex를 사용하세요."
fi

echo "▶ Codex CLI 확인"
if command -v codex >/dev/null 2>&1; then
  echo "  codex 설치됨: $(codex --version 2>/dev/null || echo ok)"
else
  if command -v npm >/dev/null 2>&1; then
    echo "  Codex 미설치 → npm install -g @openai/codex 시도"
    npm install -g @openai/codex || echo "  ⚠ 자동 설치 실패. 수동: npm install -g @openai/codex"
  else
    echo "  ⚠ npm 이 없어 Codex를 설치할 수 없습니다. 수동: npm install -g @openai/codex"
  fi
fi

echo "▶ ~/.codex/config.toml 검증 기본값 템플릿"
mkdir -p "${CODEX_DIR}"
if [ ! -f "${CODEX_DIR}/config.toml" ]; then
  cat > "${CODEX_DIR}/config.toml" <<'CODEXCFG'
# Codex 검증 기본값 (원하는 값으로 조정)
# model = "gpt-5.5"             # 리뷰 모델 명시 예시 (미지정 시 CLI 기본값 사용)
model_reasoning_effort = "high"
CODEXCFG
  echo "  생성 완료: ${CODEX_DIR}/config.toml"
else
  echo "  이미 존재 → 건드리지 않음"
fi

cat <<'DONE'

────────────────────────────────────────────────────────────
파일 설치 완료.  이제 Claude Code 세션 안에서 아래를 실행하세요.
(플러그인 설치는 세션 내 슬래시 명령이라 스크립트로는 불가합니다)

  /plugin marketplace add openai/codex-plugin-cc
  /plugin install codex@openai-codex
  /reload-plugins
  /codex:setup          # Codex 설치/로그인 상태 확인
  !codex login          # 로그인 안 돼 있으면

확인:
  /agents   → architect, worker, analyzer, codex:codex-rescue 표시
  /model    → 사용 가능한 별칭 확인 (architect는 fable 별칭 사용)

폴백 (Fable 한도 소진 시 Opus):
  /model opus                                            # 모드 A: 즉석 전환
  export ANTHROPIC_DEFAULT_FABLE_MODEL=claude-opus-4-8   # 모드 무관: 셸 프로필에 추가

검증 실행:
  /codex:review                 # 표준 검증
  /codex:adversarial-review     # 설계 도전(적대적) 검증
  /codex:review --background    # 큰 변경은 백그라운드 권장 → /codex:status, /codex:result

참고: ~/.claude/CLAUDE.md 의 개인 추가 내용은 번들 마커 블록 밖에 작성하세요.
      재설치 시 마커 블록 안만 교체되고 밖은 보존됩니다.
────────────────────────────────────────────────────────────
DONE

if [ -n "${BACKED_UP}" ]; then
  echo ""
  echo "백업된 기존 파일:"
  printf '%s' "${BACKED_UP}" | while IFS= read -r line; do
    [ -n "${line}" ] && echo "  - ${line}"
  done
fi
