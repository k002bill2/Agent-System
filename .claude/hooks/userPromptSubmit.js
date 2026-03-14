/**
 * UserPromptSubmit Hook for AOS Website
 * React Web + Python Backend 개발 환경에 맞춤화된 스킬/에이전트 자동 활성화
 *
 * 사용자 프롬프트를 분석하여:
 * 1. React Web 패턴 감지 및 가이드 활성화
 * 2. Python/FastAPI/LangGraph 패턴 감지
 * 3. skill-rules.json 기반 스킬 활성화
 * 4. 에이전트 자동 추천 (agent-skill 연계)
 * 5. 중요 파일 감지
 *
 * @version 3.0.0-AOS Website
 *
 * @hook-config
 * {"event": "UserPromptSubmit", "matcher": "", "command": "node .claude/hooks/userPromptSubmit.js 2>/dev/null || true"}
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const RULES_PATH = path.join(PROJECT_ROOT, '.claude', 'skill-rules.json');
const AGENTS_REGISTRY_PATH = path.join(PROJECT_ROOT, '.claude', 'agents-registry.json');

// ─── stdin에서 이벤트 데이터 읽기 ───────────────────────────
let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(input);
    const prompt = event?.prompt || event?.content || '';

    if (!prompt || prompt.trim().length === 0) {
      process.exit(0);
      return;
    }

    const messages = [];

    // 0. Gemini 크로스 리뷰 결과 확인 (가장 먼저 실행)
    const geminiMsg = checkPendingGeminiReviews();
    if (geminiMsg) messages.push(geminiMsg);

    // 1-2. 패턴 감지는 skill-rules.json으로 통합 (하드코딩 제거)
    //       skill-rules.json의 reminder 필드가 React/Backend 리마인더를 대체

    // 3. skill-rules.json 기반 스킬 활성화
    const skillMsg = activateSkills(prompt);
    if (skillMsg) messages.push(skillMsg);

    // 4. 에이전트 자동 추천
    const agentMsg = recommendAgents(prompt);
    if (agentMsg) messages.push(agentMsg);

    // 5. 중요 파일 감지
    const criticalMsg = detectCriticalFiles(prompt);
    if (criticalMsg) messages.push(criticalMsg);

    // 결과 출력 (stdout → Claude Code가 context에 추가)
    if (messages.length > 0) {
      console.log(messages.join('\n\n'));
    }

  } catch (error) {
    // 파싱 실패 시 조용히 종료
    process.exit(0);
  }
});

// ─── 중요 파일 감지 ─────────────────────────────────────────
function detectCriticalFiles(prompt) {
  const criticalPatterns = [
    { pattern: /app\.tsx|main\.tsx/i, file: 'App Entry Point' },
    { pattern: /authstore|auth\.ts/i, file: 'Auth Store' },
    { pattern: /package\.json/i, file: 'Dependencies' },
    { pattern: /vite\.config/i, file: 'Vite Config' },
    { pattern: /\.env|config\.py/i, file: 'Configuration' }
  ];

  const detected = [];
  for (const { pattern, file } of criticalPatterns) {
    if (pattern.test(prompt)) detected.push(file);
  }

  if (detected.length === 0) return null;
  return '[CRITICAL FILE] ' + detected.join(', ') + ' - 변경 전 테스트/백업 권장';
}

// ─── skill-rules.json 기반 스킬 활성화 ─────────────────────
function activateSkills(prompt) {
  if (!fs.existsSync(RULES_PATH)) return null;

  try {
    const rules = JSON.parse(fs.readFileSync(RULES_PATH, 'utf-8'));
    const activated = [];

    for (const [skillName, rule] of Object.entries(rules)) {
      if (shouldActivateSkill(prompt, rule)) {
        activated.push({
          name: skillName,
          priority: rule.priority || 'normal',
          enforcement: rule.enforcement || 'suggest',
          type: rule.type || 'skill'
        });
      }
    }

    // 우선순위별 정렬
    const priorityOrder = { 'critical': 0, 'high': 1, 'normal': 2, 'low': 3 };
    activated.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    if (activated.length === 0) return null;

    const critical = activated.filter(s => s.priority === 'critical');
    const high = activated.filter(s => s.priority === 'high');
    const other = activated.filter(s => !['critical', 'high'].includes(s.priority));

    let msg = '[SKILLS ACTIVATED]';
    if (critical.length > 0) {
      msg += '\n  CRITICAL: ' + critical.map(s => s.name).join(', ');
      for (const s of critical) {
        const sf = getSkillFile(rules, s.name);
        if (sf) msg += `\n  → Invoke: Skill tool "${s.name}" before implementing`;
      }
    }
    if (high.length > 0) {
      msg += '\n  HIGH: ' + high.map(s => s.name).join(', ');
      for (const s of high) {
        const sf = getSkillFile(rules, s.name);
        if (sf) msg += `\n  → Invoke: Skill tool "${s.name}" before implementing`;
      }
    }
    if (other.length > 0) {
      msg += '\n  SUGGESTED: ' + other.map(s => s.name).join(', ');
    }

    // reminder 필드 출력 (React/Backend 등 도메인별 가이드)
    for (const s of activated) {
      const rule = rules[s.name];
      if (rule && rule.reminder) {
        msg += `\n  [${s.name}] ${rule.reminder}`;
      }
    }

    return msg;
  } catch {
    return null;
  }
}

function getSkillFile(rules, skillName) {
  return rules[skillName]?.skillFile || null;
}

function shouldActivateSkill(prompt, rule) {
  const lowerPrompt = prompt.toLowerCase();

  // 키워드 체크
  if (rule.promptTriggers?.keywords) {
    if (rule.promptTriggers.keywords.some(kw => lowerPrompt.includes(kw.toLowerCase()))) {
      return true;
    }
  }

  // 패턴 체크
  if (rule.promptTriggers?.intentPatterns) {
    if (rule.promptTriggers.intentPatterns.some(pattern => {
      try { return new RegExp(pattern, 'i').test(prompt); }
      catch { return false; }
    })) {
      return true;
    }
  }

  return false;
}

// ─── Gemini 크로스 리뷰 결과 확인 ─────────────────────────────
function checkPendingGeminiReviews() {
  try {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'coordination', 'gemini-state.json');
    if (!fs.existsSync(stateFile)) return null;

    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const pending = (state.pendingReviews || []).filter(r => r.status === 'completed');

    if (pending.length === 0) return null;

    const reviewsDir = path.join(PROJECT_ROOT, '.claude', 'gemini-bridge', 'reviews');
    const reviewBlocks = [];
    const thirtyMinAgo = Date.now() - 30 * 60 * 1000;

    for (const review of pending) {
      // 30분 이상 된 리뷰는 stale로 폐기
      const reviewTime = new Date(review.timestamp).getTime();
      if (reviewTime < thirtyMinAgo) {
        review.status = 'stale';
        continue;
      }

      // 리뷰 파일 읽기
      const reviewFile = path.join(reviewsDir, `${review.id}.json`);
      if (!fs.existsSync(reviewFile)) {
        review.status = 'missing';
        continue;
      }

      try {
        const reviewData = JSON.parse(fs.readFileSync(reviewFile, 'utf8'));
        if (reviewData.review) {
          // 리뷰 내용에서 핵심 부분 추출 (ISSUES/VERDICT/SUMMARY)
          const extracted = extractReviewSummary(reviewData.review);
          reviewBlocks.push(extracted);
        }
        review.status = 'shown';
      } catch (_) {
        review.status = 'read_error';
      }
    }

    // 4b. Cleanup: remove shown/stale/missing reviews older than 30 minutes
    state.pendingReviews = state.pendingReviews.filter(r => {
      if (['shown', 'stale', 'missing', 'read_error'].includes(r.status)) {
        const age = Date.now() - new Date(r.timestamp).getTime();
        return age < 30 * 60 * 1000; // keep if less than 30 min old
      }
      return true;
    });

    // 상태 업데이트 (shown/stale/missing 마킹 + cleanup)
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');

    if (reviewBlocks.length === 0) return null;

    // severity 분석하여 대응 지시 추가
    const allText = reviewBlocks.join('\n');
    const hasCritical = /severity:critical/i.test(allText);
    const hasWarning = /severity:warning/i.test(allText);
    const needsAttention = /needs-attention/i.test(allText);

    let msg = '[GEMINI REVIEW - Cross-verification by Gemini CLI]';
    for (const block of reviewBlocks) {
      msg += '\n' + block;
    }
    msg += '\n[/GEMINI REVIEW]';

    // critical/warning 이슈가 있으면 Claude에게 대응 안내
    if (hasCritical) {
      msg += '\n⚠️ Gemini가 critical 이슈를 발견했습니다. 커밋 전에 반드시 확인하세요.';
    } else if (hasWarning || needsAttention) {
      msg += '\n💡 Gemini가 warning 이슈를 제기했습니다. 관련 작업 시 참고하세요.';
    }

    return msg;
  } catch (_) {
    return null;
  }
}

/**
 * Gemini 리뷰에서 핵심 ISSUES/VERDICT/SUMMARY 부분을 추출.
 * 마지막 ISSUES: 블록을 사용 (Gemini의 tool-thinking preamble이
 * 첫번째 ISSUES: 를 포함할 수 있으므로).
 */
function extractReviewSummary(reviewText) {
  const lines = reviewText.split('\n');

  // 마지막 ISSUES: 라인 인덱스 찾기
  let lastIssuesIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^ISSUES:/i.test(lines[i].trim())) {
      lastIssuesIdx = i;
      break;
    }
  }

  if (lastIssuesIdx >= 0) {
    // ISSUES: 부터 끝까지 추출
    const block = lines.slice(lastIssuesIdx);

    // VERDICT 존재 확인
    const hasVerdict = block.some(l => /^VERDICT:/i.test(l.trim()));
    const hasSummary = block.some(l => /^SUMMARY:/i.test(l.trim()));

    if (hasVerdict) {
      // SUMMARY까지 포함된 완전한 블록
      if (hasSummary) {
        const summaryIdx = block.findIndex(l => /^SUMMARY:/i.test(l.trim()));
        return block.slice(0, summaryIdx + 1).join('\n').trim();
      }
      // VERDICT까지만
      const verdictIdx = block.findIndex(l => /^VERDICT:/i.test(l.trim()));
      return block.slice(0, verdictIdx + 1).join('\n').trim();
    }

    // VERDICT 없으면 incomplete block — 폴백
  }

  // 폴백: VERDICT 라인 주변 추출
  const verdictIdx = lines.findIndex(l => /^VERDICT:/i.test(l.trim()));
  if (verdictIdx >= 0) {
    const start = Math.max(0, verdictIdx - 5);
    const end = Math.min(lines.length, verdictIdx + 3);
    return lines.slice(start, end).join('\n').trim();
  }

  // 최종 폴백: 마지막 500자
  if (reviewText.length > 500) {
    return '...' + reviewText.slice(-500).trim();
  }
  return reviewText.trim();
}

// ─── 에이전트 자동 추천 (skill→agent 연계) ──
function recommendAgents(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  const recommended = [];

  // 0. /resume 감지 시 체크포인트 컨텍스트 주입
  if (/^\/resume\b/i.test(prompt.trim())) {
    try {
      const cpMgr = require('../coordination/checkpoint-manager');
      const checkpoints = cpMgr.listCheckpoints(3);
      if (checkpoints.length > 0) {
        let cpMsg = '[CHECKPOINT CONTEXT]';
        for (const cp of checkpoints) {
          cpMsg += `\n  ${cp.timestamp} | ${cp.trigger} | ${cp.description}`;
        }
        console.log(cpMsg);
      }
    } catch {}
  }

  // 1. skill-rules.json에서 agentFile이 있는 항목 매칭
  if (fs.existsSync(RULES_PATH)) {
    try {
      const rules = JSON.parse(fs.readFileSync(RULES_PATH, 'utf-8'));
      for (const [name, rule] of Object.entries(rules)) {
        if (rule.agentFile && shouldActivateSkill(prompt, rule)) {
          recommended.push({
            agent: path.basename(rule.agentFile, '.md'),
            reason: `skill:${name}`,
            model: rule.model || 'haiku'
          });
        }
      }
    } catch {}
  }

  if (recommended.length === 0) return null;

  // 중복 제거
  const unique = [...new Map(recommended.map(r => [r.agent, r])).values()];

  let msg = '[AGENT RECOMMENDATION]';
  for (const r of unique) {
    msg += `\n  -> ${r.agent} (${r.model}) [${r.reason}]`;
  }
  return msg;
}
