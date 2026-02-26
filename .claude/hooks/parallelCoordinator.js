/**
 * Parallel Coordinator Hook for AOS Dashboard
 * 병렬 에이전트 작업 조정 — 파일 락, stale 정리, completedAgents 이력
 *
 * @version 2.0.0-AOS Dashboard
 *
 * @hook-config
 * {"event": "PreToolUse", "matcher": "Task", "command": "node .claude/hooks/parallelCoordinator.js pre 2>/dev/null || true"}
 *
 * @hook-config
 * {"event": "PostToolUse", "matcher": "Task", "command": "node .claude/hooks/parallelCoordinator.js post 2>/dev/null || true"}
 */

const fs = require('fs');
const path = require('path');

// 병렬 작업 상태 파일
const PARALLEL_STATE_PATH = path.join(__dirname, '../coordination/parallel-state.json');
const STALE_MS = 10 * 60 * 1000; // 10분
const MAX_COMPLETED = 20;

// file-lock-manager 로드 (실패 시 no-op)
let fileLockManager;
try {
  fileLockManager = require('../coordination/file-lock-manager');
} catch {
  fileLockManager = {
    acquireLock: () => ({ success: true, lockId: null }),
    releaseByAgent: () => ({ success: true, released: 0 })
  };
}

/**
 * 기본 병렬 상태
 */
const DEFAULT_STATE = {
  activeAgents: [],
  completedAgents: [],
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
      const state = JSON.parse(fs.readFileSync(PARALLEL_STATE_PATH, 'utf8'));
      // completedAgents 필드 보장
      if (!state.completedAgents) state.completedAgents = [];
      return state;
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
    // Atomic write: .tmp → rename (동시 쓰기 경합 방지)
    const tmpPath = PARALLEL_STATE_PATH + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmpPath, PARALLEL_STATE_PATH);
  } catch (error) {
    console.error('[ParallelCoordinator] Save error:', error.message);
  }
}

/**
 * Stale 에이전트 정리 (10분 이상 된 에이전트 제거 + 락 해제)
 */
function cleanupStaleAgents(state) {
  const now = Date.now();
  const stale = state.activeAgents.filter(a => (now - a.startTime) >= STALE_MS);
  if (stale.length > 0) {
    for (const agent of stale) {
      try {
        fileLockManager.releaseByAgent(agent.taskId);
      } catch {}
    }
    state.activeAgents = state.activeAgents.filter(a => (now - a.startTime) < STALE_MS);
  }
}

/**
 * 프롬프트에서 파일 경로 추출
 */
function extractTargetFiles(prompt) {
  const matches = prompt.match(/(?:src\/|\.\/|tests\/|infra\/|docs\/|\.claude\/)[^\s\n,)'"]+\.\w{1,5}/g) || [];
  // 프로젝트 루트 기준으로 resolve (Gemini 리뷰 반영 - CWD 독립적)
  const projectRoot = path.resolve(__dirname, '../..');
  return [...new Set(matches.map(f => path.resolve(projectRoot, f)))];
}

/**
 * Task 실행 전 조정
 */
async function onTaskPreExecute(event) {
  const { tool_input } = event;
  const state = loadParallelState();

  // Stale 에이전트 정리
  cleanupStaleAgents(state);

  // 에이전트 가용성 체크 (task-allocator 연동)
  let taskAllocator;
  try {
    taskAllocator = require('../coordination/task-allocator');
  } catch {
    taskAllocator = null;
  }

  if (taskAllocator) {
    const availability = taskAllocator.checkAgentAvailability(tool_input.subagent_type);
    if (!availability.available) {
      console.log(`[ParallelCoordinator] ⚠️ Agent ${tool_input.subagent_type} at capacity (${availability.currentTasks}/3 tasks). Queuing...`);
    }
  }

  const taskInfo = {
    taskId: `task_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    subagentType: tool_input.subagent_type,
    description: tool_input.description,
    startTime: Date.now(),
    status: 'running'
  };

  // 대상 영역 추출
  const targetAreas = extractTargetAreas(tool_input.prompt);

  // 대상 파일 추출 + 파일 락 획득
  const targetFiles = extractTargetFiles(tool_input.prompt || '');
  const lockIds = [];

  for (const filePath of targetFiles) {
    try {
      const result = fileLockManager.acquireLock({
        agentId: taskInfo.taskId,
        filePath,
        operation: 'write'
      });
      if (result.success && result.lockId) {
        lockIds.push(result.lockId);
      } else if (!result.success) {
        console.log(`[ParallelCoordinator] ⚠️ File lock conflict: ${path.basename(filePath)} held by ${result.heldBy}`);
      }
    } catch {}
  }

  // 영역 충돌 감지 — 충돌 시 차단 (advisory → enforced)
  const conflicts = detectConflicts(state, targetAreas);
  if (conflicts.length > 0) {
    const warning = formatConflictWarning(conflicts);
    console.error(warning);
    // 파일 레벨 충돌은 차단, 영역 레벨은 경고만
    const hasFileLevelConflict = lockIds.length === 0 && targetFiles.length > 0;
    if (hasFileLevelConflict) {
      return {
        decision: 'block',
        reason: `File lock conflict detected: ${conflicts.map(c => c.overlapping.join(', ')).join('; ')}`
      };
    }
  }

  // 작업 등록
  state.activeAgents.push({
    ...taskInfo,
    targetAreas,
    targetFiles: targetFiles.map(f => path.relative(process.cwd(), f)),
    lockIds
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

  // Stale 에이전트 정리
  cleanupStaleAgents(state);

  // 작업 찾기 (task_id 매칭 → description 폴백)
  let agentIndex = state.activeAgents.findIndex(a => a.taskId === task_id);
  if (agentIndex < 0 && typeof task_id === 'string') {
    agentIndex = state.activeAgents.findIndex(a => a.description === task_id);
  }

  if (agentIndex >= 0) {
    const agent = state.activeAgents[agentIndex];

    // 파일 락 해제
    try {
      fileLockManager.releaseByAgent(agent.taskId);
    } catch {}

    // completedAgents 이력 저장
    state.completedAgents.push({
      taskId: agent.taskId,
      subagentType: agent.subagentType,
      description: agent.description,
      startTime: agent.startTime,
      endTime: Date.now(),
      duration_ms: Date.now() - agent.startTime,
      status: success ? 'completed' : 'failed'
    });

    // 최근 MAX_COMPLETED개만 유지
    if (state.completedAgents.length > MAX_COMPLETED) {
      state.completedAgents = state.completedAgents.slice(-MAX_COMPLETED);
    }

    // activeAgents에서 제거
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
 * ACE Layer 1 윤리적 원칙 로드
 */
function loadEthicalPrinciples() {
  try {
    const acePath = path.join(__dirname, '../agents/shared/ace-framework.md');
    if (!fs.existsSync(acePath)) return null;
    const content = fs.readFileSync(acePath, 'utf8');

    // Layer 1 섹션만 추출 (Aspirational Foundation ~ Ethical Veto Protocol 시작 전)
    const layer1Match = content.match(/## Layer 1: Aspirational Foundation[\s\S]*?(?=\n## Ethical Veto Protocol)/);
    if (!layer1Match) return null;

    return layer1Match[0].trim();
  } catch {
    return null;
  }
}

/**
 * 조정 컨텍스트 주입 — ACE 원칙 포함
 */
function injectCoordinationContext(prompt, taskInfo) {
  const lines = [`[PARALLEL TASK: ${taskInfo.taskId}]`];

  // ACE Layer 1 원칙 주입
  const principles = loadEthicalPrinciples();
  if (principles) {
    lines.push('');
    lines.push('<ace-principles>');
    lines.push(principles);
    lines.push('</ace-principles>');
    lines.push('');
    lines.push('위 원칙을 최우선으로 준수하세요. 위반 시 작업을 즉시 중단하고 사용자에게 보고하세요.');
  }

  // 충돌 방지 안내
  lines.push('');
  lines.push('다른 에이전트와 같은 파일 수정 시 충돌에 주의하세요.');
  lines.push('');
  lines.push(prompt);

  return lines.join('\n');
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
    completedCount: state.completedAgents.length,
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
  clearAllTasks,
  loadEthicalPrinciples,
  injectCoordinationContext
};

// CLI entry point for hook system
if (require.main === module) {
  const mode = process.argv[2]; // 'pre', 'post', 'status', 'clear'

  // 즉시 실행 모드 (stdin 불필요)
  if (mode === 'status') {
    const status = getParallelStatus();
    console.log(JSON.stringify(status, null, 2));
    process.exit(0);
  }
  if (mode === 'clear') {
    clearAllTasks();
    const flm = require('../coordination/file-lock-manager');
    flm.clearAllLocks();
    console.log('✅ All parallel tasks and locks cleared');
    process.exit(0);
  }

  // stdin 기반 hook 모드
  let inputData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { inputData += chunk; });
  process.stdin.on('end', () => {
    try {
      const event = JSON.parse(inputData);
      if (mode === 'pre') {
        onTaskPreExecute({ tool_input: event.tool_input || {} });
      } else {
        onTaskPostExecute({ task_id: event.tool_input?.description, success: true });
      }
    } catch (e) { /* ignore */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000);
}
