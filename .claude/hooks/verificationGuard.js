/**
 * Verification Guard v2.0
 *
 * PostToolUse:Write 시 src/ 디렉토리의 TypeScript/Python 파일 변경을 감지하고
 * 경량 검증(tsc --noEmit, ruff check)을 실행합니다.
 *
 * v2.0: 임계값 기반 차단 (BLOCK)
 *   - TypeScript 에러 5개 이상 → exit 2 (차단)
 *   - Python 에러 3개 이상 → exit 2 (차단)
 *   - 임계값 미만 → exit 0 (경고만)
 *
 * @version 2.0.0
 * @hook-config
 * {"event": "PostToolUse", "matcher": "Write", "command": "node .claude/hooks/verificationGuard.js", "timeout": 15}
 */

const { execSync } = require('child_process');

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

      // TypeScript 파일 → tsc 경량 체크
      if (/\.(ts|tsx)$/.test(filePath) && filePath.includes('src/dashboard')) {
        try {
          execSync('cd src/dashboard && npx tsc --noEmit --pretty false 2>&1 | head -20', {
            timeout: 12000,
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: process.cwd()
          });
        } catch (err) {
          const output = (err.stdout || '').toString().trim();
          if (output) {
            const errorCount = (output.match(/error TS/g) || []).length;
            if (errorCount >= TS_ERROR_THRESHOLD) {
              console.log(
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
        try {
          execSync(`ruff check "${filePath}" --select E,F --no-fix --quiet 2>&1 | head -10`, {
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'pipe']
          });
        } catch (err) {
          const output = (err.stdout || '').toString().trim();
          if (output) {
            const errorCount = output.split('\n').filter(l => l.trim()).length;
            if (errorCount >= PY_ERROR_THRESHOLD) {
              console.log(
                `\n[BLOCKED] Python lint: ${errorCount} issue(s) in ${filePath.split('/').pop()} (threshold: ${PY_ERROR_THRESHOLD})\n` +
                `${output.split('\n').slice(0, 5).join('\n')}\n` +
                `ACTION: lint 에러를 먼저 수정하세요.\n`
              );
              shouldBlock = true;
            } else {
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
