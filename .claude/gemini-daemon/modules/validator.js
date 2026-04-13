/**
 * validator.js — Gemini 리뷰 결과 검증
 *
 * Obsidian validateReviewIssues() 참고.
 * phantom-file 이슈, escaped operator 오탐 필터링.
 */

'use strict';

/**
 * @param {string} reviewText — Gemini 원본 출력
 * @param {string} diff — 리뷰 대상 diff
 * @returns {{ filteredText: string, removedCount: number, verdict: string, summary: string }}
 */
function validateReview(reviewText, diff) {
  if (!reviewText) {
    return { filteredText: '', removedCount: 0, verdict: 'error', summary: 'Empty review output' };
  }

  const diffFiles = extractFilesFromDiff(diff);
  const lines = reviewText.split('\n');
  const filtered = [];
  let removedCount = 0;

  for (const line of lines) {
    if (!isIssueLine(line)) {
      filtered.push(line);
      continue;
    }

    if (isPhantomFileIssue(line, diffFiles)) {
      removedCount++;
      continue;
    }

    if (isEscapedOperatorIssue(line)) {
      removedCount++;
      continue;
    }

    filtered.push(line);
  }

  const filteredText = filtered.join('\n');
  const verdict = extractVerdict(filteredText);
  const summary = extractSummary(filteredText);

  // critical/warning 이슈가 모두 제거되면 verdict를 approve로 보정
  const remainingIssues = filtered.filter(l => isIssueLine(l) && /\[(?:critical|warning)\]/.test(l));
  const correctedVerdict = remainingIssues.length === 0 && removedCount > 0 ? 'approve' : verdict;

  return { filteredText, removedCount, verdict: correctedVerdict, summary };
}

function isIssueLine(line) {
  return /^- \[(?:critical|warning|info)\]/.test(line.trim());
}

function isPhantomFileIssue(line, diffFiles) {
  const fileMatch = line.match(/\]\s+([^\s:]+):/);
  if (!fileMatch) return false;
  const referenced = fileMatch[1];
  return diffFiles.length > 0 && !diffFiles.some(f => f.includes(referenced) || referenced.includes(f));
}

function isEscapedOperatorIssue(line) {
  return /[!<>=]{2,}|escaped?\s+operator/i.test(line);
}

function extractFilesFromDiff(diff) {
  const matches = diff.match(/^(?:diff --git a\/|[\+\-]{3} [ab]\/)(\S+)/gm) || [];
  return [...new Set(matches.map(m => m.replace(/^(?:diff --git a\/|[\+\-]{3} [ab]\/)/, '')))];
}

function extractVerdict(text) {
  const match = text.match(/^VERDICT:\s*(.+)/mi);
  if (!match) return 'unknown';
  const v = match[1].trim().toLowerCase();
  if (v.includes('approve')) return 'approve';
  if (v.includes('needs-attention')) return 'needs-attention';
  return v;
}

function extractSummary(text) {
  const match = text.match(/^SUMMARY:\s*(.+)/mi);
  return match ? match[1].trim() : '';
}

module.exports = { validateReview };
