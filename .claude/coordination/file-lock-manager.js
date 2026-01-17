/**
 * File Lock Manager for LiveMetro
 * 다중 에이전트 환경에서 파일 충돌 방지
 *
 * @version 1.0.0-LiveMetro
 */

const fs = require('fs');
const path = require('path');

const LOCK_FILE_PATH = path.join(__dirname, 'active-locks.json');
const LOCK_TIMEOUT_MS = 60000; // 1분

/**
 * 락 획득
 * @param {object} options - { agentId, filePath, operation }
 */
function acquireLock(options) {
  const { agentId, filePath, operation = 'write' } = options;
  const locks = loadLocks();
  const lockKey = normalizePath(filePath);

  // 기존 락 확인
  const existingLock = locks[lockKey];
  if (existingLock) {
    // 타임아웃 체크
    if (Date.now() - existingLock.timestamp < LOCK_TIMEOUT_MS) {
      return {
        success: false,
        error: 'Lock already held',
        heldBy: existingLock.agentId,
        since: existingLock.timestamp
      };
    }
    // 타임아웃된 락은 해제
  }

  // 새 락 설정
  const lockId = `lock_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  locks[lockKey] = {
    lockId,
    agentId,
    filePath,
    operation,
    timestamp: Date.now()
  };

  saveLocks(locks);

  return {
    success: true,
    lockId
  };
}

/**
 * 락 해제
 * @param {object} options - { lockId, agentId }
 */
function releaseLock(options) {
  const { lockId, agentId } = options;
  const locks = loadLocks();

  for (const [key, lock] of Object.entries(locks)) {
    if (lock.lockId === lockId) {
      if (lock.agentId !== agentId) {
        return {
          success: false,
          error: 'Cannot release lock owned by another agent'
        };
      }
      delete locks[key];
      saveLocks(locks);
      return { success: true };
    }
  }

  return { success: false, error: 'Lock not found' };
}

/**
 * 파일 락 확인
 * @param {string} filePath
 */
function isLocked(filePath) {
  const locks = loadLocks();
  const lockKey = normalizePath(filePath);
  const lock = locks[lockKey];

  if (!lock) return false;

  // 타임아웃 체크
  if (Date.now() - lock.timestamp >= LOCK_TIMEOUT_MS) {
    delete locks[lockKey];
    saveLocks(locks);
    return false;
  }

  return true;
}

/**
 * 현재 락 상태 조회
 */
function getLockStatus() {
  const locks = loadLocks();
  const now = Date.now();

  // 타임아웃된 락 정리
  let cleaned = false;
  for (const [key, lock] of Object.entries(locks)) {
    if (now - lock.timestamp >= LOCK_TIMEOUT_MS) {
      delete locks[key];
      cleaned = true;
    }
  }
  if (cleaned) saveLocks(locks);

  return {
    activeLocks: Object.values(locks),
    count: Object.keys(locks).length
  };
}

/**
 * 모든 락 해제 (강제)
 */
function clearAllLocks() {
  saveLocks({});
  return { success: true };
}

/**
 * 락 파일 로드
 */
function loadLocks() {
  try {
    if (fs.existsSync(LOCK_FILE_PATH)) {
      return JSON.parse(fs.readFileSync(LOCK_FILE_PATH, 'utf8'));
    }
  } catch (error) {
    console.error('[FileLockManager] Load error:', error.message);
  }
  return {};
}

/**
 * 락 파일 저장
 */
function saveLocks(locks) {
  try {
    fs.writeFileSync(LOCK_FILE_PATH, JSON.stringify(locks, null, 2), 'utf8');
  } catch (error) {
    console.error('[FileLockManager] Save error:', error.message);
  }
}

/**
 * 경로 정규화
 */
function normalizePath(filePath) {
  return path.resolve(filePath).toLowerCase();
}

module.exports = {
  acquireLock,
  releaseLock,
  isLocked,
  getLockStatus,
  clearAllLocks
};
