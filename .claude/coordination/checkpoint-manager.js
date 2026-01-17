/**
 * Checkpoint Manager for LiveMetro
 * 작업 상태 저장 및 복원
 *
 * @version 1.0.0-LiveMetro
 */

const fs = require('fs');
const path = require('path');

const CHECKPOINT_DIR = path.join(__dirname, 'checkpoints');
const MAX_CHECKPOINTS = 10;

/**
 * 체크포인트 생성
 * @param {object} options - 체크포인트 옵션
 */
function createCheckpoint(options) {
  const {
    agentId = 'primary',
    trigger = 'manual',
    description = '',
    context = {}
  } = options;

  ensureCheckpointDir();

  const checkpointId = `cp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const checkpoint = {
    checkpointId,
    agentId,
    trigger,
    description,
    context,
    timestamp: new Date().toISOString(),
    createdAt: Date.now()
  };

  const filePath = path.join(CHECKPOINT_DIR, `${checkpointId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), 'utf8');

  // 오래된 체크포인트 정리
  cleanupOldCheckpoints();

  return {
    success: true,
    checkpointId,
    filePath
  };
}

/**
 * 체크포인트 복원
 * @param {string} checkpointId
 */
function restoreCheckpoint(checkpointId) {
  const filePath = path.join(CHECKPOINT_DIR, `${checkpointId}.json`);

  if (!fs.existsSync(filePath)) {
    return {
      success: false,
      error: 'Checkpoint not found'
    };
  }

  try {
    const checkpoint = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      success: true,
      checkpoint
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 최근 체크포인트 조회
 * @param {number} limit - 조회 개수
 */
function listCheckpoints(limit = 5) {
  ensureCheckpointDir();

  const files = fs.readdirSync(CHECKPOINT_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const filePath = path.join(CHECKPOINT_DIR, f);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        checkpointId: content.checkpointId,
        description: content.description,
        trigger: content.trigger,
        agentId: content.agentId,
        timestamp: content.timestamp,
        createdAt: content.createdAt
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);

  return files;
}

/**
 * 체크포인트 삭제
 * @param {string} checkpointId
 */
function deleteCheckpoint(checkpointId) {
  const filePath = path.join(CHECKPOINT_DIR, `${checkpointId}.json`);

  if (!fs.existsSync(filePath)) {
    return { success: false, error: 'Checkpoint not found' };
  }

  fs.unlinkSync(filePath);
  return { success: true };
}

/**
 * 오래된 체크포인트 정리
 */
function cleanupOldCheckpoints() {
  const files = fs.readdirSync(CHECKPOINT_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({
      name: f,
      path: path.join(CHECKPOINT_DIR, f),
      mtime: fs.statSync(path.join(CHECKPOINT_DIR, f)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);

  // MAX_CHECKPOINTS 초과 시 삭제
  if (files.length > MAX_CHECKPOINTS) {
    const toDelete = files.slice(MAX_CHECKPOINTS);
    for (const file of toDelete) {
      fs.unlinkSync(file.path);
    }
  }
}

/**
 * 체크포인트 디렉토리 확인
 */
function ensureCheckpointDir() {
  if (!fs.existsSync(CHECKPOINT_DIR)) {
    fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  }
}

/**
 * 모든 체크포인트 삭제
 */
function clearAllCheckpoints() {
  ensureCheckpointDir();

  const files = fs.readdirSync(CHECKPOINT_DIR)
    .filter(f => f.endsWith('.json'));

  for (const file of files) {
    fs.unlinkSync(path.join(CHECKPOINT_DIR, file));
  }

  return { success: true, deleted: files.length };
}

module.exports = {
  createCheckpoint,
  restoreCheckpoint,
  listCheckpoints,
  deleteCheckpoint,
  clearAllCheckpoints
};
