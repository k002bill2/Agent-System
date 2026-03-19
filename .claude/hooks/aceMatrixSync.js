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

// hooks.json이 우선, 없으면 settings.json fallback
const HOOKS_PATH = path.join(__dirname, '../hooks.json');
const SETTINGS_PATH = path.join(__dirname, '../settings.json');
// 글로벌 스킬 경로 사용 (프로젝트 레벨 ace-framework는 글로벌로 통합됨)
const HOME = process.env.HOME || process.env.USERPROFILE || '';
const MATRIX_PATH = path.join(HOME, '.claude/skills/ace-framework/references/enforcement-matrix.md');

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

      if (!fs.existsSync(MATRIX_PATH)) {
        process.exit(0);
        return;
      }

      // hooks.json 우선, 없으면 settings.json fallback
      const hooksFile = fs.existsSync(HOOKS_PATH) ? HOOKS_PATH : SETTINGS_PATH;
      if (!fs.existsSync(hooksFile)) {
        process.exit(0);
        return;
      }

      const config = JSON.parse(fs.readFileSync(hooksFile, 'utf8'));
      const hooks = config.hooks || {};
      let totalHooks = 0;
      for (const rules of Object.values(hooks)) {
        for (const rule of rules) {
          totalHooks += (rule.hooks || []).length;
        }
      }

      // enforcement-matrix에서 P2 + P4 행 수 계산 (둘 다 실제 훅에 대응)
      const matrixContent = fs.readFileSync(MATRIX_PATH, 'utf8');
      const p2Rows = (matrixContent.match(/^\| P2-/gm) || []).length;
      const p4Rows = (matrixContent.match(/^\| P4-/gm) || []).length;
      const matrixTotal = p2Rows + p4Rows;

      // drift 감지
      if (totalHooks !== matrixTotal) {
        console.log(`[ACE MatrixSync] ⚠️ Drift 감지: hooks.json ${totalHooks} hooks vs enforcement-matrix ${matrixTotal} rows (P2:${p2Rows} + P4:${p4Rows})`);
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
