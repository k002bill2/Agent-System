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

    // 1. React Web 패턴 감지
    const reactMsg = detectReactWebPatterns(prompt);
    if (reactMsg) messages.push(reactMsg);

    // 2. Python/Backend 패턴 감지
    const backendMsg = detectBackendPatterns(prompt);
    if (backendMsg) messages.push(backendMsg);

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

// ─── React Web 패턴 감지 ────────────────────────────────────
function detectReactWebPatterns(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  const detectedPatterns = [];

  const patterns = [
    { keywords: ['useeffect', 'cleanup', '구독', 'subscription'], pattern: 'useEffect Cleanup' },
    { keywords: ['zustand', 'store', '상태 관리', 'state management'], pattern: 'Zustand Store' },
    { keywords: ['tailwind', 'classname', 'cn(', '스타일'], pattern: 'Tailwind CSS' },
    { keywords: ['router', 'navigate', 'page', 'route', '라우팅'], pattern: 'React Router' },
    { keywords: ['component', 'tsx', 'jsx', '컴포넌트'], pattern: 'React Component' },
    { keywords: ['hook', 'custom hook', '커스텀 훅', 'usememo', 'usecallback'], pattern: 'Custom Hooks' },
    { keywords: ['vite', 'build', '빌드'], pattern: 'Vite Build' },
    { keywords: ['vitest', 'test', '테스트', 'coverage'], pattern: 'Vitest Testing' }
  ];

  for (const { keywords, pattern } of patterns) {
    if (keywords.some(kw => lowerPrompt.includes(kw))) {
      detectedPatterns.push(pattern);
    }
  }

  if (detectedPatterns.length === 0) return null;

  let msg = '[REACT WEB] Detected: ' + detectedPatterns.join(', ');

  const reminders = [];
  if (detectedPatterns.includes('useEffect Cleanup')) {
    reminders.push('useEffect cleanup 함수 필수');
  }
  if (detectedPatterns.includes('Zustand Store')) {
    reminders.push('stores/ 디렉토리, 셀렉터 사용');
  }
  if (detectedPatterns.includes('Tailwind CSS')) {
    reminders.push('cn() 유틸리티 사용 (@/lib/utils)');
  }
  if (detectedPatterns.includes('Vitest Testing')) {
    reminders.push('커버리지 75%+ 목표');
  }

  if (reminders.length > 0) {
    msg += ' | Reminders: ' + reminders.join('; ');
  }
  return msg;
}

// ─── Python/Backend 패턴 감지 ───────────────────────────────
function detectBackendPatterns(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  const detectedPatterns = [];

  const patterns = [
    { keywords: ['fastapi', 'endpoint', 'api'], pattern: 'FastAPI' },
    { keywords: ['langgraph', 'graph', 'orchestrat'], pattern: 'LangGraph' },
    { keywords: ['sqlalchemy', 'database', 'repository'], pattern: 'Database' },
    { keywords: ['hitl', 'approval', '승인'], pattern: 'HITL' },
    { keywords: ['pytest'], pattern: 'Pytest' }
  ];

  for (const { keywords, pattern } of patterns) {
    if (keywords.some(kw => lowerPrompt.includes(kw))) {
      detectedPatterns.push(pattern);
    }
  }

  if (detectedPatterns.length === 0) return null;
  return '[BACKEND] Detected: ' + detectedPatterns.join(', ');
}

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
    }
    if (high.length > 0) {
      msg += '\n  HIGH: ' + high.map(s => s.name).join(', ');
    }
    if (other.length > 0) {
      msg += '\n  SUGGESTED: ' + other.map(s => s.name).join(', ');
    }
    return msg;
  } catch {
    return null;
  }
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

// ─── 에이전트 자동 추천 (skill→agent 연계) ──────────────────
function recommendAgents(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  const recommended = [];

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

  // 2. agents-registry.json에서 직접 매칭
  if (fs.existsSync(AGENTS_REGISTRY_PATH)) {
    try {
      const registry = JSON.parse(fs.readFileSync(AGENTS_REGISTRY_PATH, 'utf-8'));
      const agents = registry.agents || {};

      // 에이전트별 트리거 패턴 (agents-registry.json의 triggers가 null이므로 여기서 보완)
      const agentTriggers = {
        'web-ui-specialist': {
          keywords: ['ui', 'ux', 'design', 'layout', 'responsive', '디자인', '레이아웃', 'css', 'styling'],
          patterns: ['(create|make|design).*?(ui|component|layout|page)', '(UI|UX).*?(개선|수정|디자인)']
        },
        'test-automation-specialist': {
          keywords: ['test', 'vitest', 'coverage', 'tdd', '테스트', '커버리지'],
          patterns: ['(write|add|create).*?test', '(coverage|커버리지).*?(improve|증가|올려)']
        },
        'performance-optimizer': {
          keywords: ['performance', 'optimize', 'slow', 'memory leak', 'bundle', '성능', '최적화', '느려'],
          patterns: ['(optimize|improve).*?performance', '(성능|속도).*?(개선|최적화)']
        },
        'code-simplifier': {
          keywords: ['simplify', 'refactor', 'complexity', '단순화', '리팩토링', '복잡'],
          patterns: ['(simplify|refactor).*?(code|function)', '(코드|함수).*?(단순화|리팩토링)']
        },
        'quality-validator': {
          keywords: ['validate', 'review', 'quality', '검증', '품질', '리뷰'],
          patterns: ['(validate|review|check).*?(quality|code)', '(코드|품질).*?(검증|리뷰)']
        },
        'background-verifier': {
          keywords: ['verify', 'check all', 'full check', '전체 검증', '종합 검증'],
          patterns: ['(verify|check).*?(all|everything)', '전체.*?검증']
        }
      };

      for (const [agentName, triggers] of Object.entries(agentTriggers)) {
        // 이미 skill 연계로 추천된 에이전트는 제외
        if (recommended.some(r => r.agent === agentName)) continue;
        if (!agents[agentName]) continue;

        const keywordMatch = triggers.keywords.some(kw => lowerPrompt.includes(kw));
        const patternMatch = triggers.patterns.some(p => {
          try { return new RegExp(p, 'i').test(prompt); }
          catch { return false; }
        });

        if (keywordMatch || patternMatch) {
          recommended.push({
            agent: agentName,
            reason: 'prompt-match',
            model: agents[agentName].model || 'haiku'
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
