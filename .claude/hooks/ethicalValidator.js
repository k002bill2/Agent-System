/**
 * Ethical Validator Hook for LiveMetro
 * 위험 작업 사전 차단 (PreToolUse)
 *
 * @version 1.0.0-LiveMetro
 */

const fs = require('fs');
const path = require('path');

/**
 * 차단 패턴
 */
const BLOCKED_OPERATIONS = {
  filesystem: {
    patterns: [
      /rm\s+-rf\s+[\/~]/,
      /rmdir.*\/s.*\/q/i,
      /del.*\/f.*\/s/i
    ],
    message: '시스템 파일 삭제는 차단됩니다.',
    severity: 'CRITICAL'
  },
  credentials: {
    patterns: [
      /EXPO_PUBLIC_FIREBASE.*=.*["'][^"']+["']/,
      /api[_-]?key\s*[:=]\s*["'][^"']+["']/i,
      /password\s*[:=]\s*["'][^"']+["']/i
    ],
    message: '하드코딩된 자격 증명은 차단됩니다.',
    severity: 'HIGH'
  },
  git: {
    patterns: [
      /git\s+push\s+--force\s+origin\s+(main|master)/i,
      /git\s+reset\s+--hard\s+origin/i
    ],
    message: 'main/master 강제 푸시는 차단됩니다.',
    severity: 'HIGH'
  }
};

/**
 * 경고 패턴
 */
const WARNING_OPERATIONS = {
  production: {
    patterns: [
      /eas\s+build.*--profile\s+production/i,
      /app\.json/i,
      /firebase.*config/i
    ],
    message: '프로덕션 관련 변경입니다. 주의하세요.'
  },
  dependencies: {
    patterns: [
      /npm\s+install|yarn\s+add/i,
      /package\.json/i
    ],
    message: '의존성 변경은 테스트 후 커밋하세요.'
  }
};

/**
 * 보호된 파일
 */
const PROTECTED_FILES = [
  'app.json',
  'firebase.config.ts',
  'eas.json',
  '.env',
  '.env.production'
];

/**
 * 윤리적 검증 수행
 */
function validateEthically(toolName, toolInput, context) {
  const result = {
    allowed: true,
    warnings: [],
    blockedReasons: []
  };

  const content = extractContent(toolName, toolInput);
  if (!content) {
    return result;
  }

  // 차단 패턴 검사
  for (const [category, config] of Object.entries(BLOCKED_OPERATIONS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(content)) {
        result.allowed = false;
        result.blockedReasons.push({
          category,
          severity: config.severity,
          message: config.message
        });
      }
    }
  }

  // 경고 패턴 검사
  for (const [category, config] of Object.entries(WARNING_OPERATIONS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(content)) {
        result.warnings.push({
          category,
          message: config.message
        });
      }
    }
  }

  // 보호된 파일 검사
  const filePath = toolInput.file_path || '';
  for (const protectedFile of PROTECTED_FILES) {
    if (filePath.includes(protectedFile)) {
      result.warnings.push({
        category: 'protected_file',
        message: `${protectedFile}은 보호된 파일입니다. 변경에 주의하세요.`
      });
    }
  }

  return result;
}

/**
 * 도구 입력에서 검증할 내용 추출
 */
function extractContent(toolName, toolInput) {
  switch (toolName.toLowerCase()) {
    case 'bash':
      return toolInput.command || '';
    case 'edit':
    case 'write':
      return (toolInput.content || '') + ' ' + (toolInput.file_path || '');
    default:
      return JSON.stringify(toolInput);
  }
}

/**
 * 검증 결과 포맷
 */
function formatValidationResult(result) {
  if (result.allowed && result.warnings.length === 0) {
    return null;
  }

  let message = '';

  if (!result.allowed) {
    message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    message += '🛑 BLOCKED - Safety Violation\n';
    message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

    for (const reason of result.blockedReasons) {
      message += `❌ [${reason.severity}] ${reason.category}\n`;
      message += `   ${reason.message}\n\n`;
    }
  }

  if (result.warnings.length > 0) {
    message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    message += '⚠️  WARNING - Review Required\n';
    message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

    for (const warning of result.warnings) {
      message += `⚠️  [${warning.category}] ${warning.message}\n`;
    }
  }

  message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  return message;
}

/**
 * PreToolUse Hook Entry Point
 */
async function onPreToolUse(event) {
  try {
    const { tool_name, tool_input } = event;
    const validationResult = validateEthically(tool_name, tool_input, {});

    if (!validationResult.allowed) {
      return {
        decision: 'block',
        message: formatValidationResult(validationResult)
      };
    }

    if (validationResult.warnings.length > 0) {
      console.log(formatValidationResult(validationResult));
    }

    return { decision: 'allow' };

  } catch (error) {
    console.error('[EthicalValidator] Error:', error.message);
    return { decision: 'allow' };
  }
}

module.exports = {
  onPreToolUse,
  validateEthically,
  formatValidationResult
};
