/**
 * Gemini Auto Review Hook - Triggers on Stop event
 *
 * When Claude Code stops, checks if there are significant uncommitted changes.
 * If changes exceed a threshold, suggests running /gemini-review.
 *
 * This is a lightweight check -- it does NOT run the full review automatically.
 * It only prints a suggestion to the user.
 *
 * @version 1.0.0
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ─── Constants ──────────────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const BRIDGE_SCRIPT = path.join(__dirname, 'gemini-bridge.js');
const MIN_CHANGED_FILES = 5;

// ─── Main ───────────────────────────────────────────────────

function main() {
  // 1. Check if gemini-bridge.js exists
  if (!fs.existsSync(BRIDGE_SCRIPT)) {
    process.exit(0);
  }

  // 2. Check if Gemini CLI is available
  let geminiAvailable = false;
  try {
    execSync('which gemini', { encoding: 'utf8', timeout: 3000, stdio: 'pipe' });
    geminiAvailable = true;
  } catch (_) {
    // Gemini CLI not found -- check common paths
    const commonPaths = [
      '/opt/homebrew/bin/gemini',
      '/usr/local/bin/gemini',
      path.join(process.env.HOME || '', '.local/bin/gemini')
    ];
    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        geminiAvailable = true;
        break;
      }
    }
  }

  if (!geminiAvailable) {
    process.exit(0);
  }

  // 3. Count changed files using git diff --stat
  let changedFiles = 0;
  try {
    const diffStat = execSync('git diff --stat HEAD 2>/dev/null || git diff --stat 2>/dev/null', {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    if (diffStat && diffStat.trim()) {
      const lines = diffStat.trim().split('\n');
      // Last line is the summary; count file lines above it
      changedFiles = Math.max(0, lines.length - 1);
    }
  } catch (_) {
    process.exit(0);
  }

  // 4. If changes exceed threshold, suggest review
  if (changedFiles >= MIN_CHANGED_FILES) {
    console.log(`[GEMINI] ${changedFiles} files changed. Consider running /gemini-review for a cross-review.`);
  }

  process.exit(0);
}

// ─── Entry ──────────────────────────────────────────────────

main();
