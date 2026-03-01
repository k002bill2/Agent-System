/**
 * Ethical Validator Hook for AOS Dashboard
 * 위험 작업 사전 차단 (PreToolUse)
 *
 * @version 1.0.0-AOS Dashboard
 *
 * @hook-config
 * {"event": "PreToolUse", "matcher": "Bash", "command": "node .claude/hooks/ethicalValidator.js 2>/dev/null || true"}
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
      /git\s+reset\s+--hard\s+origin/i,
      /git\s+branch\s+-D\s+(main|master)/i
    ],
    message: 'main/master 강제 푸시/리셋/삭제는 차단됩니다.',
    severity: 'HIGH'
  },
  database: {
    patterns: [
      /DROP\s+(TABLE|DATABASE|SCHEMA)\s+/i,
      /TRUNCATE\s+TABLE/i,
      /DELETE\s+FROM\s+\w+(?!\s+WHERE)\s*[;\s]?$/im  // WHERE 없는 전체 삭제 (세미콜론 유무 무관)
    ],
    message: '파괴적 DB 작업은 차단됩니다. WHERE 조건을 사용하세요.',
    severity: 'CRITICAL'
  },
  secrets: {
    patterns: [
      /-----BEGIN\s+(RSA |EC |DSA )?PRIVATE KEY-----/,
      /AKIA[0-9A-Z]{16}/,  // AWS Access Key
      /ghp_[A-Za-z0-9_]{36}/  // GitHub Personal Token
    ],
    message: '시크릿/키가 코드에 포함되어 있습니다.',
    severity: 'CRITICAL'
  },
  dangerous_commands: {
    patterns: [
      /curl\s+.*\|\s*(ba)?sh/i,       // curl | bash (원격 코드 실행)
      /wget\s+.*\|\s*(ba)?sh/i,       // wget | bash
      /chmod\s+777\s+/,               // 과도한 권한 부여
      /sudo\s+rm\s/i,                 // sudo rm
      /npm\s+publish/i,               // 패키지 퍼블리시
      /docker\s+rm\s+-f/i,            // 컨테이너 강제 삭제
      /kubectl\s+delete\s+(ns|namespace|pod|deploy)/i  // K8s 리소스 삭제
    ],
    message: '위험한 시스템 명령이 감지되었습니다.',
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

// CLI entry point for hook system
if (require.main === module) {
  let inputData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { inputData += chunk; });
  process.stdin.on('end', () => {
    try {
      const event = JSON.parse(inputData);
      const result = validateEthically(event.tool_name || '', event.tool_input || {}, {});

      if (!result.allowed) {
        // ACE Layer 1: 윤리적 거부 — 차단 결정을 JSON으로 반환
        const blockResponse = {
          decision: 'block',
          reason: result.blockedReasons.map(r => `[${r.severity}] ${r.message}`).join('; ')
        };
        process.stdout.write(JSON.stringify(blockResponse));

        // feedback-loop.js 제거됨 — 차단 이벤트는 stdout JSON으로 충분
      } else {
        const message = formatValidationResult(result);
        if (message) {
          process.stderr.write(message);
        }
      }
    } catch (e) { /* ignore parse errors */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000);
}
