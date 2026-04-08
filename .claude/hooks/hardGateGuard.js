/**
 * PreToolUse:Edit|Write Hook - HARD-GATE 차단
 *
 * 세션 내 3개 이상 고유 파일을 편집하면 plan 파일 없이는
 * 추가 편집을 차단(exit 2)합니다.
 *
 * v2.0: WARN → BLOCK 전환
 *   - plan 없이 3+ 파일 수정 시 → exit 2 (차단)
 *   - plan 존재 시 또는 3개 미만 → exit 0 (통과)
 *
 * Exit codes:
 *   0 = 통과
 *   2 = 차단 (plan 먼저 필요)
 *
 * @version 2.0.0
 * @hook-config
 * {"event": "PreToolUse", "matcher": "Edit|Write", "command": "node .claude/hooks/hardGateGuard.js", "timeout": 3}
 */

const fs = require('fs');
const path = require('path');

const TRACKER_DIR = '/tmp/claude-hard-gate';
const TRACKER_FILE = path.join(TRACKER_DIR, 'edited-files.json');
const FILE_THRESHOLD = 3;

function hasPlanFile(projectDir) {
  const devActive = path.join(projectDir, 'dev', 'active');
  if (fs.existsSync(devActive)) {
    try {
      const tasks = fs.readdirSync(devActive, { withFileTypes: true });
      for (const task of tasks) {
        if (!task.isDirectory()) continue;
        const planPath = path.join(devActive, task.name, `${task.name}-plan.md`);
        if (fs.existsSync(planPath)) return true;
      }
    } catch { /* ignore */ }
  }
  return false;
}

function hasClaudePlan(projectDir) {
  const plansDir = path.join(projectDir, '.claude', 'plans');
  if (!fs.existsSync(plansDir)) return false;
  try {
    return fs.readdirSync(plansDir).some(f => f.endsWith('.md'));
  } catch {
    return false;
  }
}

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const event = JSON.parse(input);
      const filePath = (event.tool_input && event.tool_input.file_path) || '';
      if (!filePath) return process.exit(0);

      // hooks, settings, config, plan 파일은 카운트에서 제외
      if (filePath.includes('.claude/hooks/') ||
          filePath.includes('.claude/settings') ||
          filePath.includes('.claude/plans/') ||
          filePath.includes('.claude/rules/') ||
          filePath.includes('node_modules/') ||
          filePath.endsWith('.json') && filePath.includes('package')) {
        return process.exit(0);
      }

      fs.mkdirSync(TRACKER_DIR, { recursive: true });

      let editedFiles = [];
      if (fs.existsSync(TRACKER_FILE)) {
        try {
          editedFiles = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
        } catch {
          editedFiles = [];
        }
      }

      if (!editedFiles.includes(filePath)) {
        editedFiles.push(filePath);
        fs.writeFileSync(TRACKER_FILE, JSON.stringify(editedFiles, null, 2));
      }

      if (editedFiles.length <= FILE_THRESHOLD) {
        return process.exit(0);
      }

      const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
      if (hasPlanFile(projectDir) || hasClaudePlan(projectDir)) {
        return process.exit(0);
      }

      // BLOCK: plan 없이 3+ 파일 수정 시도
      const fileList = editedFiles.map(f => `  - ${path.basename(f)}`).join('\n');
      console.log(
        `\n[BLOCKED] HARD-GATE: ${editedFiles.length}개 파일을 plan 없이 수정 중 (임계값: ${FILE_THRESHOLD})\n` +
        `수정 파일:\n${fileList}\n` +
        `ACTION: /plan을 먼저 실행하세요. plan 파일이 생성되면 자동으로 통과됩니다.\n`
      );
      process.exit(2);
    } catch {
      process.exit(0);
    }
  });
  setTimeout(() => process.exit(0), 3000);
}

main();
