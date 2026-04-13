/**
 * filter.js — 리뷰 대상 파일 필터링
 *
 * gemini-review.sh 40-57줄 흡수.
 * 확장자, 크기, 경로 패턴으로 리뷰 대상 여부 판별.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ALLOWED_EXTENSIONS = new Set(['.py', '.ts', '.tsx', '.js', '.jsx']);

const MAX_FILE_SIZE_KB = 500;

const EXCLUDED_PATHS = [
  '/node_modules/', '/dist/', '/.next/', '/build/', '/__pycache__/',
  '/vendor/', '/generated/', '/.venv/', '/.claude/gemini-daemon/',
  '/.claude/hooks/', '/.claude/scripts/'
];

const EXCLUDED_PATTERNS = [
  '.min.js', '.min.css', '-lock.json', '.lock',
  '_generated.', '.d.ts'
];

/**
 * @param {string} filePath — 절대 또는 상대 경로
 * @returns {{ skip: boolean, reason?: string }}
 */
function shouldReview(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { skip: true, reason: `extension ${ext} not reviewable` };
  }

  const normalized = filePath.replace(/\\/g, '/');

  for (const excl of EXCLUDED_PATHS) {
    if (normalized.includes(excl)) {
      return { skip: true, reason: `path excluded: ${excl}` };
    }
  }

  for (const pat of EXCLUDED_PATTERNS) {
    if (normalized.includes(pat)) {
      return { skip: true, reason: `pattern excluded: ${pat}` };
    }
  }

  try {
    const stats = fs.statSync(filePath);
    if (stats.size / 1024 > MAX_FILE_SIZE_KB) {
      return { skip: true, reason: `file too large: ${Math.round(stats.size / 1024)}KB > ${MAX_FILE_SIZE_KB}KB` };
    }
  } catch {
    // 파일 없으면 skip (삭제된 파일)
    return { skip: true, reason: 'file not found' };
  }

  return { skip: false };
}

module.exports = { shouldReview, ALLOWED_EXTENSIONS, MAX_FILE_SIZE_KB };
