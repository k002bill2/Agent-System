/**
 * Task Allocator for AOS Dashboard
 * 작업을 적절한 에이전트에게 분배
 *
 * @version 3.0.0-AOS
 */

const fs = require('fs');
const path = require('path');

/**
 * 에이전트 능력 정의
 */
const AGENT_CAPABILITIES = {
  'web-ui-specialist': {
    skills: ['ui', 'component', 'style', 'layout', 'responsive', 'tailwind', 'css', 'ux', 'design'],
    priority: ['components', 'pages', 'styles'],
    model: 'sonnet'
  },
  'backend-integration-specialist': {
    skills: ['firebase', 'api', 'data', 'sync', 'auth', 'backend', 'fastapi', 'langgraph', 'postgresql', 'endpoint'],
    priority: ['services', 'firebase', 'api'],
    model: 'sonnet'
  },
  'test-automation-specialist': {
    skills: ['test', 'coverage', 'vitest', 'mock', 'tdd', 'spec'],
    priority: ['__tests__', 'test', 'mock'],
    model: 'haiku'
  },
  'performance-optimizer': {
    skills: ['performance', 'optimization', 'memory', 'bundle', 'slow', 'optimize'],
    priority: ['performance', 'optimization'],
    model: 'sonnet'
  },
  'quality-validator': {
    skills: ['review', 'validate', 'check', 'quality'],
    priority: ['all'],
    model: 'haiku'
  },
  'lead-orchestrator': {
    skills: ['coordinate', 'plan', 'orchestrate', 'parallel'],
    priority: ['all'],
    model: 'opus'
  },
  'code-simplifier': {
    skills: ['simplify', 'refactor', 'complexity', 'clean', 'readable'],
    priority: ['all'],
    model: 'sonnet'
  },
  'background-verifier': {
    skills: ['verify', 'check', 'lint', 'typecheck', 'build'],
    priority: ['all'],
    model: 'haiku'
  },
  'eval-grader': {
    skills: ['eval', 'grade', 'rubric', 'score', 'assess'],
    priority: ['evals'],
    model: 'sonnet'
  },
  'eval-task-runner': {
    skills: ['eval', 'run', 'task', 'benchmark'],
    priority: ['evals'],
    model: 'sonnet'
  }
};

/**
 * 작업 분류
 */
const TASK_TYPES = {
  ui_development: {
    keywords: ['ui', 'component', 'screen', 'style', '화면', '컴포넌트', 'css', 'tailwind', 'layout', 'ux', 'design'],
    recommendedAgent: 'web-ui-specialist'
  },
  backend_integration: {
    keywords: ['firebase', 'api', 'service', 'data', '서비스', 'auth', 'backend', 'fastapi', 'langgraph', 'postgresql', 'endpoint'],
    recommendedAgent: 'backend-integration-specialist'
  },
  testing: {
    keywords: ['test', 'jest', 'coverage', '테스트', 'mock', 'vitest', 'tdd', 'spec'],
    recommendedAgent: 'test-automation-specialist'
  },
  performance: {
    keywords: ['performance', 'optimize', 'memory', '성능', '최적화', 'slow', 'bundle'],
    recommendedAgent: 'performance-optimizer'
  },
  validation: {
    keywords: ['review', 'validate', 'check', '검증', '리뷰', 'quality'],
    recommendedAgent: 'quality-validator'
  },
  coordination: {
    keywords: ['parallel', 'coordinate', 'orchestrate', '병렬', '조정'],
    recommendedAgent: 'lead-orchestrator'
  },
  refactoring: {
    keywords: ['simplify', 'refactor', 'complexity', '단순화', '리팩토링', '복잡', 'clean'],
    recommendedAgent: 'code-simplifier'
  },
  verification: {
    keywords: ['verify', 'check all', 'full check', '전체 검증', '종합 검증', 'typecheck', 'lint'],
    recommendedAgent: 'background-verifier'
  },
  evaluation: {
    keywords: ['eval', 'evaluate', 'grade', 'benchmark', '평가'],
    recommendedAgent: 'eval-task-runner'
  }
};

/**
 * 에이전트 과거 성능 조회 (feedback-loop 연동)
 */
function getAgentPerformanceData() {
  try {
    const feedbackLoop = require('./feedback-loop');
    return feedbackLoop.analyzeAgentPerformance();
  } catch {
    return {};
  }
}

/**
 * 작업에 적합한 에이전트 추천 (성능 데이터 반영)
 * @param {string} taskDescription - 작업 설명
 * @returns {object} - 추천 결과
 */
function recommendAgent(taskDescription) {
  const lowerTask = taskDescription.toLowerCase();
  const matches = [];
  const perfData = getAgentPerformanceData();

  for (const [taskType, config] of Object.entries(TASK_TYPES)) {
    const matchCount = config.keywords.filter(kw =>
      lowerTask.includes(kw)
    ).length;

    if (matchCount > 0) {
      // 과거 성능 데이터로 점수 보정
      const agentPerf = perfData[config.recommendedAgent];
      let perfBonus = 0;
      if (agentPerf && agentPerf.totalTasks >= 3) {
        const successRate = parseFloat(agentPerf.successRate);
        if (successRate >= 90) perfBonus = 2;      // 성공률 90%+ → 보너스
        else if (successRate < 50) perfBonus = -2;  // 성공률 50%- → 페널티
      }

      matches.push({
        taskType,
        agent: config.recommendedAgent,
        matchScore: matchCount + perfBonus,
        capabilities: AGENT_CAPABILITIES[config.recommendedAgent],
        performance: agentPerf || null
      });
    }
  }

  // 점수순 정렬
  matches.sort((a, b) => b.matchScore - a.matchScore);

  if (matches.length === 0) {
    return {
      recommended: 'web-ui-specialist',
      confidence: 'low',
      reason: 'Default recommendation'
    };
  }

  return {
    recommended: matches[0].agent,
    confidence: matches[0].matchScore > 2 ? 'high' : 'medium',
    taskType: matches[0].taskType,
    model: matches[0].capabilities?.model,
    performance: matches[0].performance,
    alternatives: matches.slice(1).map(m => m.agent)
  };
}

/**
 * 복합 작업 분해
 * @param {string} taskDescription - 복합 작업 설명
 * @returns {array} - 분해된 하위 작업들
 */
function decomposeTask(taskDescription) {
  const subtasks = [];
  const lowerTask = taskDescription.toLowerCase();

  // UI + API 패턴 감지
  if (lowerTask.includes('ui') && lowerTask.includes('api')) {
    subtasks.push({
      description: 'UI 컴포넌트 구현',
      agent: 'web-ui-specialist',
      parallel: true
    });
    subtasks.push({
      description: 'API 서비스 구현',
      agent: 'backend-integration-specialist',
      parallel: true
    });
  }

  // 구현 + 테스트 패턴 감지
  if (lowerTask.includes('implement') && lowerTask.includes('test')) {
    subtasks.push({
      description: '기능 구현',
      agent: recommendAgent(taskDescription.replace(/test/gi, '')).recommended,
      parallel: false
    });
    subtasks.push({
      description: '테스트 작성',
      agent: 'test-automation-specialist',
      parallel: false,
      dependsOn: 0
    });
  }

  // 기본: 단일 작업
  if (subtasks.length === 0) {
    const recommendation = recommendAgent(taskDescription);
    subtasks.push({
      description: taskDescription,
      agent: recommendation.recommended,
      parallel: false
    });
  }

  return subtasks;
}

/**
 * 에이전트 가용성 체크 (parallel-state.json 기반)
 */
function checkAgentAvailability(agentId) {
  try {
    const statePath = path.join(__dirname, 'parallel-state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const activeTasks = (state.activeAgents || []).filter(a => a.subagentType === agentId);
    return { available: activeTasks.length < 3, currentTasks: activeTasks.length };
  } catch { return { available: true, currentTasks: 0 }; }
}

module.exports = {
  AGENT_CAPABILITIES,
  TASK_TYPES,
  recommendAgent,
  decomposeTask,
  checkAgentAvailability
};
