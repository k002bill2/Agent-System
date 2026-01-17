/**
 * Task Allocator for LiveMetro
 * 작업을 적절한 에이전트에게 분배
 *
 * @version 1.0.0-LiveMetro
 */

/**
 * 에이전트 능력 정의
 */
const AGENT_CAPABILITIES = {
  'mobile-ui-specialist': {
    skills: ['ui', 'component', 'style', 'layout', 'responsive'],
    priority: ['components', 'screens', 'styles'],
    model: 'sonnet'
  },
  'backend-integration-specialist': {
    skills: ['firebase', 'api', 'data', 'sync', 'auth'],
    priority: ['services', 'firebase', 'api'],
    model: 'sonnet'
  },
  'test-automation-specialist': {
    skills: ['test', 'coverage', 'jest', 'mock'],
    priority: ['__tests__', 'test', 'mock'],
    model: 'haiku'
  },
  'performance-optimizer': {
    skills: ['performance', 'optimization', 'memory', 'bundle'],
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
  }
};

/**
 * 작업 분류
 */
const TASK_TYPES = {
  ui_development: {
    keywords: ['ui', 'component', 'screen', 'style', '화면', '컴포넌트'],
    recommendedAgent: 'mobile-ui-specialist'
  },
  backend_integration: {
    keywords: ['firebase', 'api', 'service', 'data', '서비스', 'auth'],
    recommendedAgent: 'backend-integration-specialist'
  },
  testing: {
    keywords: ['test', 'jest', 'coverage', '테스트', 'mock'],
    recommendedAgent: 'test-automation-specialist'
  },
  performance: {
    keywords: ['performance', 'optimize', 'memory', '성능', '최적화'],
    recommendedAgent: 'performance-optimizer'
  },
  validation: {
    keywords: ['review', 'validate', 'check', '검증', '리뷰'],
    recommendedAgent: 'quality-validator'
  },
  coordination: {
    keywords: ['parallel', 'coordinate', 'orchestrate', '병렬', '조정'],
    recommendedAgent: 'lead-orchestrator'
  }
};

/**
 * 작업에 적합한 에이전트 추천
 * @param {string} taskDescription - 작업 설명
 * @returns {object} - 추천 결과
 */
function recommendAgent(taskDescription) {
  const lowerTask = taskDescription.toLowerCase();
  const matches = [];

  for (const [taskType, config] of Object.entries(TASK_TYPES)) {
    const matchCount = config.keywords.filter(kw =>
      lowerTask.includes(kw)
    ).length;

    if (matchCount > 0) {
      matches.push({
        taskType,
        agent: config.recommendedAgent,
        matchScore: matchCount,
        capabilities: AGENT_CAPABILITIES[config.recommendedAgent]
      });
    }
  }

  // 점수순 정렬
  matches.sort((a, b) => b.matchScore - a.matchScore);

  if (matches.length === 0) {
    return {
      recommended: 'mobile-ui-specialist',
      confidence: 'low',
      reason: 'Default recommendation'
    };
  }

  return {
    recommended: matches[0].agent,
    confidence: matches[0].matchScore > 2 ? 'high' : 'medium',
    taskType: matches[0].taskType,
    model: matches[0].capabilities?.model,
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
      agent: 'mobile-ui-specialist',
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
 * 에이전트 가용성 체크 (향후 확장)
 */
function checkAgentAvailability(agentId) {
  // 현재는 항상 가용
  return {
    available: true,
    currentTasks: 0
  };
}

module.exports = {
  AGENT_CAPABILITIES,
  TASK_TYPES,
  recommendAgent,
  decomposeTask,
  checkAgentAvailability
};
