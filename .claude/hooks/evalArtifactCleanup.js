/**
 * SessionEnd Hook - eval 아티팩트 자동 정리
 *
 * eval 실행 후 남는 worktrees, orphaned branches, 오래된 results를 정리.
 * - agent-* 패턴의 worktree만 대상 (feature-frontend 등 보호)
 * - locked worktree 건너뜀
 * - 현재 프로세스가 실행 중인 worktree 보호
 * - 30일 이상 된 results 디렉토리 삭제
 *
 * Exit codes:
 *   0 = 정리 완료 (항상)
 *
 * @hook-config
 * {"event": "SessionEnd", "matcher": "", "command": "node .claude/hooks/evalArtifactCleanup.js", "timeout": 30}
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const MAX_RESULTS_AGE_DAYS = 30

/**
 * Find the main git repository root (not worktree root).
 */
function findRepoRoot() {
  try {
    const toplevel = execSync('git rev-parse --show-toplevel 2>/dev/null', {
      encoding: 'utf8', timeout: 3000
    }).trim()

    const gitCommonDir = execSync('git rev-parse --git-common-dir 2>/dev/null', {
      encoding: 'utf8', timeout: 3000, cwd: toplevel
    }).trim()

    return path.resolve(toplevel, gitCommonDir, '..')
  } catch {
    return null
  }
}

/**
 * Get the worktree path that the current process is running from.
 * This worktree must never be removed.
 */
function getCurrentWorktreePath() {
  try {
    return execSync('git rev-parse --show-toplevel 2>/dev/null', {
      encoding: 'utf8', timeout: 3000
    }).trim()
  } catch {
    return null
  }
}

/**
 * Parse `git worktree list --porcelain` into structured blocks.
 * Each block: { path, head, branch, locked }
 */
function parseWorktrees(repoRoot) {
  try {
    const output = execSync('git worktree list --porcelain 2>/dev/null', {
      encoding: 'utf8', timeout: 5000, cwd: repoRoot
    })

    const blocks = output.split('\n\n').filter(Boolean)
    return blocks.map(block => {
      const lines = block.split('\n')
      const entry = { path: '', head: '', branch: '', locked: false }

      for (const line of lines) {
        if (line.startsWith('worktree ')) entry.path = line.slice(9)
        else if (line.startsWith('HEAD ')) entry.head = line.slice(5)
        else if (line.startsWith('branch ')) entry.branch = line.slice(7)
        else if (line === 'locked' || line.startsWith('locked ')) entry.locked = true
      }

      return entry
    })
  } catch {
    return []
  }
}

/**
 * Remove agent-* worktrees that are not locked and not current.
 * Returns count of removed worktrees.
 */
function cleanWorktrees(repoRoot, currentWorktree) {
  const worktrees = parseWorktrees(repoRoot)

  const targets = worktrees.filter(wt => {
    const dirName = path.basename(wt.path)
    if (!dirName.startsWith('agent-')) return false
    if (wt.locked) return false
    if (currentWorktree && wt.path === currentWorktree) return false
    return true
  })

  if (targets.length === 0) return 0

  process.stderr.write(
    `[Artifact Cleanup] Worktrees to remove: ${targets.map(wt => path.basename(wt.path)).join(', ')}\n`
  )

  let removed = 0
  for (const wt of targets) {
    try {
      execSync(`git worktree remove --force "${wt.path}" 2>/dev/null`, {
        encoding: 'utf8', timeout: 15000, cwd: repoRoot
      })
      removed++
    } catch {
      process.stderr.write(
        `[Artifact Cleanup] Failed to remove worktree: ${path.basename(wt.path)}\n`
      )
    }
  }

  // Prune stale worktree references
  try {
    execSync('git worktree prune 2>/dev/null', {
      encoding: 'utf8', timeout: 5000, cwd: repoRoot
    })
  } catch {
    // Ignore prune failures
  }

  return removed
}

/**
 * Remove orphaned worktree-agent-* branches with no corresponding worktree.
 * Returns count of removed branches.
 */
function cleanOrphanedBranches(repoRoot) {
  try {
    const branchOutput = execSync(
      "git branch --list 'worktree-agent-*' --format='%(refname:short)' 2>/dev/null",
      { encoding: 'utf8', timeout: 5000, cwd: repoRoot }
    ).trim()

    if (!branchOutput) return 0

    const branches = branchOutput.split('\n').filter(Boolean)

    // Get remaining worktrees to check for orphans
    const worktrees = parseWorktrees(repoRoot)
    const activeWorktreeBranches = new Set(
      worktrees.map(wt => wt.branch.replace('refs/heads/', ''))
    )

    let removed = 0
    for (const branch of branches) {
      if (activeWorktreeBranches.has(branch)) continue

      try {
        execSync(`git branch -D "${branch}" 2>/dev/null`, {
          encoding: 'utf8', timeout: 5000, cwd: repoRoot
        })
        removed++
      } catch {
        // Branch deletion failed — skip
      }
    }

    return removed
  } catch {
    return 0
  }
}

/**
 * Remove eval results directories older than maxAgeDays.
 * Handles date formats: YYYY-MM-DD and YYYY-MM-DD-suffix (e.g., 2026-02-13-r2).
 * Returns count of removed directories.
 */
function cleanOldResults(repoRoot, maxAgeDays = MAX_RESULTS_AGE_DAYS) {
  const resultsDir = path.join(repoRoot, '.claude', 'evals', 'results')
  if (!fs.existsSync(resultsDir)) return 0

  const now = Date.now()
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
  const datePattern = /^(\d{4}-\d{2}-\d{2})/

  let removed = 0
  try {
    const entries = fs.readdirSync(resultsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const match = entry.name.match(datePattern)
      if (!match) continue

      const dirDate = new Date(match[1])
      if (isNaN(dirDate.getTime())) continue

      const ageMs = now - dirDate.getTime()
      if (ageMs <= maxAgeMs) continue

      const dirPath = path.join(resultsDir, entry.name)
      try {
        fs.rmSync(dirPath, { recursive: true, force: true })
        removed++
      } catch {
        // Removal failed — skip
      }
    }
  } catch {
    // Directory read failed
  }

  return removed
}

// ── Main ─────────────────────────────────────

function main() {
  const repoRoot = findRepoRoot()
  if (!repoRoot) {
    process.exit(0)
  }

  const currentWorktree = getCurrentWorktreePath()

  const worktrees = cleanWorktrees(repoRoot, currentWorktree)
  const branches = cleanOrphanedBranches(repoRoot)
  const results = cleanOldResults(repoRoot)

  const total = worktrees + branches + results
  if (total > 0) {
    process.stderr.write(
      `[Artifact Cleanup] Removed: ${worktrees} worktree(s), ${branches} branch(es), ${results} old result(s)\n`
    )
  }
}

main()
process.exit(0)
