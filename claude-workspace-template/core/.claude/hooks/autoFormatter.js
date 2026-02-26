/**
 * Auto Formatter Hook (Generalized)
 * Automatically formats files after Edit/Write operations (PostToolUse)
 *
 * Supports multiple languages out of the box:
 *   .ts, .tsx, .js, .jsx, .json  -> npx prettier --write
 *   .py                           -> ruff format (fallback: black)
 *   .go                           -> gofmt -w
 *   .rs                           -> rustfmt
 *
 * Configuration:
 *   If `claude-workspace.yaml` contains `commands.format`, that command
 *   is used as an override for ALL file types. The placeholder `{file}`
 *   in the command string is replaced with the actual file path.
 *
 * @hook-config
 * {"event": "PostToolUse", "matcher": "Edit|Write", "command": "node .claude/hooks/autoFormatter.js 2>/dev/null || true"}
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

function loadFormatOverride() {
  const configPaths = [
    path.join(process.cwd(), 'claude-workspace.yaml'),
    path.join(process.cwd(), 'claude-workspace.yml')
  ];

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const override = parseFormatCommand(raw);
        if (override) return override;
      }
    } catch (e) { /* ignore */ }
  }

  return null;
}

/**
 * Minimal YAML parser for commands.format value.
 */
function parseFormatCommand(yamlContent) {
  const lines = yamlContent.split('\n');
  let inCommands = false;

  for (const line of lines) {
    const trimmed = line.trimEnd();

    if (/^commands\s*:/.test(trimmed)) {
      inCommands = true;
      continue;
    }

    if (inCommands) {
      const match = trimmed.match(/^\s+format\s*:\s*['"]?(.+?)['"]?\s*$/);
      if (match) {
        return match[1];
      }
      // If we hit another top-level key, stop
      if (/^\S/.test(trimmed) && !/^commands\s*:/.test(trimmed)) {
        break;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Formatter definitions (per extension)
// ---------------------------------------------------------------------------

const FORMATTERS = {
  // JavaScript / TypeScript / JSON -> Prettier
  '.ts':   { cmd: 'npx prettier --write "{file}"', name: 'Prettier' },
  '.tsx':  { cmd: 'npx prettier --write "{file}"', name: 'Prettier' },
  '.js':   { cmd: 'npx prettier --write "{file}"', name: 'Prettier' },
  '.jsx':  { cmd: 'npx prettier --write "{file}"', name: 'Prettier' },
  '.json': { cmd: 'npx prettier --write "{file}"', name: 'Prettier' },

  // Python -> ruff format, fallback to black
  '.py': {
    cmd: 'ruff format "{file}"',
    fallback: 'black "{file}"',
    name: 'ruff format',
    fallbackName: 'black'
  },

  // Go -> gofmt
  '.go': { cmd: 'gofmt -w "{file}"', name: 'gofmt' },

  // Rust -> rustfmt
  '.rs': { cmd: 'rustfmt "{file}"', name: 'rustfmt' }
};

// ---------------------------------------------------------------------------
// Formatting logic
// ---------------------------------------------------------------------------

function runFormatter(filePath, ext) {
  const formatOverride = loadFormatOverride();

  // If there is a config override, use it for all files
  if (formatOverride) {
    const cmd = formatOverride.replace(/\{file\}/g, filePath);
    try {
      execSync(cmd, { stdio: 'pipe', timeout: 30000 });
      return { formatted: true, formatter: 'config override' };
    } catch (e) {
      return { formatted: false, error: 'Config override command failed' };
    }
  }

  const formatter = FORMATTERS[ext];
  if (!formatter) {
    return { formatted: false, skipped: true };
  }

  // Try primary command
  const primaryCmd = formatter.cmd.replace(/\{file\}/g, filePath);
  try {
    execSync(primaryCmd, { stdio: 'pipe', timeout: 30000 });
    return { formatted: true, formatter: formatter.name };
  } catch (e) {
    // Try fallback if available
    if (formatter.fallback) {
      const fallbackCmd = formatter.fallback.replace(/\{file\}/g, filePath);
      try {
        execSync(fallbackCmd, { stdio: 'pipe', timeout: 30000 });
        return { formatted: true, formatter: formatter.fallbackName };
      } catch (e2) {
        return { formatted: false, error: `Neither ${formatter.name} nor ${formatter.fallbackName} available` };
      }
    }
    return { formatted: false, error: `${formatter.name} not available` };
  }
}

// ---------------------------------------------------------------------------
// Hook entry point
// ---------------------------------------------------------------------------

async function onPostToolUse(event) {
  try {
    if (event.tool !== 'Write' && event.tool !== 'Edit') {
      return { success: true, skipped: true };
    }

    const filePath = event.parameters?.file_path;

    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }

    const ext = path.extname(filePath).toLowerCase();
    const result = runFormatter(filePath, ext);

    if (result.skipped) {
      return { success: true, skipped: true };
    }

    if (result.formatted) {
      console.log(`[AutoFormatter] Formatted ${path.basename(filePath)} with ${result.formatter}`);
    } else if (result.error) {
      console.log(`[AutoFormatter] ${result.error} for ${path.basename(filePath)}`);
    }

    return { success: true, results: result };

  } catch (error) {
    console.error('[AutoFormatter] Error:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { onPostToolUse };

// CLI entry point for hook system
if (require.main === module) {
  let inputData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { inputData += chunk; });
  process.stdin.on('end', () => {
    try {
      const event = JSON.parse(inputData);
      const toolInput = event.tool_input || {};
      const filePath = toolInput.file_path;

      if (!filePath || !fs.existsSync(filePath)) {
        process.exit(0);
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const result = runFormatter(filePath, ext);

      if (result.formatted) {
        process.stderr.write(`[AutoFormatter] Formatted ${path.basename(filePath)} with ${result.formatter}\n`);
      }
    } catch (e) { /* ignore parse errors */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 30000);
}
