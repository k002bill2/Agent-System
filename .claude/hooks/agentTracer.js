#!/usr/bin/env node
/**
 * Agent Tracer Hook
 * PostToolUse:Task 이벤트에서 자동으로 에이전트 호출을 트레이싱합니다.
 *
 * ACE Framework Layer 1 준수:
 * - Increase Understanding: 모든 에이전트 활동 투명하게 기록
 * - Transparency: 감사 추적 가능한 로그 생성
 *
 * @version 2.0.0-AOS Dashboard
 *
 * @hook-config
 * {"event": "PostToolUse", "matcher": "Task", "command": "node .claude/hooks/agentTracer.js 2>/dev/null || true"}
 */

const fs = require('fs');
const path = require('path');

const TRACE_DIR = '.temp/traces/sessions';

// feedback-loop 제거됨 — 메트릭은 events.jsonl로 직접 기록
const feedbackLoop = {
  recordExecutionMetrics: () => ({ success: true })
};

/**
 * parallel-state.json에서 에이전트 startTime 조회하여 duration 계산
 */
function calculateDuration(description) {
  try {
    const statePath = path.join(__dirname, '../coordination/parallel-state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    // activeAgents와 completedAgents 모두 검색
    const agent = (state.activeAgents || []).find(a => a.description === description)
      || (state.completedAgents || []).find(a => a.description === description);
    return agent ? Date.now() - agent.startTime : 0;
  } catch { return 0; }
}

/**
 * 설명에서 작업 유형 감지
 */
function detectTaskType(description) {
  if (!description) return 'unknown';
  const lower = description.toLowerCase();
  if (/test|spec|coverage/.test(lower)) return 'testing';
  if (/ui|component|style|layout/.test(lower)) return 'ui_development';
  if (/api|backend|service|endpoint/.test(lower)) return 'backend_integration';
  if (/perf|optim|bundle/.test(lower)) return 'performance';
  if (/review|valid|check|quality/.test(lower)) return 'validation';
  if (/fix|bug|debug/.test(lower)) return 'bugfix';
  if (/refactor|simplif/.test(lower)) return 'refactoring';
  return 'general';
}

// stdin에서 도구 입력 읽기
let inputData = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(inputData);

    // Task 도구 호출이 아니면 무시
    if (input.tool_name !== 'Task') {
      process.exit(0);
    }

    // tool_response 존재 여부로 spawn vs completion 판단
    const hasResponse = !!(input.tool_response);

    // 세션 ID 생성 (환경변수 또는 타임스탬프 기반)
    const sessionId = process.env.CLAUDE_SESSION_ID || `sess_${Date.now()}`;
    const sessionDir = path.join(TRACE_DIR, sessionId);

    // 디렉토리 생성
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    if (hasResponse) {
      // === Completion 이벤트 ===
      const description = input.tool_input?.description || '';
      const duration = calculateDuration(description);
      const responseText = typeof input.tool_response === 'string'
        ? input.tool_response
        : JSON.stringify(input.tool_response || '');

      // 이벤트 기록
      const event = {
        event: 'agent_completed',
        timestamp: new Date().toISOString(),
        session_id: sessionId,
        data: {
          agent_type: input.tool_input?.subagent_type || 'unknown',
          description,
          duration_ms: duration,
          // 성공 판정: 응답 내 에러 키워드 단순 매칭 대신 구조화된 판정
          // "fixed error", "resolved exception" 등 오탐 방지
          success: !(
            /\b(error|failed|exception)\b/i.test(responseText) &&
            !/\b(fix(ed)?|resolv(ed|ing)|handl(ed|ing)|recover(ed)?|success|pass(ed)?)\b/i.test(responseText)
          )
        }
      };

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      fs.appendFileSync(eventsFile, JSON.stringify(event) + '\n');

      // feedback-loop에 메트릭 기록
      try {
        feedbackLoop.recordExecutionMetrics({
          agentId: input.tool_input?.subagent_type || 'unknown',
          taskType: detectTaskType(description),
          metrics: {
            duration_ms: duration,
            files_edited: 0,
            tools_used: 0,
            success: event.data.success
          }
        });
      } catch {}

    } else {
      // === Spawn 이벤트 (기존 동작) ===
      const event = {
        event: 'agent_spawned',
        timestamp: new Date().toISOString(),
        session_id: sessionId,
        data: {
          agent_type: input.tool_input?.subagent_type || 'unknown',
          description: input.tool_input?.description || '',
          model: input.tool_input?.model || 'default',
          run_in_background: input.tool_input?.run_in_background || false
        }
      };

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      fs.appendFileSync(eventsFile, JSON.stringify(event) + '\n');
    }

    // 세션 메타데이터 업데이트
    const metaFile = path.join(sessionDir, 'metadata.json');
    let metadata = { created: new Date().toISOString(), agent_count: 0, events_count: 0 };

    if (fs.existsSync(metaFile)) {
      try {
        metadata = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      } catch (e) {
        // 파싱 실패시 새로 생성
      }
    }

    if (!hasResponse) {
      metadata.agent_count = (metadata.agent_count || 0) + 1;
    }
    metadata.events_count = (metadata.events_count || 0) + 1;
    metadata.last_updated = new Date().toISOString();
    metadata.last_agent = input.tool_input?.subagent_type || 'unknown';

    fs.writeFileSync(metaFile, JSON.stringify(metadata, null, 2));

    process.exit(0);
  } catch (error) {
    // 에러 발생해도 프로세스는 성공으로 종료 (다른 작업 방해 안함)
    process.exit(0);
  }
});

// 타임아웃 (5초 후 종료)
setTimeout(() => {
  process.exit(0);
}, 5000);
