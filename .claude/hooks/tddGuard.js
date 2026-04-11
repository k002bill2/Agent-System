/**
 * PreToolUse:Edit|Write Hook - TDD Guard 차단
 *
 * src/dashboard/src/ 내 컴포넌트 파일(.tsx, 비테스트) 편집 시
 * 같은 디렉토리에 테스트 파일(.test.tsx)이 존재하지 않으면
 * 편집을 차단(exit 2)합니다.
 *
 * v2.0: WARN → BLOCK 전환
 *   - 테스트 파일 없이 구현 코드 수정 → exit 2 (차단)
 *   - 테스트 파일 존재 또는 스킵 대상 → exit 0 (통과)
 *
 * Exit codes:
 *   0 = 통과
 *   2 = 차단 (테스트 먼저 필요)
 *
 * @version 2.0.0
 * @hook-config
 * {"event": "PreToolUse", "matcher": "Edit|Write", "command": "node .claude/hooks/tddGuard.js", "timeout": 3}
 */

const fs = require('fs');
const path = require('path');

const SKIP_PATTERNS = [
  /\/pages\//,
  /\/types\//,
  /\/styles\//,
  /index\.tsx?$/,
  /main\.tsx$/,
  /App\.tsx$/,
  /vite/,
  /\.config\./,
  /\.d\.ts$/,
  /\/hooks\/use[A-Z]/, // 커스텀 훅 (테스트 작성 복잡)
  /\/lib\//,           // 유틸리티 라이브러리
  /\/providers\//,     // Context providers
];

const COOLDOWN_DIR = '/tmp/claude-tdd-guard';
const COOLDOWN_SECONDS = 300;

function isInCooldown(filePath) {
  const hash = Buffer.from(filePath).toString('base64url').slice(0, 32);
  const cooldownFile = path.join(COOLDOWN_DIR, hash);
  if (fs.existsSync(cooldownFile)) {
    try {
      const lastWarn = parseInt(fs.readFileSync(cooldownFile, 'utf8'), 10);
      if (Date.now() / 1000 - lastWarn < COOLDOWN_SECONDS) return true;
    } catch { /* ignore */ }
  }
  return false;
}

function setCooldown(filePath) {
  fs.mkdirSync(COOLDOWN_DIR, { recursive: true });
  const hash = Buffer.from(filePath).toString('base64url').slice(0, 32);
  fs.writeFileSync(path.join(COOLDOWN_DIR, hash), String(Math.floor(Date.now() / 1000)));
}

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const event = JSON.parse(input);
      const filePath = (event.tool_input && event.tool_input.file_path) || '';
      if (!filePath) return process.exit(0);

      // dashboard src 내 .tsx 파일만 대상
      if (!filePath.includes('src/dashboard/src/') || !filePath.endsWith('.tsx')) {
        return process.exit(0);
      }

      // 테스트 파일 자체는 건너뜀
      if (filePath.includes('.test.') || filePath.includes('.spec.')) {
        return process.exit(0);
      }

      // 스킵 패턴 확인
      if (SKIP_PATTERNS.some(pattern => pattern.test(filePath))) {
        return process.exit(0);
      }

      // 쿨다운 확인 (같은 파일 반복 차단 방지)
      if (isInCooldown(filePath)) {
        return process.exit(0);
      }

      // 테스트 파일 존재 확인
      const dir = path.dirname(filePath);
      const basename = path.basename(filePath, '.tsx');
      const testFile = path.join(dir, `${basename}.test.tsx`);
      const specFile = path.join(dir, `${basename}.spec.tsx`);
      const testsDir = path.join(dir, '__tests__');
      const testInDir = path.join(testsDir, `${basename}.test.tsx`);

      if (fs.existsSync(testFile) || fs.existsSync(specFile) || fs.existsSync(testInDir)) {
        return process.exit(0);
      }

      // BLOCK: 테스트 없이 구현 코드 수정 시도
      setCooldown(filePath);
      console.log(
        `\n[BLOCKED] TDD Guard: 테스트 파일이 없습니다 — ${basename}.tsx\n` +
        `예상 테스트 파일: ${basename}.test.tsx\n` +
        `ACTION: 테스트를 먼저 작성하세요. /tdd 명령 사용 권장.\n`
      );
      process.exit(2);
    } catch {
      process.exit(0);
    }
  });
  setTimeout(() => process.exit(0), 3000);
}

main();
