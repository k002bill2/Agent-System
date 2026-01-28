/**
 * UserPromptSubmit Hook for AOS Dashboard
 * React Web + Python Backend 개발 환경에 맞춤화된 스킬 자동 활성화
 *
 * 사용자 프롬프트를 분석하여:
 * 1. React Web 패턴 감지 및 가이드 활성화
 * 2. Python/FastAPI/LangGraph 패턴 감지
 * 3. skill-rules.json 기반 스킬 활성화
 *
 * @version 2.0.0-AOS Dashboard
 */

const fs = require('fs');
const path = require('path');

/**
 * Hook entry point
 * @param {string} prompt - 사용자의 원본 프롬프트
 * @param {object} context - Hook 실행 컨텍스트
 * @returns {string} - 수정된 프롬프트 (Skills 활성화 메시지 포함)
 */
async function onUserPromptSubmit(prompt, context) {
  try {
    const projectRoot = context.workspaceRoot || process.cwd();
    const messages = [];

    // 1. React Web 패턴 감지
    const reactWebPatterns = detectReactWebPatterns(prompt);
    if (reactWebPatterns) {
      messages.push(reactWebPatterns);
    }

    // 2. Python/Backend 패턴 감지
    const backendPatterns = detectBackendPatterns(prompt);
    if (backendPatterns) {
      messages.push(backendPatterns);
    }

    // 3. skill-rules.json 기반 스킬 활성화
    const skillActivation = await activateSkills(prompt, projectRoot);
    if (skillActivation) {
      messages.push(skillActivation);
    }

    // 4. 중요 파일 감지
    const criticalFiles = detectCriticalFiles(prompt);
    if (criticalFiles) {
      messages.push(criticalFiles);
    }

    // 메시지가 있으면 프롬프트 앞에 추가
    if (messages.length > 0) {
      return messages.join('\n\n') + '\n\n' + prompt;
    }

    return prompt;

  } catch (error) {
    console.error('[UserPromptSubmit] Error:', error.message);
    return prompt;
  }
}

/**
 * React Web 패턴 감지 (Vite + Tailwind + Zustand)
 */
function detectReactWebPatterns(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  const detectedPatterns = [];

  // React Web 패턴
  const patterns = [
    { keywords: ['useeffect', 'cleanup', '구독', 'subscription'], pattern: 'useEffect Cleanup' },
    { keywords: ['zustand', 'store', '상태 관리', 'state management'], pattern: 'Zustand Store' },
    { keywords: ['tailwind', 'className', 'cn(', '스타일'], pattern: 'Tailwind CSS' },
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

  if (detectedPatterns.length === 0) {
    return null;
  }

  let message = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += '🔵 REACT WEB PATTERN DETECTED\n';
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  message += `**Detected Patterns**: ${detectedPatterns.join(', ')}\n\n`;
  message += '**Reminders:**\n';

  if (detectedPatterns.includes('useEffect Cleanup')) {
    message += '• useEffect에서 cleanup 함수 필수 반환\n';
    message += '• 구독/타이머는 반드시 정리하세요\n';
  }
  if (detectedPatterns.includes('Zustand Store')) {
    message += '• stores/ 디렉토리에 스토어 정의\n';
    message += '• 액션과 상태 분리, 셀렉터 사용 권장\n';
  }
  if (detectedPatterns.includes('Tailwind CSS')) {
    message += '• cn() 유틸리티로 조건부 클래스 결합\n';
    message += '• @/ 경로 별칭 사용 (import { cn } from \'@/lib/utils\')\n';
  }
  if (detectedPatterns.includes('React Router')) {
    message += '• pages/ 디렉토리에 페이지 컴포넌트\n';
    message += '• useNavigate, useParams 훅 활용\n';
  }
  if (detectedPatterns.includes('Vitest Testing')) {
    message += '• 테스트 커버리지 75% 이상 목표\n';
    message += '• __tests__/ 디렉토리에 테스트 파일\n';
  }

  message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  return message;
}

/**
 * Python/Backend 패턴 감지 (FastAPI + LangGraph)
 */
function detectBackendPatterns(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  const detectedPatterns = [];

  // Backend 패턴
  const patterns = [
    { keywords: ['fastapi', 'endpoint', 'router', 'api'], pattern: 'FastAPI Endpoint' },
    { keywords: ['langgraph', 'node', 'graph', 'orchestrat'], pattern: 'LangGraph Orchestration' },
    { keywords: ['async', 'await', 'asyncio', '비동기'], pattern: 'Async Python' },
    { keywords: ['sqlalchemy', 'database', 'db', 'repository'], pattern: 'Database Layer' },
    { keywords: ['mcp', 'tool', 'model context protocol'], pattern: 'MCP Integration' },
    { keywords: ['hitl', 'approval', '승인', 'human-in-the-loop'], pattern: 'HITL Approval' },
    { keywords: ['pytest', 'test', '테스트'], pattern: 'Pytest Testing' },
    { keywords: ['pydantic', 'model', 'schema', 'validation'], pattern: 'Pydantic Models' }
  ];

  for (const { keywords, pattern } of patterns) {
    if (keywords.some(kw => lowerPrompt.includes(kw))) {
      detectedPatterns.push(pattern);
    }
  }

  if (detectedPatterns.length === 0) {
    return null;
  }

  let message = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += '🟢 BACKEND PATTERN DETECTED\n';
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  message += `**Detected Patterns**: ${detectedPatterns.join(', ')}\n\n`;
  message += '**Reminders:**\n';

  if (detectedPatterns.includes('FastAPI Endpoint')) {
    message += '• api/ 디렉토리에 라우터 정의\n';
    message += '• Pydantic 모델로 요청/응답 검증\n';
  }
  if (detectedPatterns.includes('LangGraph Orchestration')) {
    message += '• AgentState TypedDict 준수 필수\n';
    message += '• 노드 함수는 반드시 async def로 정의\n';
    message += '• orchestrator/nodes.py 참조\n';
  }
  if (detectedPatterns.includes('Async Python')) {
    message += '• async def에는 반드시 await 포함\n';
    message += '• 동기 함수와 혼용 주의\n';
    message += '• asyncio.gather()로 병렬 실행\n';
  }
  if (detectedPatterns.includes('HITL Approval')) {
    message += '• HIGH 리스크 도구는 승인 필요\n';
    message += '• models/hitl.py TOOL_RISK_CONFIG 참조\n';
  }
  if (detectedPatterns.includes('Pytest Testing')) {
    message += '• tests/backend/ 디렉토리에 테스트\n';
    message += '• pytest-asyncio로 비동기 테스트\n';
  }

  message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  return message;
}

/**
 * 중요 파일 감지 (AOS Dashboard)
 */
function detectCriticalFiles(prompt) {
  const criticalPatterns = [
    // Frontend
    { pattern: /app\.tsx|main\.tsx/i, file: 'App Entry Point' },
    { pattern: /authstore|auth\.ts/i, file: 'Authentication Store' },
    { pattern: /router|routes/i, file: 'Routing' },
    { pattern: /package\.json/i, file: 'Dependencies' },
    { pattern: /vite\.config/i, file: 'Vite Config' },
    // Backend
    { pattern: /app\.py|main\.py/i, file: 'Backend Entry Point' },
    { pattern: /database\.py|models\.py/i, file: 'Database Layer' },
    { pattern: /orchestrator.*graph|nodes\.py/i, file: 'LangGraph Orchestrator' },
    { pattern: /auth_service|oauth/i, file: 'Auth Service' },
    { pattern: /\.env|config\.py/i, file: 'Configuration' }
  ];

  const detected = [];
  for (const { pattern, file } of criticalPatterns) {
    if (pattern.test(prompt)) {
      detected.push(file);
    }
  }

  if (detected.length === 0) {
    return null;
  }

  let message = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += '⚠️  CRITICAL FILE DETECTED\n';
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  message += `**Affected Areas**: ${detected.join(', ')}\n`;
  message += '**Recommendation**: 변경 전 테스트 및 백업 권장\n';
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  return message;
}

/**
 * skill-rules.json 기반 스킬 활성화
 */
async function activateSkills(prompt, projectRoot) {
  const rulesPath = path.join(projectRoot, '.claude', 'skill-rules.json');

  if (!fs.existsSync(rulesPath)) {
    return null;
  }

  try {
    const rulesContent = fs.readFileSync(rulesPath, 'utf-8');
    const rules = JSON.parse(rulesContent);
    const activatedSkills = [];

    for (const [skillName, rule] of Object.entries(rules)) {
      if (shouldActivateSkill(prompt, rule)) {
        activatedSkills.push({
          name: skillName,
          priority: rule.priority || 'normal',
          enforcement: rule.enforcement || 'suggest'
        });
      }
    }

    // 우선순위별 정렬
    const priorityOrder = { 'critical': 0, 'high': 1, 'normal': 2, 'low': 3 };
    activatedSkills.sort((a, b) =>
      priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    if (activatedSkills.length > 0) {
      return generateActivationMessage(activatedSkills);
    }
  } catch (error) {
    console.error('[UserPromptSubmit] Skill activation error:', error.message);
  }

  return null;
}

/**
 * 스킬 활성화 여부 판단
 */
function shouldActivateSkill(prompt, rule) {
  const lowerPrompt = prompt.toLowerCase();

  // 키워드 체크
  if (rule.promptTriggers?.keywords) {
    const hasKeyword = rule.promptTriggers.keywords.some(keyword =>
      lowerPrompt.includes(keyword.toLowerCase())
    );
    if (hasKeyword) return true;
  }

  // 패턴 체크
  if (rule.promptTriggers?.intentPatterns) {
    const hasPattern = rule.promptTriggers.intentPatterns.some(pattern => {
      try {
        const regex = new RegExp(pattern, 'i');
        return regex.test(prompt);
      } catch (e) {
        return false;
      }
    });
    if (hasPattern) return true;
  }

  return false;
}

/**
 * 스킬 활성화 메시지 생성
 */
function generateActivationMessage(skills) {
  const criticalSkills = skills.filter(s => s.priority === 'critical');
  const highSkills = skills.filter(s => s.priority === 'high');
  const otherSkills = skills.filter(s => !['critical', 'high'].includes(s.priority));

  let message = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += '🎯 SKILL ACTIVATION CHECK\n';
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  if (criticalSkills.length > 0) {
    message += '🔴 **CRITICAL** - Must follow:\n';
    criticalSkills.forEach(skill => {
      message += `   • ${skill.name}\n`;
    });
    message += '\n';
  }

  if (highSkills.length > 0) {
    message += '🟡 **HIGH** - Recommended:\n';
    highSkills.forEach(skill => {
      message += `   • ${skill.name}\n`;
    });
    message += '\n';
  }

  if (otherSkills.length > 0) {
    message += '🟢 **SUGGESTED**:\n';
    otherSkills.forEach(skill => {
      message += `   • ${skill.name}\n`;
    });
    message += '\n';
  }

  message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  return message;
}

module.exports = { onUserPromptSubmit };
