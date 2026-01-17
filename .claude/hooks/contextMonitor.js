#!/usr/bin/env node
/**
 * Context Monitor Hook for LiveMetro
 *
 * 상호작용 횟수 기반으로 /save-and-compact 실행을 권장합니다.
 * Stop 이벤트에서 호출됩니다.
 *
 * @version 2.0.0
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '.context-state.json');

const CONFIG = {
  WARNING_THRESHOLD: 15,   // 경고 표시 횟수
  CRITICAL_THRESHOLD: 25,  // 강력 권고 횟수
  REMINDER_INTERVAL: 5     // 알림 간격 (분)
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (e) { /* ignore */ }

  return {
    count: 0,
    start: Date.now(),
    lastReminder: 0
  };
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) { /* ignore */ }
}

function resetState() {
  const state = { count: 0, start: Date.now(), lastReminder: 0 };
  saveState(state);
  console.log('Context monitor reset.');
  return state;
}

function getMinutes(start) {
  return Math.floor((Date.now() - start) / 60000);
}

function showStatus(state) {
  const mins = getMinutes(state.start);
  console.log(`Interactions: ${state.count} | Session: ${mins}m`);
}

function main() {
  const args = process.argv.slice(2);

  // CLI commands
  if (args[0] === 'reset') {
    resetState();
    return;
  }

  if (args[0] === 'status') {
    showStatus(loadState());
    return;
  }

  // Hook mode - increment and check
  const state = loadState();
  state.count++;

  const mins = getMinutes(state.start);
  const sinceReminder = (Date.now() - state.lastReminder) / 60000;

  // Skip if reminded recently
  if (sinceReminder < CONFIG.REMINDER_INTERVAL) {
    saveState(state);
    return;
  }

  // Check thresholds
  if (state.count >= CONFIG.CRITICAL_THRESHOLD) {
    console.log(`\n[Context Monitor] ${state.count} interactions, ${mins}m elapsed`);
    console.log('[Context Monitor] Recommend: /save-and-compact then /compact\n');
    state.lastReminder = Date.now();
  } else if (state.count >= CONFIG.WARNING_THRESHOLD) {
    console.log(`\n[Context Monitor] ${state.count} interactions - consider saving soon\n`);
    state.lastReminder = Date.now();
  }

  saveState(state);
}

main();
