/**
 * geminiDaemonHook.js — Gemini Lazy Daemon PostToolUse Hook
 *
 * Edit|Write 시 Gemini daemon에 리뷰 요청.
 * daemon이 없으면 lazy-start, 실패 시 gemini-review.sh fallback.
 *
 * Exit codes:
 *   0 = 통과 (approve, skip, error)
 *   2 = 차단 (needs-attention → Claude에 수정 요청)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const { computeSocketPath, probeSocket, spawnDaemon, waitForSocket, sendRequest } = require('../gemini-daemon/client');

const FALLBACK_SCRIPT = path.join(PROJECT_ROOT, 'infra', 'scripts', 'gemini-review.sh');
const DISABLE_FLAG = path.join(PROJECT_ROOT, '.claude', 'gemini-daemon', '.daemon-disabled');
const FAIL_COUNT_FILE = '/tmp/gemini-daemon-fail-count';
const MAX_FAILURES = 3;
const FAIL_WINDOW_MS = 5 * 60_000; // 5분

async function main() {
  // stdin에서 file_path 추출
  let filePath;
  try {
    const input = fs.readFileSync('/dev/stdin', 'utf8');
    const parsed = JSON.parse(input);
    filePath = (parsed.tool_input || {}).file_path || '';
  } catch {
    process.exit(0);
  }

  if (!filePath) process.exit(0);

  // daemon 비활성화 플래그 체크
  if (fs.existsSync(DISABLE_FLAG)) {
    runFallback(filePath);
    return;
  }

  const socketPath = computeSocketPath(PROJECT_ROOT);

  try {
    let alive = await probeSocket(socketPath);

    if (!alive) {
      // Lazy start
      const spawned = spawnDaemon(PROJECT_ROOT);
      if (spawned || !alive) {
        alive = await waitForSocket(socketPath);
      }
    }

    if (!alive) {
      recordFailure();
      runFallback(filePath);
      return;
    }

    // Daemon에 리뷰 요청
    const result = await sendRequest(socketPath, { type: 'review', filePath });

    if (!result) {
      recordFailure();
      runFallback(filePath);
      return;
    }

    clearFailures();

    // 결과 출력 (Claude 컨텍스트에 주입)
    if (result.verdict === 'skip') {
      process.exit(0);
    }

    if (result.type === 'error') {
      console.log(`\nGemini Daemon Error: [${result.code}] ${result.message}`);
      process.exit(0);
    }

    const basename = path.basename(filePath);
    console.log('');
    console.log(`Gemini Checker [${basename}]`);

    if (result.review) {
      // 구조화된 출력만 추출
      const clean = result.review.split('\n')
        .filter(l => /^ISSUES|^VERDICT|^SUMMARY|^- \[/.test(l.trim()))
        .join('\n');
      console.log(clean || result.review.split('\n').slice(-15).join('\n'));
    }

    if (result.blocked) {
      console.log('');
      console.log('[BLOCKED] Gemini가 문제를 발견했습니다. 위 이슈를 먼저 수정하세요.');
      process.exit(2);
    }

    if (result.verdict === 'deadlock') {
      console.log(result.review || '');
      process.exit(0);
    }

  } catch (err) {
    recordFailure();
    runFallback(filePath);
  }
}

function runFallback(filePath) {
  if (!fs.existsSync(FALLBACK_SCRIPT)) {
    process.exit(0);
  }

  try {
    // gemini-review.sh에 stdin으로 tool_input 전달
    const input = JSON.stringify({ tool_input: { file_path: filePath } });
    const result = execSync(`echo '${input.replace(/'/g, "'\\''")}' | bash "${FALLBACK_SCRIPT}"`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      timeout: 40_000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    if (result) console.log(result);
  } catch (err) {
    if (err.status === 2) {
      // Shell script가 BLOCK 신호
      if (err.stdout) console.log(err.stdout);
      process.exit(2);
    }
    // 다른 에러는 무시
  }
}

function recordFailure() {
  try {
    let data = { count: 0, since: Date.now() };
    if (fs.existsSync(FAIL_COUNT_FILE)) {
      data = JSON.parse(fs.readFileSync(FAIL_COUNT_FILE, 'utf8'));
      if (Date.now() - data.since > FAIL_WINDOW_MS) {
        data = { count: 0, since: Date.now() };
      }
    }
    data.count++;
    fs.writeFileSync(FAIL_COUNT_FILE, JSON.stringify(data));

    if (data.count >= MAX_FAILURES) {
      fs.writeFileSync(DISABLE_FLAG, `Disabled at ${new Date().toISOString()} after ${MAX_FAILURES} failures`);
    }
  } catch { /* ok */ }
}

function clearFailures() {
  try { if (fs.existsSync(FAIL_COUNT_FILE)) fs.unlinkSync(FAIL_COUNT_FILE); } catch { /* ok */ }
}

main().catch(() => process.exit(0));
