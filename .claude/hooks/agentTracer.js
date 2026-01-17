#!/usr/bin/env node
/**
 * Agent Tracer Hook
 * PostToolUse:Task 이벤트에서 자동으로 에이전트 호출을 트레이싱합니다.
 *
 * ACE Framework Layer 1 준수:
 * - Increase Understanding: 모든 에이전트 활동 투명하게 기록
 * - Transparency: 감사 추적 가능한 로그 생성
 */

const fs = require('fs');
const path = require('path');

const TRACE_DIR = '.temp/traces/sessions';

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

    // 세션 ID 생성 (환경변수 또는 타임스탬프 기반)
    const sessionId = process.env.CLAUDE_SESSION_ID || `sess_${Date.now()}`;
    const sessionDir = path.join(TRACE_DIR, sessionId);

    // 디렉토리 생성
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // 이벤트 생성
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

    // JSONL 형식으로 append
    const eventsFile = path.join(sessionDir, 'events.jsonl');
    fs.appendFileSync(eventsFile, JSON.stringify(event) + '\n');

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

    metadata.agent_count = (metadata.agent_count || 0) + 1;
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
