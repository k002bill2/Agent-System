#!/usr/bin/env node
/**
 * Auto Commit & Push Hook
 *
 * Stop 이벤트 발생 시 변경사항이 있으면 자동으로 커밋+푸시합니다.
 *
 * 환경변수:
 *   AUTO_PUSH=false    - 자동 푸시 비활성화
 *   QUICK_PUSH=1       - 빠른 푸시 (lint만)
 */

const { execSync } = require('child_process');
const path = require('path');

const REPO_ROOT = execSync('git rev-parse --show-toplevel', {
  encoding: 'utf-8',
  cwd: __dirname,
}).trim();

function run(cmd, options = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      cwd: REPO_ROOT,
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options,
    }).trim();
  } catch (error) {
    if (!options.ignoreError) throw error;
    return '';
  }
}

function hasChanges() {
  const status = run('git status --porcelain', { silent: true });
  return status.length > 0;
}

function getUnpushedCommits() {
  const result = run('git log origin/$(git branch --show-current)..HEAD --oneline', {
    silent: true,
    ignoreError: true,
  });
  return result.split('\n').filter(Boolean);
}

async function main() {
  // AUTO_PUSH=false면 스킵
  if (process.env.AUTO_PUSH === 'false') {
    console.log('⏭️  AUTO_PUSH=false, 자동 푸시 스킵');
    return;
  }

  const changes = hasChanges();
  const unpushed = getUnpushedCommits();

  // 변경사항도 없고 푸시할 커밋도 없으면 스킵
  if (!changes && unpushed.length === 0) {
    console.log('✅ 변경사항 없음, 자동 푸시 스킵');
    return;
  }

  console.log('\n🤖 Auto Commit & Push 시작...\n');

  // 1. Unstaged 변경사항이 있으면 커밋
  if (changes) {
    console.log('📝 변경사항 커밋 중...');
    run('git add -A');

    const message = `chore: auto-commit by Claude Code\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`;
    run(`git commit -m "${message}"`);
    console.log('✅ 커밋 완료\n');
  }

  // 2. 푸시
  console.log('🚀 푸시 중...');

  // QUICK_PUSH 환경변수 상속
  const pushEnv = process.env.QUICK_PUSH === '1' ? 'QUICK_PUSH=1 ' : '';

  try {
    run(`${pushEnv}git push origin $(git branch --show-current)`);
    console.log('✅ 푸시 완료!\n');
  } catch (error) {
    console.error('❌ 푸시 실패:', error.message);
    console.error('💡 수동으로 푸시하세요: git push\n');
    process.exit(0); // 훅은 실패해도 프로세스 계속
  }
}

main().catch(error => {
  console.error('❌ Auto Commit & Push 실패:', error.message);
  process.exit(0);
});
