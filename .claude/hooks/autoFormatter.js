/**
 * Auto Formatter Hook for AOS Dashboard
 * PostToolUse에서 자동 코드 포매팅 및 린팅
 *
 * @version 1.0.0-AOS Dashboard
 *
 * @hook-config
 * {"event": "PostToolUse", "matcher": "Edit|Write", "command": "node .claude/hooks/autoFormatter.js 2>/dev/null || true"}
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Hook entry point
 * @param {object} event - PostToolUse 이벤트 객체
 */
async function onPostToolUse(event) {
  try {
    // Write 또는 Edit 도구만 처리
    if (event.tool !== 'Write' && event.tool !== 'Edit') {
      return { success: true, skipped: true };
    }

    const filePath = event.parameters?.file_path;

    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }

    const ext = path.extname(filePath);
    const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];

    if (!supportedExtensions.includes(ext)) {
      return { success: true, skipped: true };
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ AUTO FORMATTER');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`📄 File: ${path.basename(filePath)}`);

    const results = {
      formatted: false,
      linted: false
    };

    // 1. Prettier 포매팅
    try {
      execSync(`npx prettier --write "${filePath}"`, {
        stdio: 'pipe',
        timeout: 30000
      });
      results.formatted = true;
      console.log('✅ Formatted with Prettier');
    } catch (e) {
      console.log('⚠️  Prettier not available');
    }

    // 2. ESLint 자동 수정 (TS/TSX만)
    if (['.ts', '.tsx'].includes(ext)) {
      try {
        execSync(`npx eslint --fix "${filePath}"`, {
          stdio: 'pipe',
          timeout: 30000
        });
        results.linted = true;
        console.log('✅ Linted with ESLint');
      } catch (e) {
        console.log('⚠️  ESLint auto-fix had issues');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    return { success: true, results };

  } catch (error) {
    console.error('[AutoFormatter] Error:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { onPostToolUse };
