/**
 * SessionStart/SessionEnd Hook - eval 실행 잔여 임시 파일 정리
 *
 * run_loop.py / run_eval.py가 타임아웃이나 비정상 종료 시
 * .claude/commands/ 에 남기는 *-skill-*.md 임시 파일을 자동 삭제.
 *
 * Exit codes:
 *   0 = 정리 완료 (항상)
 *
 * @hook-config
 * {"event": "SessionStart|SessionEnd", "matcher": "", "command": "node .claude/hooks/evalCleanup.js", "timeout": 5}
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

/**
 * Find all .claude/commands/ directories to clean.
 * Includes: current project root, git main worktree root, and all worktree roots.
 */
function findCommandsDirs() {
  const dirs = new Set()

  // 1. Walk up from cwd to find .claude/
  let dir = process.cwd()
  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, '.claude', 'commands')
    if (fs.existsSync(candidate)) {
      dirs.add(candidate)
      break
    }
    dir = path.dirname(dir)
  }

  // 2. Find git toplevel (main worktree) — covers cases where cwd is a worktree
  try {
    const toplevel = execSync('git rev-parse --show-toplevel 2>/dev/null', {
      encoding: 'utf8', timeout: 3000
    }).trim()
    const mainCommands = path.join(toplevel, '.claude', 'commands')
    if (fs.existsSync(mainCommands)) dirs.add(mainCommands)

    // 3. Also check if we're in a worktree — get the main repo root
    const gitCommonDir = execSync('git rev-parse --git-common-dir 2>/dev/null', {
      encoding: 'utf8', timeout: 3000, cwd: toplevel
    }).trim()
    const mainRoot = path.resolve(toplevel, gitCommonDir, '..')
    const mainRootCommands = path.join(mainRoot, '.claude', 'commands')
    if (fs.existsSync(mainRootCommands)) dirs.add(mainRootCommands)
  } catch {
    // Not in a git repo, skip
  }

  return [...dirs]
}

function cleanup() {
  const commandsDirs = findCommandsDirs()
  const pattern = /-skill-[0-9a-f]{8}\.md$/
  let cleaned = 0

  for (const commandsDir of commandsDirs) {
    try {
      const files = fs.readdirSync(commandsDir)
      for (const file of files) {
        if (pattern.test(file)) {
          try {
            fs.unlinkSync(path.join(commandsDir, file))
            cleaned++
          } catch {
            // Ignore permission errors
          }
        }
      }
    } catch {
      // Directory read failed, skip
    }
  }

  if (cleaned > 0) {
    process.stderr.write(
      `[Eval Cleanup] Removed ${cleaned} orphaned eval command file(s)\n`
    )
  }
}

cleanup()
process.exit(0)
