/**
 * Stop Event Hook for AOS Dashboard
 * React Web 코드 변경 후 자동 검증 + 세션 메트릭 집계
 *
 * Claude의 응답이 완료된 후 실행되어:
 * 1. 코드 변경사항 분석
 * 2. React Web 패턴 검증
 * 3. 자동 테스트 실행 (선택적)
 * 4. 세션 메트릭 집계 (Feedback Loops)
 *
 * @version 2.0.0-AOS
 *
 * @hook-config
 * {"event": "Stop", "matcher": "", "command": "node .claude/hooks/stopEvent.js 2>/dev/null || true"}
 */

const fs = require('fs');
const path = require('path');

const TRACE_DIR = '.temp/traces/sessions';
const PARALLEL_STATE_PATH = path.join(__dirname, '../coordination/parallel-state.json');

/**
 * JSON 파일 안전 읽기
 */
function readJsonSafe(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {}
  return defaultValue;
}

/**
 * 세션 체크포인트 생성 (checkpoint-manager.js 연동)
 */
function createSessionCheckpoint(editedFiles) {
  try {
    const cpMgr = require('../coordination/checkpoint-manager');
    const parallelState = readJsonSafe(PARALLEL_STATE_PATH, { activeAgents: [], completedAgents: [] });

    // no-op 방지: 편집 파일 0개 + 활성 에이전트 0개이면 스킵
    if (editedFiles.length === 0 && (parallelState.activeAgents || []).length === 0) return;

    cpMgr.createCheckpoint({
      agentId: 'session',
      trigger: 'stop_event',
      description: `${editedFiles.length} files edited`,
      context: {
        editedFiles: editedFiles.slice(0, 20),
        activeAgents: (parallelState.activeAgents || []).map(a => ({
          subagentType: a.subagentType, status: a.status
        })),
        completedAgents: (parallelState.completedAgents || []).map(a => ({
          subagentType: a.subagentType, duration_ms: a.duration_ms
        }))
      }
    });
  } catch {}
}

/**
 * Hook entry point
 * @param {object} context - Hook 실행 컨텍스트
 */
async function onStopEvent(context) {
  try {
    // Stop 이벤트에는 editedFiles가 없으므로 git diff로 감지
    let editedFiles = context.editedFiles || [];
    if (editedFiles.length === 0) {
      editedFiles = detectChangedFiles();
    }

    // 0. 세션 체크포인트 생성
    createSessionCheckpoint(editedFiles);

    // 1. 세션 메트릭 집계 (항상 실행)
    await aggregateSessionMetrics();

    if (editedFiles.length === 0) {
      return;
    }

    // 2. 코드 변경사항 분석
    await analyzeCodeChanges(editedFiles);

    // 3. Verify 스킬 매칭 안내
    suggestVerifySkills(editedFiles);

    // 4. 테스트 커버리지 알림 (TS/TSX 파일 변경 시)
    const tsFiles = editedFiles.filter(f =>
      f.endsWith('.ts') || f.endsWith('.tsx')
    );

    if (tsFiles.length > 0) {
      displayTestReminder(tsFiles, 'typescript');
    }

    // 5. Python 테스트 알림 (PY 파일 변경 시)
    const pyFiles = editedFiles.filter(f => f.endsWith('.py'));

    if (pyFiles.length > 0) {
      displayTestReminder(pyFiles, 'python');
    }

    // 6. Gemini 크로스 리뷰 트리거 (백그라운드, 비차단)
    triggerGeminiReview(editedFiles);

  } catch (error) {
    console.error('[StopEvent] Error:', error.message);
  }
}

/**
 * Git diff로 변경된 파일 감지
 * Stop 이벤트에는 editedFiles가 포함되지 않으므로 git으로 직접 확인
 */
function detectChangedFiles() {
  try {
    const { execSync } = require('child_process');
    const output = execSync('git diff --name-only HEAD 2>/dev/null || git diff --name-only 2>/dev/null', {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
      timeout: 5000
    });
    return output.trim().split('\n').filter(f => f.trim().length > 0);
  } catch (_) {
    return [];
  }
}

/**
 * Gemini 크로스 리뷰 트리거 (fire-and-forget)
 * 백그라운드에서 Gemini CLI를 호출하여 코드 리뷰를 수행합니다.
 * 결과는 .claude/gemini-bridge/reviews/에 저장되며,
 * 다음 UserPromptSubmit에서 Claude에 주입됩니다.
 */
function triggerGeminiReview(editedFiles) {
  try {
    // 편집된 파일이 없으면 스킵
    if (!editedFiles || editedFiles.length === 0) return;

    // src/ 파일만 필터링 (설정 파일 등 제외)
    const srcFiles = editedFiles.filter(f =>
      f.startsWith('src/') || f.endsWith('.py') || f.endsWith('.ts') || f.endsWith('.tsx')
    );
    if (srcFiles.length === 0) return;

    // 레이트 리밋 체크 (동기적으로 상태 파일 읽기)
    const stateFile = path.join(__dirname, '..', 'coordination', 'gemini-state.json');
    if (fs.existsSync(stateFile)) {
      try {
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        const today = new Date().toISOString().slice(0, 10);
        if (state.date === today && state.callCount >= (state.dailyLimit || 900)) {
          return; // 일일 한도 초과
        }
      } catch (_) {}
    }

    // 백그라운드 spawn (fire-and-forget)
    const bridgeScript = path.join(__dirname, 'gemini-bridge.js');
    if (!fs.existsSync(bridgeScript)) return;

    const child = require('child_process').spawn(
      process.execPath,
      [bridgeScript, 'review', ...srcFiles],
      {
        cwd: path.resolve(__dirname, '../..'),
        stdio: 'ignore',
        detached: true
      }
    );

    child.unref(); // 부모 프로세스가 자식을 기다리지 않음

  } catch (_) {
    // Gemini 리뷰 트리거 실패는 무시 (기존 훅 기능에 영향 없음)
  }
}

/**
 * 세션 메트릭 집계 (Feedback Loops)
 * 현재 세션의 에이전트 호출 통계를 집계합니다.
 */
async function aggregateSessionMetrics() {
  try {
    if (!fs.existsSync(TRACE_DIR)) {
      return;
    }

    const sessions = fs.readdirSync(TRACE_DIR).filter(d =>
      fs.statSync(path.join(TRACE_DIR, d)).isDirectory()
    );

    if (sessions.length === 0) {
      return;
    }

    // 가장 최근 세션 찾기
    const latestSession = sessions.sort().pop();
    const sessionDir = path.join(TRACE_DIR, latestSession);
    const eventsFile = path.join(sessionDir, 'events.jsonl');
    const metricsFile = path.join(sessionDir, 'metrics.json');

    if (!fs.existsSync(eventsFile)) {
      return;
    }

    // 이벤트 파싱
    const events = fs.readFileSync(eventsFile, 'utf8')
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);

    if (events.length === 0) {
      return;
    }

    // 메트릭 집계
    const agentCounts = {};
    const modelCounts = {};

    events.forEach(event => {
      if (event.event === 'agent_spawned' && event.data) {
        const agentType = event.data.agent_type || 'unknown';
        const model = event.data.model || 'default';

        agentCounts[agentType] = (agentCounts[agentType] || 0) + 1;
        modelCounts[model] = (modelCounts[model] || 0) + 1;
      }
    });

    const metrics = {
      session_id: latestSession,
      aggregated_at: new Date().toISOString(),
      total_events: events.length,
      total_agents_spawned: Object.values(agentCounts).reduce((a, b) => a + b, 0),
      agents_by_type: agentCounts,
      models_used: modelCounts,
      first_event: events[0]?.timestamp || null,
      last_event: events[events.length - 1]?.timestamp || null
    };

    // 메트릭 저장
    fs.writeFileSync(metricsFile, JSON.stringify(metrics, null, 2));

    // 간략 요약 출력 (에이전트가 사용된 경우에만)
    if (metrics.total_agents_spawned > 0) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📊 SESSION AGENT METRICS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Agents spawned: ${metrics.total_agents_spawned}`);
      Object.entries(agentCounts).forEach(([type, count]) => {
        console.log(`  • ${type}: ${count}`);
      });
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    // Feedback Loop 요약 출력
    try {
      const feedbackLoop = require('../coordination/feedback-loop');
      const summary = feedbackLoop.generateMetricsSummary();
      if (summary.totalTasks > 0) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📈 FEEDBACK SUMMARY');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Tasks: ${summary.totalTasks}, Success: ${summary.successRate}%, Avg: ${summary.avgDuration}ms`);
        if (summary.recentErrors && summary.recentErrors.length > 0) {
          console.log(`Recent errors: ${summary.recentErrors.length}`);
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      }
    } catch {}

  } catch (error) {
    // 메트릭 집계 실패는 무시 (다른 작업 방해 안함)
  }
}

/**
 * 코드 변경사항 분석
 */
async function analyzeCodeChanges(editedFiles) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 CODE CHANGES SELF-CHECK');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`📁 Changes detected in ${editedFiles.length} file(s)\n`);

  const reminders = new Set();
  const fileCategories = {
    components: [],
    hooks: [],
    services: [],
    screens: [],
    navigation: [],
    other: []
  };

  for (const filePath of editedFiles) {
    await analyzeFile(filePath, reminders);
    categorizeFile(filePath, fileCategories);
  }

  // 파일 카테고리별 요약
  for (const [category, files] of Object.entries(fileCategories)) {
    if (files.length > 0) {
      console.log(`**${category}**: ${files.length} file(s)`);
    }
  }

  // 체크리스트 표시
  if (reminders.size > 0) {
    console.log('\n**Self-check Questions:**');
    Array.from(reminders).forEach(reminder => {
      console.log(`❓ ${reminder}`);
    });
  } else {
    console.log('\n✅ No critical patterns detected');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

/**
 * 변경된 파일과 매칭되는 verify 스킬 안내
 * manage-skills/SKILL.md의 등록된 검증 스킬 테이블에서 스킬명 + 커버 파일 패턴을 파싱하여
 * 변경된 파일 목록과 매칭합니다.
 */
function suggestVerifySkills(editedFiles) {
  try {
    const skillRegistryPath = path.join('.claude', 'skills', 'manage-skills', 'SKILL.md');
    if (!fs.existsSync(skillRegistryPath)) {
      return;
    }

    const content = fs.readFileSync(skillRegistryPath, 'utf-8');

    // 등록된 검증 스킬 테이블 파싱
    // 형식: | `verify-name` | 설명 | `pattern1`, `pattern2` |
    const tableRegex = /\|\s*`(verify-[^`]+)`\s*\|[^|]+\|\s*([^|]+)\|/g;
    const skills = [];
    let match;

    while ((match = tableRegex.exec(content)) !== null) {
      const skillName = match[1];
      const patternsRaw = match[2].trim();

      // 백틱으로 감싸진 패턴들 추출
      const patterns = [];
      const patternRegex = /`([^`]+)`/g;
      let patternMatch;
      while ((patternMatch = patternRegex.exec(patternsRaw)) !== null) {
        patterns.push(patternMatch[1]);
      }

      if (patterns.length > 0) {
        skills.push({ name: skillName, patterns });
      }
    }

    if (skills.length === 0) {
      return;
    }

    // 변경된 파일과 패턴 매칭
    const matchedSkills = {};

    for (const file of editedFiles) {
      for (const skill of skills) {
        for (const pattern of skill.patterns) {
          if (matchesPattern(file, pattern)) {
            if (!matchedSkills[skill.name]) {
              matchedSkills[skill.name] = [];
            }
            if (!matchedSkills[skill.name].includes(file)) {
              matchedSkills[skill.name].push(file);
            }
            break; // 한 스킬에 대해 파일이 한번 매칭되면 충분
          }
        }
      }
    }

    const matchedCount = Object.keys(matchedSkills).length;
    if (matchedCount === 0) {
      return;
    }

    // 안내 출력
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 VERIFY SKILLS MATCHED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('변경된 파일이 다음 verify 스킬과 매칭됩니다:');

    for (const [skillName, files] of Object.entries(matchedSkills)) {
      console.log(`• ${skillName} (${files.length} files)`);
    }

    console.log('\n실행: /verify-implementation');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    // verify 스킬 매칭 실패는 무시
  }
}

/**
 * 간단한 glob 패턴 매칭
 * 지원: ** (any path), * (any name segment), *.ext (extension match)
 */
function matchesPattern(filePath, pattern) {
  // 정규화: 백슬래시를 슬래시로
  const normalizedFile = filePath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // 패턴을 regex로 변환
  let regexStr = normalizedPattern
    .replace(/\./g, '\\.')           // . → \.
    .replace(/\*\*\//g, '(.+/)?')   // **/ → 임의 경로
    .replace(/\*\*/g, '.*')         // ** → 임의 문자열
    .replace(/\*/g, '[^/]*');        // * → 경로 구분자 제외 임의 문자

  // 정확한 경로 매칭 또는 패턴 매칭
  const regex = new RegExp(`(^|/)${regexStr}$`);
  return regex.test(normalizedFile);
}

/**
 * 파일 분석 및 리스크 패턴 검사
 */
async function analyzeFile(filePath, reminders) {
  try {
    if (!fs.existsSync(filePath)) {
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath);

    // TypeScript/TSX 파일 패턴 검사
    if (ext === '.ts' || ext === '.tsx') {
      checkTypeScriptPatterns(content, filePath, reminders);
    }

    // Python 파일 패턴 검사
    if (ext === '.py') {
      checkPythonPatterns(content, filePath, reminders);
    }

  } catch (error) {
    console.error(`[StopEvent] Error analyzing ${filePath}:`, error.message);
  }
}

/**
 * TypeScript/React Native 파일 패턴 검사
 */
function checkTypeScriptPatterns(content, filePath, reminders) {
  // useEffect cleanup 체크
  if (/useEffect\s*\(/.test(content)) {
    if (/subscribe|interval|setTimeout|addEventListener/i.test(content)) {
      if (!/return\s*\(\s*\)\s*=>|return\s*cleanup|return\s*\(\)/.test(content)) {
        reminders.add('useEffect에 cleanup 함수가 있나요? (구독/타이머 정리)');
      }
    }
  }

  // any 타입 체크
  if (/:\s*any\b/.test(content)) {
    reminders.add('any 타입이 사용되었습니다. 구체적인 타입으로 대체하세요.');
  }

  // console.log 체크
  if (/console\.(log|debug|info)\(/.test(content)) {
    reminders.add('console.log가 남아있습니다. 프로덕션 전 제거하세요.');
  }

  // 에러 처리 체크
  if (/try\s*{/.test(content)) {
    if (!/catch.*Sentry|ErrorBoundary|handleError/.test(content)) {
      reminders.add('에러 처리가 Sentry로 전송되나요?');
    }
  }

  // API 호출 체크
  if (/fetch\(|axios\.|seoulSubwayApi/.test(content)) {
    reminders.add('API 호출에 에러 처리와 로딩 상태가 있나요?');
  }

  // AsyncStorage 체크
  if (/AsyncStorage/.test(content)) {
    reminders.add('AsyncStorage 작업에 try-catch가 있나요?');
  }

  // Navigation 체크
  if (/navigation\.(navigate|push|replace)/.test(content)) {
    reminders.add('네비게이션 파라미터 타입이 정의되어 있나요?');
  }
}

/**
 * Python 파일 패턴 검사 (FastAPI + LangGraph)
 */
function checkPythonPatterns(content, filePath, reminders) {
  // async def 체크 (await 없이 async 사용)
  const asyncDefMatch = content.match(/async\s+def\s+\w+/g) || [];
  if (asyncDefMatch.length > 0) {
    // 각 async 함수에 await가 있는지 간단 체크
    if (!/await\s+/.test(content)) {
      reminders.add('async def에 await가 없습니다. 동기 함수로 변경하거나 await 추가하세요.');
    }
  }

  // 타입 힌트 체크
  if (/def\s+\w+\([^)]*\)\s*:/.test(content) && !/def\s+\w+\([^)]*\)\s*->\s*/.test(content)) {
    reminders.add('함수에 반환 타입 힌트가 없습니다.');
  }

  // bare except 체크
  if (/except\s*:/.test(content)) {
    reminders.add('bare except 대신 구체적인 예외 타입을 사용하세요.');
  }

  // print 문 체크
  if (/print\s*\(/.test(content)) {
    reminders.add('print 문이 있습니다. logging 모듈 사용을 권장합니다.');
  }

  // TODO/FIXME 체크
  if (/#\s*(TODO|FIXME|HACK)/i.test(content)) {
    reminders.add('TODO/FIXME 주석이 있습니다. 해결이 필요합니다.');
  }

  // LangGraph 관련 체크
  if (/class\s+\w+Node|BaseNode/.test(content)) {
    if (!/async\s+def\s+run/.test(content)) {
      reminders.add('LangGraph Node에 async def run() 메서드가 없습니다.');
    }
  }

  // FastAPI 관련 체크
  if (/@(app|router)\.(get|post|put|delete|patch)/.test(content)) {
    if (!/response_model\s*=/.test(content) && !/return.*Response/.test(content)) {
      reminders.add('FastAPI 엔드포인트에 response_model이 정의되지 않았습니다.');
    }
  }
}

/**
 * 파일 카테고리화
 */
function categorizeFile(filePath, categories) {
  const lowerPath = filePath.toLowerCase();

  if (lowerPath.includes('/components/')) {
    categories.components.push(filePath);
  } else if (lowerPath.includes('/hooks/')) {
    categories.hooks.push(filePath);
  } else if (lowerPath.includes('/services/')) {
    categories.services.push(filePath);
  } else if (lowerPath.includes('/screens/') || lowerPath.includes('/pages/')) {
    categories.screens.push(filePath);
  } else if (lowerPath.includes('/navigation/') || lowerPath.includes('/api/')) {
    categories.navigation.push(filePath);
  } else if (lowerPath.includes('/orchestrator/') || lowerPath.includes('/agents/')) {
    categories.other.push(filePath);
  } else {
    categories.other.push(filePath);
  }
}

/**
 * 테스트 알림 표시
 */
function displayTestReminder(files, language = 'typescript') {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST REMINDER');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (language === 'typescript') {
    console.log(`${files.length} TypeScript file(s) modified.\n`);
    console.log('**Recommended Actions:**');
    console.log('• npm test -- --coverage (테스트 실행)');
    console.log('• npm run type-check (타입 검사)');
    console.log('• npm run lint (린트 검사)');
    console.log('• /verify-app (전체 검증)');
    console.log('\n**Coverage Thresholds:**');
    console.log('• Statements: 75%');
    console.log('• Functions: 70%');
    console.log('• Branches: 60%');
  } else if (language === 'python') {
    console.log(`${files.length} Python file(s) modified.\n`);
    console.log('**Recommended Actions:**');
    console.log('• pytest tests/backend --cov (테스트 + 커버리지)');
    console.log('• mypy src/backend (타입 검사)');
    console.log('• ruff check src/backend (린트 검사)');
    console.log('• /verify-app (전체 검증)');
    console.log('\n**Coverage Thresholds:**');
    console.log('• Statements: 70%');
    console.log('• Functions: 65%');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

module.exports = { onStopEvent };

// CLI entry point for hook system
if (require.main === module) {
  let inputData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { inputData += chunk; });
  process.stdin.on('end', () => {
    try {
      const event = inputData.trim() ? JSON.parse(inputData) : {};
      onStopEvent(event);
    } catch (e) {
      onStopEvent({});
    }
  });
  setTimeout(() => process.exit(0), 10000);
}
