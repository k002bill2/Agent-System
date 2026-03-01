/**
 * Workspace Guard Hook for ACE Framework (P3 Boundary Enforcement)
 *
 * 병렬 에이전트가 자신의 워크스페이스 외부(src/ 등)에 직접 쓰는 것을 감지합니다.
 * parallel-state.json에 활성 에이전트가 있을 때만 작동합니다.
 *
 * 동작: 경고 로그 출력 (block하지 않음 — 메인 에이전트의 정상 작업 방해 방지)
 *
 * @version 1.0.0
 * @hook-config
 * {"event": "PostToolUse", "matcher": "Edit|Write", "command": "node .claude/hooks/workspaceGuard.js 2>/dev/null || true"}
 */

const fs = require('fs');
const path = require('path');

const PARALLEL_STATE_PATH = path.join(__dirname, '../coordination/parallel-state.json');
const WORKSPACE_BASE = '.temp/agent_workspaces';

function main() {
  let inputData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { inputData += chunk; });
  process.stdin.on('end', () => {
    try {
      // 활성 에이전트 확인
      if (!fs.existsSync(PARALLEL_STATE_PATH)) {
        process.exit(0);
        return;
      }

      const state = JSON.parse(fs.readFileSync(PARALLEL_STATE_PATH, 'utf8'));
      const activeCount = (state.activeAgents || []).length;

      if (activeCount === 0) {
        process.exit(0);
        return;
      }

      // 편집된 파일 경로 확인
      const event = inputData.trim() ? JSON.parse(inputData) : {};
      const filePath = event.tool_input?.file_path || '';

      if (!filePath) {
        process.exit(0);
        return;
      }

      const normalizedPath = filePath.replace(/\\/g, '/');

      // 워크스페이스 내부 쓰기는 허용
      if (normalizedPath.includes(WORKSPACE_BASE)) {
        process.exit(0);
        return;
      }

      // src/ 직접 쓰기 감지 (병렬 실행 중)
      if (normalizedPath.includes('/src/') || normalizedPath.startsWith('src/')) {
        console.log(`[WorkspaceGuard] ⚠️ src/ 직접 쓰기 감지 (활성 에이전트: ${activeCount}개): ${path.basename(filePath)}`);
        console.log(`[WorkspaceGuard] 병렬 실행 중에는 .temp/agent_workspaces/ 사용을 권장합니다.`);
      }
    } catch (e) {
      // 가드 실패는 무시
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000);
}

main();
