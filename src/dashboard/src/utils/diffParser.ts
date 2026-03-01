/**
 * Shared diff parser utility.
 * Extracts parsePatch from DiffViewer for reuse across components.
 */

export interface DiffLine {
  type: 'add' | 'remove' | 'context'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

export interface ParsedHunk {
  header: string
  lines: DiffLine[]
}

export interface DiffStats {
  additions: number
  deletions: number
  files: number
}

/**
 * Parse a unified diff patch into renderable hunks.
 */
export function parsePatch(patch: string): ParsedHunk[] {
  const lines = patch.split('\n')
  const hunks: ParsedHunk[] = []

  let currentHunk: ParsedHunk | null = null
  let oldLine = 0
  let newLine = 0

  for (const line of lines) {
    // Skip file headers
    if (
      line.startsWith('---') ||
      line.startsWith('+++') ||
      line.startsWith('Index:') ||
      line.startsWith('===') ||
      line.startsWith('diff --git')
    ) {
      continue
    }

    // Hunk header
    const hunkMatch = line.match(/^@@ -(\d+),?\d* \+(\d+),?\d* @@(.*)$/)
    if (hunkMatch) {
      currentHunk = {
        header: line,
        lines: [],
      }
      hunks.push(currentHunk)
      oldLine = parseInt(hunkMatch[1], 10)
      newLine = parseInt(hunkMatch[2], 10)
      continue
    }

    if (!currentHunk) continue

    if (line.startsWith('+')) {
      currentHunk.lines.push({
        type: 'add',
        content: line.slice(1),
        newLineNumber: newLine++,
      })
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({
        type: 'remove',
        content: line.slice(1),
        oldLineNumber: oldLine++,
      })
    } else if (line.startsWith(' ') || line === '') {
      currentHunk.lines.push({
        type: 'context',
        content: line.slice(1) || '',
        oldLineNumber: oldLine++,
        newLineNumber: newLine++,
      })
    }
  }

  return hunks
}

/**
 * Calculate diff statistics from a unified diff string.
 */
export function calcDiffStats(diff: string): DiffStats {
  const lines = diff.split('\n')
  let additions = 0
  let deletions = 0
  const files = new Set<string>()

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/b\/(.+)$/)
      if (match) files.add(match[1])
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++
    }
  }

  return { additions, deletions, files: files.size }
}
