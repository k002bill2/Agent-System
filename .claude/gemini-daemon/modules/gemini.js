/**
 * gemini.js — Gemini CLI 호출
 *
 * gemini-review.sh 125-143줄 + Obsidian callGemini() 참고.
 * timeout, backpressure, EPIPE 처리, 동시 실행 제한.
 */

'use strict';

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 120_000; // 2분
const MAX_STDIN_SIZE = 200_000; // 200KB 이상이면 tmpfile 사용
const MAX_STDOUT_SIZE = 500_000; // stdout 버퍼 제한 (500KB)

let geminiBin = null;

function findGeminiBin() {
  if (geminiBin) return geminiBin;

  try {
    geminiBin = execSync('which gemini', { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    return geminiBin;
  } catch { /* fallback */ }

  const candidates = [
    '/opt/homebrew/bin/gemini',
    '/usr/local/bin/gemini',
    path.join(process.env.HOME || '', '.local/bin/gemini')
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      geminiBin = p;
      return geminiBin;
    }
  }

  return null;
}

// 동시 실행 제한 (1개)
let activeCall = null;
const queue = [];

/**
 * @param {string} prompt
 * @param {{ timeoutMs?: number, projectRoot?: string }} options
 * @returns {Promise<{ success: boolean, output: string, error?: string }>}
 */
function callGemini(prompt, options = {}) {
  return new Promise((resolve) => {
    const task = { prompt, options, resolve };

    if (activeCall) {
      queue.push(task);
      return;
    }

    executeCall(task);
  });
}

function executeCall(task) {
  activeCall = task;
  const { prompt, options, resolve } = task;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const bin = findGeminiBin();

  if (!bin) {
    finishCall(resolve, { success: false, output: '', error: 'Gemini CLI not found' });
    return;
  }

  const readOnlyPrefix = 'CRITICAL CONSTRAINT: You are a READ-ONLY reviewer. You MUST NOT use any tools that write, edit, or delete files. Only analyze and respond with text.\n\n';
  const fullPrompt = readOnlyPrefix + prompt;

  const useTmpFile = Buffer.byteLength(fullPrompt) > MAX_STDIN_SIZE;
  let tmpFile = null;

  const args = useTmpFile
    ? ['--output-format', 'text', '--sandbox', '-e', 'none', '--yolo']
    : ['-p', fullPrompt, '--output-format', 'text', '--sandbox', '-e', 'none', '--yolo'];

  if (useTmpFile) {
    tmpFile = path.join(require('os').tmpdir(), `.gemini-prompt-${Date.now()}.tmp`);
    fs.writeFileSync(tmpFile, fullPrompt);
    args.unshift('-p', `@${tmpFile}`);
  }

  let stdout = '';
  let stderr = '';
  let killed = false;
  let spawnError = false;

  const child = spawn(bin, args, {
    cwd: options.projectRoot || process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: timeoutMs
  });

  child.on('error', (err) => {
    spawnError = true;
    cleanup();
    finishCall(resolve, { success: false, output: '', error: `spawn error: ${err.message}` });
  });

  const timer = setTimeout(() => {
    killed = true;
    try { process.kill(child.pid, 'SIGTERM'); } catch { /* already dead */ }
    setTimeout(() => {
      try { process.kill(child.pid, 'SIGKILL'); } catch { /* already dead */ }
    }, 5000);
  }, timeoutMs);

  child.stdout.on('data', (data) => {
    if (stdout.length < MAX_STDOUT_SIZE) {
      stdout += data.toString();
    }
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString().slice(0, 10_000);
  });

  child.on('close', (code) => {
    if (spawnError) return;
    clearTimeout(timer);
    cleanup();

    if (killed) {
      finishCall(resolve, { success: false, output: stdout, error: `timeout after ${timeoutMs}ms` });
      return;
    }

    finishCall(resolve, {
      success: code === 0,
      output: stdout.trim(),
      error: code !== 0 ? `exit ${code}: ${stderr.slice(0, 500)}` : undefined
    });
  });

  function cleanup() {
    clearTimeout(timer);
    if (tmpFile) {
      try { fs.unlinkSync(tmpFile); } catch { /* ok */ }
    }
  }
}

function finishCall(resolve, result) {
  activeCall = null;
  resolve(result);

  // 큐에 대기 중인 다음 작업 처리
  if (queue.length > 0) {
    executeCall(queue.shift());
  }
}

module.exports = { callGemini, findGeminiBin };
