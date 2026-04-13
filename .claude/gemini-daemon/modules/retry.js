/**
 * retry.js — Deadlock 방지 (needs-attention 반복 차단)
 *
 * gemini-review.sh 73-88줄 흡수.
 * 동일 파일이 연속 N회 needs-attention이면 자동 리뷰 중단.
 */

'use strict';

const DEFAULT_MAX_RETRIES = 3;

/**
 * @param {number} maxRetries
 * @returns {{ check, increment, clear, clearAll }}
 */
function createRetryTracker(maxRetries = DEFAULT_MAX_RETRIES) {
  /** @type {Map<string, number>} filePath → consecutive needs-attention count */
  const counts = new Map();

  function check(filePath) {
    const count = counts.get(filePath) || 0;
    return { blocked: count >= maxRetries, count };
  }

  function increment(filePath) {
    const next = (counts.get(filePath) || 0) + 1;
    counts.set(filePath, next);
    return next;
  }

  function clear(filePath) {
    counts.delete(filePath);
  }

  function clearAll() {
    counts.clear();
  }

  return { check, increment, clear, clearAll };
}

module.exports = { createRetryTracker, DEFAULT_MAX_RETRIES };
