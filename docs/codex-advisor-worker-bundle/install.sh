#!/usr/bin/env bash
#
# 조언자–작업자–Codex 검증 번들 · 원샷 설치기
# ─ ~/.claude/CLAUDE.md 의 번들 마커 블록 갱신 (블록 밖 개인 내용은 보존)
# ─ ~/.claude/agents/{architect,worker,analyzer,researcher}.md 생성 (내용 동일 시 건너뜀)
# ─ 구버전 reviewer.md 백업 후 제거(검증은 Codex로 대체)
# ─ 활성 statusline 스크립트에 컨텍스트 예산 브리지 블록 삽입 (마커 관리·백업, settings.json 무수정)
# ─ GSD 컨텍스트 모니터 훅 버전 대조 (불일치 시 경고만)
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

# statusline 컨텍스트 브리지 마커 — 남의 파일(statusline 스크립트)에 삽입하므로
# 이 블록 안만 설치기가 관리하고, 마커 밖 사용자 커스터마이징은 보존한다.
CTX_MARK_START='# <<< codex-advisor-worker-bundle:ctx-budget:start — install.sh가 관리 -->>>'
CTX_MARK_END='# <<< codex-advisor-worker-bundle:ctx-budget:end -->>>'

# 브리지 값을 읽는 GSD 훅의 핀 버전. 불일치 시 경고만 하고 설치는 계속한다.
GSD_HOOK_PIN='1.26.0'

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

# install_file 과 같지만 mv 대신 리다이렉트로 덮어써 기존 퍼미션·inode 를 보존한다.
# statusline 스크립트는 실행 비트(+x)가 필요하고 mktemp 파일은 0600 이므로 mv 를 쓰면 안 된다.
install_file_preserve_mode() {
  target="$1"
  tmpfile="$2"
  if [ -f "${target}" ] && cmp -s "${tmpfile}" "${target}"; then
    echo "  변경 없음 → 건너뜀: ${target}"
    rm -f "${tmpfile}"
  else
    backup_if_exists "${target}"
    # 원자적 교체: 'cat > target' 은 리다이렉션이 열리는 순간 truncate 하므로
    # 중간에 실패하면 사용자의 활성 statusline 이 빈 파일로 남는다(백업은 자동 복원되지 않음).
    # 대상과 '같은 디렉토리'에 임시본을 만들어 rename 한다 — 같은 파일시스템이라 mv 가 원자적.
    # ($TMPDIR 은 다른 파일시스템일 수 있어 원자성이 보장되지 않는다)
    atomic_tmp="${target}.tmp.$$"
    # cp -p 로 퍼미션·소유를 승계한다 (chmod --reference 는 BSD/macOS 에 없다)
    if ! cp -p "${target}" "${atomic_tmp}" 2>/dev/null; then
      rm -f "${atomic_tmp}" "${tmpfile}"
      echo "  ⚠ 임시본 생성 실패 → ${target} 를 변경하지 않았습니다(원본 보존)."
      return 0
    fi
    if ! cat "${tmpfile}" > "${atomic_tmp}" 2>/dev/null; then
      rm -f "${atomic_tmp}" "${tmpfile}"
      echo "  ⚠ 임시본 쓰기 실패 → ${target} 를 변경하지 않았습니다(원본 보존)."
      return 0
    fi
    if ! mv -f "${atomic_tmp}" "${target}" 2>/dev/null; then
      rm -f "${atomic_tmp}" "${tmpfile}"
      echo "  ⚠ 교체(rename) 실패 → ${target} 원본을 그대로 유지합니다."
      return 0
    fi
    rm -f "${tmpfile}"
    echo "  설치 완료: ${target}"
  fi
}

# 브리지 값을 소비하는 GSD 훅의 버전을 핀 값과 대조 (경고만, 설치는 계속).
check_gsd_hook_version() {
  echo "▶ GSD 컨텍스트 모니터 훅 버전 대조 (핀: ${GSD_HOOK_PIN})"
  gsd_hook="${CLAUDE_DIR}/hooks/gsd-context-monitor.js"
  if [ ! -f "${gsd_hook}" ]; then
    echo "  ⚠ 주의: ${gsd_hook} 가 없습니다. 브리지를 써도 컨텍스트 경고가 주입되지 않습니다."
    echo "     REVIEW 문서 §10 R1 을 확인하세요."
    return 0
  fi
  gsd_ver="$(grep -m1 '^// gsd-hook-version:' "${gsd_hook}" 2>/dev/null | sed 's|^// gsd-hook-version:[[:space:]]*||' || true)"
  if [ -z "${gsd_ver}" ]; then
    gsd_ver="unknown"
  fi
  if [ "${gsd_ver}" = "${GSD_HOOK_PIN}" ]; then
    echo "  버전 일치: ${gsd_ver}"
  else
    echo "  ⚠ 주의: gsd-context-monitor.js 버전이 ${GSD_HOOK_PIN} 이 아닙니다(현재: ${gsd_ver})."
    echo "     임계치·브리지 스키마가 바뀌었을 수 있으니 REVIEW 문서 §10 R1 을 확인하세요."
  fi
}

# 활성 statusline 스크립트에 컨텍스트 예산 브리지 블록을 삽입한다.
# settings.json 은 읽기만 하고 절대 쓰지 않는다. 전제가 하나라도 어긋나면 경고 후 skip.
install_ctx_bridge() {
  echo "▶ statusline 컨텍스트 예산 브리지 삽입"
  ctx_settings="${CLAUDE_DIR}/settings.json"

  if ! command -v jq >/dev/null 2>&1; then
    echo "  ⚠ jq 가 없어 statusline 경로를 확인할 수 없습니다 → 브리지 건너뜀"
    return 0
  fi
  if [ ! -f "${ctx_settings}" ]; then
    echo "  ⚠ ${ctx_settings} 없음 → 브리지 건너뜀"
    return 0
  fi

  # settings.json 은 읽기 전용으로만 접근한다.
  ctx_cmd="$(jq -r '.statusLine.command // ""' "${ctx_settings}" 2>/dev/null || true)"
  if [ -z "${ctx_cmd}" ] || [ "${ctx_cmd}" = "null" ]; then
    echo "  ⚠ settings.json 에 .statusLine.command 가 없습니다 → 브리지 건너뜀"
    return 0
  fi

  # 래퍼 커맨드 대응: 첫 토큰이 아니라 토큰을 순회하며 대상을 고른다.
  #   "bash ~/statusline.sh" / "env FOO=1 ~/statusline.sh" / "/bin/zsh ~/statusline.sh"
  # 첫 토큰만 보면 인터프리터(bash/env)를 대상으로 잡아 앵커를 못 찾고 조용히 skip 된다.
  # 후보 조건: 선행 '~' 를 $HOME 으로 확장한 뒤 실제 파일(-f)이고 앵커를 포함한 첫 파일.
  #   - 'bash'·'env' 같은 PATH 실행파일은 상대경로라 -f 에서 탈락
  #   - '/bin/bash' 처럼 절대경로로 와도 앵커 검사에서 탈락
  #   - 'FOO=1' 같은 env 대입도 -f 에서 탈락
  ctx_script=""
  for ctx_tok in ${ctx_cmd}; do
    # Claude Code 는 이 커맨드를 셸로 실행하므로 '$HOME/...' 형태도 정상 설정이다.
    # 공백 포함·따옴표 감싼 경로는 단어 분리로 이미 깨지므로 다루지 않는다.
    case "${ctx_tok}" in
      '~/'*)       ctx_tok="${HOME}/${ctx_tok#\~/}" ;;
      '~')         ctx_tok="${HOME}" ;;
      '$HOME/'*)   ctx_tok="${HOME}/${ctx_tok#\$HOME/}" ;;
      '${HOME}/'*) ctx_tok="${HOME}/${ctx_tok#\$\{HOME\}/}" ;;
    esac
    [ -f "${ctx_tok}" ] || continue
    if grep -q '^CURRENT_USAGE=' "${ctx_tok}" 2>/dev/null; then
      ctx_script="${ctx_tok}"
      break
    fi
  done
  if [ -z "${ctx_script}" ]; then
    echo "  ⚠ statusLine 커맨드에서 앵커(^CURRENT_USAGE=)를 가진 스크립트를 찾지 못했습니다."
    echo "    커맨드: ${ctx_cmd}"
    echo "    컨텍스트 예산 경고가 동작하지 않습니다. statusline 스크립트 경로를 공백 없는"
    echo "    '~/' 또는 '\$HOME/' 형태로 두거나, 블록을 수동 삽입하세요(REVIEW 문서 §4 참조)."
    return 0
  fi
  echo "  대상 statusline: ${ctx_script}"

  # 마커 구조 검증: 없음(0쌍) 또는 정확히 1쌍(start가 end보다 앞)만 허용.
  ctx_n_start="$(grep -cF "${CTX_MARK_START}" "${ctx_script}" || true)"
  ctx_n_end="$(grep -cF "${CTX_MARK_END}" "${ctx_script}" || true)"
  if [ "${ctx_n_start}" -ne "${ctx_n_end}" ] || [ "${ctx_n_start}" -gt 1 ]; then
    echo "  ⚠ 브리지 마커 구조 비정상(start=${ctx_n_start}, end=${ctx_n_end}) → 건너뜀"
    echo "    ${ctx_script} 에서 마커를 수동 정리 후 재실행하세요."
    return 0
  fi
  if [ "${ctx_n_start}" -eq 1 ]; then
    ctx_l_start="$(grep -nF "${CTX_MARK_START}" "${ctx_script}" | head -1 | cut -d: -f1)"
    ctx_l_end="$(grep -nF "${CTX_MARK_END}" "${ctx_script}" | head -1 | cut -d: -f1)"
    if [ "${ctx_l_start}" -ge "${ctx_l_end}" ]; then
      echo "  ⚠ 브리지 마커 순서 역전(start=${ctx_l_start}, end=${ctx_l_end}) → 건너뜀"
      return 0
    fi
  fi

  # 브리지 본문. POSIX sh 호환이고 표준출력에 아무것도 쓰지 않는다(statusline 표시가 깨진다).
  ctx_body="$(mktemp)"
  cat > "${ctx_body}" <<'CTXBRIDGE'
# 조언자 컨텍스트 예산 브리지: baseline 대비 델타를 예산 잔량(%)으로 합성해
# gsd-context-monitor.js(PostToolUse)에 전달한다. 표준출력에 아무것도 쓰지 않는다.
# 비0 종료 가능한 명령에는 전부 '|| true' 를 붙인다 — 대상 스크립트가 set -e 면
# baseline 파일이 없는 첫 렌더에서 cat 이 비0으로 끝나 statusline 전체가 죽는다.
__ctx_sid=$(printf '%s' "$input" | jq -r '.session_id // ""' 2>/dev/null || true)
if [ -n "$__ctx_sid" ] && [ "$CURRENT_USAGE" != "null" ]; then
  __ctx_now=$(printf '%s' "$CURRENT_USAGE" | jq -r '(.input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.cache_read_input_tokens // 0)' 2>/dev/null || true)
  case "$__ctx_now" in ''|*[!0-9]*) __ctx_now=0 ;; esac
  if [ "$__ctx_now" -gt 0 ]; then
    __ctx_dir="${TMPDIR:-/tmp}"; __ctx_dir="${__ctx_dir%/}"
    __ctx_base_f="${__ctx_dir}/claude-ctx-${__ctx_sid}-base"
    __ctx_base=$(cat "$__ctx_base_f" 2>/dev/null || true)
    case "$__ctx_base" in ''|*[!0-9]*) __ctx_base=0 ;; esac
    # 최초 관측이거나 compact 후(현재<기존)면 재래치 + 디바운스 상태 제거
    if [ "$__ctx_base" -eq 0 ] || [ "$__ctx_now" -lt "$__ctx_base" ]; then
      __ctx_base="$__ctx_now"
      printf '%s' "$__ctx_base" > "$__ctx_base_f" 2>/dev/null || true
      rm -f "${__ctx_dir}/claude-ctx-${__ctx_sid}-warned.json" 2>/dev/null || true
    fi
    __ctx_delta=$(( __ctx_now - __ctx_base ))
    # BUDGET_RAW=78666 → CRITICAL(잔량 25%)이 delta 59,000 에서 발동, WARNING(35%)은 51,133
    # 78666 = floor(59000/0.75). 반올림한 78667 을 쓰면 $(( )) 의 정수 truncation 때문에
    # delta 59,000 에서 26 이 나와(잔량<=25 미달) CRITICAL 이 그 지점에서 안 뜬다.
    __ctx_rem=$(( 100 - (__ctx_delta * 100 / 78666) ))
    if [ "$__ctx_rem" -lt 0 ]; then __ctx_rem=0; fi
    if [ "$__ctx_rem" -gt 100 ]; then __ctx_rem=100; fi
    __ctx_used=$(( 100 - __ctx_rem ))
    printf '{"session_id":"%s","remaining_percentage":%s,"used_pct":%s,"timestamp":%s}' \
      "$__ctx_sid" "$__ctx_rem" "$__ctx_used" "$(date +%s)" \
      > "${__ctx_dir}/claude-ctx-${__ctx_sid}.json" 2>/dev/null || true
  fi
fi
CTXBRIDGE

  # 멱등성: 매 실행마다 (1) 기존 마커 블록 제거 → (2) 앵커 뒤에 새 블록 삽입.
  # 최초 삽입과 재삽입이 같은 코드 경로를 타므로 2회 실행 결과가 바이트 동일해진다.
  ctx_stripped="$(mktemp)"
  awk -v s="${CTX_MARK_START}" -v e="${CTX_MARK_END}" '
    $0 == s { inblock=1; next }
    $0 == e { inblock=0; next }
    inblock { next }
    { print }
  ' "${ctx_script}" > "${ctx_stripped}"

  ctx_new="$(mktemp)"
  awk -v s="${CTX_MARK_START}" -v e="${CTX_MARK_END}" -v bf="${ctx_body}" '
    { print }
    !ins && /^CURRENT_USAGE=/ {
      print s
      while ((getline line < bf) > 0) print line
      close(bf)
      print e
      ins = 1
    }
  ' "${ctx_stripped}" > "${ctx_new}"

  # 사후 확인: 삽입 결과에 마커가 정확히 1쌍 있어야 한다.
  ctx_v_start="$(grep -cF "${CTX_MARK_START}" "${ctx_new}" || true)"
  ctx_v_end="$(grep -cF "${CTX_MARK_END}" "${ctx_new}" || true)"
  if [ "${ctx_v_start}" -ne 1 ] || [ "${ctx_v_end}" -ne 1 ]; then
    echo "  ⚠ 삽입 결과 검증 실패(start=${ctx_v_start}, end=${ctx_v_end}) → statusline 을 변경하지 않았습니다."
    rm -f "${ctx_body}" "${ctx_stripped}" "${ctx_new}"
    return 0
  fi

  install_file_preserve_mode "${ctx_script}" "${ctx_new}"
  rm -f "${ctx_body}" "${ctx_stripped}"
}

echo "▶ ~/.claude/CLAUDE.md 번들 블록 갱신"
TMP_BLOCK="$(mktemp)"
cat > "${TMP_BLOCK}" <<'CLAUDEMD'
# 글로벌 작업 원칙 (모든 프로젝트 공통)

> `~/.claude/CLAUDE.md`. 이 지침은 권고(context)이며, 실제 모델 고정은
> `~/.claude/agents/` 서브에이전트의 `model:` 필드로 강제한다. 검증은 Codex 플러그인이 담당한다.

## 핵심: 조언자–작업자–검증 (Advisor–Worker–Codex)
- 조언자(Advisor · Opus): 설계·판단·위임·최종 결정. 직접 코딩하지 않는다.
- 작업자(Worker · Opus): 조언자의 브리프대로 구현·테스트만. 범위 확장·무한 리팩터링 금지.
- 검증(Codex): 작업자 결과는 조언자가 직접 보지 않고 Codex 리뷰로 검증한다.
  - 표준 검증: /codex:review
  - 설계·트레이드오프 도전(적대적 검증): /codex:adversarial-review
- 조언자와 작업자가 같은 모델이어도 분리는 유지한다. 목적은 모델 등급 차이가 아니라 역할(설계 vs 구현)·컨텍스트 분리다. 조언자가 완료 기준·시도 상한을 주고 Codex 검증으로 관문을 만든다 — 자기 결과를 자기가 승인하지 않는 것이 핵심이다.

## 검증은 무조건 (가장 중요)
작업자의 "완료" 보고를 그대로 믿지 않는다. /codex:review(또는 /codex:adversarial-review)를 실행해
diff를 실제로 검토한 뒤, 조언자가 지적사항 반영을 지시하고 통과했을 때만 승인한다.

## 조언자 직접 코딩 금지의 범위
- 구현은 worker 위임이 기본값. "브리프 작성 비용이 구현과 비슷하다"는 위임 회피 사유가 아니다.
- 예외(조언자 직접 처리 허용): 단일 파일이며 30줄 이내의 문서·설정 수정. 예외여도 Codex 검증은 동일하게 적용한다.
- 예외 2: 컨텍스트 핸드오프 문서(HANDOFF / pause-work) 작성 — 줄 수 제한 없음. 저장 대상이 메인 세션 컨텍스트에만 존재해 위임이 원리적으로 불가능하다.

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
- 모드 A(기본): 메인 세션 = 조언자(Opus). 구현은 worker(Opus), 검증은 /codex:review.
- 모드 B(비용 최소): 메인은 Sonnet. 설계는 architect 버스트(Opus), 구현은 worker(Opus), 검증은 Codex.
- (옵션) 자동 검증: /codex:setup --enable-review-gate — 종료 전 Codex 자동 리뷰. 사용량 소모 큼, 감시하며 사용.

## 모델 고정
조언자·작업자 모두 opus 별칭으로 고정한다 (~/.claude/agents/architect.md, worker.md). 자동 폴백은 두지 않는다.
--fallback-model 은 과부하(503)에만 발동하고 한도 소진(429)에는 발동하지 않으므로 폴백 수단으로 신뢰하지 않는다.
모드 B는 소진 "대비" 절약책이지 소진 "후" 대책이 아니다 — 모드 B에서도 architect·worker는 그대로 opus를 호출한다.
Opus 소진 후 경로는 둘: (a) 두 에이전트의 model: 을 sonnet 으로 임시 하향, (b) /codex:rescue 로 Codex(별도 한도)에 위임.

## Reasoning effort
- Claude 기본 high. Codex 검증 effort는 ~/.codex/config.toml 의 model_reasoning_effort 로 조절(high 권장).

## 토큰 무거운 작업은 분리
코드베이스 분석·긴 로그·대량 요약은 analyzer(Haiku)에 먼저 위임하고 압축 결론만 넘긴다.
규모가 큰 구현·버그 조사는 /codex:rescue 로 Codex에 위임할 수 있다.

## 컨텍스트 예산 (조언자 세션)
세션 시작 시점 대비 +59k 토큰을 쓰면 새 작업을 시작하지 않는다.
컨텍스트 경고(CONTEXT WARNING / CONTEXT CRITICAL)가 주입되면 즉시:
1. 진행 중 작업을 자연스러운 지점에서 마무리
2. 상태 저장 — `.planning/STATE.md` 가 있으면 `/gsd:pause-work` 를 제안하고, 없으면 HANDOFF.md 작성(설계 결정·완료 기준·검증 상태·다음 단계). 코드가 더러우면 `/wip-save` 병행
3. 새 세션을 권고한다 (compact 보다 우선 — 무엇을 남길지 조언자가 직접 고를 수 있다)
저장 포맷을 새로 만들지 않는다. 위 경로 중 하나를 쓴다.
주입 문구의 숫자는 창 사용률이 아니라 예산 소진율이다.
기준은 델타(토큰)다. 베이스라인 50,905 기준 200k 창 사용률로는 약 55% 시점이며, 1M 창에서는 같은 작업량 시점에 울린다(창 사용률로는 약 11%).

## 리서치·외부 도구는 메인에서 직접 호출하지 않는다
메인 세션(모드 A의 조언자)은 WebSearch·WebFetch·tavily·context7 을 직접 부르지 않는다.
researcher 에게 위임하고 결론+출처 요약만 받는다. 로컬 대량 입력은 analyzer.
서브에이전트가 이 도구들을 갖는 것은 모순이 아니다 — 컨텍스트가 분리되기 때문이다.

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
tools: Read, Grep, Glob
# 어드바이저 모델. 'opus' 별칭으로 고정 — 메인 세션(settings.json "model": "opus[1m]")과 같은 계열. 별칭 고정으로 동적 모델 오배정을 차단한다.
model: opus
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

echo "▶ ~/.claude/agents/researcher.md 작성"
TMP_AGENT="$(mktemp)"
cat > "${TMP_AGENT}" <<'RESEARCHERMD'
---
name: researcher
description: 웹·MCP 외부 조사 전담. 라이브러리 문서, 릴리스 노트, 외부 사례·스펙 조사에 사용. 원문을 삼키고 결론+출처만 반환해 메인 세션 컨텍스트를 보호한다. 로컬 코드베이스 조사는 analyzer 담당.
tools: WebSearch, WebFetch, Read, Grep, Glob, mcp__plugin_context7_context7__resolve-library-id, mcp__plugin_context7_context7__query-docs, mcp__tavily__tavily_search, mcp__tavily__tavily_extract, mcp__tavily__tavily_research
model: sonnet
---

너는 외부 조사 담당이다. 조사 원문은 네 컨텍스트에서 끝난다.

원칙:
- 반환은 결론 → 근거(출처 URL 또는 문서 위치) → 불확실한 부분 순. 원문 인용은 항목당 3줄 이내.
- 판단·설계는 하지 않는다. 출처가 상충하면 상충한다고 보고한다.
- 라이브러리·프레임워크는 최신 문서를 우선한다(학습 데이터보다 문서가 정본).
- 라이브러리·프레임워크 문서는 context7 로 먼저 조회한다(resolve-library-id → query-docs).
- 찾지 못했으면 "찾지 못했다"고 보고한다. 추측으로 채우지 않는다.
RESEARCHERMD
install_file "${AGENTS_DIR}/researcher.md" "${TMP_AGENT}"

# 구버전 reviewer.md 백업 후 제거 (검증은 Codex로 대체)
if [ -f "${AGENTS_DIR}/reviewer.md" ]; then
  backup_if_exists "${AGENTS_DIR}/reviewer.md"
  rm -f "${AGENTS_DIR}/reviewer.md"
  echo "▶ 구버전 reviewer.md 백업 후 제거 (검증은 Codex로 대체)"
fi

install_ctx_bridge
check_gsd_hook_version

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
  /agents   → architect, worker, analyzer, researcher, codex:codex-rescue 표시
  /model    → 사용 가능한 별칭 확인 (architect는 opus 별칭 사용)

모델 고정 (조언자·작업자 모두 opus):
  /model opus     # 메인 세션을 조언자 등급으로
  # 모드 B(메인 sonnet)는 소진 "대비" 절약책 — 소진 후엔 architect·worker의 model: 하향 또는 /codex:rescue

검증 실행:
  /codex:review                 # 표준 검증
  /codex:adversarial-review     # 설계 도전(적대적) 검증
  /codex:review --background    # 큰 변경은 백그라운드 권장 → /codex:status, /codex:result

참고: ~/.claude/CLAUDE.md 의 개인 추가 내용은 번들 마커 블록 밖에 작성하세요.
      재설치 시 마커 블록 안만 교체되고 밖은 보존됩니다.
      statusline 스크립트에도 컨텍스트 예산 브리지 마커 블록이 삽입됩니다(마커 밖은 보존).
────────────────────────────────────────────────────────────
DONE

if [ -n "${BACKED_UP}" ]; then
  echo ""
  echo "백업된 기존 파일:"
  printf '%s' "${BACKED_UP}" | while IFS= read -r line; do
    [ -n "${line}" ] && echo "  - ${line}"
  done
fi
