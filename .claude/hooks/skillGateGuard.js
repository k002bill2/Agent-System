/**
 * Skill Gate Guard — 스킬 라우팅 강제
 *
 * 두 가지 역할을 하나의 스크립트로 수행:
 *
 * 1) PostToolUse:Skill — 호출된 스킬명을 마커 파일에 기록
 *    매칭: Skill 도구 사용 후
 *
 * 2) PreToolUse:Edit|Write — 파일 타입에 맞는 스킬이 호출되었는지 확인
 *    매칭: Edit|Write 도구 사용 전
 *
 * 스킬 요구사항 (aos-workflow.md 기반):
 *   - .tsx/.ts 파일 편집 → react-web-development 스킬 필요
 *   - .test.tsx/.spec.tsx 작성 → test-automation 스킬 필요
 *
 * 차단 조건: 필수 스킬이 세션 내에서 한 번도 호출되지 않은 경우
 * 쿨다운: 파일 타입별 1회 경고 후 5분간 재차단 안 함
 *
 * @version 1.0.0
 * @hook-config (2개 훅에서 공유)
 * PostToolUse:Skill → node .claude/hooks/skillGateGuard.js
 * PreToolUse:Edit|Write → node .claude/hooks/skillGateGuard.js
 */

const fs = require('fs');
const path = require('path');

const MARKER_DIR = '/tmp/claude-skill-gate';
const COOLDOWN_DIR = '/tmp/claude-skill-gate-cooldown';
const COOLDOWN_SECONDS = 300;

// 파일 패턴 → 필수 스킬 매핑
const SKILL_REQUIREMENTS = [
  {
    pattern: /src\/dashboard\/src\/.*\.tsx$/,
    exclude: /\.(test|spec)\.tsx$/,
    skill: 'react-web-development',
    label: 'React 컴포넌트',
  },
  {
    pattern: /\.(test|spec)\.(tsx|ts)$/,
    exclude: null,
    skill: 'test-automation',
    label: '테스트 파일',
  },
];

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
}

function isSkillInvoked(skillName) {
  const markerFile = path.join(MARKER_DIR, skillName);
  return fs.existsSync(markerFile);
}

function recordSkill(skillName) {
  ensureDir(MARKER_DIR);
  fs.writeFileSync(
    path.join(MARKER_DIR, skillName),
    String(Math.floor(Date.now() / 1000))
  );
}

function isInCooldown(key) {
  const hash = Buffer.from(key).toString('base64url').slice(0, 32);
  const file = path.join(COOLDOWN_DIR, hash);
  if (fs.existsSync(file)) {
    try {
      const ts = parseInt(fs.readFileSync(file, 'utf8'), 10);
      if (Date.now() / 1000 - ts < COOLDOWN_SECONDS) return true;
    } catch { /* ignore */ }
  }
  return false;
}

function setCooldown(key) {
  ensureDir(COOLDOWN_DIR);
  const hash = Buffer.from(key).toString('base64url').slice(0, 32);
  fs.writeFileSync(
    path.join(COOLDOWN_DIR, hash),
    String(Math.floor(Date.now() / 1000))
  );
}

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const event = JSON.parse(input);
      const toolName = event.tool_name || '';

      // ── 모드 1: Skill 호출 기록 (PostToolUse:Skill) ──
      if (toolName === 'Skill') {
        const skillName = event.tool_input?.skill || '';
        if (skillName) {
          recordSkill(skillName);
        }
        return process.exit(0);
      }

      // ── 모드 2: 스킬 게이트 (PreToolUse:Edit|Write) ──
      const filePath = event.tool_input?.file_path || '';
      if (!filePath) return process.exit(0);

      for (const req of SKILL_REQUIREMENTS) {
        if (!req.pattern.test(filePath)) continue;
        if (req.exclude && req.exclude.test(filePath)) continue;

        // 이미 스킬이 호출되었으면 통과
        if (isSkillInvoked(req.skill)) continue;

        // 쿨다운 체크
        const cooldownKey = `${req.skill}:${req.label}`;
        if (isInCooldown(cooldownKey)) continue;

        // BLOCK: 필수 스킬 미호출
        setCooldown(cooldownKey);
        const basename = path.basename(filePath);
        console.log(
          `\n[BLOCKED] Skill Gate: ${req.label} 편집에 '${req.skill}' 스킬이 필요합니다.\n` +
          `파일: ${basename}\n` +
          `ACTION: Skill('${req.skill}') 을 먼저 호출하세요.\n`
        );
        return process.exit(2);
      }

      process.exit(0);
    } catch {
      process.exit(0);
    }
  });
  setTimeout(() => process.exit(0), 3000);
}

main();
