/**
 * Gemini Auto Review Hook - Stop 이벤트에서 자동 실행
 *
 * Claude Code Stop 시 변경량을 확인하고,
 * 임계값 이상이면 Gemini review를 동기적으로 실행하여
 * 결과를 즉시 context에 출력합니다.
 *
 * @version 2.0.0
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ─── Constants ──────────────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const BRIDGE_SCRIPT = path.join(__dirname, 'gemini-bridge.js');
const MIN_CHANGED_LINES = 5;
const GEMINI_BIN = '/opt/homebrew/bin/gemini';

// ─── Main (async) ───────────────────────────────────────────

async function main() {
  // 1. Gemini CLI 존재 여부 확인
  if (!fs.existsSync(GEMINI_BIN)) {
    process.exit(0);
  }

  // 2. gemini-bridge.js 존재 여부 확인
  if (!fs.existsSync(BRIDGE_SCRIPT)) {
    process.exit(0);
  }

  // 3. git diff --stat으로 변경량 확인
  let diffStat;
  try {
    diffStat = execSync('git diff --stat HEAD', {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      timeout: 5000
    });
  } catch (e) {
    try {
      diffStat = execSync('git diff --stat', {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        timeout: 5000
      });
    } catch (_) {
      process.exit(0);
    }
  }

  // 4. 변경 라인 수 파싱
  const changedLines = parseChangedLines(diffStat);

  if (changedLines < MIN_CHANGED_LINES) {
    if (changedLines > 0) {
      console.log(`[GEMINI] 변경 ${changedLines}줄 (< ${MIN_CHANGED_LINES}) - 자동 리뷰 스킵`);
    }
    process.exit(0);
  }

  // 5. 일일 한도 확인
  const { loadState, canCallGemini, runReview } = require('./gemini-bridge.js');
  const state = loadState();
  if (!canCallGemini(state)) {
    console.log(`[GEMINI] 일일 한도 도달 (${state.callCount}/${state.dailyLimit}) - 자동 리뷰 스킵`);
    process.exit(0);
  }

  // 6. 동기적으로 Gemini review 실행 → 결과를 즉시 stdout 출력
  console.log(`[GEMINI] 변경 ${changedLines}줄 감지 - 리뷰 실행 중...`);

  try {
    const result = await runReview();

    if (result.skipped) {
      console.log(`[GEMINI] 리뷰 스킵: ${result.reason}`);
      process.exit(0);
    }

    if (result.status === 'completed' && result.review) {
      // 결과를 context에 바로 표시
      console.log('[GEMINI REVIEW RESULT]');
      console.log(result.review);
      console.log(`[/GEMINI REVIEW RESULT] (${result.id})`);
    } else {
      console.log(`[GEMINI] 리뷰 실패: ${result.error || 'unknown error'}`);
    }
  } catch (e) {
    console.error(`[GEMINI] 리뷰 실행 오류: ${e.message}`);
  }

  process.exit(0);
}

// ─── Helpers ────────────────────────────────────────────────

function parseChangedLines(diffStat) {
  if (!diffStat || !diffStat.trim()) return 0;

  const lines = diffStat.trim().split('\n');
  const summaryLine = lines[lines.length - 1];

  let total = 0;

  const insertMatch = summaryLine.match(/(\d+)\s+insertion/);
  if (insertMatch) total += parseInt(insertMatch[1], 10);

  const deleteMatch = summaryLine.match(/(\d+)\s+deletion/);
  if (deleteMatch) total += parseInt(deleteMatch[1], 10);

  return total;
}

// ─── Entry ──────────────────────────────────────────────────

main();
