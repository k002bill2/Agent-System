/**
 * Verification Guard v2.0
 *
 * PostToolUse:Write 시 src/ 디렉토리의 TypeScript/Python 파일 변경을 감지하고
 * 경량 검증(tsc --noEmit, ruff check)을 실행합니다.
 *
 * v2.0: 임계값 기반 오류 신호 (exit 2)
 *   - TypeScript 에러 3개 이상 → exit 2   (TS_ERROR_THRESHOLD)
 *   - Python 에러 2개 이상 → exit 2       (PY_ERROR_THRESHOLD)
 *   - 임계값 미만 → exit 0 (경고만)
 *
 * NOTE: PostToolUse의 exit 2는 non-blocking이다 — 편집(Edit/Write)은 이미 실행된 뒤
 *   훅이 발화하므로 되돌리지 못한다. exit 2는 stderr([BLOCKED] 메시지)를 Claude에게
 *   피드백하여 같은 세션에서 후속 수정을 유도할 뿐, 턴을 강제 중단하지 않는다
 *   (Claude Code hooks 스펙: PostToolUse exit 2 = stderr to Claude, non-blocking).
 *   `continueOnBlock` 같은 필드는 스펙에 없다. 명시적 block+트랜스크립트 기록이 필요하면
 *   exit 0 + JSON `{decision:"block"}`으로 전환해야 하나, 현 목적(오류 알림)엔 exit 2로 충분.
 *
 * PERF: TS 검사는 프로젝트 전역 tsc라 첫 실행 ~수초, incremental 캐시(.tsbuildinfo)로
 *   2회차부터 단축. 대규모 연속 편집 세션은 향후 debounce/end-of-turn 이벤트로 개선 여지.
 *
 * @version 2.0.0
 * @hook-config
 * {"event": "PostToolUse", "matcher": "Write", "command": "node .claude/hooks/verificationGuard.js", "timeout": 15}
 *
 * 등록: settings.json PostToolUse(Edit|Write)로 Claude Code 발효(2026-07-20).
 *       .claude/hooks.json 항목은 백엔드 대시보드 표시용으로 병행 유지 (ADR-017 참조).
 */

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const TS_ERROR_THRESHOLD = 3;
const PY_ERROR_THRESHOLD = 2;

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const event = JSON.parse(input);
      const filePath = event.tool_input?.file_path || '';

      if (!filePath.includes('src/')) {
        process.exit(0);
        return;
      }

      let shouldBlock = false;

      // TypeScript 파일 → tsc 경량 체크 (incremental 캐시로 2회차 이후 단축)
      if (/\.(ts|tsx)$/.test(filePath) && filePath.includes('src/dashboard')) {
        // 캐시는 gitignore된 node_modules/.cache 하위 — cwd(src/dashboard) 기준 상대경로로 전달
        fs.mkdirSync(path.join(ROOT, 'src/dashboard/node_modules/.cache'), { recursive: true });
        try {
          execSync('set -o pipefail; npx tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/verifguard.tsbuildinfo --pretty false 2>&1 | head -20', {
            timeout: 12000,
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: path.join(ROOT, 'src/dashboard'),
            shell: '/bin/bash'
          });
        } catch (err) {
          const output = (err.stdout || '').toString().trim();
          if (output) {
            const errorCount = (output.match(/error TS/g) || []).length;
            if (errorCount >= TS_ERROR_THRESHOLD) {
              console.error(
                `\n[BLOCKED] TypeScript: ${errorCount} error(s) detected (threshold: ${TS_ERROR_THRESHOLD})\n` +
                `${output.split('\n').slice(0, 5).join('\n')}\n` +
                `ACTION: 타입 에러를 먼저 수정하세요. /build-fix 사용 권장.\n`
              );
              shouldBlock = true;
            } else if (errorCount > 0) {
              console.log(`[Verification] TypeScript: ${errorCount} error(s) — threshold(${TS_ERROR_THRESHOLD}) 미만, 경고`);
            }
          }
        }
      }

      // Python 파일 → ruff 경량 체크
      if (/\.py$/.test(filePath) && filePath.includes('src/backend')) {
        const ruffBin = fs.existsSync(path.join(ROOT, 'src/backend/.venv/bin/ruff'))
          ? path.join(ROOT, 'src/backend/.venv/bin/ruff')
          : 'ruff';
        try {
          // filePath는 positional 인자($2)로 전달 — 셸 문자열 보간(명령 주입) 제거
          execFileSync(
            '/bin/bash',
            ['-c', 'set -o pipefail; "$1" check "$2" --no-fix --quiet --output-format concise 2>&1 | head -10', '_', ruffBin, filePath],
            {
              timeout: 5000,
              stdio: ['pipe', 'pipe', 'pipe'],
              cwd: ROOT
            }
          );
        } catch (err) {
          const output = ((err.stdout || '').toString() + (err.stderr || '').toString()).trim();
          if (output) {
            const errorCount = output.split('\n').filter(l => /:\d+:\d+: /.test(l)).length;
            if (errorCount === 0 && /command not found|No such file/.test(output)) {
              console.log('[Verification] ruff 미설치 — Python lint 스킵');
            } else if (errorCount >= PY_ERROR_THRESHOLD) {
              console.error(
                `\n[BLOCKED] Python lint: ${errorCount} issue(s) in ${filePath.split('/').pop()} (threshold: ${PY_ERROR_THRESHOLD})\n` +
                `${output.split('\n').slice(0, 5).join('\n')}\n` +
                `ACTION: lint 에러를 먼저 수정하세요.\n`
              );
              shouldBlock = true;
            } else if (errorCount > 0) {
              console.log(`[Verification] Python lint: ${errorCount} issue(s) — threshold(${PY_ERROR_THRESHOLD}) 미만, 경고`);
            }
          }
        }
      }

      process.exit(shouldBlock ? 2 : 0);
    } catch {
      // 파싱 실패 시 차단하지 않음
      process.exit(0);
    }
  });
  setTimeout(() => process.exit(0), 15000);
}

main();
