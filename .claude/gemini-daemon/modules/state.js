/**
 * state.js — Gemini 상태 관리
 *
 * 일일 호출 제한, pending reviews, 원자적 파일 쓰기.
 * daemon single-writer이므로 concurrent write 이슈 없음.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_DAILY_LIMIT = 900;

/**
 * @param {string} stateFilePath
 * @param {string} reviewsDir
 */
function createStateManager(stateFilePath, reviewsDir) {
  let state = load();

  function load() {
    try {
      if (!fs.existsSync(stateFilePath)) return freshState();
      const raw = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
      const today = new Date().toISOString().slice(0, 10);

      // 날짜 변경 시 카운터 리셋
      if (raw.date !== today) {
        return { ...freshState(), pendingReviews: raw.pendingReviews || [] };
      }

      return {
        date: raw.date || today,
        callCount: raw.callCount || 0,
        dailyLimit: raw.dailyLimit || DEFAULT_DAILY_LIMIT,
        activeJobs: Array.isArray(raw.activeJobs) ? raw.activeJobs : [],
        pendingReviews: Array.isArray(raw.pendingReviews) ? raw.pendingReviews : []
      };
    } catch {
      return freshState();
    }
  }

  function freshState() {
    return {
      date: new Date().toISOString().slice(0, 10),
      callCount: 0,
      dailyLimit: DEFAULT_DAILY_LIMIT,
      activeJobs: [],
      pendingReviews: []
    };
  }

  function save() {
    try {
      const dir = path.dirname(stateFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      // 원자적 쓰기: .tmp → rename
      const tmpPath = stateFilePath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2) + '\n');
      fs.renameSync(tmpPath, stateFilePath);
    } catch (err) {
      logError('saveState', err);
    }
  }

  function canCall() {
    const today = new Date().toISOString().slice(0, 10);
    if (state.date !== today) {
      state = { ...freshState(), pendingReviews: state.pendingReviews };
    }
    return state.callCount < state.dailyLimit;
  }

  function incrementCalls() {
    state.callCount++;
    save(); // write-ahead: Gemini 호출 전 디스크 기록
  }

  function addPendingReview(review) {
    state.pendingReviews.push(review);
    // 최근 50개만 유지
    if (state.pendingReviews.length > 50) {
      state.pendingReviews = state.pendingReviews.slice(-50);
    }
    save();
  }

  function saveReview(result) {
    try {
      if (!fs.existsSync(reviewsDir)) fs.mkdirSync(reviewsDir, { recursive: true });
      const reviewPath = path.join(reviewsDir, `review-${Date.now()}.json`);
      fs.writeFileSync(reviewPath, JSON.stringify(result, null, 2) + '\n');
    } catch (err) {
      logError('saveReview', err);
    }
  }

  function cleanupReviews(maxAge = 7 * 24 * 3600 * 1000) {
    try {
      if (!fs.existsSync(reviewsDir)) return;
      const now = Date.now();
      for (const file of fs.readdirSync(reviewsDir)) {
        if (!file.endsWith('.json')) continue;
        const fullPath = path.join(reviewsDir, file);
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > maxAge) fs.unlinkSync(fullPath);
      }
    } catch (err) {
      logError('cleanupReviews', err);
    }
  }

  function getState() {
    return { ...state };
  }

  function reload() {
    state = load();
  }

  return { canCall, incrementCalls, addPendingReview, saveReview, cleanupReviews, save, getState, reload };
}

function logError(context, err) {
  try {
    const msg = `[${new Date().toISOString()}] [${context}] ${err.message || err}\n`;
    const logPath = path.join(path.dirname(__filename), '..', 'daemon.log');
    fs.appendFileSync(logPath, msg);
  } catch { /* 로깅 실패는 무시 */ }
}

module.exports = { createStateManager, DEFAULT_DAILY_LIMIT };
