#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');

let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const filePath = data?.tool_input?.file_path;
    if (!filePath || !filePath.endsWith('.py')) process.exit(0);
    if (!fs.existsSync(filePath)) process.exit(0);

    try {
      execSync(`ruff format "${filePath}"`, { stdio: 'ignore', timeout: 10000 });
    } catch {
      // Fallback to black
      try {
        execSync(`black "${filePath}"`, { stdio: 'ignore', timeout: 10000 });
      } catch {
        // Neither available, skip
      }
    }
  } catch (e) {
    // Silent fail
  }
  process.exit(0);
});
