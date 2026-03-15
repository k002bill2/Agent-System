/**
 * PreToolUse:Bash Hook - 위험한 쉘 명령어 차단
 * ACE Framework의 윤리적 검증 레이어로, 시스템 파괴적 명령을 사전 차단
 *
 * v2.0: regex 우회 방지 강화 (flag 순서 무관, pipe 대상 확장, base64 감지)
 *
 * Exit codes:
 *   0 = 허용 (정상 실행)
 *   2 = 차단 (도구 실행 중단)
 *
 * @hook-config
 * {"event": "PreToolUse", "matcher": "Bash", "command": "node .claude/hooks/ethicalValidator.js", "timeout": 3}
 */

const BLOCKED_PATTERNS = [
  // 파일 시스템 파괴 (flag 순서/조합 무관)
  { pattern: /\brm\s+(-\w+\s+)*\//,                    label: 'rm with root path' },
  { pattern: /\brm\s+(-\w+\s+)*~/,                     label: 'rm with home path' },
  // 데이터베이스 파괴
  { pattern: /DROP\s+(TABLE|DATABASE|SCHEMA)/i,         label: 'DROP TABLE/DATABASE' },
  { pattern: /TRUNCATE\s+TABLE/i,                       label: 'TRUNCATE TABLE' },
  // 셸 폭탄/위험 명령
  { pattern: /:\s*\(\s*\)\s*\{/,                        label: 'fork bomb' },
  { pattern: /\bmkfs\b/,                                label: 'mkfs (format disk)' },
  { pattern: /\bdd\s+if=/,                              label: 'dd if= (raw disk write)' },
  { pattern: />\s*\/dev\/[sh]d/,                        label: '> /dev/sd (disk overwrite)' },
  // 위험한 권한 변경
  { pattern: /\bchmod\s+(-\w+\s+)*777\s+\//,            label: 'chmod 777 on root' },
  // 원격 코드 실행 (sh, bash, zsh, dash 모두 차단, 파이프 공백 무관)
  { pattern: /\bcurl\b.*\|\s*(sh|bash|zsh|dash)\b/,     label: 'curl pipe to shell' },
  { pattern: /\bwget\b.*\|\s*(sh|bash|zsh|dash)\b/,     label: 'wget pipe to shell' },
  // base64 인코딩 우회 감지
  { pattern: /base64\s+(-d|--decode).*\|\s*(sh|bash)\b/, label: 'base64 decode pipe to shell' },
  // eval/exec 기반 우회
  { pattern: /\beval\s.*\$\(/,                           label: 'eval with command substitution' },
];

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const event = JSON.parse(input);
      const command = (event.tool_input && event.tool_input.command) || '';
      if (!command) return process.exit(0);

      for (const { pattern, label } of BLOCKED_PATTERNS) {
        if (pattern.test(command)) {
          process.stderr.write(
            `[ACE Ethical Validator] BLOCKED: "${label}" detected.\n` +
            `Command: ${command.slice(0, 120)}${command.length > 120 ? '...' : ''}\n`
          );
          return process.exit(2);
        }
      }
      process.exit(0);
    } catch {
      process.exit(0);
    }
  });
  setTimeout(() => process.exit(0), 3000);
}

main();
