/**
 * diff.js — Git diff 추출
 *
 * gemini-review.sh 90-120줄 흡수.
 * diff → cached → HEAD → new file 폴백 체인.
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');

const MIN_DIFF_LINES = 3;
const MAX_NEW_FILE_PREVIEW = 150;
const NEW_FILE_HEAD = 80;

/**
 * @param {string} filePath
 * @param {string} projectRoot
 * @returns {{ diff: string, isNewFile: boolean, changedLines: number } | null}
 */
function extractDiff(filePath, projectRoot) {
  const execOpts = { cwd: projectRoot, encoding: 'utf8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'] };

  let diff = tryExec(`git diff -- "${filePath}"`, execOpts);
  if (!diff) diff = tryExec(`git diff --cached -- "${filePath}"`, execOpts);
  if (!diff) diff = tryExec(`git diff HEAD -- "${filePath}"`, execOpts);

  if (diff) {
    const changedLines = (diff.match(/^[+-]/gm) || []).length;
    if (changedLines < MIN_DIFF_LINES) return null;
    return { diff, isNewFile: false, changedLines };
  }

  // New file (untracked): 내용 직접 읽기
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const totalLines = lines.length;

    let preview;
    if (totalLines <= MAX_NEW_FILE_PREVIEW) {
      preview = content;
    } else {
      preview = lines.slice(0, NEW_FILE_HEAD).join('\n')
        + `\n... (${totalLines} lines total, showing first ${NEW_FILE_HEAD}) ...`;
    }

    return {
      diff: `[NEW FILE] ${filePath} (${totalLines} lines)\n${preview}`,
      isNewFile: true,
      changedLines: totalLines
    };
  } catch {
    return null;
  }
}

/**
 * diff가 너무 클 때 파일별로 비례 축소
 * @param {string} diff
 * @param {number} maxLen
 * @returns {string}
 */
function truncateDiffSmart(diff, maxLen = 50_000) {
  if (diff.length <= maxLen) return diff;

  const sections = diff.split(/^(diff --git )/m);
  if (sections.length <= 1) return diff.slice(0, maxLen) + '\n... (truncated)';

  const ratio = maxLen / diff.length;
  const result = [];
  for (const section of sections) {
    const sliceLen = Math.max(200, Math.floor(section.length * ratio));
    result.push(section.slice(0, sliceLen));
  }

  return result.join('') + `\n... (truncated from ${diff.length} to ~${maxLen} chars)`;
}

function tryExec(cmd, opts) {
  try {
    const result = execSync(cmd, opts);
    return result && result.trim() ? result : null;
  } catch {
    return null;
  }
}

module.exports = { extractDiff, truncateDiffSmart, MIN_DIFF_LINES };
