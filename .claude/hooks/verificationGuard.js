/**
 * Verification Guard
 *
 * PostToolUse:Write 시 src/ 디렉토리의 TypeScript/Python 파일 변경을 감지하고
 * 경량 검증(tsc --noEmit, ruff check)을 실행합니다.
 *
 * 임계값 초과 시 차단(exit 2) — 심각한 에러 누적을 방지합니다.
 * - TypeScript: 5개 이상 에러 → 차단
 * - Python: 3개 이상 에러 → 차단
 * - 임계값 미만 → 경고만 출력
 *
 * @version 2.0.0
 * @hook-config
 * {"event": "PostToolUse", "matcher": "Write", "command": "node .claude/hooks/verificationGuard.js", "timeout": 10}
 */

const { execSync } = require('child_process');

// 차단 임계값
const TS_ERROR_THRESHOLD = 5;
const PY_ERROR_THRESHOLD = 3;

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const event = JSON.parse(input);
      const filePath = event.tool_input?.file_path || '';

      // src/ 디렉토리 파일만 대상
      if (!filePath.includes('src/')) {
        process.exit(0);
        return;
      }

      const warnings = [];
      let shouldBlock = false;

      // TypeScript 파일 → tsc 경량 체크
      if (/\.(ts|tsx)$/.test(filePath) && filePath.includes('src/dashboard')) {
        try {
          execSync('cd src/dashboard && npx tsc --noEmit --pretty false 2>&1 | head -10', {
            timeout: 8000,
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: process.cwd()
          });
        } catch (err) {
          const output = (err.stdout || '').toString().trim();
          if (output) {
            const errorCount = (output.match(/error TS/g) || []).length;
            if (errorCount > 0) {
              warnings.push(`[Verification] TypeScript: ${errorCount} error(s) detected`);
              if (errorCount >= TS_ERROR_THRESHOLD) {
                shouldBlock = true;
              }
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
            const lines = output.split('\n').filter(l => l.trim()).length;
            warnings.push(`[Verification] Python lint: ${lines} issue(s) in ${filePath.split('/').pop()}`);
            if (lines >= PY_ERROR_THRESHOLD) {
              shouldBlock = true;
            }
          }
        }
      }

      if (warnings.length > 0) {
        if (shouldBlock) {
          process.stderr.write(`[BLOCKED] ${warnings.join(' | ')}\n`);
          process.stderr.write('[ACTION] Fix the errors above, then run /verify-loop to auto-fix remaining issues.\n');
          process.exit(2);
        } else {
          console.log(warnings.join('\n'));
        }
      }
    } catch { /* silent */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 10000);
}

main();
