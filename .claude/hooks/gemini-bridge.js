/**
 * Gemini Bridge - Claude Code <-> Gemini CLI Integration
 *
 * Modes:
 *   review  - Cross-verify code changes via Gemini
 *   scan    - Large-context codebase analysis
 *   parallel - Delegate independent tasks
 *   status  - Show current Gemini job status
 *
 * All results saved to .claude/gemini-bridge/
 * Gemini is READ-ONLY: never edits src/ files.
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');

// ─── Constants ──────────────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const BRIDGE_DIR = path.join(PROJECT_ROOT, '.claude', 'gemini-bridge');
const REVIEWS_DIR = path.join(BRIDGE_DIR, 'reviews');
const STATE_FILE = path.join(PROJECT_ROOT, '.claude', 'coordination', 'gemini-state.json');
const ERRORS_LOG = path.join(BRIDGE_DIR, 'errors.log');
const GEMINI_BIN = '/opt/homebrew/bin/gemini';
const GEMINI_MD = path.join(PROJECT_ROOT, 'GEMINI.md');

const TIMEOUT_REVIEW = 180_000;  // 180s (increased from 120s for large diffs)
const TIMEOUT_SCAN = 300_000;    // 300s (increased from 180s for full scans)
const DAILY_LIMIT = 900;

// ─── State Management ───────────────────────────────────────

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const state = JSON.parse(raw);
      // Reset daily counter if date changed
      const today = new Date().toISOString().slice(0, 10);
      if (state.date !== today) {
        state.date = today;
        state.callCount = 0;
        state.activeJobs = [];
      }
      return state;
    }
  } catch (e) {
    logError('loadState', e);
  }
  return {
    date: new Date().toISOString().slice(0, 10),
    callCount: 0,
    dailyLimit: DAILY_LIMIT,
    activeJobs: [],
    pendingReviews: []
  };
}

function saveState(state) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
  } catch (e) {
    logError('saveState', e);
  }
}

function canCallGemini(state) {
  return state.callCount < (state.dailyLimit || DAILY_LIMIT);
}

function incrementCallCount(state) {
  state.callCount++;
  saveState(state);
}

// ─── Error Logging ──────────────────────────────────────────

function logError(context, error) {
  try {
    if (!fs.existsSync(BRIDGE_DIR)) fs.mkdirSync(BRIDGE_DIR, { recursive: true });
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] [${context}] ${error.message || error}\n`;
    fs.appendFileSync(ERRORS_LOG, entry);
  } catch (_) {
    // Silent fail - cannot even log errors
  }
}

// ─── Gemini Invocation ──────────────────────────────────────

/**
 * Call Gemini CLI with a prompt string.
 * Small prompts (<200K) use -p flag directly.
 * Large prompts write to a temp file and use stdin pipe with -p instruction prefix,
 * plus --approval-mode plan to prevent Gemini from launching tool calls.
 * PID-based timeout (macOS has no `timeout` command).
 *
 * @param {string} prompt - The prompt text
 * @param {object} options - { timeoutMs, outputFormat }
 * @returns {Promise<{success: boolean, output: string, error?: string}>}
 */
function callGemini(prompt, options = {}) {
  const { timeoutMs = TIMEOUT_REVIEW, outputFormat = 'text' } = options;
  const TMPFILE_THRESHOLD = 200_000; // Use temp file above this size

  return new Promise((resolve) => {
    if (!fs.existsSync(GEMINI_BIN)) {
      resolve({ success: false, output: '', error: 'Gemini binary not found at ' + GEMINI_BIN });
      return;
    }

    if (!fs.existsSync(BRIDGE_DIR)) {
      try { fs.mkdirSync(BRIDGE_DIR, { recursive: true }); } catch (_) {}
    }

    const useTmpFile = prompt.length > TMPFILE_THRESHOLD;
    let tmpFile = null;

    // For large prompts, write to temp file and reference it in -p
    if (useTmpFile) {
      tmpFile = path.join(BRIDGE_DIR, `.prompt-${Date.now()}.tmp`);
      try {
        fs.writeFileSync(tmpFile, prompt);
      } catch (e) {
        resolve({ success: false, output: '', error: 'Failed to write temp prompt: ' + e.message });
        return;
      }
    }

    const args = [];

    // READ-ONLY 제한: 프롬프트에 수정 금지 명시 + sandbox로 파일시스템 보호
    const readOnlyPrefix = 'CRITICAL CONSTRAINT: You are a READ-ONLY reviewer. You MUST NOT use any tools that write, edit, or delete files (WriteFile, EditFile, ReplaceInFile, etc). Only analyze and respond with text. ';

    if (useTmpFile) {
      args.push('-p', readOnlyPrefix + 'Analyze the content provided via stdin. Follow all instructions within the stdin content.');
    } else {
      args.push('-p', readOnlyPrefix + prompt);
    }

    args.push('--output-format', outputFormat);
    args.push('--sandbox');          // Sandbox: 파일 수정 시도해도 실제 파일시스템에 반영 안됨
    args.push('-e', 'none');         // 확장 비활성화: 파일 도구 로드 차단
    args.push('--yolo');

    let stdout = '';
    let stderr = '';
    let killed = false;

    const child = spawn(GEMINI_BIN, args, {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        TERM: 'dumb',
        NODE_OPTIONS: '--max-old-space-size=2048'  // Limit Gemini CLI heap to 2GB to prevent OOM
      },
      stdio: [useTmpFile ? 'pipe' : 'ignore', 'pipe', 'pipe']
    });

    // Feed prompt via stdin for large prompts
    if (useTmpFile) {
      const content = fs.readFileSync(tmpFile, 'utf8');
      child.stdin.on('error', () => {}); // Suppress EPIPE if Gemini closes early
      child.stdin.write(content, () => {
        try { child.stdin.end(); } catch (_) {}
      });
    }

    // PID-based timeout
    const timer = setTimeout(() => {
      killed = true;
      try { process.kill(child.pid, 'SIGTERM'); } catch (_) {}
      setTimeout(() => {
        try { process.kill(child.pid, 'SIGKILL'); } catch (_) {}
      }, 5000);
    }, timeoutMs);

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      clearTimeout(timer);
      // Cleanup temp file
      if (tmpFile) {
        try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (_) {}
      }

      if (killed) {
        resolve({ success: false, output: stdout, error: `Timeout after ${timeoutMs}ms` });
      } else if (code !== 0) {
        resolve({ success: false, output: stdout, error: `Exit code ${code}: ${stderr.slice(0, 500)}` });
      } else {
        resolve({ success: true, output: stdout });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (tmpFile) {
        try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (_) {}
      }
      resolve({ success: false, output: '', error: err.message });
    });
  });
}

// ─── Review Mode ────────────────────────────────────────────

/**
 * Review code changes using Gemini as second opinion.
 * Gets git diff, sends to Gemini with review prompt.
 *
 * @param {string[]} files - Optional list of specific files to review
 * @returns {Promise<object>} Review result
 */
async function runReview(files = []) {
  const state = loadState();

  // 4c. Clean up stale activeJobs (older than TIMEOUT_REVIEW + 30s)
  const staleThreshold = Date.now() - (TIMEOUT_REVIEW + 30_000);
  const staleCount = state.activeJobs.length;
  state.activeJobs = state.activeJobs.filter(j => {
    const startTime = new Date(j.startedAt).getTime();
    return startTime > staleThreshold;
  });
  if (state.activeJobs.length < staleCount) {
    saveState(state);
  }

  if (!canCallGemini(state)) {
    console.log('[GEMINI] Daily limit reached (' + state.callCount + '/' + state.dailyLimit + '). Skipping review.');
    return { skipped: true, reason: 'daily_limit' };
  }

  // Get diff
  let diff;
  try {
    if (files.length > 0) {
      diff = execSync(`git diff HEAD -- ${files.map(f => `"${f}"`).join(' ')}`, {
        cwd: PROJECT_ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024
      });
    } else {
      diff = execSync('git diff HEAD', {
        cwd: PROJECT_ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024
      });
    }
  } catch (e) {
    // Try staged + unstaged
    try {
      diff = execSync('git diff', {
        cwd: PROJECT_ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024
      });
    } catch (e2) {
      logError('runReview:git-diff', e2);
      return { skipped: true, reason: 'git_diff_failed' };
    }
  }

  if (!diff || diff.trim().length === 0) {
    return { skipped: true, reason: 'no_changes' };
  }

  // 4a. Diff hash deduplication — skip if same diff reviewed within 10 minutes
  const diffHash = crypto.createHash('md5').update(diff).digest('hex').slice(0, 12);
  const tenMinAgo = Date.now() - 10 * 60 * 1000;
  const recentDuplicate = (state.pendingReviews || []).find(r => {
    return r.diffHash === diffHash && new Date(r.timestamp).getTime() > tenMinAgo;
  });
  if (recentDuplicate) {
    return { skipped: true, reason: 'duplicate_diff', existingReview: recentDuplicate.id };
  }

  // Smart diff handling for large diffs (reduced from 80K to 50K to prevent OOM)
  const maxDiffLen = 50_000;
  if (diff.length > maxDiffLen) {
    // Extract only key changes: file headers + first N lines per file
    diff = truncateDiffSmart(diff, maxDiffLen);
  }

  // Get recent commit messages for intent context
  let recentCommits = '';
  try {
    recentCommits = execSync('git log --oneline -5 2>/dev/null', {
      cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 3000
    }).trim();
  } catch (_) {}

  // Load GEMINI.md context if available
  let geminiContext = '';
  try {
    if (fs.existsSync(GEMINI_MD)) {
      geminiContext = fs.readFileSync(GEMINI_MD, 'utf8');
    }
  } catch (_) {}

  const prompt = buildReviewPrompt(diff, geminiContext, recentCommits);

  // Register active job
  const jobId = `review-${Date.now()}`;
  state.activeJobs.push({ id: jobId, mode: 'review', startedAt: new Date().toISOString() });
  incrementCallCount(state);

  const result = await callGemini(prompt, { timeoutMs: TIMEOUT_REVIEW, outputFormat: 'text' });

  // Remove from active jobs
  const updatedState = loadState();
  updatedState.activeJobs = updatedState.activeJobs.filter(j => j.id !== jobId);

  // Post-validate review to filter false positives
  let validatedReview = result.success ? result.output : null;
  let validationMeta = null;
  if (result.success && validatedReview) {
    const validation = validateReviewIssues(validatedReview, diff);
    if (validation.modified) {
      validationMeta = { removedCount: validation.removedCount, filtered: true };
      validatedReview = validation.filteredText;
    }
  }

  // Save review result
  const reviewResult = {
    id: jobId,
    timestamp: new Date().toISOString(),
    status: result.success ? 'completed' : 'failed',
    filesReviewed: files.length > 0 ? files : ['(all changed files)'],
    diffLength: diff.length,
    review: validatedReview,
    rawReview: (validationMeta && result.output !== validatedReview) ? result.output : undefined,
    validation: validationMeta || undefined,
    error: result.error || null
  };

  if (result.success) {
    updatedState.pendingReviews.push({
      id: jobId,
      timestamp: reviewResult.timestamp,
      status: 'completed',
      diffHash
    });
  }

  saveState(updatedState);
  saveReview(reviewResult);
  cleanupReviews();

  return reviewResult;
}

/**
 * Smart diff truncation: preserve file headers and key hunks.
 * Instead of naive slice, keeps the beginning of each file's diff
 * to maximize context coverage across all changed files.
 *
 * @param {string} diff - Full git diff
 * @param {number} maxLen - Maximum output length
 * @returns {string} Truncated diff with all file headers preserved
 */
function truncateDiffSmart(diff, maxLen) {
  const fileSections = diff.split(/(?=^diff --git )/m);
  const maxPerFile = Math.floor(maxLen / Math.max(fileSections.length, 1));
  let result = '';
  let truncatedCount = 0;

  for (const section of fileSections) {
    if (result.length + section.length <= maxLen) {
      result += section;
    } else {
      const remaining = maxLen - result.length;
      if (remaining > 200) {
        // Keep at least the header and first hunk
        const truncated = section.slice(0, Math.min(remaining, maxPerFile));
        result += truncated + '\n... [FILE TRUNCATED]\n';
        truncatedCount++;
      } else {
        truncatedCount++;
      }
    }
  }

  if (truncatedCount > 0) {
    result += `\n... [${truncatedCount} file(s) truncated to fit ${Math.round(maxLen / 1024)}KB limit]\n`;
  }

  return result;
}

function buildReviewPrompt(diff, geminiContext, recentCommits = '') {
  const contextBlock = geminiContext
    ? `\n\nPROJECT CONTEXT:\n${geminiContext}\n`
    : '';

  // Auto-detect which skills to activate based on diff content
  const activeSkills = detectSkillsFromDiff(diff);
  const skillBlock = activeSkills.length > 0
    ? `\nACTIVATED SKILLS: ${activeSkills.join(', ')}\nApply the review criteria from these skills to the diff below.\n`
    : '';

  const commitsBlock = recentCommits
    ? `\nRECENT COMMITS (for intent context):\n${recentCommits}\n`
    : '';

  return `You are a verification partner reviewing Claude Code's changes for an AOS project
(LangGraph + FastAPI backend, React + Zustand + Tailwind frontend).
${contextBlock}${skillBlock}${commitsBlock}
CRITICAL INSTRUCTION FOR READING THE DIFF:
The content below is a UNIFIED DIFF produced by \`git diff\`.
- Lines starting with \`+\` are ADDED lines (the \`+\` is NOT part of the code)
- Lines starting with \`-\` are REMOVED lines (the \`-\` is NOT part of the code)
- Lines starting with \`@@\` are hunk headers showing line numbers
- Do NOT report diff format characters as syntax errors
- Operators like \`!==\`, \`===\`, \`!=\`, \`>=\` are valid JS/TS operators
- When evaluating syntax, mentally strip the leading \`+\` or \`-\` prefix first

Focus ONLY on issues that local static analysis would miss:
1. Cross-file consistency (interface changes propagated?)
2. Security boundaries (auth, validation, secrets)
3. Performance at scale (N+1, re-render storms, missing memo)
4. Error propagation gaps (async errors surfaced to user?)
5. Type safety across frontend-backend boundary

Skip: formatting, naming conventions, simple type issues (already caught by linters).

Respond in this EXACT format (no preamble, no tool-use reasoning, ONLY the structured output):
ISSUES:
- [severity:critical|warning|info] file:line - description

VERDICT: approve | needs-attention
SUMMARY: (1 sentence)

If no issues:
ISSUES: none
VERDICT: approve
SUMMARY: Changes look good.

DIFF:
${diff}`;
}

// ─── Skill Detection ────────────────────────────────────────

/**
 * Detect which Gemini skills to activate based on diff content.
 * Maps file patterns to skill names for automatic skill activation.
 *
 * @param {string} diff - Git diff content
 * @returns {string[]} List of skill names to activate
 */
function detectSkillsFromDiff(diff) {
  const skills = new Set();

  // Always activate code-review for any diff
  skills.add('code-review');

  // Security-related changes (tightened patterns to reduce false positives)
  const securityFilePatterns = [
    /auth[._/]/i, /\.env/i, /secret/i, /credential/i, /oauth/i
  ];
  const securityContentPatterns = [
    /auth[._/](?!or)/i, /password/i, /secret/i,
    /cors/i, /oauth/i, /credential/i,
    /sanitize/i, /validate.*input/i
  ];
  // Activate if security-related file path OR 2+ content pattern matches
  const hasSecurityFile = securityFilePatterns.some(p => {
    // Check only diff file headers (lines starting with "diff --git" or "---" or "+++")
    return diff.split('\n').some(line =>
      (/^diff --git|^---|^\+\+\+/.test(line)) && p.test(line)
    );
  });
  const securityContentMatches = securityContentPatterns.filter(p => p.test(diff)).length;
  if (hasSecurityFile || securityContentMatches >= 2) {
    skills.add('security-audit');
  }

  // Type boundary changes (both frontend and backend files changed)
  const hasFrontend = /src\/dashboard\/src\/(types|stores|components)/.test(diff);
  const hasBackend = /src\/backend\/(models|api|services)/.test(diff);
  if (hasFrontend && hasBackend) {
    skills.add('type-safety');
  }

  // Type definition changes
  if (/\.(types|models)\.(ts|py)/.test(diff) || /interface\s+\w+|class\s+\w+.*BaseModel/.test(diff)) {
    skills.add('type-safety');
  }

  // Architecture-level changes (new files, imports, config)
  const archPatterns = [
    /^diff --git.*new file/m,
    /from\s+\.\.|import.*from\s+['"]@\//,
    /router\.(get|post|put|delete|patch)/i,
    /create<.*State>/,
  ];
  if (archPatterns.some(p => p.test(diff))) {
    skills.add('architecture-check');
  }

  return [...skills];
}

// ─── Post-Validation Filter ─────────────────────────────────

/**
 * Validate and filter Gemini review issues to remove false positives.
 * Runs locally after Gemini returns, before saving the result.
 *
 * @param {string} reviewText - Raw review text from Gemini
 * @param {string} diff - The original git diff that was reviewed
 * @returns {{ filteredText: string, removedCount: number, modified: boolean }}
 */
function validateReviewIssues(reviewText, diff) {
  const lines = reviewText.split('\n');
  let removedCount = 0;
  let modified = false;
  const filteredLines = [];

  // Parse diff to know which files and line ranges are present
  const diffFiles = new Set();
  const diffSections = {};
  const fileHeaderRegex = /^diff --git a\/(.+?) b\/(.+)$/;
  let currentFile = null;

  for (const line of diff.split('\n')) {
    const fileMatch = line.match(fileHeaderRegex);
    if (fileMatch) {
      currentFile = fileMatch[2];
      diffFiles.add(currentFile);
      diffSections[currentFile] = [];
    }
    if (currentFile && /^@@/.test(line)) {
      const hunkMatch = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (hunkMatch) {
        const start = parseInt(hunkMatch[1], 10);
        const count = parseInt(hunkMatch[2] || '1', 10);
        diffSections[currentFile].push({ start, end: start + count - 1 });
      }
    }
  }

  // Escaped operator pattern: detects hallucinated backslash-escaped operators
  const escapedOperatorPattern = /\\!==|\\===|\\!=|\\>=|\\<=|\\&&|\\\|\|/;

  let inIssuesBlock = false;
  let currentIssueLines = [];
  let issueRemoved = false;
  let criticalOrWarningCount = 0;

  function flushIssue() {
    if (currentIssueLines.length === 0) return;
    if (issueRemoved) {
      removedCount++;
      modified = true;
    } else {
      for (const il of currentIssueLines) {
        filteredLines.push(il);
        if (/\[severity:(critical|warning)\]/.test(il)) {
          criticalOrWarningCount++;
        }
      }
    }
    currentIssueLines = [];
    issueRemoved = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect start of ISSUES block
    if (/^ISSUES:/i.test(trimmed)) {
      inIssuesBlock = true;
      filteredLines.push(line);
      continue;
    }

    // Detect end of ISSUES block
    if (inIssuesBlock && /^(VERDICT|SUMMARY):/i.test(trimmed)) {
      flushIssue();
      inIssuesBlock = false;

      // If all critical/warning issues were removed, override VERDICT
      if (/^VERDICT:/i.test(trimmed) && criticalOrWarningCount === 0 && removedCount > 0) {
        filteredLines.push('VERDICT: approve');
        modified = true;
        continue;
      }

      filteredLines.push(line);
      continue;
    }

    if (!inIssuesBlock) {
      filteredLines.push(line);
      continue;
    }

    // Inside ISSUES block — parse issue lines
    if (/^\s*-\s*\[severity:/.test(line)) {
      // New issue starts — flush previous
      flushIssue();
      currentIssueLines = [line];

      // Check 1: Escaped operator hallucination
      if (escapedOperatorPattern.test(line)) {
        issueRemoved = true;
        continue;
      }

      // Check 2: Referenced file not in diff
      const fileRef = line.match(/\]\s+([^\s:]+):(\d+)/);
      if (fileRef) {
        const refFile = fileRef[1];
        const refLine = parseInt(fileRef[2], 10);

        // Normalize: try both with and without leading paths
        const fileInDiff = diffFiles.has(refFile) ||
          [...diffFiles].some(f => f.endsWith('/' + refFile) || f === refFile);

        if (!fileInDiff) {
          // File not in diff: downgrade to info
          currentIssueLines = [line.replace(/\[severity:(critical|warning)\]/, '[severity:info][phantom-file]')];
          if (/\[severity:(critical|warning)\]/.test(line)) modified = true;
          continue;
        }

        // Check 3: Referenced line outside diff hunk ranges
        const matchingDiffFile = [...diffFiles].find(f => f.endsWith('/' + refFile) || f === refFile);
        if (matchingDiffFile && diffSections[matchingDiffFile]) {
          const ranges = diffSections[matchingDiffFile];
          const inRange = ranges.some(r => refLine >= r.start && refLine <= r.end);
          if (!inRange && ranges.length > 0) {
            currentIssueLines = [line.replace(/\[severity:(critical|warning)\]/, '[severity:info][out-of-hunk]')];
            if (/\[severity:(critical|warning)\]/.test(line)) modified = true;
          }
        }
      }
    } else {
      // Continuation line of current issue
      currentIssueLines.push(line);
    }
  }

  // Flush last issue
  flushIssue();

  // If no issues remain, ensure "ISSUES: none" if all were removed
  const result = filteredLines.join('\n');
  if (removedCount > 0 && !/\[severity:/.test(result) && /^ISSUES:\s*$/m.test(result)) {
    return {
      filteredText: result.replace(/^ISSUES:\s*$/m, 'ISSUES: none'),
      removedCount,
      modified: true
    };
  }

  return { filteredText: result, removedCount, modified };
}

// ─── Scan Mode ──────────────────────────────────────────────

/**
 * Scan entire codebase or subsection using Gemini's large context.
 *
 * @param {object} options - { scope, analysisType }
 * @returns {Promise<object>} Scan result
 */
async function runScan(options = {}) {
  const { scope = 'full', analysisType = 'architecture' } = options;

  const state = loadState();
  if (!canCallGemini(state)) {
    console.log('[GEMINI] Daily limit reached. Skipping scan.');
    return { skipped: true, reason: 'daily_limit' };
  }

  // Collect source files based on scope
  let sourceContent = '';
  try {
    sourceContent = collectSource(scope);
  } catch (e) {
    logError('runScan:collectSource', e);
    return { skipped: true, reason: 'source_collection_failed', error: e.message };
  }

  if (!sourceContent || sourceContent.length === 0) {
    return { skipped: true, reason: 'no_source_files' };
  }

  // Truncate to ~120K chars to stay within Gemini CLI memory limits
  // (Reduced from 200K to prevent OOM - Gemini CLI V8 heap exhaustion at ~4GB)
  const maxLen = 120_000;
  if (sourceContent.length > maxLen) {
    sourceContent = sourceContent.slice(0, maxLen) + '\n\n... [TRUNCATED - ' +
      Math.round(sourceContent.length / 1024) + 'KB total, showing first ' +
      Math.round(maxLen / 1024) + 'KB] ...';
  }

  // Load GEMINI.md context
  let geminiContext = '';
  try {
    if (fs.existsSync(GEMINI_MD)) {
      geminiContext = fs.readFileSync(GEMINI_MD, 'utf8');
    }
  } catch (_) {}

  const prompt = buildScanPrompt(sourceContent, analysisType, scope, geminiContext);

  const jobId = `scan-${Date.now()}`;
  state.activeJobs.push({ id: jobId, mode: 'scan', startedAt: new Date().toISOString() });
  incrementCallCount(state);

  const result = await callGemini(prompt, { timeoutMs: TIMEOUT_SCAN, outputFormat: 'text' });

  const updatedState = loadState();
  updatedState.activeJobs = updatedState.activeJobs.filter(j => j.id !== jobId);

  const scanResult = {
    id: jobId,
    timestamp: new Date().toISOString(),
    status: result.success ? 'completed' : 'failed',
    scope,
    analysisType,
    sourceLength: sourceContent.length,
    analysis: result.success ? result.output : null,
    error: result.error || null
  };

  saveState(updatedState);
  saveReview(scanResult);
  cleanupReviews();

  return scanResult;
}

function collectSource(scope) {
  const files = [];
  const extensions = {
    backend: ['.py'],
    frontend: ['.ts', '.tsx'],
    full: ['.py', '.ts', '.tsx']
  };

  const dirs = {
    backend: [path.join(PROJECT_ROOT, 'src', 'backend')],
    frontend: [path.join(PROJECT_ROOT, 'src', 'dashboard', 'src')],
    full: [
      path.join(PROJECT_ROOT, 'src', 'backend'),
      path.join(PROJECT_ROOT, 'src', 'dashboard', 'src')
    ]
  };

  const targetDirs = dirs[scope] || dirs.full;
  const targetExts = extensions[scope] || extensions.full;

  for (const dir of targetDirs) {
    collectFilesRecursive(dir, targetExts, files);
  }

  // Build concatenated source
  let result = '';
  for (const filePath of files) {
    try {
      const relativePath = path.relative(PROJECT_ROOT, filePath);
      const content = fs.readFileSync(filePath, 'utf8');
      result += `\n${'='.repeat(60)}\n`;
      result += `FILE: ${relativePath}\n`;
      result += `${'='.repeat(60)}\n`;
      result += content + '\n';
    } catch (_) {}
  }

  return result;
}

function collectFilesRecursive(dir, extensions, result) {
  if (!fs.existsSync(dir)) return;

  const skipDirs = ['node_modules', '__pycache__', '.git', 'dist', 'build', '.venv', 'venv'];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.includes(entry.name)) {
          collectFilesRecursive(fullPath, extensions, result);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          result.push(fullPath);
        }
      }
    }
  } catch (_) {}
}

function buildScanPrompt(source, analysisType, scope, geminiContext) {
  const analysisInstructions = {
    architecture: `Analyze the overall architecture:
1. Component dependency graph - are there circular dependencies?
2. Layer separation - does the code respect backend/frontend boundaries?
3. API contract consistency - do frontend types match backend schemas?
4. Missing abstractions or over-engineering?`,

    deps: `Analyze the import/dependency graph:
1. Circular import chains
2. Unused imports
3. Heavy transitive dependencies
4. Opportunities for lazy loading`,

    'dead-code': `Identify dead code:
1. Exported functions/components never imported elsewhere
2. Unreachable code paths
3. Unused variables, types, or interfaces
4. Deprecated patterns still present`,

    security: `Security audit:
1. Authentication/authorization gaps
2. Input validation missing
3. Secrets or credentials in code
4. SQL injection, XSS, or CSRF vulnerabilities
5. Insecure defaults`
  };

  const instructions = analysisInstructions[analysisType] || analysisInstructions.architecture;
  const contextBlock = geminiContext ? `\nPROJECT CONTEXT:\n${geminiContext}\n` : '';

  // Map analysis types to skills
  const skillMap = {
    architecture: 'architecture-check',
    security: 'security-audit',
    deps: 'architecture-check',
    'dead-code': 'architecture-check'
  };
  const skill = skillMap[analysisType] || 'architecture-check';

  return `You are analyzing the ${scope} scope of an AOS project.
${contextBlock}
ACTIVATED SKILL: ${skill}
ANALYSIS TYPE: ${analysisType}

${instructions}

Respond in this format:
FINDINGS:
- [severity:critical|warning|info] file:line - description

RECOMMENDATIONS:
- [priority:high|medium|low] description

SUMMARY: (2-3 sentences)

SOURCE CODE:
${source}`;
}

// ─── Parallel Mode ──────────────────────────────────────────

/**
 * Run a custom prompt on Gemini in parallel with Claude's work.
 *
 * @param {string} task - Description of the task
 * @param {string} prompt - Full prompt to send
 * @returns {Promise<object>}
 */
async function runParallel(task, prompt) {
  const state = loadState();
  if (!canCallGemini(state)) {
    return { skipped: true, reason: 'daily_limit' };
  }

  const jobId = `parallel-${Date.now()}`;
  state.activeJobs.push({ id: jobId, mode: 'parallel', task, startedAt: new Date().toISOString() });
  incrementCallCount(state);

  const result = await callGemini(prompt, { timeoutMs: TIMEOUT_SCAN, outputFormat: 'text' });

  const updatedState = loadState();
  updatedState.activeJobs = updatedState.activeJobs.filter(j => j.id !== jobId);

  const parallelResult = {
    id: jobId,
    timestamp: new Date().toISOString(),
    mode: 'parallel',
    task,
    status: result.success ? 'completed' : 'failed',
    output: result.success ? result.output : null,
    error: result.error || null
  };

  if (result.success) {
    updatedState.pendingReviews.push({
      id: jobId,
      timestamp: parallelResult.timestamp,
      status: 'completed'
    });
  }

  saveState(updatedState);
  saveReview(parallelResult);
  cleanupReviews();

  return parallelResult;
}

// ─── Status Mode ────────────────────────────────────────────

function showStatus() {
  const state = loadState();

  console.log('\n' + '='.repeat(50));
  console.log('GEMINI BRIDGE STATUS');
  console.log('='.repeat(50));
  console.log(`Date: ${state.date}`);
  console.log(`API Calls: ${state.callCount} / ${state.dailyLimit}`);
  console.log(`Active Jobs: ${state.activeJobs.length}`);
  console.log(`Pending Reviews: ${state.pendingReviews.filter(r => r.status === 'completed').length}`);

  if (state.activeJobs.length > 0) {
    console.log('\nActive:');
    for (const job of state.activeJobs) {
      console.log(`  - [${job.mode}] ${job.id} (started: ${job.startedAt})`);
    }
  }

  if (state.pendingReviews.length > 0) {
    const pending = state.pendingReviews.filter(r => r.status === 'completed');
    if (pending.length > 0) {
      console.log('\nPending Reviews:');
      for (const review of pending) {
        console.log(`  - ${review.id} (${review.timestamp})`);
      }
    }
  }

  console.log('='.repeat(50) + '\n');

  return state;
}

// ─── Review Storage ─────────────────────────────────────────

function saveReview(result) {
  try {
    if (!fs.existsSync(REVIEWS_DIR)) fs.mkdirSync(REVIEWS_DIR, { recursive: true });
    const filePath = path.join(REVIEWS_DIR, `${result.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2) + '\n');
  } catch (e) {
    logError('saveReview', e);
  }
}

function loadReview(reviewId) {
  try {
    const filePath = path.join(REVIEWS_DIR, `${reviewId}.json`);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    logError('loadReview', e);
  }
  return null;
}

/**
 * Cleanup old review files and stale pendingReviews entries.
 * Keeps only the last `maxReviews` files (default: 50).
 * Also prunes pendingReviews in state to match existing files.
 *
 * @param {number} maxReviews - Maximum number of review files to keep
 */
function cleanupReviews(maxReviews = 50) {
  try {
    if (!fs.existsSync(REVIEWS_DIR)) return { removed: 0 };

    const files = fs.readdirSync(REVIEWS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(REVIEWS_DIR, f),
        mtime: fs.statSync(path.join(REVIEWS_DIR, f)).mtimeMs
      }))
      .sort((a, b) => b.mtime - a.mtime); // newest first

    let removed = 0;
    if (files.length > maxReviews) {
      const toRemove = files.slice(maxReviews);
      for (const file of toRemove) {
        try { fs.unlinkSync(file.path); removed++; } catch (_) {}
      }
    }

    // Prune pendingReviews in state to only keep existing review IDs
    const state = loadState();
    const existingIds = new Set(
      fs.readdirSync(REVIEWS_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''))
    );
    state.pendingReviews = state.pendingReviews.filter(r => existingIds.has(r.id));
    saveState(state);

    return { removed, remaining: files.length - removed };
  } catch (e) {
    logError('cleanupReviews', e);
    return { removed: 0, error: e.message };
  }
}

// ─── Exports ────────────────────────────────────────────────

module.exports = {
  runReview,
  runScan,
  runParallel,
  showStatus,
  loadState,
  saveState,
  canCallGemini,
  loadReview,
  cleanupReviews,
  callGemini,
  validateReviewIssues,
  detectSkillsFromDiff,
  BRIDGE_DIR,
  REVIEWS_DIR,
  STATE_FILE
};

// ─── CLI Entry Point ────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const mode = args[0] || 'status';

  (async () => {
    try {
      switch (mode) {
        case 'review': {
          const files = args.slice(1);
          console.log('[GEMINI] Starting review...');
          const result = await runReview(files);
          if (result.skipped) {
            console.log('[GEMINI] Review skipped:', result.reason);
          } else if (result.status === 'completed') {
            console.log('[GEMINI] Review completed:', result.id);
            console.log('\n' + result.review);
          } else {
            console.log('[GEMINI] Review failed:', result.error);
          }
          break;
        }

        case 'scan': {
          const scope = args[1] || 'full';
          const analysisType = args[2] || 'architecture';
          console.log(`[GEMINI] Starting ${analysisType} scan (${scope})...`);
          const result = await runScan({ scope, analysisType });
          if (result.skipped) {
            console.log('[GEMINI] Scan skipped:', result.reason);
          } else if (result.status === 'completed') {
            console.log('[GEMINI] Scan completed:', result.id);
            console.log('\n' + result.analysis);
          } else {
            console.log('[GEMINI] Scan failed:', result.error);
          }
          break;
        }

        case 'parallel': {
          const task = args[1] || 'custom-task';
          // Read prompt from stdin
          let prompt = '';
          process.stdin.setEncoding('utf8');
          process.stdin.on('data', (chunk) => { prompt += chunk; });
          process.stdin.on('end', async () => {
            if (!prompt.trim()) {
              console.log('[GEMINI] No prompt provided on stdin for parallel mode.');
              process.exit(0);
            }
            const result = await runParallel(task, prompt);
            if (result.status === 'completed') {
              console.log('[GEMINI] Parallel task completed:', result.id);
              console.log('\n' + result.output);
            } else {
              console.log('[GEMINI] Parallel task failed:', result.error);
            }
            process.exit(0);
          });
          return; // Don't exit yet - waiting for stdin
        }

        case 'status':
          showStatus();
          break;

        case 'cleanup': {
          const maxReviews = parseInt(args[1], 10) || 50;
          console.log(`[GEMINI] Cleaning up reviews (keeping last ${maxReviews})...`);
          const result = cleanupReviews(maxReviews);
          console.log(`[GEMINI] Removed ${result.removed} old reviews, ${result.remaining} remaining.`);
          break;
        }

        default:
          console.log('Usage: gemini-bridge.js <review|scan|parallel|status|cleanup> [args...]');
          console.log('  review [file1 file2 ...]  - Review git diff');
          console.log('  scan [scope] [type]       - Scan codebase (scope: backend|frontend|full, type: architecture|deps|dead-code|security)');
          console.log('  parallel <task>            - Run custom prompt (stdin)');
          console.log('  status                     - Show bridge status');
          console.log('  cleanup [max]              - Remove old reviews (default: keep last 50)');
      }
    } catch (e) {
      logError('cli', e);
      console.error('[GEMINI] Error:', e.message);
    }

    process.exit(0);
  })();
}
