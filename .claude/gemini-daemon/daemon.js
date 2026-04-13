#!/usr/bin/env node
/**
 * daemon.js — Gemini Lazy Daemon (UDS Server)
 *
 * 첫 번째 리뷰 요청에서 lazy-start, N분 유휴 시 자동 종료.
 * NDJSON over Unix Domain Socket 프로토콜.
 */

'use strict';

const net = require('net');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

// ─── Modules ───────────────────────────────────────
const { shouldReview } = require('./modules/filter');
const { createCooldownTracker } = require('./modules/cooldown');
const { createRetryTracker } = require('./modules/retry');
const { extractDiff, truncateDiffSmart } = require('./modules/diff');
const { callGemini } = require('./modules/gemini');
const { validateReview } = require('./modules/validator');
const { createStateManager } = require('./modules/state');

// ─── Constants ─────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const STATE_FILE = path.join(PROJECT_ROOT, '.claude', 'coordination', 'gemini-state.json');
const REVIEWS_DIR = path.join(PROJECT_ROOT, '.claude', 'gemini-bridge', 'reviews');
const GEMINI_MD = path.join(PROJECT_ROOT, 'GEMINI.md');
const LOG_FILE = path.join(__dirname, 'daemon.log');

const IDLE_TIER_1 = 5 * 60_000;   // 5분 (리뷰 0건)
const IDLE_TIER_2 = 10 * 60_000;  // 10분 (1-4건)
const IDLE_TIER_3 = 20 * 60_000;  // 20분 (5+건)
const DEBOUNCE_MS = 2_000;        // 2초 coalescing window
const CHECKPOINT_INTERVAL = 60_000; // 60초 상태 체크포인트
const MIN_REVIEW_INTERVAL = 60_000; // 최소 리뷰 간격 60초

// ─── State ─────────────────────────────────────────
const stateManager = createStateManager(STATE_FILE, REVIEWS_DIR);
const cooldown = createCooldownTracker();
const retryTracker = createRetryTracker();

let idleTimer = null;
let checkpointTimer = null;
let reviewCount = 0;
let lastReviewTime = 0;
let shuttingDown = false;
let cleaned = false;
const activeJobs = new Set();

// ─── Socket Path ───────────────────────────────────
function computeSocketPath() {
  const hash = crypto.createHash('md5').update(PROJECT_ROOT).digest('hex').slice(0, 8);
  return `/tmp/gemini-daemon-${hash}.sock`;
}

function computePidPath() {
  const hash = crypto.createHash('md5').update(PROJECT_ROOT).digest('hex').slice(0, 8);
  return `/tmp/gemini-daemon-${hash}.pid`;
}

// ─── Logging ───────────────────────────────────────
function log(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch { /* ok */ }
}

// ─── Idle Timer ────────────────────────────────────
function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);

  let timeout;
  if (reviewCount === 0) timeout = IDLE_TIER_1;
  else if (reviewCount < 5) timeout = IDLE_TIER_2;
  else timeout = IDLE_TIER_3;

  idleTimer = setTimeout(() => {
    if (activeJobs.size > 0) {
      resetIdleTimer(); // 진행 중인 작업이 있으면 연기
      return;
    }
    gracefulShutdown('idle timeout');
  }, timeout);
}

// ─── Graceful Shutdown ─────────────────────────────
function gracefulShutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('info', `Shutting down: ${reason}`);

  if (server) server.close();
  if (checkpointTimer) clearInterval(checkpointTimer);
  if (idleTimer) clearTimeout(idleTimer);

  // 진행 중 작업 대기 (최대 30초)
  const drainTimeout = setTimeout(() => {
    cleanup();
    process.exit(0);
  }, 30_000);

  const checkDrain = setInterval(() => {
    if (activeJobs.size === 0) {
      clearTimeout(drainTimeout);
      clearInterval(checkDrain);
      cleanup();
      process.exit(0);
    }
  }, 500);
}

function cleanup() {
  if (cleaned) return;
  cleaned = true;
  stateManager.save();
  const socketPath = computeSocketPath();
  const pidPath = computePidPath();
  try { if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath); } catch { /* ok */ }
  try { if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath); } catch { /* ok */ }
  log('info', 'Cleanup complete');
}

// ─── Prompt Builder ────────────────────────────────
function buildReviewPrompt(diff, filePath) {
  let contextBlock = '';
  try {
    if (fs.existsSync(GEMINI_MD)) {
      contextBlock = fs.readFileSync(GEMINI_MD, 'utf8').slice(0, 4000) + '\n\n';
    }
  } catch { /* ok */ }

  let recentCommits = '';
  try {
    recentCommits = execSync('git log --oneline -5', {
      cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch { /* ok */ }

  return `${contextBlock}Review this code change. Only flag critical/warning issues (security vulnerabilities, bugs, logic errors, missing error handling). Skip style/formatting.

CRITICAL INSTRUCTION FOR READING THE DIFF:
- Lines starting with \`+\` are ADDED lines (new code)
- Lines starting with \`-\` are REMOVED lines (deleted code)
- Do NOT report diff format characters (+/-) as syntax errors

Recent commits for context:
${recentCommits}

File: ${filePath}

\`\`\`diff
${truncateDiffSmart(diff)}
\`\`\`

Respond in this exact format:
ISSUES:
- [critical|warning|info] file:line - description

VERDICT: approve | needs-attention
SUMMARY: (1 sentence)`;
}

// ─── Request Handler ───────────────────────────────
async function handleRequest(request) {
  if (request.type === 'ping') {
    return { type: 'result', status: 'ok', uptime: process.uptime(), activeJobs: activeJobs.size, reviewCount };
  }

  if (request.type === 'status') {
    return { type: 'result', status: 'ok', ...stateManager.getState(), reviewCount, activeJobs: activeJobs.size };
  }

  if (request.type === 'shutdown') {
    gracefulShutdown('client request');
    return { type: 'result', status: 'ok', message: 'shutting down' };
  }

  if (request.type !== 'review') {
    return { type: 'error', code: 'UNKNOWN_TYPE', message: `Unknown type: ${request.type}` };
  }

  if (shuttingDown) {
    return { type: 'error', code: 'SHUTTING_DOWN', message: 'Daemon is shutting down' };
  }

  const filePath = request.filePath;
  if (!filePath) {
    return { type: 'error', code: 'MISSING_PATH', message: 'filePath required' };
  }

  // Pipeline: filter → cooldown → retry → diff → limit → gemini → validate
  const filterResult = shouldReview(filePath);
  if (filterResult.skip) {
    return { type: 'result', verdict: 'skip', reason: filterResult.reason, blocked: false };
  }

  if (!cooldown.check(filePath)) {
    return { type: 'result', verdict: 'skip', reason: 'cooldown', blocked: false };
  }

  const retryResult = retryTracker.check(filePath);
  if (retryResult.blocked) {
    return { type: 'result', verdict: 'deadlock', reason: `${retryResult.count}x needs-attention`, blocked: false,
      review: `GEMINI DEADLOCK PREVENTION [${path.basename(filePath)}]\n이 파일은 ${retryResult.count}회 연속 needs-attention 판정을 받았습니다.\n자동 리뷰를 중단합니다.` };
  }

  // 최소 리뷰 간격 체크
  if (Date.now() - lastReviewTime < MIN_REVIEW_INTERVAL) {
    return { type: 'result', verdict: 'skip', reason: 'min interval', blocked: false };
  }

  const diffResult = extractDiff(filePath, PROJECT_ROOT);
  if (!diffResult) {
    return { type: 'result', verdict: 'skip', reason: 'no diff', blocked: false };
  }

  if (!stateManager.canCall()) {
    return { type: 'error', code: 'DAILY_LIMIT', message: `${stateManager.getState().callCount}/${stateManager.getState().dailyLimit} calls used` };
  }

  // Gemini 호출
  const jobId = `review-${Date.now()}`;
  activeJobs.add(jobId);

  try {
    stateManager.incrementCalls(); // write-ahead
    lastReviewTime = Date.now();

    const prompt = buildReviewPrompt(diffResult.diff, filePath);
    const geminiResult = await callGemini(prompt, { projectRoot: PROJECT_ROOT });

    if (!geminiResult.success) {
      return { type: 'error', code: 'GEMINI_FAILED', message: geminiResult.error, blocked: false };
    }

    const validated = validateReview(geminiResult.output, diffResult.diff);
    cooldown.record(filePath);
    reviewCount++;

    // verdict에 따라 retry 카운터 관리
    const blocked = validated.verdict === 'needs-attention';
    if (blocked) {
      retryTracker.increment(filePath);
    } else if (validated.verdict === 'approve') {
      retryTracker.clear(filePath);
    }

    // 리뷰 결과 저장
    const reviewData = {
      id: jobId,
      timestamp: new Date().toISOString(),
      filePath,
      verdict: validated.verdict,
      summary: validated.summary,
      review: validated.filteredText,
      diffLength: diffResult.diff.length,
      removedIssues: validated.removedCount
    };

    stateManager.saveReview(reviewData);
    stateManager.addPendingReview({
      id: jobId,
      timestamp: reviewData.timestamp,
      status: 'completed',
      filePath
    });

    return { type: 'result', verdict: validated.verdict, review: validated.filteredText, blocked, summary: validated.summary };
  } finally {
    activeJobs.delete(jobId);
    resetIdleTimer();
  }
}

// ─── Server ────────────────────────────────────────
let server;

function start() {
  const socketPath = computeSocketPath();
  const pidPath = computePidPath();

  // Stale socket 정리
  if (fs.existsSync(socketPath)) {
    try {
      const probe = net.connect(socketPath);
      probe.on('connect', () => {
        probe.destroy();
        log('info', 'Another daemon is running, exiting');
        process.exit(0);
      });
      probe.on('error', () => {
        // Stale socket — 삭제
        try { fs.unlinkSync(socketPath); } catch { /* ok */ }
        bind();
      });
    } catch {
      try { fs.unlinkSync(socketPath); } catch { /* ok */ }
      bind();
    }
  } else {
    bind();
  }

  function bind() {
    server = net.createServer((socket) => {
      resetIdleTimer();

      const rl = readline.createInterface({ input: socket });
      rl.on('line', async (line) => {
        try {
          const request = JSON.parse(line);
          const response = await handleRequest(request);
          socket.write(JSON.stringify(response) + '\n');
        } catch (err) {
          try {
            socket.write(JSON.stringify({ type: 'error', code: 'PARSE_ERROR', message: err.message }) + '\n');
          } catch { /* client disconnected */ }
        }
      });

      socket.on('error', () => {}); // client disconnect
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        log('error', 'Socket already in use');
        process.exit(1);
      }
      log('error', `Server error: ${err.message}`);
    });

    server.listen(socketPath, () => {
      fs.writeFileSync(pidPath, String(process.pid));
      log('info', `Daemon started (PID ${process.pid}) on ${socketPath}`);
      resetIdleTimer();

      // 주기적 상태 체크포인트
      checkpointTimer = setInterval(() => stateManager.save(), CHECKPOINT_INTERVAL);

      // 시작 시 오래된 리뷰 정리
      stateManager.cleanupReviews();
    });
  }

  // Signal handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('exit', cleanup);
  process.on('uncaughtException', (err) => {
    log('error', `Uncaught exception: ${err.stack || err.message}`);
    cleanup();
    process.exit(1);
  });
}

// ─── Entry ─────────────────────────────────────────
if (require.main === module) {
  start();
}

module.exports = { start, computeSocketPath, computePidPath };
