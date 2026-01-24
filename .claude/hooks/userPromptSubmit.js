/**
 * UserPromptSubmit Hook for AOS Dashboard
 * React Native/Expo 개발 환경에 맞춤화된 스킬 자동 활성화
 *
 * 사용자 프롬프트를 분석하여:
 * 1. React Native 패턴 감지 및 가이드 활성화
 * 2. Firebase/Seoul API 패턴 감지
 * 3. skill-rules.json 기반 스킬 활성화
 *
 * @version 1.0.0-AOS Dashboard
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

    // 1. React Native 패턴 감지
    const rnPatterns = detectReactNativePatterns(prompt);
    if (rnPatterns) {
      messages.push(rnPatterns);
    }

    // 2. skill-rules.json 기반 스킬 활성화
    const skillActivation = await activateSkills(prompt, projectRoot);
    if (skillActivation) {
      messages.push(skillActivation);
    }

    // 3. 중요 파일 감지
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
 * React Native 패턴 감지
 */
function detectReactNativePatterns(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  const detectedPatterns = [];

  // React Native 패턴
  const patterns = [
    { keywords: ['useeffect', 'cleanup', '구독', 'subscription'], pattern: 'useEffect Cleanup' },
    { keywords: ['navigation', 'navigate', 'screen', '네비게이션'], pattern: 'React Navigation' },
    { keywords: ['firebase', 'firestore', 'auth'], pattern: 'Firebase Integration' },
    { keywords: ['expo', 'notification', 'push'], pattern: 'Expo Notifications' },
    { keywords: ['asyncstorage', 'storage', '캐시', 'cache'], pattern: 'AsyncStorage' },
    { keywords: ['seoul api', '서울 api', '실시간 도착', 'arrival'], pattern: 'Seoul Open Data API' },
    { keywords: ['context', 'provider', '상태 관리'], pattern: 'Context API' },
    { keywords: ['hook', 'custom hook', '커스텀 훅'], pattern: 'Custom Hooks' }
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
  message += '🔵 REACT NATIVE PATTERN DETECTED\n';
  message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  message += `**Detected Patterns**: ${detectedPatterns.join(', ')}\n\n`;
  message += '**Reminders:**\n';

  if (detectedPatterns.includes('useEffect Cleanup')) {
    message += '• useEffect에서 cleanup 함수 필수 반환\n';
    message += '• 구독/타이머는 반드시 정리하세요\n';
  }
  if (detectedPatterns.includes('React Navigation')) {
    message += '• 타입 안전한 네비게이션 사용 (RootStackParamList)\n';
  }
  if (detectedPatterns.includes('Seoul Open Data API')) {
    message += '• API 폴링 간격 최소 30초 유지\n';
    message += '• 에러 시 빈 배열 반환 (throw 대신)\n';
  }
  if (detectedPatterns.includes('Firebase Integration')) {
    message += '• 실시간 리스너 정리 필수\n';
  }

  message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  return message;
}

/**
 * 중요 파일 감지
 */
function detectCriticalFiles(prompt) {
  const criticalPatterns = [
    { pattern: /app\.tsx|app\.json/i, file: 'App Entry Point' },
    { pattern: /authcontext|firebase.*config/i, file: 'Authentication' },
    { pattern: /navigation|navigator/i, file: 'Navigation' },
    { pattern: /package\.json/i, file: 'Dependencies' }
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
