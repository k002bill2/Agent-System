/**
 * cooldown.js — Per-file 리뷰 쿨다운
 *
 * gemini-review.sh 59-71줄 흡수.
 * 파일 기반 → in-memory Map (daemon long-lived).
 */

'use strict';

const DEFAULT_TTL_MS = 60_000; // 60초

/**
 * @param {number} ttlMs — 쿨다운 시간 (ms)
 * @returns {{ check: (path: string) => boolean, record: (path: string) => void, reset: () => void }}
 */
function createCooldownTracker(ttlMs = DEFAULT_TTL_MS) {
  /** @type {Map<string, number>} filePath → timestamp */
  const entries = new Map();

  function check(filePath) {
    const lastTime = entries.get(filePath);
    if (lastTime == null) return true; // 쿨다운 없음, 리뷰 가능
    return (Date.now() - lastTime) > ttlMs;
  }

  function record(filePath) {
    entries.set(filePath, Date.now());
  }

  function reset() {
    entries.clear();
  }

  return { check, record, reset };
}

module.exports = { createCooldownTracker, DEFAULT_TTL_MS };
