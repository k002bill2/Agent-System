/**
 * Parallel Coordinator Hook for LiveMetro
 * 병렬 에이전트 작업 조정
 *
 * @version 1.0.0-LiveMetro
 */

const fs = require('fs');
const path = require('path');

// 병렬 작업 상태 파일
const PARALLEL_STATE_PATH = path.join(__dirname, '../coordination/parallel-state.json');

/**
 * 기본 병렬 상태
 */
const DEFAULT_STATE = {
  activeAgents: [],
  lastUpdated: null,
  sessionId: null
};

/**
 * 세션 ID 생성
 */
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 병렬 상태 로드
 */
function loadParallelState() {
  try {
    if (fs.existsSync(PARALLEL_STATE_PATH)) {
      return JSON.parse(fs.readFileSync(PARALLEL_STATE_PATH, 'utf8'));
    }
  } catch (error) {
    console.error('[ParallelCoordinator] Load error:', error.message);
  }
  return { ...DEFAULT_STATE, sessionId: generateSessionId() };
}

/**
 * 병렬 상태 저장
 */
function saveParallelState(state) {
  try {
    state.lastUpdated = new Date().toISOString();
    const dir = path.dirname(PARALLEL_STATE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PARALLEL_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    console.error('[ParallelCoordinator] Save error:', error.message);
  }
}

/**
 * Task 실행 전 조정
 */
async function onTaskPreExecute(event) {
  const { tool_input } = event;
  const state = loadParallelState();

  const taskInfo = {
    taskId: `task_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    subagentType: tool_input.subagent_type,
    description: tool_input.description,
    startTime: Date.now(),
    status: 'running'
  };

  // 대상 영역 추출
  const targetAreas = extractTargetAreas(tool_input.prompt);

  // 충돌 감지
  const conflicts = detectConflicts(state, targetAreas);
  if (conflicts.length > 0) {
    console.log(formatConflictWarning(conflicts));
  }

  // 작업 등록
  state.activeAgents.push({
    ...taskInfo,
    targetAreas
  });

  saveParallelState(state);

  // 조정 컨텍스트 주입
  const modifiedInput = {
    ...tool_input,
    prompt: injectCoordinationContext(tool_input.prompt, taskInfo)
  };

  return {
    decision: 'allow',
    modifiedInput,
    taskId: taskInfo.taskId
  };
}

/**
 * Task 실행 후 정리
 */
async function onTaskPostExecute(event) {
  const { task_id, success } = event;
  const state = loadParallelState();

  // 작업 제거
  const agentIndex = state.activeAgents.findIndex(a => a.taskId === task_id);
  if (agentIndex >= 0) {
    state.activeAgents.splice(agentIndex, 1);
  }

  saveParallelState(state);

  console.log(`${success ? '✅' : '❌'} Task ${task_id} ${success ? 'completed' : 'failed'}`);
}

/**
 * 대상 영역 추출
 */
function extractTargetAreas(prompt) {
  const areas = [];
  const lowerPrompt = prompt.toLowerCase();

  const patterns = [
    { pattern: /components?/i, area: 'components' },
    { pattern: /hooks?/i, area: 'hooks' },
    { pattern: /services?/i, area: 'services' },
    { pattern: /screens?/i, area: 'screens' },
    { pattern: /navigation/i, area: 'navigation' },
    { pattern: /firebase/i, area: 'firebase' },
    { pattern: /api/i, area: 'api' }
  ];

  for (const { pattern, area } of patterns) {
    if (pattern.test(prompt)) {
      areas.push(area);
    }
  }

  return [...new Set(areas)];
}

/**
 * 충돌 감지
 */
function detectConflicts(state, targetAreas) {
  const conflicts = [];

  for (const agent of state.activeAgents) {
    const overlap = targetAreas.filter(area =>
      agent.targetAreas?.includes(area)
    );

    if (overlap.length > 0) {
      conflicts.push({
        taskId: agent.taskId,
        agentType: agent.subagentType,
        overlapping: overlap
      });
    }
  }

  return conflicts;
}

/**
 * 충돌 경고 포맷
 */
function formatConflictWarning(conflicts) {
  let message = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += '⚠️  POTENTIAL CONFLICT DETECTED\n';
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (const conflict of conflicts) {
    message += `Task: ${conflict.taskId} (${conflict.agentType})\n`;
    message += `Overlapping areas: ${conflict.overlapping.join(', ')}\n\n`;
  }

  message += '**Note**: 같은 파일 수정 시 충돌 가능성이 있습니다.\n';
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  return message;
}

/**
 * 조정 컨텍스트 주입
 */
function injectCoordinationContext(prompt, taskInfo) {
  return `[PARALLEL TASK: ${taskInfo.taskId}]\n` +
    `다른 에이전트와 같은 파일 수정 시 충돌에 주의하세요.\n\n${prompt}`;
}

/**
 * 병렬 상태 조회
 */
function getParallelStatus() {
  const state = loadParallelState();
  return {
    sessionId: state.sessionId,
    activeCount: state.activeAgents.length,
    agents: state.activeAgents,
    lastUpdated: state.lastUpdated
  };
}

/**
 * 모든 작업 정리
 */
function clearAllTasks() {
  const state = { ...DEFAULT_STATE, sessionId: generateSessionId() };
  saveParallelState(state);
  console.log('✅ All parallel tasks cleared');
}

module.exports = {
  onTaskPreExecute,
  onTaskPostExecute,
  getParallelStatus,
  clearAllTasks
};
