/**
 * Gemini Auto Trigger - PostToolUse hook for Edit|Write
 *
 * Debounce 방식으로 연속 편집 시 마지막 편집 후 일정 시간 뒤에
 * 백그라운드로 gemini-bridge.js review를 실행합니다.
 *
 * 동작 방식:
 * 1. Edit/Write가 발생할 때마다 타임스탬프 파일에 기록
 * 2. 이전 예약된 리뷰가 있으면 취소 (debounce)
 * 3. 30초 후 변경이 없으면 백그라운드로 리뷰 실행
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const BRIDGE_DIR = path.join(PROJECT_ROOT, '.claude', 'gemini-bridge');
const TRIGGER_FILE = path.join(BRIDGE_DIR, '.pending-trigger');
const LOCK_FILE = path.join(BRIDGE_DIR, '.review-lock');
const STATE_FILE = path.join(PROJECT_ROOT, '.claude', 'coordination', 'gemini-state.json');

const DEBOUNCE_MS = 30_000; // 30초 debounce
const LOCK_TTL_MS = 180_000; // 3분 lock TTL (리뷰 최대 시간)
const MIN_INTERVAL_MS = 300_000; // 5분 최소 간격

function main() {
  try {
    // Ensure bridge dir exists
    if (!fs.existsSync(BRIDGE_DIR)) {
      fs.mkdirSync(BRIDGE_DIR, { recursive: true });
    }

    // Check daily limit before even queuing
    if (!checkDailyLimit()) {
      return;
    }

    // Check minimum interval between reviews
    if (!checkMinInterval()) {
      return;
    }

    // Check if a review is already running (lock file)
    if (isReviewLocked()) {
      return;
    }

    // Write trigger timestamp (debounce marker)
    const now = Date.now();
    fs.writeFileSync(TRIGGER_FILE, JSON.stringify({
      timestamp: now,
      debounceUntil: now + DEBOUNCE_MS
    }));

    // Spawn detached debounce checker
    // This process will wait DEBOUNCE_MS and then check if we're still the latest trigger
    const child = spawn('node', ['-e', `
      const fs = require('fs');
      const path = require('path');
      const { spawn } = require('child_process');

      const TRIGGER_FILE = ${JSON.stringify(TRIGGER_FILE)};
      const LOCK_FILE = ${JSON.stringify(LOCK_FILE)};
      const PROJECT_ROOT = ${JSON.stringify(PROJECT_ROOT)};
      const myTimestamp = ${now};

      setTimeout(() => {
        try {
          // Check if we're still the latest trigger
          if (!fs.existsSync(TRIGGER_FILE)) process.exit(0);
          const data = JSON.parse(fs.readFileSync(TRIGGER_FILE, 'utf8'));
          if (data.timestamp !== myTimestamp) process.exit(0); // newer trigger exists

          // We're the latest - acquire lock and run review
          fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
          fs.unlinkSync(TRIGGER_FILE);

          const review = spawn('node', [
            path.join(PROJECT_ROOT, '.claude', 'hooks', 'gemini-bridge.js'),
            'review'
          ], {
            cwd: PROJECT_ROOT,
            stdio: 'ignore',
            detached: true
          });

          review.on('close', () => {
            try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch (_) {}
          });

          review.unref();
        } catch (_) {
          try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch (_) {}
        }
        process.exit(0);
      }, ${DEBOUNCE_MS});
    `], {
      cwd: PROJECT_ROOT,
      stdio: 'ignore',
      detached: true
    });

    child.unref();

  } catch (e) {
    // Silent fail - hook should never block Claude Code
  }
}

function checkDailyLimit() {
  try {
    if (!fs.existsSync(STATE_FILE)) return true;
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const today = new Date().toISOString().slice(0, 10);
    if (state.date !== today) return true; // New day, counter reset
    return state.callCount < (state.dailyLimit || 900);
  } catch (_) {
    return true;
  }
}

function checkMinInterval() {
  try {
    if (!fs.existsSync(STATE_FILE)) return true;
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const pending = state.pendingReviews || [];
    if (pending.length === 0) return true;

    const lastReview = pending[pending.length - 1];
    const lastTime = new Date(lastReview.timestamp).getTime();
    return (Date.now() - lastTime) > MIN_INTERVAL_MS;
  } catch (_) {
    return true;
  }
}

function isReviewLocked() {
  try {
    if (!fs.existsSync(LOCK_FILE)) return false;
    const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    const lockAge = Date.now() - new Date(lock.startedAt).getTime();

    // Lock expired (stale process)
    if (lockAge > LOCK_TTL_MS) {
      fs.unlinkSync(LOCK_FILE);
      return false;
    }

    return true; // Lock is valid
  } catch (_) {
    return false;
  }
}

main();
