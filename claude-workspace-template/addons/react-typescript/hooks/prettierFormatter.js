#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');

// Read tool input from stdin
let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const filePath = data?.tool_input?.file_path;
    if (!filePath) process.exit(0);

    const ext = filePath.split('.').pop();
    if (!['ts', 'tsx', 'js', 'jsx', 'json'].includes(ext)) process.exit(0);
    if (!fs.existsSync(filePath)) process.exit(0);

    execSync(`npx prettier --write "${filePath}"`, { stdio: 'ignore', timeout: 10000 });
  } catch (e) {
    // Silent fail
  }
  process.exit(0);
});
