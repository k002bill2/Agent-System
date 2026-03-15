/**
 * File Lock Manager for AOS Dashboard
 * 다중 에이전트 환경에서 파일 충돌 방지
 *
 * fs.mkdirSync(path, { exclusive }) 기반 원자적 락킹으로 TOCTOU 방지
 *
 * @version 2.0.0-AOS Dashboard
 */

const fs = require('fs');
const path = require('path');

const LOCK_DIR = path.join(__dirname, 'locks');
const LOCK_FILE_PATH = path.join(__dirname, 'active-locks.json');
const LOCK_TIMEOUT_MS = 60000; // 1분

// locks 디렉토리 보장
if (!fs.existsSync(LOCK_DIR)) {
  fs.mkdirSync(LOCK_DIR, { recursive: true });
}

/**
 * 경로를 안전한 락 디렉토리 이름으로 변환
 */
function lockDirName(filePath) {
  return path.resolve(filePath).replace(/[^a-zA-Z0-9]/g, '_');
}

/**
 * 원자적 락 획득 (mkdir 기반 — TOCTOU 방지)
 * @param {object} options - { agentId, filePath, operation }
 */
function acquireLock(options) {
  const { agentId, filePath, operation = 'write' } = options;
  const lockKey = lockDirName(filePath);
  const lockPath = path.join(LOCK_DIR, lockKey);
  const metaPath = path.join(lockPath, 'meta.json');

  // 기존 락 디렉토리가 있으면 타임아웃 체크
  if (fs.existsSync(lockPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (Date.now() - meta.timestamp < LOCK_TIMEOUT_MS) {
        return {
          success: false,
          error: 'Lock already held',
          heldBy: meta.agentId,
          since: meta.timestamp
        };
      }
      // 타임아웃된 락 — 제거 후 재시도
      fs.rmSync(lockPath, { recursive: true, force: true });
    } catch {
      // meta 읽기 실패 — 깨진 락, 제거
      fs.rmSync(lockPath, { recursive: true, force: true });
    }
  }

  // 원자적 디렉토리 생성 시도 (다른 프로세스와 경쟁 시 EEXIST 발생)
  const lockId = `lock_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  try {
    fs.mkdirSync(lockPath);
  } catch (err) {
    if (err.code === 'EEXIST') {
      // 다른 프로세스가 먼저 락을 획득함
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        return {
          success: false,
          error: 'Lock already held (race)',
          heldBy: meta.agentId,
          since: meta.timestamp
        };
      } catch {
        return { success: false, error: 'Lock contention' };
      }
    }
    throw err;
  }

  // 메타 데이터 기록
  const meta = { lockId, agentId, filePath, operation, timestamp: Date.now() };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  // 호환성: active-locks.json에도 기록
  syncToLockFile();

  return { success: true, lockId };
}

/**
 * 락 해제
 * @param {object} options - { lockId, agentId }
 */
function releaseLock(options) {
  const { lockId, agentId } = options;

  const entries = fs.readdirSync(LOCK_DIR).filter(d => {
    const metaPath = path.join(LOCK_DIR, d, 'meta.json');
    if (!fs.existsSync(metaPath)) return false;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      return meta.lockId === lockId && meta.agentId === agentId;
    } catch { return false; }
  });

  if (entries.length === 0) {
    return { success: false, error: 'Lock not found' };
  }

  for (const entry of entries) {
    fs.rmSync(path.join(LOCK_DIR, entry), { recursive: true, force: true });
  }

  syncToLockFile();
  return { success: true };
}

/**
 * 파일 락 확인
 * @param {string} filePath
 */
function isLocked(filePath) {
  const lockKey = lockDirName(filePath);
  const lockPath = path.join(LOCK_DIR, lockKey);
  const metaPath = path.join(lockPath, 'meta.json');

  if (!fs.existsSync(lockPath)) return false;

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (Date.now() - meta.timestamp >= LOCK_TIMEOUT_MS) {
      fs.rmSync(lockPath, { recursive: true, force: true });
      syncToLockFile();
      return false;
    }
    return true;
  } catch {
    fs.rmSync(lockPath, { recursive: true, force: true });
    return false;
  }
}

/**
 * 현재 락 상태 조회
 */
function getLockStatus() {
  cleanupExpiredLocks();
  const locks = getAllActiveLocks();
  return { activeLocks: locks, count: locks.length };
}

/**
 * 에이전트 기반 일괄 해제
 * @param {string} agentId - 해제할 에이전트 ID
 */
function releaseByAgent(agentId) {
  let released = 0;

  if (!fs.existsSync(LOCK_DIR)) return { success: true, released: 0 };

  for (const entry of fs.readdirSync(LOCK_DIR)) {
    const metaPath = path.join(LOCK_DIR, entry, 'meta.json');
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (meta.agentId === agentId) {
        fs.rmSync(path.join(LOCK_DIR, entry), { recursive: true, force: true });
        released++;
      }
    } catch { /* skip broken entries */ }
  }

  if (released > 0) syncToLockFile();
  return { success: true, released };
}

/**
 * 모든 락 해제 (강제)
 */
function clearAllLocks() {
  if (fs.existsSync(LOCK_DIR)) {
    for (const entry of fs.readdirSync(LOCK_DIR)) {
      fs.rmSync(path.join(LOCK_DIR, entry), { recursive: true, force: true });
    }
  }
  syncToLockFile();
  return { success: true };
}

// ─── Internal helpers ───────────────────────────────────

function cleanupExpiredLocks() {
  if (!fs.existsSync(LOCK_DIR)) return;
  const now = Date.now();
  for (const entry of fs.readdirSync(LOCK_DIR)) {
    const metaPath = path.join(LOCK_DIR, entry, 'meta.json');
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (now - meta.timestamp >= LOCK_TIMEOUT_MS) {
        fs.rmSync(path.join(LOCK_DIR, entry), { recursive: true, force: true });
      }
    } catch {
      fs.rmSync(path.join(LOCK_DIR, entry), { recursive: true, force: true });
    }
  }
}

function getAllActiveLocks() {
  if (!fs.existsSync(LOCK_DIR)) return [];
  const locks = [];
  for (const entry of fs.readdirSync(LOCK_DIR)) {
    const metaPath = path.join(LOCK_DIR, entry, 'meta.json');
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (Date.now() - meta.timestamp < LOCK_TIMEOUT_MS) {
        locks.push(meta);
      }
    } catch { /* skip */ }
  }
  return locks;
}

/**
 * locks/ 디렉토리 → active-locks.json 동기화 (호환성)
 */
function syncToLockFile() {
  try {
    const locks = {};
    if (fs.existsSync(LOCK_DIR)) {
      for (const entry of fs.readdirSync(LOCK_DIR)) {
        const metaPath = path.join(LOCK_DIR, entry, 'meta.json');
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          const key = path.resolve(meta.filePath).toLowerCase();
          locks[key] = meta;
        } catch { /* skip */ }
      }
    }
    const tmpPath = LOCK_FILE_PATH + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(locks, null, 2), 'utf8');
    fs.renameSync(tmpPath, LOCK_FILE_PATH);
  } catch { /* best effort */ }
}

module.exports = {
  acquireLock,
  releaseLock,
  releaseByAgent,
  isLocked,
  getLockStatus,
  clearAllLocks
};
