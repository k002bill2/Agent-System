#!/usr/bin/env node
/**
 * SubagentStop hook: Extract and persist agent learnings.
 *
 * Parses [LEARNING:agent-name] category: description from subagent output
 * and appends to .claude/agent-memory/learnings.md with deduplication.
 */

const fs = require('fs');
const path = require('path');

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const data = JSON.parse(input);
  const result = data.result || '';

  const learningPattern = /\[LEARNING:([^\]]+)\]\s*([\w-]+)\s*:\s*(.+)/g;
  const learnings = [];
  let match;

  while ((match = learningPattern.exec(result)) !== null) {
    learnings.push({
      agent: match[1].trim(),
      category: match[2].trim(),
      description: match[3].trim(),
    });
  }

  if (learnings.length === 0) return;

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const memoryDir = path.join(projectDir, '.claude', 'agent-memory');
  const memoryFile = path.join(memoryDir, 'learnings.md');

  fs.mkdirSync(memoryDir, { recursive: true });

  const header = `# Agent Learnings

> SubagentStop 훅이 자동 기록하는 학습 로그.
> 포맷: [날짜] **에이전트** \`카테고리\`: 설명

`;

  let existing = '';
  if (fs.existsSync(memoryFile)) {
    existing = fs.readFileSync(memoryFile, 'utf-8');
  } else {
    fs.writeFileSync(memoryFile, header);
    existing = header;
  }

  const date = new Date().toISOString().split('T')[0];
  const newEntries = learnings.filter((l) => {
    const needle = `\`${l.category}\`: ${l.description}`;
    return !existing.includes(needle);
  });

  if (newEntries.length === 0) return;

  const lines = newEntries
    .map((l) => `- [${date}] **${l.agent}** \`${l.category}\`: ${l.description}`)
    .join('\n');

  fs.appendFileSync(memoryFile, lines + '\n');
}

main().catch(() => {});
