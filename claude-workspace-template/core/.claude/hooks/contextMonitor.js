#!/usr/bin/env node
/**
 * Context Monitor Hook (Generalized)
 *
 * Tracks interaction count and recommends `/save-and-compact` when
 * approaching context window limits. Called on the Stop event.
 *
 * CLI usage:
 *   node contextMonitor.js           # Hook mode: increment + check
 *   node contextMonitor.js status    # Show current session stats
 *   node contextMonitor.js reset     # Reset counter
 *
 * @hook-config
 * {"event": "Stop", "matcher": "", "command": "node .claude/hooks/contextMonitor.js 2>/dev/null || true"}
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '.context-state.json');

const CONFIG = {
  WARNING_THRESHOLD: 15,   // Show warning at this many interactions
  CRITICAL_THRESHOLD: 25,  // Show strong recommendation at this count
  REMINDER_INTERVAL: 5     // Minutes between reminders (avoid spam)
};

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function getMinutes(start) {
  return Math.floor((Date.now() - start) / 60000);
}

function showStatus(state) {
  const mins = getMinutes(state.start);
  console.log(`Interactions: ${state.count} | Session: ${mins}m`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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
