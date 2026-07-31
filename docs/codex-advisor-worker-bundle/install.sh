#!/usr/bin/env bash
#
# 조언자–작업자–Codex 검증 번들 · 원샷 설치기
# ─ ~/.claude/CLAUDE.md 의 번들 마커 블록 갱신 (블록 밖 개인 내용은 보존)
# ─ ~/.claude/agents/{architect,worker,analyzer,researcher}.md 생성 (내용 동일 시 건너뜀)
# ─ 구버전 reviewer.md 백업 후 제거(검증은 Codex로 대체)
# ─ 활성 statusline 스크립트에 컨텍스트 예산 브리지 블록 삽입 (마커 관리·백업)
# ─ ~/.claude/hooks/advisor-context-budget.js 설치 (번들 소유 컨텍스트 예산 훅)
# ─ ~/.claude/settings.json 의 hooks 에 위 훅을 멱등 병합 (백업 + 유효성 게이트)
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

# 번들이 소유하는 컨텍스트 예산 훅. 브리지 파일을 읽고 경고를 주입한다.
# (구 버전은 GSD 플러그인 소유 gsd-context-monitor.js 에 합성값을 태웠다 — 플러그인
#  업데이트로 임계치·스키마가 바뀌면 조용히 깨지는 의존이라 자기 훅 소유로 전환했다.)
CTX_HOOK_PATH="${CLAUDE_DIR}/hooks/advisor-context-budget.js"
# settings.json 엔트리 '탐색' 키 — 우리가 설치한 **절대경로**다.
# basename('advisor-context-budget.js')으로 찾으면 다른 프로젝트의 훅이나 같은 이름을 쓰는
# 래퍼를 우리 것으로 오인해 커맨드를 조용히 덮어쓴다. 커맨드 전체 문자열이 아닌 이유는
# PATH·node 경로가 바뀌어도 같은 훅을 찾아 '갱신' 해야 하기 때문이다.
# (성공 '판정' 은 별도로 완전일치를 쓴다 — ms_verify_registered 참조)
CTX_HOOK_KEY="${CTX_HOOK_PATH}"

# 엔트리가 '우리 훅을 가리키는가' 판정 — 경로 동치성. 절대경로 부분일치만 보면
# 같은 파일을 다르게 표기한 기존 엔트리(~/ · $HOME/ · 심링크 경유)를 탐색이 놓쳐
# 이중 등록되고, 계수도 같은 기준이라 exact:1 로 조용히 통과한다.
# **탐색과 계수가 반드시 같은 판정을 써야 한다** — 두 곳에 복사하면 언젠가 갈라진다.
# 그래서 판정 본문을 여기 한 번만 두고 양쪽 python 에 주입한다.
CTX_PY_PATHMATCH='
import os, shlex

_CTX_QUOTES = "\"\x27"          # " 와 \x27(=홑따옴표). bash 홑따옴표 문자열 안이라 리터럴로 못 쓴다.

def _ctx_norm(tok):
    home = os.path.expanduser("~")
    t = str(tok).replace("${HOME}", home).replace("$HOME", home)
    if t.startswith("~"):
        t = os.path.expanduser(t)
    return os.path.realpath(t)

# 후보 토큰 추출. 넓히는 것은 \x27추출\x27 뿐이고 \x27판정\x27(완전일치)은 건드리지 않는다 —
# 남의 훅(/other/project/…)은 어떤 토큰으로 쪼개도 realpath 가 우리 것과 같아지지 않는다.
def _ctx_toks(command):
    try:
        toks = shlex.split(str(command))
    except ValueError:
        toks = str(command).split()   # 따옴표 불균형 → 토큰에 따옴표가 잔류한다
    out = []
    for t in toks:
        # 토큰 소스는 가산적이다 (jq 의 ctx_toks 와 같은 계약).
        # 1) shlex 가 만든 온전한 토큰을 먼저 보존한다 — HOME 에 공백이 있는 머신
        #    (/Users/Jane Doe/…)에서는 아래 재분해가 경로를 낱말로 갈라놓으므로 이것이 유일하게
        #    온전한 형태다. 보존하지 않으면 설치기가 자기 훅조차 못 찾아 found:0 → 미전환이 된다.
        #    따옴표 불균형 폴백에서는 따옴표가 남아 어차피 매칭되지 않는다 — 그 경우는 2) 가 덮는다.
        if t:
            out.append(str(t))
        # 2) sh -c "node …" 는 경로가 한 토큰 안에 낱말로 들어온다 → 다시 쪼갠다.
        for w in str(t).split():
            w = w.strip(_CTX_QUOTES)  # 확장 전에 벗긴다 (폴백 토큰의 잔류 따옴표)
            if w:
                out.append(w)
    return out

def ctx_is_ours(command, key):
    want = _ctx_norm(key)
    toks = _ctx_toks(command)
    return any(_ctx_norm(t) == want for t in toks)
'

# jq 경로의 같은 판정. jq 에는 realpath 가 없어 심링크 해석이 원리적으로 불가능하므로
# '문자열 동치 집합'(절대경로 · ~/… · $HOME/… · ${HOME}/…)으로만 대응한다.
# 이것도 탐색·계수 양쪽에 같은 정의를 주입한다.
CTX_JQ_MATCH='def cmd_is_ours($c): any($keys[]; . as $k | $c | contains($k));
# 토큰 완전일치 판정 (python 의 realpath 완전일치에 대응). contains 는 접미사가 붙은
# 남의 경로(.js.disabled 등)도 우리 것으로 오인하므로 **탐색·계수·삭제 판정은 전부 이것을 쓴다** —
# 한 곳이라도 느슨하게 남기면 사용자가 비활성화해 둔 훅을 우리 엔트리로 덮어쓴다.
# cmd_is_ours(느슨)가 남는 곳은 갱신 대상 수집($hits) 하나뿐이다. 거기서는 exact 를 우선
# 선택하고 비-exact 는 손대지 않고 통과시키므로 과잉매칭이 파일을 바꾸지 못한다.
# 홑따옴표는 \u0027 이스케이프로 쓴다 — bash 홑따옴표 문자열이라 리터럴은 인자를 쪼갠다.
# 토큰 소스는 두 가지이고 **가산적**이다 (python 의 shlex.split 에 대응).
#   1) 인용 구간 통째로 — 설치기 커맨드는 "<node>" "<hookpath>" 형식이라(ms_cmd 참조)
#      HOME 에 공백이 있는 머신(/Users/Jane Doe/...)에서는 이것이 유일하게 온전한 경로다.
#      whitespace 로만 쪼개면 /Users/Jane 과 Doe/.claude/... 로 갈라져 설치기가 자기 훅조차
#      못 찾고 found:0 -> settings 복원 -> 브리지 미전환이 된다.
#   2) whitespace 재분해 + 앞뒤 따옴표 strip — sh -c "node ..." 처럼 경로가 인용 구간 안의
#      낱말로 들어오는 표기와 따옴표 불균형 표기를 덮는다. 1) 만 남기면 이 둘이 깨진다 —
#      **둘 중 어느 쪽도 제거하지 말 것.**
# 판정은 여전히 완전일치이므로 토큰을 넓혀도 남의 훅(.js.disabled 등)은 매칭되지 않는다.
def ctx_toks($c): ([$c | splits("[ \t]+")] | map(gsub("^[\"\u0027]+|[\"\u0027]+$"; "")))
                  + [$c | scan("\"[^\"]*\"") | .[1:-1]]
                  + [$c | scan("\u0027[^\u0027]*\u0027") | .[1:-1]];
def cmd_is_exact_ours($c): (ctx_toks($c)) as $t | any($keys[]; . as $k | $t | any(. == $k));'

# statusline 이 stdin 을 'input' 변수로 받는지 판정하는 앵커 (grep -E).
# **이 판정 하나가 두 동작을 가른다** — 통과하면 '삽입 대상', 실패하면 '정리 경로'다.
# 따라서 좁게 잡으면 정상 동작하던 스크립트(export input=$(cat) 등)가 정리 대상으로 흘러들어가
# 잘 돌던 브리지가 삭제된다. 정의를 한 곳에만 두는 이유도 그것 — 두 곳에 쓰면 언젠가 갈라진다.
# 허용: 선행 공백, export / declare -x / local / typeset 접두사.
CTX_INPUT_ANCHOR='^[[:space:]]*(export[[:space:]]+|declare[[:space:]]+-[a-zA-Z]+[[:space:]]+|local[[:space:]]+|typeset[[:space:]]+)?input='

ctx_has_input_anchor() {
  grep -qE "${CTX_INPUT_ANCHOR}" "$1" 2>/dev/null
}

mkdir -p "${AGENTS_DIR}"

# 백업된 파일 경로 누적 (bash 3.2 호환: 배열 대신 개행 구분 문자열)
BACKED_UP=""

# 직전 backup_if_exists 가 만든 백업 경로 (백업하지 않았으면 빈 문자열).
# 호출 직후에만 유효하다 — 복원이 필요한 호출부가 타임스탬프를 재계산하면
# 초 경계에서 어긋난 경로를 가리킬 수 있어 실제 백업 경로를 넘겨받는다.
LAST_BACKUP=""

# 이번 실행에서 이미 백업한 대상 → 백업 경로 매핑 (한 줄에 "<대상><TAB><백업>").
# 훅 등록과 구 모니터 정리가 '각각' 병합을 돌리는데 백업 이름이 초 단위라,
# 같은 초에 끝나면 두 번째 백업이 첫 번째를 덮어써 **설치 전 원본 백업이 사라진다.**
# 보존해야 하는 것은 '설치 전 상태' 하나뿐이므로 대상당 1회만 백업한다.
BACKUP_MAP=""
BACKUP_TAB="$(printf '\t')"

backup_lookup() {
  printf '%s' "${BACKUP_MAP}" | awk -F"${BACKUP_TAB}" -v t="$1" '$1 == t { print $2; exit }'
}

# 대상 파일이 존재하고 비어 있지 않으면 <파일>.bak.<UTC타임스탬프> 로 복사 후 진행.
# 존재하지 않거나 0바이트면 백업 없이 진행.
backup_if_exists() {
  target="$1"
  LAST_BACKUP=""
  # 같은 실행에서 이미 백업했으면 다시 만들지 않는다(덮어쓰기 방지). 복원용 경로는 그대로 넘긴다.
  backup_prev="$(backup_lookup "${target}")"
  if [ -n "${backup_prev}" ]; then
    LAST_BACKUP="${backup_prev}"
    return 0
  fi
  if [ -s "${target}" ]; then
    ts="$(date -u +%Y%m%dT%H%M%SZ)"
    backup="${target}.bak.${ts}"
    # 백업 실패를 삼키면 '백업 없이 덮어쓰기'가 되어 복원 수단이 사라진다 → 호출부로 전파.
    if ! cp -p "${target}" "${backup}" 2>/dev/null; then
      echo "  ⚠ 백업 생성 실패: ${backup}"
      return 1
    fi
    LAST_BACKUP="${backup}"
    BACKUP_MAP="${BACKUP_MAP}${target}${BACKUP_TAB}${backup}
"
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
    if ! backup_if_exists "${target}"; then
      rm -f "${tmpfile}"
      echo "  ⚠ 백업 실패 → ${target} 를 변경하지 않았습니다(원본 보존)."
      return 1
    fi
    if ! mv "${tmpfile}" "${target}" 2>/dev/null; then
      rm -f "${tmpfile}"
      echo "  ⚠ 교체 실패 → ${target} 를 변경하지 않았습니다(원본 보존)."
      return 1
    fi
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
    if ! backup_if_exists "${target}"; then
      rm -f "${tmpfile}"
      echo "  ⚠ 백업 실패 → ${target} 를 변경하지 않았습니다(원본 보존)."
      return 1
    fi
    # 원자적 교체: 'cat > target' 은 리다이렉션이 열리는 순간 truncate 하므로
    # 중간에 실패하면 사용자의 활성 statusline 이 빈 파일로 남는다(백업은 자동 복원되지 않음).
    # 대상과 '같은 디렉토리'에 임시본을 만들어 rename 한다 — 같은 파일시스템이라 mv 가 원자적.
    # ($TMPDIR 은 다른 파일시스템일 수 있어 원자성이 보장되지 않는다)
    atomic_tmp="${target}.tmp.$$"
    # cp -p 로 퍼미션·소유를 승계한다 (chmod --reference 는 BSD/macOS 에 없다)
    if ! cp -p "${target}" "${atomic_tmp}" 2>/dev/null; then
      rm -f "${atomic_tmp}" "${tmpfile}"
      echo "  ⚠ 임시본 생성 실패 → ${target} 를 변경하지 않았습니다(원본 보존)."
      return 1
    fi
    if ! cat "${tmpfile}" > "${atomic_tmp}" 2>/dev/null; then
      rm -f "${atomic_tmp}" "${tmpfile}"
      echo "  ⚠ 임시본 쓰기 실패 → ${target} 를 변경하지 않았습니다(원본 보존)."
      return 1
    fi
    if ! mv -f "${atomic_tmp}" "${target}" 2>/dev/null; then
      rm -f "${atomic_tmp}" "${tmpfile}"
      echo "  ⚠ 교체(rename) 실패 → ${target} 원본을 그대로 유지합니다."
      return 1
    fi
    rm -f "${tmpfile}"
    echo "  설치 완료: ${target}"
  fi
}

# 번들 소유 컨텍스트 예산 훅을 설치한다. 브리지 JSON(사실값)을 읽어 델타 임계로 판정하고
# 경고를 additionalContext 로 주입한다. 남의 플러그인(GSD) 내부 구현에 의존하지 않는다.
install_ctx_hook() {
  echo "▶ ~/.claude/hooks/advisor-context-budget.js 작성"
  mkdir -p "${CLAUDE_DIR}/hooks"
  ctx_hook_tmp="$(mktemp)"
  cat > "${ctx_hook_tmp}" <<'ADVCTXJS'
#!/usr/bin/env node
// advisor-context-budget.js — codex-advisor-worker-bundle 소유 (install.sh 가 생성)
//
// statusline 브리지가 기록한 '사실값'을 읽어 조언자 세션의 컨텍스트 예산을 감시한다.
//   <임시디렉토리>/claude-ctx-advisor-{session_id}.json
//   (임시디렉토리 = TMPDIR → TMP → TEMP → /tmp. 브리지와 '같은 순서'여야 한다 — 아래 tmpDir 주석)
//   {"session_id","baseline","current","delta","window","window_pct","timestamp"}
//
// 판정은 창 사용률이 아니라 '세션 베이스라인 대비 델타'다. 베이스라인(시스템 프롬프트 +
// CLAUDE.md + 도구 스키마)이 이미 창의 25% 를 차지하므로 창 퍼센트 임계는 양쪽 끝에서 깨진다.
// 창 크기와 무관하게 같은 작업량 시점에 발동한다(200k 든 1M 이든 동일).
//
// 임계: delta >= 51,133 WARNING / delta >= 59,000 CRITICAL (사용자 지정값)
// 디바운스: 경고 사이 도구 호출 5회. 단 WARNING → CRITICAL 승격은 즉시 발화.
// 어떤 예외에서도 도구 실행을 막지 않는다.

const fs = require('fs');
const path = require('path');

const WARNING_DELTA = 51133;
const CRITICAL_DELTA = 59000;
const STALE_SECONDS = 60;   // 60초 지난 지표는 무시 (statusline 이 안 돌고 있는 상태)
const DEBOUNCE_CALLS = 5;

// 천단위 구분 (toLocaleString 은 ICU 빌드에 의존하므로 쓰지 않는다)
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// 상태 파일은 공유 임시디렉토리(대개 /tmp) 에 놓이고 이름이 session_id 로 예측 가능하다.
// 다른 로컬 사용자가 미리 심링크를 걸어두면 평범한 읽기·쓰기가 그것을 따라가
// 임의 파일을 덮어쓰거나 임의 내용을 우리에게 먹인다(/tmp 의 sticky bit 는 삭제만 막는다).
// 경로는 옮기지 않는다(하네스·브리지 계약) — O_NOFOLLOW 로 심링크만 거부한다.
const NOFOLLOW_R = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
const NOFOLLOW_W = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW;

// 성공 true / 실패 false. 절대 던지지 않는다 — 쓰기 실패가 바깥 catch 로 새면
// 경고 메시지가 통째로 삼켜진다(심링크 하나로 경고를 영구히 끄는 길이 된다).
const writeStateSafe = (p, text) => {
  let fd;
  try {
    fd = fs.openSync(p, NOFOLLOW_W, 0o600);
    fs.writeFileSync(fd, text);
    return true;
  } catch (e) {
    return false;   // ELOOP(심링크) · EACCES 등
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (e) { /* noop */ } }
  }
};

// 내용 문자열 / 실패·부재 시 null. 심링크면 ELOOP 로 null 이 되어 '상태 없음'으로 취급된다.
const readStateSafe = (p) => {
  let fd;
  try {
    fd = fs.openSync(p, NOFOLLOW_R);
    return fs.readFileSync(fd, 'utf8');
  } catch (e) {
    return null;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (e) { /* noop */ } }
  }
};

let input = '';
// stdin 이 10초 안에 안 닫히면 조용히 종료 (파이프 행 방지)
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const sessionId = data.session_id;
    if (!sessionId) process.exit(0);

    // 임시 디렉토리 해석은 브리지(POSIX sh)와 '같은 순서'여야 한다: TMPDIR → TMP → TEMP → /tmp.
    // 갈라지면 두 가지가 조용히 깨진다 — ① 훅이 브리지 메트릭을 영영 못 읽어 모든 경고가 억제되고
    // ② 재래치가 지우는 -warned.json 을 훅이 다른 디렉토리에서 읽어 디바운스가 승계된다.
    // os.tmpdir() 은 POSIX 에서 같은 순서지만 win32 에서는 TEMP 를 먼저 본다 — 명시 체인으로 고정한다.
    // 후행 슬래시는 브리지의 `${__ctx_dir%/}` 와 똑같이 '한 개'만 뗀다. 그래야 path.join 과 셸이
    // 바이트 동일한 경로를 만든다(전부 떼어 빈 문자열이 되면 상대경로가 되므로 루트로 되돌린다).
    const tmpRaw = process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
    const tmpDir = (tmpRaw.endsWith('/') ? tmpRaw.slice(0, -1) : tmpRaw) || '/';
    const metricsPath = path.join(tmpDir, `claude-ctx-advisor-${sessionId}.json`);
    // 파일 없음 = 서브에이전트이거나 statusline 미동작. 조용히 종료.
    // 심링크도 여기서 걸러진다(O_NOFOLLOW) — 이 파일이 '경고를 낼지 말지'를 결정하므로
    // 공격자가 delta:0 을 먹이면 경고가 조용히 꺼진다. 다음 렌더가 경로를 되찾으면 복구된다.
    const rawMetrics = readStateSafe(metricsPath);
    if (rawMetrics === null) process.exit(0);

    let metrics;
    try {
      metrics = JSON.parse(rawMetrics);
    } catch (e) {
      process.exit(0);   // 파싱 실패(쓰기 도중 등) → 다음 렌더에 다시 본다
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (metrics.timestamp && (nowSec - metrics.timestamp) > STALE_SECONDS) process.exit(0);

    const delta = Number(metrics.delta);
    if (!Number.isFinite(delta)) process.exit(0);

    // 임계 미만이면 디바운스 파일을 건드리지 않고 종료한다 —
    // 여기서 카운터를 올리면 경고 이력이 없는 세션에서도 디바운스가 소진된다.
    if (delta < WARNING_DELTA) process.exit(0);

    const isCritical = delta >= CRITICAL_DELTA;
    const currentLevel = isCritical ? 'critical' : 'warning';

    // 디바운스 상태. statusline 이 재래치(compact 감지) 시 이 파일을 지운다.
    const warnPath = path.join(tmpDir, `claude-ctx-advisor-${sessionId}-warned.json`);
    let warnData = { callsSinceWarn: 0, lastLevel: null };
    let firstWarn = true;
    const rawWarn = readStateSafe(warnPath);   // 부재·심링크·읽기실패 → null
    if (rawWarn !== null) {
      try {
        warnData = JSON.parse(rawWarn);
        firstWarn = false;
      } catch (e) {
        // 손상 파일 → 초기화하고 첫 경고로 취급
      }
    }

    warnData.callsSinceWarn = (warnData.callsSinceWarn || 0) + 1;

    // 첫 경고는 즉시. 이후 5회 이내면 억제하되 카운터는 증가시킨다.
    // 승격(WARNING → CRITICAL)은 디바운스를 우회한다 — 상황이 나빠진 사실이 지연되면 안 된다.
    const severityEscalated = currentLevel === 'critical' && warnData.lastLevel === 'warning';
    const suppress = !firstWarn && warnData.callsSinceWarn < DEBOUNCE_CALLS && !severityEscalated;
    if (suppress) {
      // 억제는 '상태를 실제로 남겼을 때만' 유효하다. 상태를 못 쓰면(심링크 선점·권한 등)
      // 조용히 삼키지 않고 아래로 떨어져 매 호출 발화한다 — 감지 수단 없는 규칙은 사문화되고,
      // 삼키면 공격자가 파일 하나로 컨텍스트 경고를 영구히 끌 수 있다.
      if (writeStateSafe(warnPath, JSON.stringify(warnData))) process.exit(0);
    } else {
      warnData.callsSinceWarn = 0;
      warnData.lastLevel = currentLevel;
      writeStateSafe(warnPath, JSON.stringify(warnData));   // 실패해도 발화는 계속한다
    }

    // 창 사용률을 함께 적는 것이 이번 설계의 핵심이다 — 예산 소진과 창 고갈은 다른 축이고,
    // 상태줄(창 %)과 경고를 나란히 본 사람이 둘 중 하나를 고장으로 오해하지 않게 한다.
    const winPctRaw = Number(metrics.window_pct);
    const winText = Number.isFinite(winPctRaw) ? `컨텍스트 창은 ${winPctRaw}% 사용` : '컨텍스트 창 사용률은 미상';

    let message;
    if (isCritical) {
      message =
        `CONTEXT BUDGET CRITICAL: 세션 시작 대비 +${fmt(delta)} 토큰 사용 (${winText} — 고갈 아님). ` +
        '작업을 자연스러운 지점에서 마무리하고 상태를 저장하세요 — `.planning/STATE.md` 가 있으면 ' +
        '`/gsd:pause-work` 를 사용자에게 제안하고, 없으면 HANDOFF.md 를 작성하세요(설계 결정·완료 기준·' +
        '검증 상태·다음 단계). 코드가 더러우면 `/wip-save` 병행. 이어서 할 때는 compact 보다 새 세션을 ' +
        '권고하세요. 저장 포맷을 새로 만들지 마세요.';
    } else {
      message =
        `CONTEXT BUDGET WARNING: 세션 시작 대비 +${fmt(delta)} 토큰 사용 (${winText} — 고갈 아님). ` +
        '조언자 예산이 한계에 가깝습니다. 새 복잡 작업을 시작하지 말고 진행 중인 작업을 마무리하세요.';
    }

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: data.hook_event_name || 'PostToolUse',
        additionalContext: message
      }
    }));
  } catch (e) {
    process.exit(0);   // 절대 도구 실행을 막지 않는다
  }
});
ADVCTXJS
  if ! install_file "${CTX_HOOK_PATH}" "${ctx_hook_tmp}"; then
    echo "  ⚠ 훅 파일을 쓰지 못했습니다 → 등록·브리지 전환을 진행하지 않습니다."
    return 1
  fi
  chmod 644 "${CTX_HOOK_PATH}" 2>/dev/null || true
  # 쓰기 결과를 믿지 않는다 — 다시 읽어 실제로 존재하고 내용이 우리 것인지 확인한다.
  if [ ! -s "${CTX_HOOK_PATH}" ] || ! grep -q 'CONTEXT BUDGET CRITICAL' "${CTX_HOOK_PATH}" 2>/dev/null; then
    echo "  ⚠ 훅 파일 검증 실패(${CTX_HOOK_PATH}) → 등록·브리지 전환을 진행하지 않습니다."
    return 1
  fi
}

# settings.json 의 hooks 에 컨텍스트 예산 훅을 멱등 병합한다.
#
# 여기가 이 설치기에서 가장 위험한 지점이다 — 사용자의 '살아있는' 설정 파일에 쓴다.
# 규율: (1) 문자열 치환 금지, 반드시 파싱→수정→재출력  (2) 쓰기 전 백업
#       (3) 같은 디렉토리 임시본 + 원자적 mv  (4) 쓴 뒤 재파싱 실패면 백업 복원 후 중단.
# python3/jq 가 둘 다 없으면 경고 후 skip 한다 (설치 전체를 실패시키지 않는다).
#
# 반환값 계약 (호출부가 브리지 전환 여부를 이 값으로 결정한다):
#   0 = 우리 훅이 settings.json 에 '실제로 등록돼 있음' (사후 조건으로 확인)
#   1 = 미등록. 사유는 MS_REASON 에 담긴다
# 부분 실패(훅은 등록됐는데 contextMonitor 제거가 안 된 경우 등)는 0 이다 —
# 브리지 전환을 막아야 하는 유일한 조건은 '훅 미등록'뿐이다.
MS_REASON=""

merge_settings_hooks() {
  # $1 = register | cleanup
  #   register : advisor 훅 엔트리 추가/갱신 (구 모니터는 건드리지 않는다)
  #   cleanup  : 구 Stop 모니터 제거 전용 — '브리지 전환 성공 후'에만 호출한다
  ms_mode="${1:-register}"
  if [ "${ms_mode}" = cleanup ]; then
    echo "▶ 구 Stop 모니터 정리 (contextMonitor.js)"
  else
    echo "▶ settings.json 훅 병합 (컨텍스트 예산 훅)"
  fi
  MS_REASON=""
  ms_target="${CLAUDE_DIR}/settings.json"

  if [ ! -f "${ms_target}" ]; then
    MS_REASON="${ms_target} 이 없습니다"
    echo "  ⚠ ${ms_target} 없음 → 병합 건너뜀"
    return 1
  fi

  # node 를 '설치 시점에 절대경로로 해석'해 커맨드에 박는다.
  # 하드코딩 PATH(=/usr/local/bin:…)를 쓰면 두 가지로 실패한다:
  #   ① nvm·Volta·~/.local/bin 등 사용자 경로에만 node 가 있으면 매 도구 호출마다 exit 127
  #   ② 그 PATH 에도 node 가 '있으면' 사용자가 쓰는 것과 다른 바이너리로 조용히 실행된다
  #      (이 워크스페이스 실측: command -v node = ~/.local/bin/node v22 vs /usr/local/bin/node v25)
  # 게다가 아래 'Node.js 확인' 단계는 원래 PATH 로 성공하므로 "node 있음"이라 보고하면서
  # 훅만 죽는 조합이 된다. 절대경로가 있으면 PATH 접두사는 불필요하고, 있으면 해롭다.
  ms_node="$(command -v node 2>/dev/null || true)"
  if [ -z "${ms_node}" ]; then
    MS_REASON="node 를 찾을 수 없습니다 (훅은 node 로 실행됩니다)"
    echo "  ⚠ node 를 찾을 수 없어 훅을 등록하지 않았습니다."
    echo "    Node.js 설치 후 이 설치기를 다시 실행하면 등록됩니다."
    return 1
  fi
  # command -v 는 PATH 항목이 상대경로면 상대경로를 그대로 낸다
  # (bash 실측: 작업 디렉토리에 bin/node 가 있고 PATH=bin:$PATH 이면 결과가 "bin/node").
  # 그 커맨드가 '전역' settings.json 에 박히는데 훅은 Claude Code 의 작업 디렉토리에서 실행되므로
  # 거의 언제나 exit 127 이 된다. 그런데 사후검증은 문자열 대조라 통과하고 브리지까지 전환된다 —
  # 실행 불가능한 훅 + 전환된 브리지 = 경고 전면 소실. 이 번들이 닫으려는 실패 양식 그 자체다.
  # 정규화(realpath 등)하지 않고 '거부'한다: 상대 PATH 항목이 있다는 건 설치 시점의 해석을
  # 신뢰할 수 없다는 신호이므로, 추측한 경로를 박기보다 등록을 미루고 현 상태를 유지하는 편이 안전하다.
  case "${ms_node}" in
    /*) ;;
    *)
      MS_REASON="node 경로가 절대경로가 아닙니다: ${ms_node}"
      echo "  ⚠ node 경로가 절대경로로 해석되지 않아 훅을 등록하지 않았습니다: ${ms_node}"
      echo "    PATH 에 상대경로 항목이 있습니다. 절대경로로 고친 뒤 이 설치기를 다시 실행하세요."
      return 1
      ;;
  esac
  ms_cmd="\"${ms_node}\" \"${CTX_HOOK_PATH}\""

  # 심링크(dotfiles 저장소 연결)면 실제 경로에 쓴다. 해석하지 않고 mv 하면
  # 심링크가 일반 파일로 갈아치워져 연결이 조용히 끊어진다 — statusline 경로와 동일한 결함이라
  # 같은 헬퍼(ctx_resolve_link)를 재사용한다. 계열 결함이 경로마다 따로 재발하지 않게 한다.
  ctx_resolve_link "${ms_target}" || {
    MS_REASON="settings.json 심링크를 해석하지 못했습니다(5홉 초과이거나 일반 파일이 아님)"
    echo "    settings.json 을 변경하지 않았습니다."
    return 1
  }
  ms_target="${CTX_RESOLVED}"

  # 구 Stop 훅 제거 조건 — 아래 둘을 '모두' 만족할 때만.
  #   ① command 가 hooks/universal/contextMonitor.js 를 참조
  #   ② ~/.claude/commands/save-and-compact.md 가 없다 (그 훅이 권고하는 대상이 죽어 있음)
  # ②를 기계적으로 확인하는 이유: 살아있는 명령을 권고하는 환경까지 무조건 지우면 안 된다.
  # 제거는 cleanup 모드에서만. register 단계에서 지우면 '대체 브리지가 아직 없는 상태'에서
  # 구 모니터가 사라져 경고가 전면 중단된다(브리지 삽입은 skip/실패해도 계속 진행되므로).
  if [ "${ms_mode}" = cleanup ] && [ ! -f "${CLAUDE_DIR}/commands/save-and-compact.md" ]; then
    ms_rm_cm=1
  else
    ms_rm_cm=0
  fi

  # 병합 결과 임시본. 대상과 '같은 디렉토리'에 두지 않는다 —
  # install_file_preserve_mode 가 내부적으로 "${target}.tmp.$$" 를 쓰므로 이름이 충돌하면
  # 그 함수가 우리 병합 결과를 원본으로 덮어쓴 뒤 자기 자신을 cat 해 빈 파일을 만든다.
  # 원자성·퍼미션 승계는 그 함수가 책임지므로 여기서는 위치를 겹치지 않게만 하면 된다.
  if [ "${ms_mode}" = cleanup ]; then ms_do_add=0; else ms_do_add=1; fi
  ms_tmp="$(mktemp)"
  ms_rc=0
  ms_err=""
  if command -v python3 >/dev/null 2>&1; then
    # 출력을 명령 치환으로 받는다 — 스키마 불일치 사유(stderr)를 읽어 안내에 쓰기 위해서다.
    # (임시파일을 하나 더 만들면 정리 경로가 또 늘어나므로 변수로 받는다)
    # 경로 동치 판정(CTX_PY_PATHMATCH)을 앞에 붙여 한 프로그램으로 만든다 —
    # 계수기(ctx_hook_entry_count)도 같은 변수를 주입하므로 두 판정이 갈라질 수 없다.
    ms_err="$(
    { printf '%s\n' "${CTX_PY_PATHMATCH}"; cat <<'PYMERGE'

import json, os, sys

target, tmp = os.environ['MS_TARGET'], os.environ['MS_TMP']
cmd, key, rm_cm = os.environ['MS_CMD'], os.environ['MS_KEY'], os.environ['MS_RM_CM'] == '1'
CM = 'hooks/universal/contextMonitor.js'

try:
    with open(target, encoding='utf-8') as f:
        data = json.load(f)
except Exception as exc:
    sys.stderr.write('  parse-error: %s\n' % exc)
    sys.exit(3)                       # 기존 파일이 이미 깨져 있음 → 우리가 고칠 대상이 아님
if not isinstance(data, dict):
    sys.stderr.write('  parse-error: 최상위가 객체가 아님\n')
    sys.exit(3)

# 스키마가 다르면 '치환'하지 않는다 — 파싱은 되지만 구조가 다른 설정에서
# 사용자 데이터가 소리 없이 파괴된다. 키가 없을 때만 만들고, 타입이 다르면 안전하게 실패한다.
if 'hooks' not in data:
    data['hooks'] = {}
elif not isinstance(data['hooks'], dict):
    sys.stderr.write('  schema: hooks=%s\n' % type(data['hooks']).__name__)
    sys.exit(4)
hooks = data['hooks']

removed = []

# ── 추가: PostToolUse. 멱등 판정은 커맨드 부분문자열 기준.
if 'PostToolUse' not in hooks:
    hooks['PostToolUse'] = []
elif not isinstance(hooks['PostToolUse'], list):
    sys.stderr.write('  schema: hooks.PostToolUse=%s\n' % type(hooks['PostToolUse']).__name__)
    sys.exit(4)
post = hooks['PostToolUse']

# 멱등 판정은 '훅 파일 경로 동치'(ctx_is_ours)로 한다. 커맨드 전체 문자열로 대조하면
# node 경로가 바뀐 환경(nvm 버전 전환 등)에서 같은 훅이 중복 등록된다.
# 이미 있으면 추가하지 않고 '커맨드를 갱신'한다 — 낡은 node 경로를 가리키는 엔트리를
# 그대로 두면 업그레이드가 고장을 고치지 못한다.
added = False
updated = False
found = False
deduped = 0
do_add = os.environ.get('MS_DO_ADD', '1') == '1'
# 별칭 엔트리와 절대경로 엔트리가 공존하는 머신(= 버그 있던 설치기를 이미 돌린 머신)이
# 정확히 U 가 고치려는 모집단이다. 둘 다 갱신만 하면 동일 커맨드 2개 → dup:2 → 검증 실패로
# 브리지 전환이 막혀 '고치려던 환경을 못 고친다'. 그래서 **판정을 통과한 엔트리들 사이에서만**
# 첫 번째만 남기고 접는다. 판정에 실패한 엔트리(남의 훅)는 세지도 지우지도 않는다 —
# R 의 보호는 계수가 아니라 '판정'에 있으므로 이 경계를 넘으면 R 버그가 되돌아온다.
new_post = []
for g in post:
    if not isinstance(g, dict) or not isinstance(g.get('hooks'), list):
        new_post.append(g)
        continue
    inner = g['hooks']
    kept = []
    for h in inner:
        if not isinstance(h, dict) or not ctx_is_ours(h.get('command', ''), key):
            kept.append(h)    # 남의 훅 — 원문 그대로
            continue
        if not do_add:
            found = True
            kept.append(h)    # cleanup 모드: 엔트리를 건드리지 않는다
            continue
        if found:
            deduped += 1      # 이미 정규 엔트리를 하나 채택했다 → 이건 중복
            continue
        found = True
        if h.get('command') != cmd:
            h['command'] = cmd
            updated = True
        if h.get('type') != 'command':
            h['type'] = 'command'
            updated = True
        kept.append(h)
    if len(kept) != len(inner):
        g['hooks'] = kept
        if not kept:
            continue          # 우리가 비운 그룹만 뺀다 (원래 비어 있던 그룹은 보존)
    new_post.append(g)
hooks['PostToolUse'] = new_post
post = new_post
if not found and do_add:
    # matcher 키를 넣지 않는다 — 없으면 전체 매칭 (기존 GSD 엔트리와 동일한 형태)
    post.append({'hooks': [{'type': 'command', 'command': cmd}]})
    added = True

# ── 제거: Stop 의 contextMonitor.js. 반드시 '내부 훅' 단위로 지운다.
# 그 그룹에는 stopEvent.js·cleanup-bg-shells.sh 가 함께 들어 있어(실측),
# 그룹째 지우면 무관한 훅 2개가 같이 사라진다.
if rm_cm:
    stop = hooks.get('Stop')
    if isinstance(stop, list):
        new_stop = []
        for group in stop:
            if not isinstance(group, dict) or not isinstance(group.get('hooks'), list):
                new_stop.append(group)
                continue
            inner = group['hooks']
            kept = [h for h in inner
                    if not (isinstance(h, dict) and CM in str(h.get('command', '')))]
            if len(kept) == len(inner):
                new_stop.append(group)          # 이 그룹은 손대지 않음
                continue
            removed.append(CM)
            if kept:
                group['hooks'] = kept           # 나머지 훅은 그대로 살린다
                new_stop.append(group)
            # kept 가 비면 그룹을 뺀다 (우리가 비운 그룹에 한정)
        hooks['Stop'] = new_stop

# deduped 를 빠뜨리면 '정규 커맨드 2개'(이미 갱신까지 끝난 머신) 에서 added·updated 가 모두
# False 라 exit 10 → 임시본 폐기 → 파일 무변경 → 여전히 dup:2 로 막힌다.
if not added and not updated and not removed and not deduped:
    sys.exit(10)                      # 변경 없음

with open(tmp, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)   # 한글이 \uXXXX 로 깨지지 않게
    f.write('\n')

if added:
    print('  + PostToolUse 엔트리 추가')
if updated:
    print('  ~ PostToolUse 엔트리 커맨드 갱신 (node 경로 변경)')
if deduped:
    print('  ~ PostToolUse 중복 엔트리 %d 개 정리 (같은 훅의 다른 표기)' % deduped)
for r in removed:
    print('  - Stop 엔트리 제거: %s' % r)
PYMERGE
    } | MS_TARGET="${ms_target}" MS_TMP="${ms_tmp}" MS_CMD="${ms_cmd}" \
        MS_KEY="${CTX_HOOK_KEY}" MS_RM_CM="${ms_rm_cm}" MS_DO_ADD="${ms_do_add}" python3 - 2>&1
    )" || ms_rc=$?
    # schema: 줄은 내부 신호이므로 사용자에게는 감추고 나머지 안내만 출력한다.
    printf '%s' "${ms_err}" | grep -v '^  schema:' | grep . || true
  elif command -v jq >/dev/null 2>&1; then
    # ── 스키마 가드 (jq 실행 '전').
    # jq 의 `//` 는 좌변이 null·false 여도 우변을 쓴다 → "키 없음"과 "명시적 null/false"를
    # 구별하지 못해 사용자 데이터를 소리 없이 치환한다. python 경로는 같은 입력에 exit 4 로
    # 안전 실패하므로, 여기서도 **같은 신호(  schema: …)** 를 만들어 **같은 -eq 4 분기**로 합류시킨다.
    # (jq 표현식 안에서 error() 를 던지면 종료 코드가 python 의 4 와 갈라져 또 다른 계약 불일치가 된다)
    # 키 존재는 has() 로 본다 — type 만 보면 "키 없음"과 "명시적 null"을 구별할 수 없다.
    # 타입명은 python type().__name__ 에 맞춘다 (사용자에게 보이는 문구가 두 경로에서 같아야 한다).
    ms_schema_chk="$(jq -r '
        def pyname:
          if   type == "string"  then "str"
          elif type == "null"    then "NoneType"
          elif type == "boolean" then "bool"
          elif type == "object"  then "dict"
          elif type == "array"   then "list"
          elif type == "number"  then (if . == floor then "int" else "float" end)
          else type end;
        if (has("hooks") | not) then "ok"
        elif (.hooks | type) != "object" then "hooks=" + (.hooks | pyname)
        elif (.hooks | has("PostToolUse") | not) then "ok"
        elif (.hooks.PostToolUse | type) != "array" then "hooks.PostToolUse=" + (.hooks.PostToolUse | pyname)
        else "ok" end' "${ms_target}" 2>/dev/null)" || ms_schema_chk=""
    if [ -z "${ms_schema_chk}" ]; then
      ms_rc=3                       # 파싱 실패 또는 최상위가 객체가 아님 (python 의 exit 3 과 같은 자리)
    elif [ "${ms_schema_chk}" != "ok" ]; then
      ms_err="  schema: ${ms_schema_chk}"
      ms_rc=4
    elif jq --arg cmd "${ms_cmd}" --argjson keys "$(ctx_hook_keys_json)" --argjson rmcm "${ms_rm_cm}" --argjson doadd "${ms_do_add}" \
        "${CTX_JQ_MATCH}"'
        # 두 판정 모두 .hooks 배열 타입을 가드한다. 배열이 아닌 그룹(예: {"hooks":"x"})을
        # 만나면 any 가 던져 jq 프로그램 전체가 죽고 병합이 rc=3 으로 중단되기 때문이다.
        # python 은 isinstance(group.get(...), list) 로 그런 그룹을 건너뛰고 계속하므로,
        # 같은 계약으로 false 를 돌려준다(그룹은 무접촉 보존).
        def has_key: (.hooks? // [])
                     | if type == "array"
                       then any(type == "object" and cmd_is_exact_ours(.command? // ""))
                       else false end;
        def has_cm:  (.hooks? // [])
                     | if type == "array"
                       then any(type == "object" and ((.command? // "") | contains("hooks/universal/contextMonitor.js")))
                       else false end;
        # 가드를 통과했으므로 여기 도달 = 키가 없거나 타입이 맞다. 없을 때만 만든다(치환 금지).
        (if has("hooks") then . else .hooks = {} end)
        | (if (.hooks | has("PostToolUse")) then . else .hooks.PostToolUse = [] end)
        # 이미 있으면 커맨드를 갱신(node 경로 변경 대응), 없으면 추가. 중복 추가 금지.
        # 판정을 통과한 엔트리가 여러 개면 첫 번째만 남기고 접는다(python 경로와 같은 계약).
        # $keep = 첫 우리 엔트리의 [그룹 인덱스, 훅 인덱스]. 판정에 실패한 엔트리는 손대지 않는다.
        # 자리를 옮기지 않고 제자리에서 접는다 — 재배치하면 변경이 없어도 cmp -s 가 달라져
        # 멱등(변경 없음) 판정이 깨진다.
        # (이 주석 안에서 홑따옴표를 쓰지 말 것 — bash 홑따옴표 문자열이라 인자가 쪼개진다)
        | (if $doadd == 0 then .
           elif (.hooks.PostToolUse | any(has_key))
           then ([ .hooks.PostToolUse | to_entries[] | .key as $gi | .value
                   | if (type == "object" and ((.hooks? | type) == "array"))
                     then (.hooks | to_entries[]
                            | select((.value | type) == "object" and cmd_is_ours(.value.command? // ""))
                            | {pos: [$gi, .key], exact: cmd_is_exact_ours(.value.command? // "")})
                     else empty end ]) as $hits
                # 갱신 대상은 촘촘히 일치하는 첫 엔트리. has_key 가 (완전일치 + 배열 가드)라
                # 이 분기 도달 = 그 그룹이 객체이고 .hooks 가 배열이며 exact 히트가 있다는 뜻이고,
                # $hits 수집 조건도 같으므로(exact 이면 반드시 loose 이다) 뒤의 // 폴백은
                # 도달하지 않는다. 그래도 남기는 이유는 $keep 이 null 이 되면 아래 루프가
                # [gi,hj] == null 을 전부 실패시켜 우리 엔트리를 갱신이 아니라 empty 로 지우기
                # 때문이다 — 무동작이 아니라 데이터 손실이라 한 토큰짜리 방어를 유지한다.
                | ((([$hits[] | select(.exact)] | first) // ($hits | first)) | .pos) as $keep
                | .hooks.PostToolUse = [ .hooks.PostToolUse | to_entries[]
                    | .key as $gi | .value | (has_key) as $had
                    | (if (type == "object" and ((.hooks? | type) == "array"))
                       then .hooks = [ .hooks | to_entries[] | .key as $hj | .value
                              | if ((type == "object") and cmd_is_ours(.command? // ""))
                                then (if [$gi, $hj] == $keep
                                      then (.command = $cmd | .type = "command")
                                      elif cmd_is_exact_ours(.command? // "")
                                      then empty               # 확실히 우리 것 → 중복 제거
                                      else . end)              # 과잉매칭뿐 → 손대지 않는다
                                else . end ]
                       else . end)
                    # 우리가 비운 그룹만 뺀다 (원래 비어 있던 남의 그룹은 보존)
                    | select(($had | not) or ((.hooks? // [1]) | length) > 0) ]
           else .hooks.PostToolUse += [{"hooks": [{"type": "command", "command": $cmd}]}] end)
        | (if $rmcm == 1 and (.hooks.Stop? // [] | type) == "array" then
             .hooks.Stop = [ .hooks.Stop[] | (has_cm) as $had
               | (if $had
                  then .hooks = [ .hooks[] | select(((.command? // "") | contains("hooks/universal/contextMonitor.js")) | not) ]
                  else . end)
               # 모니터를 빼서 비워진 그룹만 뺀다 (원래 비어 있던 그룹은 보존 — python 경로와 같은 계약)
               | select(($had | not) or ((.hooks? // [1]) | length) > 0) ]
           else . end)
      ' "${ms_target}" > "${ms_tmp}" 2>/dev/null; then
      if cmp -s "${ms_tmp}" "${ms_target}"; then ms_rc=10; fi
    else
      ms_rc=3
    fi
  else
    # ms_tmp 는 위에서 이미 만들어졌다 — 파서가 없어 쓰지 못하고 나가더라도 반드시 지운다.
    # (문서화된 폴백 시나리오라 실행할 때마다 임시파일이 쌓인다)
    rm -f "${ms_tmp}"
    MS_REASON="python3 도 jq 도 없어 JSON 을 안전하게 병합할 수 없습니다"
    echo "  ⚠ python3 도 jq 도 없어 settings.json 을 안전하게 병합할 수 없습니다 → 건너뜀"
    return 1
  fi

  if [ "${ms_rc}" -eq 10 ]; then
    rm -f "${ms_tmp}"
    echo "  변경 없음 → 건너뜀 (엔트리가 이미 등록돼 있습니다)"
    # 변경 없음 경로도 같은 사후 조건을 태운다 — '이미 등록돼 있다'는 주장도 파일로 확인한다.
    ms_verify_registered "${ms_target}" "${ms_cmd}"
    return $?
  fi
  if [ "${ms_rc}" -eq 4 ]; then
    rm -f "${ms_tmp}"
    ms_schema="$(printf '%s' "${ms_err}" | sed -n 's/^  schema: //p' | head -1)"
    MS_REASON="settings.json 의 훅 구조가 예상과 다릅니다(${ms_schema:-형식 불일치})"
    echo "  ⚠ settings.json 의 ${ms_schema:-hooks 구조} 가 예상 형식이 아닙니다."
    echo "    안전을 위해 병합하지 않았습니다(원본 무변경). 수동으로 확인 후 다시 실행하세요."
    return 1
  fi
  if [ "${ms_rc}" -eq 3 ]; then
    rm -f "${ms_tmp}"
    MS_REASON="settings.json 이 이미 유효한 JSON 이 아닙니다"
    echo "  ⚠ settings.json 을 파싱할 수 없습니다 → 변경하지 않았습니다(원본 보존)."
    echo "    JSON 문법을 수동 확인한 뒤 재실행하세요: ${ms_target}"
    return 1
  fi
  if [ "${ms_rc}" -ne 0 ] || [ ! -s "${ms_tmp}" ]; then
    rm -f "${ms_tmp}"
    MS_REASON="병합 중 오류가 발생했습니다(rc=${ms_rc})"
    echo "  ⚠ 병합 중 오류(rc=${ms_rc}) → settings.json 을 변경하지 않았습니다(원본 보존)."
    return 1
  fi

  # 유효성 게이트 ①: 교체 전에 임시본이 유효한 JSON 인지 확인.
  if ! ctx_json_valid "${ms_tmp}"; then
    rm -f "${ms_tmp}"
    MS_REASON="병합 결과가 유효한 JSON 이 아닙니다"
    echo "  ⚠ 병합 결과가 유효한 JSON 이 아닙니다 → settings.json 을 변경하지 않았습니다(원본 보존)."
    return 1
  fi

  # 교체는 statusline 경로와 '같은 헬퍼'로 한다 (백업 + cp -p 로 퍼미션·소유 승계 +
  # 같은 디렉토리 임시본 + 원자적 mv). mktemp 파일을 그대로 mv 하면 프로세스 umask(보통 022)
  # 때문에 0600 이던 settings.json 이 0644 로 '넓어진다' — 이 파일은 env 키를 담을 수 있어
  # 자격증명이 다른 로컬 사용자에게 노출될 수 있다.
  # cleanup 단계의 복원원(源)은 '단계 직전 스냅샷'이다.
  # LAST_BACKUP/BACKUP_MAP 이 가리키는 백업은 대상당 1개 = register '이전'(훅 미등록) 상태뿐이라,
  # cleanup 에서 그것으로 되돌리면 방금 성공한 훅 등록이 지워진다. 그 시점엔 브리지가 이미
  # advisor 메트릭으로 전환된 뒤라 구 모니터도 새 훅도 발화하지 못한다 = 경고 전면 사망.
  # cleanup 이 되돌려야 하는 올바른 상태는 '등록됨 + 브리지 전환됨 + 구 모니터 잔존' 이다.
  # 스냅샷을 .bak.<타임스탬프> 로 만들지 않는다 — '백업은 실행당 1개, 내용은 설치 전 원본'
  # 계약(backup_if_exists 주석)이 깨진다. 같은 디렉토리의 내부 임시본을 쓰고 끝나면 지운다.
  ms_snap=""
  if [ "${ms_mode}" = cleanup ]; then
    ms_snap="$(mktemp "${ms_target%/*}/.settings.presnap.XXXXXX" 2>/dev/null)" || ms_snap=""
    if [ -z "${ms_snap}" ] || ! cp -p "${ms_target}" "${ms_snap}" 2>/dev/null; then
      rm -f "${ms_snap}" "${ms_tmp}"
      MS_REASON="정리 직전 스냅샷을 만들지 못했습니다"
      echo "  ⚠ 정리 직전 스냅샷을 만들지 못해 settings.json 을 변경하지 않았습니다(원본 보존)."
      return 1
    fi
  fi
  ms_before_mode="$(ls -l "${ms_target}" 2>/dev/null | cut -c1-10)"
  # 쓰기 성공을 '반환 코드로' 받는다. 삼키면 낡은 커맨드가 남은 채 성공으로 통과한다.
  if ! install_file_preserve_mode "${ms_target}" "${ms_tmp}"; then
    rm -f "${ms_snap}"
    MS_REASON="settings.json 쓰기에 실패했습니다(원본 보존)"
    return 1
  fi
  ms_backup="${LAST_BACKUP}"
  # 복원원 단일화: cleanup 은 단계 직전 스냅샷, register 는 설치 전 백업.
  # 두 경로가 섞이면 cleanup 이 훅 등록을 지우거나 register 가 엉뚱한 상태로 되돌아간다.
  ms_restore="${ms_backup}"
  if [ -n "${ms_snap}" ]; then ms_restore="${ms_snap}"; fi
  if [ "$(ls -l "${ms_target}" 2>/dev/null | cut -c1-10)" != "${ms_before_mode}" ]; then
    echo "  ⚠ 퍼미션이 변경되었습니다(${ms_before_mode} → $(ls -l "${ms_target}" | cut -c1-10)). 확인하세요."
  fi

  # 유효성 게이트 ②: 쓴 뒤 '실제 파일'을 다시 파싱한다. 실패면 백업을 복원하고 중단한다.
  # 정상 경로(파싱→덤프)는 항상 유효한 JSON 을 내므로 이 분기는 잘려 쓰인 파일·중단된 쓰기
  # 같은 사고를 막는 안전망이다. 설정 파일이 깨진 채로 남는 것보다 설치 실패가 낫다.
  if ! ctx_json_valid "${ms_target}"; then
    echo ""
    echo "  ✗✗ 치명: settings.json 이 병합 후 유효하지 않습니다."
    if [ -n "${ms_restore}" ] && [ -f "${ms_restore}" ]; then
      # 복원 성공을 확인한 뒤에만 스냅샷을 지운다 — 실패했는데 지우면 유일한 복구 수단이 사라진다.
      if cp -p "${ms_restore}" "${ms_target}" 2>/dev/null; then
        echo "  ↳ 백업을 복원했습니다: ${ms_restore} → ${ms_target}"
        rm -f "${ms_snap}"
      else
        echo "  ↳ ⚠ 백업 복원 실패. 수동 확인이 필요합니다: ${ms_restore}"
      fi
    else
      echo "  ↳ ⚠ 백업 파일을 찾지 못했습니다(${ms_restore}). 수동 복구가 필요합니다."
    fi
    echo "  설치를 중단합니다."
    exit 1
  fi
  # 사후 조건: 쓴 결과를 '다시 읽어' 정확히 확인한다. 어긋나면 백업 복원 후 실패 반환.
  if ! ms_verify_registered "${ms_target}" "${ms_cmd}"; then
    echo "  ⚠ 병합 후 검증 실패: ${MS_REASON}"
    if [ -n "${ms_restore}" ] && [ -f "${ms_restore}" ]; then
      if cp -p "${ms_restore}" "${ms_target}" 2>/dev/null; then
        echo "  ↳ 백업을 복원했습니다: ${ms_restore} → ${ms_target}"
        rm -f "${ms_snap}"
      else
        echo "  ↳ ⚠ 백업 복원 실패. 수동 확인이 필요합니다: ${ms_restore}"
      fi
    fi
    return 1
  fi
  # 성공 — 스냅샷은 역할을 다했다. 남기면 ~/.claude 에 점파일이 쌓인다(ms_target 이 심링크면
  # 해석된 실경로 = dotfiles 저장소 안에 생기므로 더 눈에 띈다).
  rm -f "${ms_snap}"
}

# 사후 조건: 우리 훅이 settings.json 에 '정확히 1개', '커맨드 문자열 완전 일치'로 등록됐는지
# 결과 파일에서 직접 확인한다.
#
# 왜 부분일치가 아니라 완전일치인가 — 업그레이드에서 낡은 node 경로를 갱신해야 하는데,
# "advisor-context-budget.js 가 들어있는가"만 보면 갱신이 실패해 낡은 커맨드가 남아도
# 성공으로 통과한다. 실행 불가능한 훅 + 전환된 브리지 = 경고 전면 중단.
# 원칙: 쓰기 결과를 믿지 말고 읽어서 확인한다.
# (엔트리 '판정'은 탐색·계수 모두 토큰 완전일치이고, 여기서는 커맨드 문자열까지 완전일치를 요구한다)
ms_verify_registered() {
  ms_vr_file="$1"
  ms_vr_cmd="$2"
  if ! ctx_json_valid "${ms_vr_file}"; then
    MS_REASON="병합 후 settings.json 이 유효한 JSON 이 아닙니다"
    return 1
  fi
  ms_vr_n="$(ctx_hook_entry_count "${ms_vr_file}" "${ms_vr_cmd}")"
  case "${ms_vr_n}" in
    'exact:1') return 0 ;;
    'found:0') MS_REASON="병합 후에도 훅 엔트리를 찾을 수 없습니다" ;;
    'dup:'*)   MS_REASON="훅 엔트리가 ${ms_vr_n#dup:} 개 중복 등록됐습니다" ;;
    'stale:'*) MS_REASON="훅 엔트리의 커맨드가 기대값과 다릅니다(갱신 실패 — 실행 불가능한 훅이 남습니다)" ;;
    *)         MS_REASON="훅 엔트리 검증에 실패했습니다(${ms_vr_n})" ;;
  esac
  return 1
}

# jq 경로용 '우리 훅 경로' 문자열 동치 집합 (JSON 배열).
# jq 에는 realpath 가 없어 심링크 별칭은 원리적으로 판정할 수 없다 → 표기 4형태만 덮는다.
ctx_hook_keys_json() {
  ctx_k_rel=""
  case "${CTX_HOOK_PATH}" in
    "${HOME}"/*) ctx_k_rel="${CTX_HOOK_PATH#"${HOME}"/}" ;;
  esac
  if [ -n "${ctx_k_rel}" ]; then
    jq -nc --arg p "${CTX_HOOK_PATH}" --arg r "${ctx_k_rel}" \
      '[$p, "~/" + $r, "$HOME/" + $r, "${HOME}/" + $r]'
  else
    jq -nc --arg p "${CTX_HOOK_PATH}" '[$p]'
  fi
}

# 결과를 문자열로 반환: exact:1 / found:0 / dup:N / stale:N
ctx_hook_entry_count() {
  if command -v python3 >/dev/null 2>&1; then
    MS_CHK_KEY="${CTX_HOOK_KEY}" MS_CHK_CMD="$2" python3 -c "${CTX_PY_PATHMATCH}"'
import json, os, sys
try:
    d = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    print("found:0"); sys.exit(0)
k, want = os.environ["MS_CHK_KEY"], os.environ["MS_CHK_CMD"]
groups = (d.get("hooks") or {}).get("PostToolUse") or []
cmds = [str(h.get("command", ""))
        for g in groups if isinstance(g, dict)
        for h in (g.get("hooks") or []) if isinstance(h, dict)
        and ctx_is_ours(h.get("command", ""), k)]
if not cmds:
    print("found:0")
elif len(cmds) > 1:
    print("dup:%d" % len(cmds))
elif cmds[0] != want:            # 부분일치 금지 — 완전일치만 성공
    print("stale:1")
else:
    print("exact:1")' "$1" 2>/dev/null || echo "found:0"
  elif command -v jq >/dev/null 2>&1; then
    jq -r --argjson keys "$(ctx_hook_keys_json)" --arg want "$2" \
      "${CTX_JQ_MATCH}"'
       [.hooks.PostToolUse[]?.hooks[]?.command? // "" | select(cmd_is_exact_ours(.))] as $c
       | if ($c|length) == 0 then "found:0"
         elif ($c|length) > 1 then "dup:" + (($c|length)|tostring)
         elif $c[0] != $want then "stale:1"
         else "exact:1" end' "$1" 2>/dev/null || echo "found:0"
  else
    echo "found:0"
  fi
}

# 파일이 유효한 JSON 인지 확인 (python3 우선, 없으면 jq).
ctx_json_valid() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys; json.load(open(sys.argv[1],encoding="utf-8"))' "$1" >/dev/null 2>&1
  elif command -v jq >/dev/null 2>&1; then
    jq -e . "$1" >/dev/null 2>&1
  else
    return 1
  fi
}

# ── statusline 조작 공용 헬퍼 (삽입 경로·구 블록 정리 경로가 함께 쓴다) ──────────
#
# 심링크를 실제 경로까지 해석한다. 성공 시 결과를 전역 CTX_RESOLVED 에 넣고 0 을 반환하며,
# 이 값은 **호출 직후에만 유효**하다(다음 호출이 덮어쓴다). 해석 불가면 비0 반환 + CTX_RESOLVED 미갱신.
# install_file_preserve_mode 의 'mv -f tmp target' 은 target 이 심링크면 심링크 자체를
# 일반 파일로 갈아치운다 → dotfiles 저장소 연결이 조용히 끊어진다. 그래서 쓰기 전에 해석한다.
# readlink -f 는 BSD/macOS 구버전에 없으므로 직접 최대 5홉까지 따라간다.
ctx_resolve_link() {
  ctx_rl_path="$1"
  ctx_rl_hops=0
  while [ -L "${ctx_rl_path}" ] && [ "${ctx_rl_hops}" -lt 5 ]; do
    ctx_rl_link="$(readlink "${ctx_rl_path}")"
    case "${ctx_rl_link}" in
      /*) ctx_rl_path="${ctx_rl_link}" ;;
      *)  ctx_rl_path="$(dirname "${ctx_rl_path}")/${ctx_rl_link}" ;;  # 상대 심링크는 대상 디렉토리 기준
    esac
    ctx_rl_hops=$(( ctx_rl_hops + 1 ))
  done
  if [ -L "${ctx_rl_path}" ]; then
    echo "  ⚠ 심링크 체인이 너무 깊습니다(5홉 초과) → 건너뜀: ${ctx_rl_path}"
    return 1
  fi
  if [ ! -f "${ctx_rl_path}" ]; then
    echo "  ⚠ 심링크 해석 결과가 일반 파일이 아닙니다 → 건너뜀: ${ctx_rl_path}"
    return 1
  fi
  if [ "${ctx_rl_hops}" -gt 0 ]; then
    echo "  심링크 해석(${ctx_rl_hops}홉) → 실제 파일: ${ctx_rl_path}"
  fi
  CTX_RESOLVED="${ctx_rl_path}"
  return 0
}

# 마커 구조 검증: 없음(0쌍) 또는 정확히 1쌍(start가 end보다 앞)만 정상. 비정상이면 비0.
# 정리 경로에서 특히 중요하다 — start 만 있고 end 가 없는 파일에 ctx_strip_markers 를 돌리면
# 블록 시작 이후 전부가 삭제된다(사용자 스크립트 파손).
ctx_markers_sane() {
  ctx_ms_file="$1"
  ctx_ms_n_start="$(grep -cF "${CTX_MARK_START}" "${ctx_ms_file}" || true)"
  ctx_ms_n_end="$(grep -cF "${CTX_MARK_END}" "${ctx_ms_file}" || true)"
  if [ "${ctx_ms_n_start}" -ne "${ctx_ms_n_end}" ] || [ "${ctx_ms_n_start}" -gt 1 ]; then
    echo "  ⚠ 브리지 마커 구조 비정상(start=${ctx_ms_n_start}, end=${ctx_ms_n_end}) → 건너뜀"
    echo "    ${ctx_ms_file} 에서 마커를 수동 정리 후 재실행하세요."
    return 1
  fi
  if [ "${ctx_ms_n_start}" -eq 1 ]; then
    ctx_ms_l_start="$(grep -nF "${CTX_MARK_START}" "${ctx_ms_file}" | head -1 | cut -d: -f1)"
    ctx_ms_l_end="$(grep -nF "${CTX_MARK_END}" "${ctx_ms_file}" | head -1 | cut -d: -f1)"
    if [ "${ctx_ms_l_start}" -ge "${ctx_ms_l_end}" ]; then
      echo "  ⚠ 브리지 마커 순서 역전(start=${ctx_ms_l_start}, end=${ctx_ms_l_end}) → 건너뜀"
      return 1
    fi
  fi
  return 0
}

# 마커 블록 '본문이' "$input" / "${input}" 을 참조하면 0(= 깨진 구 버전 블록).
# 판정 범위를 마커 사이로 한정하는 것이 핵심 — 파일 다른 곳의 input 문자열(주석·다른 변수)에
# 반응하면 정상 블록을 파괴한다. ctx_strip_markers 의 awk 를 뒤집어(버리는 대신 출력) 본문만 뽑는다.
ctx_block_uses_input() {
  awk -v s="${CTX_MARK_START}" -v e="${CTX_MARK_END}" '
    $0 == s { inblock=1; next }
    $0 == e { inblock=0; next }
    inblock { print }
  ' "$1" | grep -qE '\$\{input\}|\$input([^A-Za-z0-9_]|$)'
}

# 마커 블록만 제거한 내용을 $2 에 쓴다 (마커 밖은 바이트 그대로 보존).
ctx_strip_markers() {
  awk -v s="${CTX_MARK_START}" -v e="${CTX_MARK_END}" '
    $0 == s { inblock=1; next }
    $0 == e { inblock=0; next }
    inblock { next }
    { print }
  ' "$1" > "$2"
}

# 지원 불가로 skip 하는 스크립트에 구 버전이 심어둔 브리지 블록이 남아 있으면 제거한다.
# 구 버전은 '^CURRENT_USAGE=' 앵커만 봤으므로 stdin 을 다른 이름(payload=$(cat) 등)으로 받는
# 스크립트에도 블록을 심었다. 그 블록은 "$input" 을 참조하므로 매 렌더 unbound variable 로
# 죽는다 — 삽입 대상에서 빼기만 하면 업데이트가 고장을 고치지 못한다. 삽입은 안 하되 제거는 한다.
ctx_cleanup_stale_block() {
  ctx_resolve_link "$1" || return 0
  ctx_cs_file="${CTX_RESOLVED}"
  grep -qF "${CTX_MARK_START}" "${ctx_cs_file}" 2>/dev/null || return 0
  ctx_markers_sane "${ctx_cs_file}" || return 0
  # 수동 수리본은 보존한다. 위 경고는 사용자에게 수동 삽입을 안내하므로(REVIEW §4), 사용자가
  # 블록 안의 "$input" 을 자기 변수명으로 고쳐 정상 동작시키는 것은 **지원되는 시나리오**다.
  # 마커가 있다는 이유만으로 지우면 잘 돌던 설정을 재실행마다 파괴하고 경고를 꺼버린다.
  if ! ctx_block_uses_input "${ctx_cs_file}"; then
    echo "  마커 블록이 있으나 \$input 참조가 없어 수동 수리본으로 보고 보존합니다."
    return 0
  fi
  echo "  구 버전이 설치한 브리지 블록을 발견했습니다 → 백업 후 제거합니다(마커 밖은 보존)."
  ctx_cs_tmp="$(mktemp)"
  ctx_strip_markers "${ctx_cs_file}" "${ctx_cs_tmp}"
  if ! install_file_preserve_mode "${ctx_cs_file}" "${ctx_cs_tmp}"; then
    echo "    ↳ ⚠ 구 블록 제거에 실패했습니다(원본 보존). 수동 정리가 필요합니다."
    return 0
  fi
  echo "    ↳ 구 블록 제거 완료 (블록을 새로 삽입하지는 않습니다)"
}

# 활성 statusline 스크립트에 컨텍스트 예산 브리지 블록을 삽입한다.
# settings.json 은 읽기만 하고 절대 쓰지 않는다. 전제가 하나라도 어긋나면 경고 후 skip.
# 반환값 계약: 0 = 브리지 블록이 '실제로' 대상 파일에 있다(재읽기로 확인) / 1 = skip·실패.
# 호출부는 이 값으로 '구 Stop 모니터를 제거해도 되는지'를 결정한다 —
# 대체 감지 수단이 확인되기 전에 구 모니터를 지우면 경고가 전면 중단된다.
CTX_BRIDGE_REASON=""
install_ctx_bridge() {
  echo "▶ statusline 컨텍스트 예산 브리지 삽입"
  CTX_BRIDGE_REASON=""
  ctx_settings="${CLAUDE_DIR}/settings.json"

  if ! command -v jq >/dev/null 2>&1; then
    echo "  ⚠ jq 가 없어 statusline 경로를 확인할 수 없습니다 → 브리지 건너뜀"
    CTX_BRIDGE_REASON="jq 가 없어 statusline 경로를 확인할 수 없습니다"
    return 1
  fi
  if [ ! -f "${ctx_settings}" ]; then
    echo "  ⚠ ${ctx_settings} 없음 → 브리지 건너뜀"
    CTX_BRIDGE_REASON="settings.json 이 없습니다"
    return 1
  fi

  # settings.json 은 읽기 전용으로만 접근한다.
  ctx_cmd="$(jq -r '.statusLine.command // ""' "${ctx_settings}" 2>/dev/null || true)"
  if [ -z "${ctx_cmd}" ] || [ "${ctx_cmd}" = "null" ]; then
    echo "  ⚠ settings.json 에 .statusLine.command 가 없습니다 → 브리지 건너뜀"
    CTX_BRIDGE_REASON=".statusLine.command 가 없습니다"
    return 1
  fi

  # 래퍼 커맨드 대응: 첫 토큰이 아니라 토큰을 순회하며 대상을 고른다.
  #   "bash ~/statusline.sh" / "env FOO=1 ~/statusline.sh" / "/bin/zsh ~/statusline.sh"
  # 첫 토큰만 보면 인터프리터(bash/env)를 대상으로 잡아 앵커를 못 찾고 조용히 skip 된다.
  # 후보 조건: 선행 '~' 를 $HOME 으로 확장한 뒤 실제 파일(-f)이고 앵커 2종을 모두 포함한 첫 파일.
  #   - 'bash'·'env' 같은 PATH 실행파일은 상대경로라 -f 에서 탈락
  #   - '/bin/bash' 처럼 절대경로로 와도 앵커 검사에서 탈락
  #   - 'FOO=1' 같은 env 대입도 -f 에서 탈락
  # 앵커가 2종인 이유: '^CURRENT_USAGE=' 는 삽입 위치(앵커 줄 뒤)를 정하고,
  # CTX_INPUT_ANCHOR 는 삽입 블록이 참조하는 stdin 변수명이 실제로 'input' 임을 보장한다.
  # 후자를 확인하지 않으면 stdin 을 다른 이름(예: payload=$(cat))으로 받는 스크립트에서
  # 블록이 미정의 "$input" 을 읽고, 대상이 set -u 면 렌더링 전체가 죽는다.
  ctx_script=""
  ctx_partial=""   # CURRENT_USAGE= 는 있으나 input= 앵커가 없는 후보 (경고 문구 분기용)
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
    grep -q '^CURRENT_USAGE=' "${ctx_tok}" 2>/dev/null || continue
    if ! ctx_has_input_anchor "${ctx_tok}"; then
      [ -n "${ctx_partial}" ] || ctx_partial="${ctx_tok}"
      continue
    fi
    ctx_script="${ctx_tok}"
    break
  done
  if [ -z "${ctx_script}" ]; then
    if [ -n "${ctx_partial}" ]; then
      echo "  ⚠ 대상 스크립트가 stdin 을 'input' 변수로 받지 않습니다(브리지 블록이 \$input 을 참조)."
      echo "    대상: ${ctx_partial}"
      echo "    컨텍스트 예산 경고가 설치되지 않았습니다. REVIEW 문서 §4 를 보고 수동 삽입하세요."
      # skip 과 정리는 별개 결정이다 — 구 버전이 심어둔 깨진 블록은 여기서 치운다.
      ctx_cleanup_stale_block "${ctx_partial}"
    else
      echo "  ⚠ statusLine 커맨드에서 앵커(^CURRENT_USAGE= 와 input= 선언)를 가진 스크립트를 찾지 못했습니다."
      echo "    커맨드: ${ctx_cmd}"
      echo "    컨텍스트 예산 경고가 동작하지 않습니다. statusline 스크립트 경로를 공백 없는"
      echo "    '~/' 또는 '\$HOME/' 형태로 두거나, 블록을 수동 삽입하세요(REVIEW 문서 §4 참조)."
    fi
    CTX_BRIDGE_REASON="앵커를 가진 statusline 스크립트를 찾지 못했습니다"
    return 1
  fi
  echo "  대상 statusline: ${ctx_script}"

  # 심링크는 쓰기 전에 실제 경로로 해석한다(임시본도 해석된 경로와 같은 디렉토리에 생긴다).
  ctx_resolve_link "${ctx_script}" || { CTX_BRIDGE_REASON="statusline 심링크 해석 실패"; return 1; }
  ctx_script="${CTX_RESOLVED}"

  # 마커 구조 검증: 없음(0쌍) 또는 정확히 1쌍(start가 end보다 앞)만 허용.
  ctx_markers_sane "${ctx_script}" || { CTX_BRIDGE_REASON="statusline 마커 구조 비정상"; return 1; }

  # 브리지 본문. POSIX sh 호환이고 표준출력에 아무것도 쓰지 않는다(statusline 표시가 깨진다).
  ctx_body="$(mktemp)"
  cat > "${ctx_body}" <<'CTXBRIDGE'
# 조언자 컨텍스트 예산 브리지: baseline 대비 델타를 '사실 그대로' 기록해
# advisor-context-budget.js(PostToolUse, 번들 소유)에 전달한다. 표준출력에 아무것도 쓰지 않는다.
# 합성 잔량(remaining_percentage)을 쓰지 않는다 — 판정은 훅이 델타로 직접 한다.
# 창 사용률(window_pct)은 '고갈이 아님'을 경고문에 함께 적기 위한 참고값이지 판정 기준이 아니다.
# 비0 종료 가능한 명령에는 전부 '|| true' 를 붙인다 — 대상 스크립트가 set -e 면
# baseline 파일이 없는 첫 렌더에서 cat 이 비0으로 끝나 statusline 전체가 죽는다.
# 상태 파일은 공유 임시디렉토리(대개 /tmp) 에 있고 이름이 session_id 로 예측 가능하다 — 다른 로컬
# 사용자가 심링크를 선점하면 평범한 '>' 는 그것을 따라가 임의 파일을 덮어쓴다.
# rename(2) 은 대상이 심링크여도 따라가지 않고 '교체'하므로 같은 디렉토리 mktemp + mv 로 쓴다.
# 임시본은 반드시 ${__ctx_dir} 안에 만든다 — 다른 파일시스템이면 mv 가 원자적이지 않다.
__ctx_write() {  # $1=대상 경로 $2=내용 — 성공 0 / 실패 1. 표준출력에 아무것도 쓰지 않는다.
  __ctx_wt=$(mktemp "${__ctx_dir}/claude-ctx-advisor-wtmp.XXXXXX" 2>/dev/null) || return 1
  if printf '%s' "$2" > "$__ctx_wt" 2>/dev/null && mv -f "$__ctx_wt" "$1" 2>/dev/null; then
    return 0
  fi
  rm -f "$__ctx_wt" 2>/dev/null || true
  return 1
}
__ctx_sid=$(printf '%s' "$input" | jq -r '.session_id // ""' 2>/dev/null || true)
if [ -n "$__ctx_sid" ]; then
  # 해석 순서는 훅(advisor-context-budget.js)과 반드시 같아야 한다: TMPDIR → TMP → TEMP → /tmp.
  # ${TMPDIR:-/tmp} 만 보면 TMP·TEMP 만 설정된 환경에서 브리지는 /tmp 에 쓰고 훅은 $TMP 를 읽어
  # 메트릭이 영영 만나지 않는다 → 모든 컨텍스트 예산 경고가 조용히 억제된다.
  __ctx_dir="${TMPDIR:-${TMP:-${TEMP:-/tmp}}}"; __ctx_dir="${__ctx_dir%/}"
  # 구 배선(GSD) 잔여 파일 정리 — '사용량 가드보다 앞'이어야 한다.
  # 업그레이드 직후 첫 렌더가 CURRENT_USAGE=null 이거나 토큰 합이 0 이면 아래 가드 안쪽에
  # 도달하지 못하는데, 그 사이 GSD 훅이 남은 claude-ctx-{sid}.json 을 TTL(60초) 동안 읽어
  # 이번 마이그레이션이 없애려던 '낡은 경고'를 주입한다.
  # 글롭이 아니라 정확한 이름만 지운다 — 다른 세션이나 advisor 파일을 휩쓸지 않는다.
  rm -f "${__ctx_dir}/claude-ctx-${__ctx_sid}.json" \
        "${__ctx_dir}/claude-ctx-${__ctx_sid}-base" \
        "${__ctx_dir}/claude-ctx-${__ctx_sid}-prev" \
        "${__ctx_dir}/claude-ctx-${__ctx_sid}-warned.json" 2>/dev/null || true
fi
if [ -n "$__ctx_sid" ] && [ "$CURRENT_USAGE" != "null" ]; then
  __ctx_now=$(printf '%s' "$CURRENT_USAGE" | jq -r '(.input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.cache_read_input_tokens // 0)' 2>/dev/null || true)
  case "$__ctx_now" in ''|*[!0-9]*) __ctx_now=0 ;; esac
  if [ "$__ctx_now" -gt 0 ]; then
    # 창 크기는 판정에 쓰지 않으므로 없으면 200000 으로 둔다(표시용 기본값).
    __ctx_win=$(printf '%s' "$input" | jq -r '.context_window.context_window_size // 200000' 2>/dev/null || true)
    case "$__ctx_win" in ''|*[!0-9]*) __ctx_win=200000 ;; esac
    [ "$__ctx_win" -gt 0 ] || __ctx_win=200000
    __ctx_base_f="${__ctx_dir}/claude-ctx-advisor-${__ctx_sid}-base"   # 예산 기준점
    __ctx_prev_f="${__ctx_dir}/claude-ctx-advisor-${__ctx_sid}-prev"   # 직전 관측값
    __ctx_base=$(cat "$__ctx_base_f" 2>/dev/null || true)
    case "$__ctx_base" in ''|*[!0-9]*) __ctx_base=0 ;; esac
    __ctx_prev=$(cat "$__ctx_prev_f" 2>/dev/null || true)
    case "$__ctx_prev" in ''|*[!0-9]*) __ctx_prev=0 ;; esac
    # 재래치 판정은 baseline 이 아니라 '직전 관측값' 과 비교한다.
    # compact 는 시스템 프롬프트·CLAUDE.md·도구 스키마(= baseline 구성요소)를 그대로 두고
    # 대화만 요약으로 대체하므로 결과는 대개 'baseline + 요약' 이다 → 'now < baseline' 은
    # 영원히 거짓이 되어 예산이 리셋되지 않는다(compact 직후 즉시 재발동).
    # 관측값이 '떨어지는 것' 이 compact 의 신호다.
    __ctx_relatch=0
    if [ "$__ctx_base" -eq 0 ] || [ "$__ctx_prev" -eq 0 ]; then
      __ctx_relatch=1                       # 최초 관측 (또는 상태파일 유실)
    elif [ "$__ctx_now" -lt "$__ctx_prev" ]; then
      __ctx_relatch=1                       # 관측값 하락 = compact 발생
    fi
    # 재래치 시 디바운스 상태도 함께 지운다 — 안 지우면 compact 전 lastLevel 이 승계돼
    # 재발동 시 초기 경고가 5회 삼켜진다(REVIEW §3.1).
    if [ "$__ctx_relatch" -eq 1 ]; then
      __ctx_base="$__ctx_now"
      __ctx_write "$__ctx_base_f" "$__ctx_base" || true
      rm -f "${__ctx_dir}/claude-ctx-advisor-${__ctx_sid}-warned.json" 2>/dev/null || true
    fi
    __ctx_write "$__ctx_prev_f" "$__ctx_now" || true
    __ctx_delta=$(( __ctx_now - __ctx_base ))
    __ctx_wpct=$(( __ctx_now * 100 / __ctx_win ))
    # 사실만 기록한다. 임계 판정(51133 / 59000)은 훅이 delta 로 직접 수행한다.
    __ctx_json=$(printf '{"session_id":"%s","baseline":%s,"current":%s,"delta":%s,"window":%s,"window_pct":%s,"timestamp":%s}' \
      "$__ctx_sid" "$__ctx_base" "$__ctx_now" "$__ctx_delta" "$__ctx_win" "$__ctx_wpct" "$(date +%s)" 2>/dev/null || true)
    __ctx_write "${__ctx_dir}/claude-ctx-advisor-${__ctx_sid}.json" "$__ctx_json" || true
  fi
fi
CTXBRIDGE

  # 멱등성: 매 실행마다 (1) 기존 마커 블록 제거 → (2) 앵커 뒤에 새 블록 삽입.
  # 최초 삽입과 재삽입이 같은 코드 경로를 타므로 2회 실행 결과가 바이트 동일해진다.
  ctx_stripped="$(mktemp)"
  ctx_strip_markers "${ctx_script}" "${ctx_stripped}"

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
    CTX_BRIDGE_REASON="삽입 결과 마커 검증 실패"
    return 1
  fi

  if ! install_file_preserve_mode "${ctx_script}" "${ctx_new}"; then
    echo "  ⚠ statusline 브리지를 전환하지 못했습니다(원본 보존). 해결 후 재실행하세요."
    rm -f "${ctx_body}" "${ctx_stripped}"
    CTX_BRIDGE_REASON="statusline 쓰기에 실패했습니다"
    return 1
  fi
  rm -f "${ctx_body}" "${ctx_stripped}"

  # 사후 조건: 쓰기 결과를 믿지 않고 '다시 읽어' 새 형식 블록이 실제로 있는지 확인한다.
  # (N 라운드와 같은 원칙. 여기 성공 여부가 구 모니터 제거의 전제가 되므로 더 엄격해야 한다)
  if ! grep -qF "${CTX_MARK_START}" "${ctx_script}" 2>/dev/null \
     || ! grep -q 'claude-ctx-advisor-' "${ctx_script}" 2>/dev/null; then
    echo "  ⚠ 브리지 블록 사후 검증 실패 → 전환되지 않은 것으로 처리합니다."
    CTX_BRIDGE_REASON="브리지 블록 사후 검증 실패"
    return 1
  fi
  return 0
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
컨텍스트 경고(CONTEXT BUDGET WARNING / CONTEXT BUDGET CRITICAL)가 주입되면 즉시:
1. 진행 중 작업을 자연스러운 지점에서 마무리
2. 상태 저장 — `.planning/STATE.md` 가 있으면 `/gsd:pause-work` 를 제안하고, 없으면 HANDOFF.md 작성(설계 결정·완료 기준·검증 상태·다음 단계). 코드가 더러우면 `/wip-save` 병행
3. 새 세션을 권고한다 (compact 보다 우선 — 무엇을 남길지 조언자가 직접 고를 수 있다)
저장 포맷을 새로 만들지 않는다. 위 경로 중 하나를 쓴다.
경고는 예산 소진(세션 시작 대비 델타)과 컨텍스트 창 사용률을 함께 표시한다.
둘은 다른 지표다 — 창에 여유가 있어도 예산을 넘으면 정지 대상이다.
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
    install_file "${CLAUDE_TARGET}" "${TMP_OUT}" || echo "  ⚠ CLAUDE.md 갱신 실패(원본 보존)."
  else
    rm -f "${TMP_OUT}"
    echo "  ⚠ 교체 결과 검증 실패 → CLAUDE.md 를 변경하지 않았습니다. 수동 확인 필요."
  fi
elif [ "${N_START}" -gt 0 ] || [ "${N_END}" -gt 0 ]; then
  echo "  ⚠ 마커 구조 비정상(start=${N_START}, end=${N_END}) → CLAUDE.md 를 변경하지 않았습니다."
  echo "    마커가 정확히 1쌍(start가 end보다 앞)이 되도록 수동 정리 후 재실행하세요."
else
  # 마커 없음(최초 설치 또는 구버전) → 백업 후 마커 포함 전체 생성
  if ! backup_if_exists "${CLAUDE_TARGET}"; then
    echo "  ⚠ 백업 실패 → CLAUDE.md 를 변경하지 않았습니다(원본 보존)."
    rm -f "${TMP_BLOCK}"
    exit 1
  fi
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
install_file "${AGENTS_DIR}/architect.md" "${TMP_AGENT}" || echo "  ⚠ architect.md 설치 실패(원본 보존)."

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
install_file "${AGENTS_DIR}/worker.md" "${TMP_AGENT}" || echo "  ⚠ worker.md 설치 실패(원본 보존)."

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
install_file "${AGENTS_DIR}/analyzer.md" "${TMP_AGENT}" || echo "  ⚠ analyzer.md 설치 실패(원본 보존)."

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
install_file "${AGENTS_DIR}/researcher.md" "${TMP_AGENT}" || echo "  ⚠ researcher.md 설치 실패(원본 보존)."

# 구버전 reviewer.md 백업 후 제거 (검증은 Codex로 대체)
if [ -f "${AGENTS_DIR}/reviewer.md" ]; then
  if backup_if_exists "${AGENTS_DIR}/reviewer.md"; then
    rm -f "${AGENTS_DIR}/reviewer.md"
  else
    echo "  ⚠ 백업 실패 → reviewer.md 를 제거하지 않았습니다."
  fi
  echo "▶ 구버전 reviewer.md 백업 후 제거 (검증은 Codex로 대체)"
fi

# 순서가 중요하다: 훅 파일 → settings.json 등록 → (성공했을 때만) statusline 브리지 전환.
#
# 브리지를 먼저 바꾸면, 등록이 실패했을 때 '컨텍스트 경고가 전부 꺼진 상태'가 만들어진다:
#   새 브리지는 claude-ctx-advisor-*.json 만 쓰고 구 메트릭까지 지우는데,
#   그 값을 읽을 advisor 훅은 미등록이고, 남아있는 GSD 훅이 찾는 파일은 아무도 안 쓴다.
#   → 설치는 "성공"으로 끝나고 감지 수단만 사라진다. 이 작업이 고치려던 실패 양식 그 자체다.
# 등록에 실패하면 statusline 을 건드리지 않는다 — 업그레이드면 구 브리지가 계속 동작하고,
# 신규 설치면 애초에 아무것도 없었으므로 회귀가 없다.
# 훅 파일 쓰기까지 성공 판정에 넣는다 — 파일이 없거나 낡으면 등록해도 실행 불가능한 훅이 된다.
if install_ctx_hook && merge_settings_hooks register; then
  # 구 Stop 모니터 제거는 '대체 감지 수단이 실제로 확인된 뒤'에만 한다.
  # 브리지 삽입은 skip/실패해도 설치를 계속하도록 설계돼 있으므로(jq 없음·앵커 불충족·쓰기 실패 등),
  # 제거를 앞에 두면 '구 모니터는 없고 새 훅이 읽을 메트릭도 없는' 상태가 만들어진다.
  if install_ctx_bridge; then
    merge_settings_hooks cleanup || echo "  ⚠ 구 모니터 정리 실패: ${MS_REASON} (구 모니터를 그대로 둡니다)"
  else
    echo "  ⚠ 브리지가 전환되지 않아 구 Stop 모니터(contextMonitor.js)를 그대로 둡니다."
    echo "    사유: ${CTX_BRIDGE_REASON:-알 수 없음}"
    echo "    해결 후 install.sh 를 다시 실행하면 전환·정리가 이어집니다."
  fi
else
  echo "▶ statusline 컨텍스트 예산 브리지 전환"
  echo "  ⚠ settings.json 에 훅을 등록하지 못해 컨텍스트 예산 브리지를 전환하지 않았습니다(현 상태 유지)."
  echo "    사유: ${MS_REASON:-훅 파일을 설치하지 못했습니다}"
  echo "    해결 후 install.sh 를 다시 실행하세요."
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
      settings.json 의 hooks.PostToolUse 에 advisor-context-budget.js 엔트리가 병합됩니다
      (파싱→수정→재출력 · 백업 · 유효성 게이트. 기존 엔트리는 보존).
────────────────────────────────────────────────────────────
DONE

if [ -n "${BACKED_UP}" ]; then
  echo ""
  echo "백업된 기존 파일:"
  printf '%s' "${BACKED_UP}" | while IFS= read -r line; do
    [ -n "${line}" ] && echo "  - ${line}"
  done
fi
