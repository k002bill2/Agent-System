#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CLAUDE_DIR = path.join(process.cwd(), '.claude');

function parseComplexFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { data: {}, content };

  try {
    const yamlStr = match[1];
    const lines = yamlStr.split('\n');
    const result = {};
    const stack = [{ obj: result, indent: -1, lastKey: null }];

    for (const line of lines) {
      if (!line.trim()) continue;

      const indent = line.search(/\S/);
      const trimmed = line.trim();

      // Array item
      if (trimmed.startsWith('- ')) {
        // Find the parent that should contain this array item
        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
          stack.pop();
        }
        const parent = stack[stack.length - 1];
        const lastKey = parent.lastKey;

        if (lastKey) {
          // Ensure the key holds an array
          if (!Array.isArray(parent.obj[lastKey])) {
            parent.obj[lastKey] = [];
          }
          parent.obj[lastKey].push(trimmed.slice(2).trim().replace(/^["']|["']$/g, ''));
        }
        continue;
      }

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const key = trimmed.slice(0, colonIdx).trim();
        const value = trimmed.slice(colonIdx + 1).trim();

        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
          stack.pop();
        }
        const parent = stack[stack.length - 1];

        if (!value) {
          // Could be object or array - check next line
          parent.obj[key] = {};
          stack.push({ obj: parent.obj[key], indent, lastKey: key });
          parent.lastKey = key;
        } else {
          let parsedValue = value.replace(/^["']|["']$/g, '');
          if (parsedValue === 'true') parsedValue = true;
          else if (parsedValue === 'false') parsedValue = false;
          else if (/^\d+(\.\d+)?$/.test(parsedValue)) parsedValue = parseFloat(parsedValue);

          if (typeof parsedValue === 'string' && parsedValue.startsWith('[') && parsedValue.endsWith(']')) {
            parsedValue = parsedValue.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
          }

          parent.obj[key] = parsedValue;
          parent.lastKey = key;
        }
      }
    }

    return { data: result, content: content.slice(match[0].length).trim() };
  } catch (e) {
    return { data: {}, content };
  }
}

function syncSkills() {
  console.log('Skills sync...');

  const skillsDir = path.join(CLAUDE_DIR, 'skills');
  const rulesPath = path.join(CLAUDE_DIR, 'skill-rules.json');

  if (!fs.existsSync(skillsDir)) {
    console.log('   No skills directory found');
    return { synced: 0, errors: [] };
  }

  let existingRules = {};
  if (fs.existsSync(rulesPath)) {
    try {
      existingRules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
    } catch (e) {
      console.log('   Warning: Could not parse existing skill-rules.json');
    }
  }

  const skills = fs.readdirSync(skillsDir).filter(d =>
    fs.statSync(path.join(skillsDir, d)).isDirectory()
  );

  let synced = 0;
  const errors = [];

  for (const skillName of skills) {
    const skillPath = path.join(skillsDir, skillName, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;

    try {
      const content = fs.readFileSync(skillPath, 'utf-8');
      const { data } = parseComplexFrontmatter(content);

      if (data.triggers) {
        const rule = {
          type: data.type || 'skill',
          enforcement: data.enforcement || 'suggest',
          priority: data.priority || 'normal',
          description: data.description || skillName + ' skill',
          promptTriggers: {}
        };

        // Extract keywords array (handle nested object from parser)
        const keywords = data.triggers.keywords;
        if (keywords) {
          if (Array.isArray(keywords)) {
            rule.promptTriggers.keywords = keywords;
          } else if (keywords.keywords && Array.isArray(keywords.keywords)) {
            rule.promptTriggers.keywords = keywords.keywords;
          }
        }

        // Extract patterns array
        const patterns = data.triggers.patterns;
        if (patterns) {
          if (Array.isArray(patterns)) {
            rule.promptTriggers.intentPatterns = patterns;
          } else if (patterns.patterns && Array.isArray(patterns.patterns)) {
            rule.promptTriggers.intentPatterns = patterns.patterns;
          }
        }

        // Extract files array
        const files = data.triggers.files;
        if (files) {
          if (Array.isArray(files)) {
            rule.fileTriggers = { pathPatterns: files };
          } else if (files.files && Array.isArray(files.files)) {
            rule.fileTriggers = { pathPatterns: files.files };
          }
        }

        if (data.reminder) {
          rule.reminder = data.reminder;
        }

        existingRules[skillName] = rule;
        synced++;
        console.log('   + ' + skillName);
      }
    } catch (e) {
      errors.push({ skill: skillName, error: e.message });
    }
  }

  fs.writeFileSync(rulesPath, JSON.stringify(existingRules, null, 2) + '\n');

  console.log('   Synced: ' + synced + ' skills');
  return { synced, errors };
}

function syncAgents() {
  console.log('Agents sync...');

  const agentsDir = path.join(CLAUDE_DIR, 'agents');
  const registryPath = path.join(CLAUDE_DIR, 'agents-registry.json');

  if (!fs.existsSync(agentsDir)) {
    console.log('   No agents directory found');
    return { synced: 0, errors: [] };
  }

  const agentFiles = fs.readdirSync(agentsDir).filter(f =>
    f.endsWith('.md') && !fs.statSync(path.join(agentsDir, f)).isDirectory()
  );

  const registry = {
    _generated: new Date().toISOString(),
    _description: 'Auto-generated agent registry. Do not edit manually.',
    agents: {}
  };

  let synced = 0;
  const errors = [];

  for (const file of agentFiles) {
    const agentPath = path.join(agentsDir, file);

    try {
      const content = fs.readFileSync(agentPath, 'utf-8');
      const { data } = parseComplexFrontmatter(content);

      if (data.name) {
        registry.agents[data.name] = {
          file: '.claude/agents/' + file,
          description: data.description || '',
          tools: data.tools || '',
          model: data.model || 'sonnet',
          triggers: data.triggers || null
        };
        synced++;
        console.log('   + ' + data.name);
      }
    } catch (e) {
      errors.push({ file, error: e.message });
    }
  }

  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');

  console.log('   Synced: ' + synced + ' agents');
  return { synced, errors };
}

function syncHooks() {
  console.log('Hooks sync...');

  const hooksDir = path.join(CLAUDE_DIR, 'hooks');
  const hooksJsonPath = path.join(CLAUDE_DIR, 'hooks.json');

  if (!fs.existsSync(hooksDir)) {
    console.log('   No hooks directory found');
    return { synced: 0, errors: [] };
  }

  let hooksConfig = { hooks: {} };
  if (fs.existsSync(hooksJsonPath)) {
    try {
      hooksConfig = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf-8'));
    } catch (e) {
      console.log('   Warning: Could not parse existing hooks.json');
    }
  }

  const hookFiles = fs.readdirSync(hooksDir).filter(f => f.endsWith('.js'));

  let synced = 0;
  const errors = [];

  for (const file of hookFiles) {
    const hookPath = path.join(hooksDir, file);

    try {
      const content = fs.readFileSync(hookPath, 'utf-8');

      const configMatches = content.matchAll(/@hook-config\s*\n\s*\*\s*(\{[^}]+\})/g);
      for (const configMatch of configMatches) {
        try {
          const config = JSON.parse(configMatch[1].replace(/'/g, '"'));

          const event = config.event;
          const matcher = config.matcher || '';
          const command = config.command || 'node .claude/hooks/' + file + ' 2>/dev/null || true';

          if (!hooksConfig.hooks[event]) {
            hooksConfig.hooks[event] = [];
          }

          const existingIdx = hooksConfig.hooks[event].findIndex(h =>
            h.hooks && h.hooks.some(hk => hk.command && hk.command.includes(file))
          );

          if (existingIdx === -1) {
            hooksConfig.hooks[event].push({
              matcher,
              hooks: [{ type: 'command', command }]
            });
            synced++;
            console.log('   + ' + file + ' -> ' + event);
          } else {
            console.log('   - ' + file + ' (already registered)');
          }
        } catch (e) {
          errors.push({ file, error: 'Invalid @hook-config JSON' });
        }
      }
    } catch (e) {
      errors.push({ file, error: e.message });
    }
  }

  fs.writeFileSync(hooksJsonPath, JSON.stringify(hooksConfig, null, 2) + '\n');

  console.log('   Synced: ' + synced + ' hooks');
  return { synced, errors };
}

function syncAll() {
  console.log('Syncing all registries...\n');

  const results = {
    skills: syncSkills(),
    agents: syncAgents(),
    hooks: syncHooks()
  };

  console.log('\n========================================');
  console.log('Sync Summary');
  console.log('========================================');
  console.log('Skills: ' + results.skills.synced + ' synced');
  console.log('Agents: ' + results.agents.synced + ' synced');
  console.log('Hooks:  ' + results.hooks.synced + ' synced');

  const totalErrors = [
    ...results.skills.errors,
    ...results.agents.errors,
    ...results.hooks.errors
  ];

  if (totalErrors.length > 0) {
    console.log('\nErrors:');
    totalErrors.forEach(e => console.log('   - ' + (e.skill || e.file) + ': ' + e.error));
  }

  return results;
}

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('\nRegistry Sync Script for AOS Claude Code\n');
  console.log('Usage: node .claude/scripts/sync-registry.js [options]\n');
  console.log('Options:');
  console.log('  --skills    Sync skills only');
  console.log('  --agents    Sync agents only');
  console.log('  --hooks     Sync hooks only');
  console.log('  --all       Sync all (default)');
  process.exit(0);
}

if (args.includes('--skills') && !args.includes('--agents') && !args.includes('--hooks')) {
  syncSkills();
} else if (args.includes('--agents') && !args.includes('--skills') && !args.includes('--hooks')) {
  syncAgents();
} else if (args.includes('--hooks') && !args.includes('--skills') && !args.includes('--agents')) {
  syncHooks();
} else if (args.length === 0 || args.includes('--all')) {
  syncAll();
} else {
  if (args.includes('--skills')) syncSkills();
  if (args.includes('--agents')) syncAgents();
  if (args.includes('--hooks')) syncHooks();
}
