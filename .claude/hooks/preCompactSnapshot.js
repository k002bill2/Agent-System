/**
 * PreCompact Hook - 세션 컨텍스트 스냅샷
 * compact 전에 현재 세션의 작업 상태를 백업하여 컨텍스트 유실 방지
 *
 * 저장 내용:
 * 1. 활성 dev docs 태스크 목록
 * 2. git 변경사항 요약
 * 3. 타임스탬프
 *
 * @hook-config
 * {"event": "PreCompact", "matcher": "", "command": "node .claude/hooks/preCompactSnapshot.js 2>/dev/null || true"}
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SNAPSHOT_DIR = path.join(PROJECT_ROOT, '.claude', 'snapshots');
const MAX_SNAPSHOTS = 5;

function run(cmd) {
  try {
    return execSync(cmd, { cwd: PROJECT_ROOT, timeout: 5000 }).toString().trim();
  } catch {
    return '';
  }
}

function getActiveTasks() {
  const activeDir = path.join(PROJECT_ROOT, 'dev', 'active');
  if (!fs.existsSync(activeDir)) return [];
  try {
    return fs.readdirSync(activeDir).filter(d =>
      fs.statSync(path.join(activeDir, d)).isDirectory()
    );
  } catch {
    return [];
  }
}

function getGitSummary() {
  const branch = run('git branch --show-current');
  const status = run('git status --porcelain | head -20');
  const lastCommit = run('git log -1 --oneline');
  return { branch, status, lastCommit };
}

function cleanupOldSnapshots() {
  if (!fs.existsSync(SNAPSHOT_DIR)) return;
  const files = fs.readdirSync(SNAPSHOT_DIR)
    .filter(f => f.startsWith('pre-compact-') && f.endsWith('.json'))
    .sort()
    .reverse();

  // 최신 MAX_SNAPSHOTS개만 유지
  files.slice(MAX_SNAPSHOTS).forEach(f => {
    try { fs.unlinkSync(path.join(SNAPSHOT_DIR, f)); } catch {}
  });
}

function main() {
  const snapshot = {
    timestamp: new Date().toISOString(),
    activeTasks: getActiveTasks(),
    git: getGitSummary(),
  };

  // snapshots 디렉토리 생성
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }

  // 스냅샷 저장
  const filename = `pre-compact-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(
    path.join(SNAPSHOT_DIR, filename),
    JSON.stringify(snapshot, null, 2)
  );

  // 오래된 스냅샷 정리
  cleanupOldSnapshots();

  // stdout으로 요약 출력 (Claude Code에 표시)
  const taskList = snapshot.activeTasks.length > 0
    ? snapshot.activeTasks.join(', ')
    : 'none';

  process.stdout.write(
    `[PreCompact] Snapshot saved. Branch: ${snapshot.git.branch}, Active tasks: ${taskList}`
  );
}

main();
