/**
 * Verification Guard
 *
 * PostToolUse:Write 시 src/ 디렉토리의 TypeScript/Python 파일 변경을 감지하고
 * 경량 검증(tsc --noEmit, ruff check)을 실행하여 빌드 깨짐을 조기 경고합니다.
 *
 * 차단(exit 2)하지 않고 경고만 출력 — 개발 흐름을 방해하지 않으면서
 * 빌드 깨짐을 즉시 인지하도록 합니다.
 *
 * @version 1.0.0
 * @hook-config
 * {"event": "PostToolUse", "matcher": "Write", "command": "node .claude/hooks/verificationGuard.js 2>/dev/null || true", "timeout": 10}
 */

const { execSync } = require('child_process');

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

      // TypeScript 파일 → tsc 경량 체크
      if (/\.(ts|tsx)$/.test(filePath) && filePath.includes('src/dashboard')) {
        try {
          execSync('cd src/dashboard && npx tsc --noEmit --pretty false 2>&1 | head -5', {
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
            }
          }
        }
      }

      // Python 파일 → ruff 경량 체크
      if (/\.py$/.test(filePath) && filePath.includes('src/backend')) {
        try {
          execSync(`ruff check "${filePath}" --select E,F --no-fix --quiet 2>&1 | head -5`, {
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'pipe']
          });
        } catch (err) {
          const output = (err.stdout || '').toString().trim();
          if (output) {
            const lines = output.split('\n').length;
            warnings.push(`[Verification] Python lint: ${lines} issue(s) in ${filePath.split('/').pop()}`);
          }
        }
      }

      if (warnings.length > 0) {
        console.log(warnings.join('\n'));
      }
    } catch { /* silent */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 10000);
}

main();
