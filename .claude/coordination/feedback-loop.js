/**
 * Feedback Loop for LiveMetro
 * 에이전트 실행 메트릭 및 학습 이벤트 기록
 *
 * @version 1.0.0-LiveMetro
 */

const fs = require('fs');
const path = require('path');

const FEEDBACK_DIR = path.join(__dirname, 'feedback');
const METRICS_FILE = path.join(FEEDBACK_DIR, 'execution-metrics.jsonl');
const LEARNING_FILE = path.join(FEEDBACK_DIR, 'learning-events.jsonl');

/**
 * 실행 메트릭 기록
 * @param {object} metrics
 */
function recordExecutionMetrics(metrics) {
  ensureFeedbackDir();

  const record = {
    timestamp: new Date().toISOString(),
    agentId: metrics.agentId || 'unknown',
    taskType: metrics.taskType || 'unknown',
    duration_ms: metrics.metrics?.duration_ms || 0,
    files_edited: metrics.metrics?.files_edited || 0,
    tools_used: metrics.metrics?.tools_used || 0,
    success: metrics.metrics?.success ?? true,
    testResults: metrics.metrics?.testResults || null
  };

  appendToFile(METRICS_FILE, record);

  return { success: true, record };
}

/**
 * 학습 이벤트 기록
 * @param {object} event
 */
function recordLearningEvent(event) {
  ensureFeedbackDir();

  const record = {
    timestamp: new Date().toISOString(),
    agentId: event.agentId || 'unknown',
    eventType: event.eventType,
    context: event.context || {},
    suggestion: event.suggestion || '',
    severity: event.severity || 'info'
  };

  appendToFile(LEARNING_FILE, record);

  return { success: true, record };
}

/**
 * 최근 메트릭 조회
 * @param {number} limit
 */
function getRecentMetrics(limit = 10) {
  return readRecentRecords(METRICS_FILE, limit);
}

/**
 * 최근 학습 이벤트 조회
 * @param {number} limit
 */
function getRecentLearningEvents(limit = 10) {
  return readRecentRecords(LEARNING_FILE, limit);
}

/**
 * 메트릭 요약 생성
 */
function generateMetricsSummary() {
  const metrics = readRecentRecords(METRICS_FILE, 100);

  if (metrics.length === 0) {
    return {
      totalTasks: 0,
      successRate: 0,
      avgDuration: 0
    };
  }

  const successCount = metrics.filter(m => m.success).length;
  const totalDuration = metrics.reduce((sum, m) => sum + (m.duration_ms || 0), 0);

  return {
    totalTasks: metrics.length,
    successRate: (successCount / metrics.length * 100).toFixed(1),
    avgDuration: Math.round(totalDuration / metrics.length),
    recentErrors: metrics.filter(m => !m.success).slice(0, 5)
  };
}

/**
 * 에이전트별 성능 분석
 */
function analyzeAgentPerformance() {
  const metrics = readRecentRecords(METRICS_FILE, 100);
  const byAgent = {};

  for (const m of metrics) {
    const agent = m.agentId;
    if (!byAgent[agent]) {
      byAgent[agent] = {
        totalTasks: 0,
        successCount: 0,
        totalDuration: 0
      };
    }

    byAgent[agent].totalTasks++;
    if (m.success) byAgent[agent].successCount++;
    byAgent[agent].totalDuration += m.duration_ms || 0;
  }

  const result = {};
  for (const [agent, data] of Object.entries(byAgent)) {
    result[agent] = {
      totalTasks: data.totalTasks,
      successRate: (data.successCount / data.totalTasks * 100).toFixed(1),
      avgDuration: Math.round(data.totalDuration / data.totalTasks)
    };
  }

  return result;
}

/**
 * 피드백 파일에 추가
 */
function appendToFile(filePath, record) {
  try {
    fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
  } catch (error) {
    console.error('[FeedbackLoop] Write error:', error.message);
  }
}

/**
 * 최근 레코드 읽기
 */
function readRecentRecords(filePath, limit) {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    const records = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);

    return records.slice(-limit).reverse();
  } catch (error) {
    console.error('[FeedbackLoop] Read error:', error.message);
    return [];
  }
}

/**
 * 피드백 디렉토리 확인
 */
function ensureFeedbackDir() {
  if (!fs.existsSync(FEEDBACK_DIR)) {
    fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
  }
}

/**
 * 피드백 데이터 정리
 */
function clearFeedbackData() {
  ensureFeedbackDir();

  if (fs.existsSync(METRICS_FILE)) {
    fs.unlinkSync(METRICS_FILE);
  }
  if (fs.existsSync(LEARNING_FILE)) {
    fs.unlinkSync(LEARNING_FILE);
  }

  return { success: true };
}

module.exports = {
  recordExecutionMetrics,
  recordLearningEvent,
  getRecentMetrics,
  getRecentLearningEvents,
  generateMetricsSummary,
  analyzeAgentPerformance,
  clearFeedbackData
};
