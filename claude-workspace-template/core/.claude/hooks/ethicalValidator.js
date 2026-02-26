/**
 * Ethical Validator Hook (Generalized)
 * Blocks dangerous operations before execution (PreToolUse)
 *
 * Configuration:
 *   Reads `claude-workspace.yaml` from project root for `hooks.protected_paths`.
 *   Falls back to defaults if config not found.
 *
 * @hook-config
 * {"event": "PreToolUse", "matcher": "Bash", "command": "node .claude/hooks/ethicalValidator.js 2>/dev/null || true"}
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

const DEFAULT_PROTECTED_PATHS = ['.env', 'secrets', '.git/', '/prod/'];

function loadConfig() {
  const configPaths = [
    path.join(process.cwd(), 'claude-workspace.yaml'),
    path.join(process.cwd(), 'claude-workspace.yml')
  ];

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        // Lightweight YAML parsing for hooks.protected_paths (array of strings)
        const protectedPaths = parseProtectedPaths(raw);
        if (protectedPaths) {
          return { protectedPaths };
        }
      }
    } catch (e) { /* ignore */ }
  }

  return { protectedPaths: DEFAULT_PROTECTED_PATHS };
}

/**
 * Minimal YAML parser for hooks.protected_paths list.
 * Avoids requiring a full YAML library.
 */
function parseProtectedPaths(yamlContent) {
  const lines = yamlContent.split('\n');
  let inHooks = false;
  let inProtectedPaths = false;
  const paths = [];

  for (const line of lines) {
    const trimmed = line.trimEnd();

    if (/^hooks\s*:/.test(trimmed)) {
      inHooks = true;
      inProtectedPaths = false;
      continue;
    }

    if (inHooks && /^\s+protected_paths\s*:/.test(trimmed)) {
      inProtectedPaths = true;
      continue;
    }

    if (inProtectedPaths) {
      const match = trimmed.match(/^\s+-\s+['"]?(.+?)['"]?\s*$/);
      if (match) {
        paths.push(match[1]);
      } else if (trimmed && !/^\s+#/.test(trimmed)) {
        // End of list
        break;
      }
    }

    // If we hit a new top-level key, stop
    if (inHooks && /^\S/.test(trimmed) && !/^hooks\s*:/.test(trimmed)) {
      break;
    }
  }

  return paths.length > 0 ? paths : null;
}

const CONFIG = loadConfig();

// ---------------------------------------------------------------------------
// Blocked patterns (stack-agnostic)
// ---------------------------------------------------------------------------

const BLOCKED_OPERATIONS = {
  filesystem: {
    patterns: [
      /rm\s+-rf\s+[\/~]/,
      /rmdir.*\/s.*\/q/i,
      /del.*\/f.*\/s/i
    ],
    message: 'Destructive filesystem deletion is blocked.',
    severity: 'CRITICAL'
  },
  credentials: {
    patterns: [
      /api[_-]?key\s*[:=]\s*["'][^"']+["']/i,
      /password\s*[:=]\s*["'][^"']+["']/i,
      /secret[_-]?key\s*[:=]\s*["'][^"']+["']/i
    ],
    message: 'Hardcoded credentials detected and blocked.',
    severity: 'HIGH'
  },
  git: {
    patterns: [
      /git\s+push\s+--force\s+origin\s+(main|master)/i,
      /git\s+reset\s+--hard\s+origin/i,
      /git\s+branch\s+-D\s+(main|master)/i
    ],
    message: 'Force push/reset/delete on main/master is blocked.',
    severity: 'HIGH'
  },
  database: {
    patterns: [
      /DROP\s+(TABLE|DATABASE|SCHEMA)\s+/i,
      /TRUNCATE\s+TABLE/i,
      /DELETE\s+FROM\s+\w+(?!\s+WHERE)\s*[;\s]?$/im
    ],
    message: 'Destructive DB operations are blocked. Use WHERE clauses.',
    severity: 'CRITICAL'
  },
  secrets: {
    patterns: [
      /-----BEGIN\s+(RSA |EC |DSA )?PRIVATE KEY-----/,
      /AKIA[0-9A-Z]{16}/,
      /ghp_[A-Za-z0-9_]{36}/
    ],
    message: 'Secret/key detected in code.',
    severity: 'CRITICAL'
  },
  dangerous_commands: {
    patterns: [
      /curl\s+.*\|\s*(ba)?sh/i,
      /wget\s+.*\|\s*(ba)?sh/i,
      /chmod\s+777\s+/,
      /sudo\s+rm\s/i,
      /npm\s+publish/i,
      /docker\s+rm\s+-f/i,
      /kubectl\s+delete\s+(ns|namespace|pod|deploy)/i
    ],
    message: 'Dangerous system command detected.',
    severity: 'HIGH'
  }
};

// ---------------------------------------------------------------------------
// Warning patterns
// ---------------------------------------------------------------------------

const WARNING_OPERATIONS = {
  production: {
    patterns: [
      /--profile\s+production/i,
      /--prod\b/i,
      /NODE_ENV\s*=\s*production/i
    ],
    message: 'Production-related change detected. Review carefully.'
  },
  dependencies: {
    patterns: [
      /npm\s+install|yarn\s+add|pip\s+install|cargo\s+add/i
    ],
    message: 'Dependency changes should be tested before committing.'
  }
};

// ---------------------------------------------------------------------------
// Core validation
// ---------------------------------------------------------------------------

function validateEthically(toolName, toolInput) {
  const result = {
    allowed: true,
    warnings: [],
    blockedReasons: []
  };

  const content = extractContent(toolName, toolInput);
  if (!content) {
    return result;
  }

  // Check blocked patterns
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

  // Check warning patterns
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

  // Check protected paths (from config or defaults)
  const filePath = toolInput.file_path || '';
  for (const protectedPath of CONFIG.protectedPaths) {
    if (filePath.includes(protectedPath)) {
      result.warnings.push({
        category: 'protected_path',
        message: `"${protectedPath}" is a protected path. Proceed with caution.`
      });
    }
  }

  return result;
}

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

function formatValidationResult(result) {
  if (result.allowed && result.warnings.length === 0) {
    return null;
  }

  let message = '';

  if (!result.allowed) {
    message += '-------------------------------------------\n';
    message += 'BLOCKED - Safety Violation\n';
    message += '-------------------------------------------\n\n';

    for (const reason of result.blockedReasons) {
      message += `[${reason.severity}] ${reason.category}\n`;
      message += `  ${reason.message}\n\n`;
    }
  }

  if (result.warnings.length > 0) {
    message += '-------------------------------------------\n';
    message += 'WARNING - Review Required\n';
    message += '-------------------------------------------\n\n';

    for (const warning of result.warnings) {
      message += `[${warning.category}] ${warning.message}\n`;
    }
  }

  message += '-------------------------------------------\n';
  return message;
}

// ---------------------------------------------------------------------------
// Hook entry points
// ---------------------------------------------------------------------------

async function onPreToolUse(event) {
  try {
    const { tool_name, tool_input } = event;
    const validationResult = validateEthically(tool_name, tool_input);

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
      const result = validateEthically(event.tool_name || '', event.tool_input || {});

      if (!result.allowed) {
        const blockResponse = {
          decision: 'block',
          reason: result.blockedReasons.map(r => `[${r.severity}] ${r.message}`).join('; ')
        };
        process.stdout.write(JSON.stringify(blockResponse));
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
