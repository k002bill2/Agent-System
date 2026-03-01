/**
 * Link Validator Hook (P4 Optimization)
 *
 * .claude/ 내 Markdown 파일 편집 시, 해당 파일의 상대 링크가 유효한지 검사합니다.
 * 깨진 링크를 즉시 감지하여 drift를 방지합니다.
 *
 * @version 1.0.0
 * @hook-config
 * {"event": "PostToolUse", "matcher": "Edit|Write", "command": "node .claude/hooks/linkValidator.js 2>/dev/null || true"}
 */

const fs = require('fs');
const path = require('path');

function main() {
  let inputData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { inputData += chunk; });
  process.stdin.on('end', () => {
    try {
      const event = inputData.trim() ? JSON.parse(inputData) : {};
      const filePath = event.tool_input?.file_path || '';

      // .claude/ 내 .md 파일만 검사
      if (!filePath.includes('.claude/') || !filePath.endsWith('.md')) {
        process.exit(0);
        return;
      }

      if (!fs.existsSync(filePath)) {
        process.exit(0);
        return;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const dir = path.dirname(filePath);

      // Markdown 링크 추출: [text](relative/path.md)
      const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
      const brokenLinks = [];
      let match;

      while ((match = linkRegex.exec(content)) !== null) {
        const linkTarget = match[2];

        // URL, 앵커, 절대경로는 스킵
        if (linkTarget.startsWith('http') ||
            linkTarget.startsWith('#') ||
            linkTarget.startsWith('/')) {
          continue;
        }

        // 앵커 제거
        const cleanTarget = linkTarget.split('#')[0];
        if (!cleanTarget) continue;

        const resolvedPath = path.resolve(dir, cleanTarget);

        if (!fs.existsSync(resolvedPath)) {
          brokenLinks.push({ text: match[1], target: cleanTarget });
        }
      }

      if (brokenLinks.length > 0) {
        console.log(`[LinkValidator] ⚠️ ${path.basename(filePath)}에서 깨진 링크 ${brokenLinks.length}개 발견:`);
        for (const link of brokenLinks.slice(0, 5)) {
          console.log(`  ❌ [${link.text}](${link.target})`);
        }
        if (brokenLinks.length > 5) {
          console.log(`  ... 외 ${brokenLinks.length - 5}개`);
        }
      }
    } catch (e) {
      // 링크 검증 실패는 무시
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000);
}

main();
