/**
 * Stop Hook - 세션 종료 시 변경사항 자동 커밋
 * 변경사항을 스테이징하고, git diff 기반으로 WIP 커밋 메시지를 생성하여 커밋.
 * 외부 API 호출 없이 순수 git 기반으로 동작.
 *
 * @hook-config
 * {"event": "Stop", "matcher": "", "command": "node .claude/hooks/commitSession.js", "timeout": 15}
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function exec(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
  } catch {
    return '';
  }
}

/**
 * 변경된 파일 목록으로 scope와 summary 추출
 */
function buildCommitMsg(repoRoot) {
  const files = exec('git diff --cached --name-only', { cwd: repoRoot });
  if (!files) return 'wip: update files';

  const fileList = files.split('\n').filter(Boolean);
  const fileCount = fileList.length;

  // scope 추출: 공통 최상위 디렉토리
  const dirs = fileList.map(f => f.split('/')[0]);
  const uniqueDirs = [...new Set(dirs)];
  const scope = uniqueDirs.length === 1 ? uniqueDirs[0] : uniqueDirs.slice(0, 2).join(',');

  // 변경 유형 감지
  const stat = exec('git diff --cached --stat', { cwd: repoRoot });
  const insertions = (stat.match(/(\d+) insertion/) || [])[1] || '0';
  const deletions = (stat.match(/(\d+) deletion/) || [])[1] || '0';

  return `wip(${scope}): update ${fileCount} files (+${insertions}/-${deletions})`;
}

function main() {
  // Resolve repo root (worktree-safe)
  const repoRoot = exec('git rev-parse --show-toplevel') || process.env.CLAUDE_PROJECT_DIR;
  if (!repoRoot) return;

  // Stage all changes
  exec('git add -A', { cwd: repoRoot });

  // Exit if nothing to commit
  try {
    execSync('git diff-index --quiet HEAD', { cwd: repoRoot, stdio: 'pipe' });
    return; // No changes
  } catch {
    // Has changes — continue
  }

  const commitMsg = buildCommitMsg(repoRoot);

  // Commit (--no-verify for WIP auto-commits)
  const msgFile = path.join(repoRoot, '.git', 'COMMIT_SESSION_MSG');
  try {
    fs.writeFileSync(msgFile, commitMsg);
    exec(`git commit -F "${msgFile}" --no-verify`, { cwd: repoRoot });
  } finally {
    try { fs.unlinkSync(msgFile); } catch { /* ignore */ }
  }

  // Update CHANGELOG if it exists
  const changelog = path.join(repoRoot, 'docs', 'CHANGELOG.md');
  if (fs.existsSync(changelog)) {
    try {
      const content = fs.readFileSync(changelog, 'utf8');
      const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const firstLine = commitMsg.split('\n')[0];

      if (content.includes('## [Unreleased]')) {
        const updated = content.replace(
          '## [Unreleased]',
          `## [Unreleased]\n- ${timestamp}: ${firstLine}`
        );
        fs.writeFileSync(changelog, updated);
        exec('git add docs/CHANGELOG.md', { cwd: repoRoot });

        try {
          execSync('git diff-index --quiet HEAD', { cwd: repoRoot, stdio: 'pipe' });
        } catch {
          exec('git commit -m "docs: auto-update changelog" --no-verify', { cwd: repoRoot });
        }
      }
    } catch { /* ignore changelog errors */ }
  }

  const firstLine = commitMsg.split('\n')[0];
  process.stdout.write(`[Session Commit] ${firstLine}`);
}

main();
