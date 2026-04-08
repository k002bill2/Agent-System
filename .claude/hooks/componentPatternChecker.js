/**
 * PostToolUse:Write|Edit Hook - React Component Pattern Checker
 *
 * .tsx 컴포넌트 파일 수정 후 필수 패턴을 검사합니다:
 *   1) React.memo() 래핑 여부
 *   2) displayName 설정 여부
 *   3) dark: Tailwind 변형 존재 여부
 *   4) 인터랙티브 요소의 aria-label 존재 여부
 *
 * type: "prompt" (자기감시) → type: "command" (외부 검증) 전환
 *
 * 위반 2개 이상 시 exit 2 (차단), 1개는 경고만
 *
 * @version 1.0.0
 * @hook-config
 * {"event": "PostToolUse", "matcher": "Write|Edit", "command": "node .claude/hooks/componentPatternChecker.js", "timeout": 5}
 */

const fs = require('fs');
const path = require('path');

const VIOLATION_THRESHOLD = 1;

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const event = JSON.parse(input);
      const filePath = event.tool_input?.file_path || '';

      // .tsx 컴포넌트 파일만 대상
      if (!filePath.endsWith('.tsx')) return process.exit(0);
      if (!filePath.includes('src/dashboard/src/')) return process.exit(0);

      // 제외 대상
      if (filePath.includes('.test.') || filePath.includes('.spec.')) return process.exit(0);
      if (filePath.endsWith('index.tsx')) return process.exit(0);
      if (filePath.includes('/types/') || filePath.includes('/styles/')) return process.exit(0);
      if (filePath.includes('.config.') || filePath.includes('vite')) return process.exit(0);
      if (filePath.endsWith('main.tsx') || filePath.endsWith('App.tsx')) return process.exit(0);

      if (!fs.existsSync(filePath)) return process.exit(0);

      const content = fs.readFileSync(filePath, 'utf8');
      const fileName = path.basename(filePath, '.tsx');
      const violations = [];

      // 1) React.memo() 래핑 확인
      const hasDefaultExport = /export\s+default/.test(content);
      const hasMemo = /React\.memo\(|memo\(/.test(content);
      if (hasDefaultExport && !hasMemo) {
        violations.push(`memo() 미사용 — export default를 React.memo()로 래핑하세요`);
      }

      // 2) displayName 확인
      const hasDisplayName = /\.displayName\s*=/.test(content) || /displayName:/.test(content);
      if (hasDefaultExport && !hasDisplayName) {
        violations.push(`displayName 미설정 — Component.displayName = '${fileName}' 추가하세요`);
      }

      // 3) dark: Tailwind 변형 확인
      // bg-, text-, border- 클래스가 있는데 대응하는 dark: 변형이 없는 경우
      const bgClasses = content.match(/(?<!\w)bg-\w+/g) || [];
      const hasDarkBg = /dark:bg-/.test(content);
      const textClasses = content.match(/(?<!\w)text-(?:white|black|gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+/g) || [];
      const hasDarkText = /dark:text-/.test(content);

      if (bgClasses.length > 0 && !hasDarkBg) {
        violations.push(`dark: 변형 누락 — bg- 클래스에 대응하는 dark:bg- 추가하세요`);
      }
      if (textClasses.length > 0 && !hasDarkText) {
        violations.push(`dark: 변형 누락 — text- 컬러에 대응하는 dark:text- 추가하세요`);
      }

      // 4) aria-label 확인 (인터랙티브 요소)
      const interactiveElements = content.match(/<(button|input|select|textarea|a)\b[^>]*>/g) || [];
      const missingAria = interactiveElements.filter(el => {
        return !el.includes('aria-label') && !el.includes('aria-labelledby') && !el.includes('aria-describedby');
      });
      if (missingAria.length > 0) {
        violations.push(`aria-label 누락 — ${missingAria.length}개 인터랙티브 요소에 aria-label 추가하세요`);
      }

      if (violations.length === 0) {
        return process.exit(0);
      }

      const violationList = violations.map((v, i) => `  ${i + 1}. ${v}`).join('\n');

      if (violations.length >= VIOLATION_THRESHOLD) {
        console.log(
          `\n[BLOCKED] Component Pattern: ${fileName}.tsx — ${violations.length}개 위반 (threshold: ${VIOLATION_THRESHOLD})\n` +
          `${violationList}\n` +
          `ACTION: 위반 사항을 수정한 후 다시 저장하세요.\n`
        );
        process.exit(2);
      } else {
        console.log(
          `\n[WARNING] Component Pattern: ${fileName}.tsx — ${violations.length}개 위반\n` +
          `${violationList}\n`
        );
        process.exit(0);
      }
    } catch {
      process.exit(0);
    }
  });
  setTimeout(() => process.exit(0), 5000);
}

main();
