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
 */

const fs = require('fs');
const path = require('path');

const TRACE_DIR = '.temp/traces/sessions';

/**
 * Hook entry point
 * @param {object} context - Hook 실행 컨텍스트
 */
async function onStopEvent(context) {
  try {
    const editedFiles = context.editedFiles || [];

    // 1. 세션 메트릭 집계 (항상 실행)
    await aggregateSessionMetrics();

    if (editedFiles.length === 0) {
      return;
    }

    // 2. 코드 변경사항 분석
    await analyzeCodeChanges(editedFiles);

    // 3. 테스트 커버리지 알림 (TS/TSX 파일 변경 시)
    const tsFiles = editedFiles.filter(f =>
      f.endsWith('.ts') || f.endsWith('.tsx')
    );

    if (tsFiles.length > 0) {
      displayTestReminder(tsFiles);
    }

  } catch (error) {
    console.error('[StopEvent] Error:', error.message);
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
  } else if (lowerPath.includes('/screens/')) {
    categories.screens.push(filePath);
  } else if (lowerPath.includes('/navigation/')) {
    categories.navigation.push(filePath);
  } else {
    categories.other.push(filePath);
  }
}

/**
 * 테스트 알림 표시
 */
function displayTestReminder(tsFiles) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST REMINDER');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`${tsFiles.length} TypeScript file(s) modified.\n`);
  console.log('**Recommended Actions:**');
  console.log('• npm test -- --coverage (테스트 실행)');
  console.log('• npm run type-check (타입 검사)');
  console.log('• /verify-app (전체 검증)');
  console.log('\n**Coverage Thresholds:**');
  console.log('• Statements: 75%');
  console.log('• Functions: 70%');
  console.log('• Branches: 60%');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

module.exports = { onStopEvent };
