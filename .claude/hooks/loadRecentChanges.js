/**
 * SessionStart Hook - 최근 변경사항을 컨텍스트로 로딩
 * CHANGELOG 마지막 20줄 + 최근 커밋 10개를 JSON으로 출력.
 *
 * @hook-config
 * {"event": "SessionStart", "matcher": "", "command": "node .claude/hooks/loadRecentChanges.js", "timeout": 5}
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function main() {
  const repoRoot = exec('git rev-parse --show-toplevel') || process.env.CLAUDE_PROJECT_DIR;
  if (!repoRoot) return;

  const parts = [];

  // Recent changelog entries
  const changelog = path.join(repoRoot, 'docs', 'CHANGELOG.md');
  if (fs.existsSync(changelog)) {
    try {
      const lines = fs.readFileSync(changelog, 'utf8').split('\n');
      const recent = lines.slice(-20).join('\n').trim();
      if (recent) {
        parts.push(`Recent CHANGELOG entries:\n${recent}`);
      }
    } catch { /* ignore */ }
  }

  // Recent git commits
  const commits = exec('git log --oneline -10');
  if (commits) {
    parts.push(`Recent commits:\n${commits}`);
  }

  // Output as JSON for Claude Code hook system
  if (parts.length > 0) {
    const context = parts.join('\n\n');
    const output = JSON.stringify({ additionalContext: context });
    process.stdout.write(output);
  }
}

main();
