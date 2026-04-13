/**
 * client.js — Gemini Daemon 클라이언트
 *
 * Hook에서 daemon에 리뷰 요청을 보내는 경량 클라이언트.
 * stale socket probe, daemon lazy-start, fallback 지원.
 */

'use strict';

const net = require('net');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CONNECT_TIMEOUT = 2_000; // 2초
const RESPONSE_TIMEOUT = 130_000; // 2분 10초 (Gemini 120초 + 여유 10초)
const SPAWN_RETRY_DELAY = 200; // 200ms
const SPAWN_MAX_RETRIES = 3;

/**
 * 프로젝트 루트로부터 socket 경로 계산
 * @param {string} projectRoot
 * @returns {string}
 */
function computeSocketPath(projectRoot) {
  const hash = crypto.createHash('md5').update(projectRoot).digest('hex').slice(0, 8);
  return `/tmp/gemini-daemon-${hash}.sock`;
}

function computePidPath(projectRoot) {
  const hash = crypto.createHash('md5').update(projectRoot).digest('hex').slice(0, 8);
  return `/tmp/gemini-daemon-${hash}.pid`;
}

/**
 * daemon이 살아있는지 확인
 * @param {string} socketPath
 * @returns {Promise<boolean>}
 */
function probeSocket(socketPath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(socketPath)) {
      resolve(false);
      return;
    }

    const probe = net.connect(socketPath);
    const timer = setTimeout(() => {
      probe.destroy();
      resolve(false);
    }, 500);

    probe.on('connect', () => {
      clearTimeout(timer);
      probe.destroy();
      resolve(true);
    });

    probe.on('error', () => {
      clearTimeout(timer);
      // Stale socket — 정리
      try { fs.unlinkSync(socketPath); } catch { /* ok */ }
      const pidPath = socketPath.replace('.sock', '.pid');
      try { fs.unlinkSync(pidPath); } catch { /* ok */ }
      resolve(false);
    });
  });
}

/**
 * daemon 프로세스 시작 (detached)
 * @param {string} projectRoot
 * @returns {boolean} 시작 성공 여부
 */
function spawnDaemon(projectRoot) {
  const pidPath = computePidPath(projectRoot);

  // Race condition 방지: pidfile 원자적 생성
  try {
    fs.writeFileSync(pidPath, 'spawning', { flag: 'wx' });
  } catch {
    // 다른 hook이 이미 시작 중
    return false;
  }

  const daemonPath = path.join(projectRoot, '.claude', 'gemini-daemon', 'daemon.js');
  const child = spawn('node', [daemonPath], {
    cwd: projectRoot,
    stdio: 'ignore',
    detached: true
  });
  child.unref();
  return true;
}

/**
 * socket이 나타날 때까지 대기
 * @param {string} socketPath
 * @param {number} retries
 * @param {number} delayMs
 * @returns {Promise<boolean>}
 */
function waitForSocket(socketPath, retries = SPAWN_MAX_RETRIES, delayMs = SPAWN_RETRY_DELAY) {
  return new Promise((resolve) => {
    let attempt = 0;
    const check = () => {
      attempt++;
      probeSocket(socketPath).then((alive) => {
        if (alive) {
          resolve(true);
        } else if (attempt >= retries) {
          resolve(false);
        } else {
          setTimeout(check, delayMs);
        }
      });
    };
    setTimeout(check, delayMs); // 첫 번째 체크 전 약간 대기
  });
}

/**
 * daemon에 NDJSON 요청 전송
 * @param {string} socketPath
 * @param {object} request
 * @param {number} timeoutMs
 * @returns {Promise<object | null>} null이면 daemon 불가
 */
function sendRequest(socketPath, request, timeoutMs = RESPONSE_TIMEOUT) {
  return new Promise((resolve) => {
    const socket = net.connect(socketPath);
    let response = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(null);
      }
    }, timeoutMs);

    socket.on('connect', () => {
      socket.write(JSON.stringify(request) + '\n');
    });

    socket.on('data', (data) => {
      response += data.toString();
      const newlineIdx = response.indexOf('\n');
      if (newlineIdx >= 0) {
        clearTimeout(timer);
        settled = true;
        socket.destroy();
        try {
          resolve(JSON.parse(response.slice(0, newlineIdx)));
        } catch {
          resolve(null);
        }
      }
    });

    socket.on('error', () => {
      if (!settled) {
        clearTimeout(timer);
        settled = true;
        resolve(null);
      }
    });
  });
}

module.exports = { computeSocketPath, computePidPath, probeSocket, spawnDaemon, waitForSocket, sendRequest };
