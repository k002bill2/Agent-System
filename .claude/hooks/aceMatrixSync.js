/**
 * ACE Matrix Sync Checker (P4 Optimization)
 *
 * settings.json의 훅 수와 enforcement-matrix.md의 P2 행 수를 비교하여
 * drift를 감지합니다. PostToolUse Edit|Write 시 .claude/ 파일이 변경되면 실행.
 *
 * @version 1.0.0
 * @hook-config
 * {"event": "PostToolUse", "matcher": "Edit|Write", "command": "node .claude/hooks/aceMatrixSync.js 2>/dev/null || true"}
 */

const fs = require('fs');
const path = require('path');

const HOOKS_PATH = path.join(__dirname, '../hooks.json');
const MATRIX_PATH = path.join(__dirname, '../skills/ace-framework/references/enforcement-matrix.md');

function main() {
  let inputData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { inputData += chunk; });
  process.stdin.on('end', () => {
    try {
      const event = inputData.trim() ? JSON.parse(inputData) : {};
      const filePath = event.tool_input?.file_path || '';

      // .claude/ 디렉토리 파일 변경 시에만 검사
      if (!filePath.includes('.claude/')) {
        process.exit(0);
        return;
      }

      // settings.json 또는 enforcement-matrix.md 변경 시에만 검사
      if (!filePath.includes('settings.json') &&
          !filePath.includes('enforcement-matrix.md') &&
          !filePath.includes('/hooks/')) {
        process.exit(0);
        return;
      }

      if (!fs.existsSync(HOOKS_PATH) || !fs.existsSync(MATRIX_PATH)) {
        process.exit(0);
        return;
      }

      // hooks.json에서 총 훅 수 계산
      const hooksConfig = JSON.parse(fs.readFileSync(HOOKS_PATH, 'utf8'));
      const hooks = hooksConfig.hooks || {};
      let totalHooks = 0;
      for (const rules of Object.values(hooks)) {
        for (const rule of rules) {
          totalHooks += (rule.hooks || []).length;
        }
      }

      // enforcement-matrix에서 P2 행 수 계산
      const matrixContent = fs.readFileSync(MATRIX_PATH, 'utf8');
      const p2Rows = (matrixContent.match(/^\| P2-/gm) || []).length;

      // drift 감지
      if (totalHooks !== p2Rows) {
        console.log(`[ACE MatrixSync] ⚠️ Drift 감지: hooks.json ${totalHooks} hooks vs enforcement-matrix ${p2Rows} P2 rows`);
        console.log(`[ACE MatrixSync] enforcement-matrix.md 업데이트가 필요할 수 있습니다.`);
      }
    } catch (e) {
      // 동기화 검사 실패는 무시
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000);
}

main();
