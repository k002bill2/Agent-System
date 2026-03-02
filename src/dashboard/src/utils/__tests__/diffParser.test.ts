import { describe, it, expect } from 'vitest'
import { parsePatch, calcDiffStats } from '../diffParser'
import type { DiffLine, ParsedHunk, DiffStats } from '../diffParser'

// ---------------------------------------------------------------------------
// parsePatch
// ---------------------------------------------------------------------------

describe('parsePatch', () => {
  describe('empty / trivial input', () => {
    it('returns empty array for empty string', () => {
      expect(parsePatch('')).toEqual([])
    })

    it('returns empty array for whitespace-only string', () => {
      expect(parsePatch('   \n  \n')).toEqual([])
    })

    it('returns empty array when there is no hunk header', () => {
      const patch = '--- a/file.ts\n+++ b/file.ts\n'
      expect(parsePatch(patch)).toEqual([])
    })

    it('ignores lines before the first hunk header', () => {
      const patch = [
        '--- a/src/foo.ts',
        '+++ b/src/foo.ts',
        '+ orphan addition line',
        ' orphan context line',
      ].join('\n')
      // No @@ header → nothing accumulated
      expect(parsePatch(patch)).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // File header skipping
  // -------------------------------------------------------------------------

  describe('file header skipping', () => {
    const HEADERS = [
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      'Index: src/foo.ts',
      '=================================================================',
      'diff --git a/src/foo.ts b/src/foo.ts',
    ]

    const HUNK = '@@ -1,1 +1,2 @@\n context\n+added\n'

    HEADERS.forEach((header) => {
      it(`skips "${header.slice(0, 30)}" header line`, () => {
        const patch = header + '\n' + HUNK
        const hunks = parsePatch(patch)
        expect(hunks).toHaveLength(1)
        // None of the DiffLines should contain the raw header text
        const allContent = hunks.flatMap((h) => h.lines.map((l) => l.content))
        expect(allContent.some((c) => c.startsWith('---') || c.startsWith('+++'))).toBe(false)
      })
    })
  })

  // -------------------------------------------------------------------------
  // Single hunk
  // -------------------------------------------------------------------------

  describe('single hunk', () => {
    const PATCH = [
      '@@ -1,3 +1,4 @@',
      ' context line one',
      '-removed line',
      '+added line',
      ' context line two',
    ].join('\n')

    it('returns exactly one hunk', () => {
      const hunks = parsePatch(PATCH)
      expect(hunks).toHaveLength(1)
    })

    it('preserves the full hunk header string', () => {
      const [hunk] = parsePatch(PATCH)
      expect(hunk.header).toBe('@@ -1,3 +1,4 @@')
    })

    it('produces the correct number of diff lines', () => {
      const [hunk] = parsePatch(PATCH)
      expect(hunk.lines).toHaveLength(4)
    })

    it('classifies context lines correctly', () => {
      const [hunk] = parsePatch(PATCH)
      const ctxLines = hunk.lines.filter((l) => l.type === 'context')
      expect(ctxLines).toHaveLength(2)
    })

    it('classifies remove lines correctly', () => {
      const [hunk] = parsePatch(PATCH)
      const removeLines = hunk.lines.filter((l) => l.type === 'remove')
      expect(removeLines).toHaveLength(1)
      expect(removeLines[0].content).toBe('removed line')
    })

    it('classifies add lines correctly', () => {
      const [hunk] = parsePatch(PATCH)
      const addLines = hunk.lines.filter((l) => l.type === 'add')
      expect(addLines).toHaveLength(1)
      expect(addLines[0].content).toBe('added line')
    })

    it('strips the leading +/-/space sigil from content', () => {
      const patch = '@@ -1,1 +1,1 @@\n+hello world\n'
      const [hunk] = parsePatch(patch)
      expect(hunk.lines[0].content).toBe('hello world')
    })
  })

  // -------------------------------------------------------------------------
  // Multiple hunks
  // -------------------------------------------------------------------------

  describe('multiple hunks', () => {
    const PATCH = [
      '@@ -1,2 +1,2 @@',
      ' context A',
      '-old A',
      '+new A',
      '@@ -10,2 +10,2 @@',
      ' context B',
      '-old B',
      '+new B',
    ].join('\n')

    it('returns two hunks', () => {
      expect(parsePatch(PATCH)).toHaveLength(2)
    })

    it('each hunk carries its own header', () => {
      const hunks = parsePatch(PATCH)
      expect(hunks[0].header).toBe('@@ -1,2 +1,2 @@')
      expect(hunks[1].header).toBe('@@ -10,2 +10,2 @@')
    })

    it('each hunk carries only its own lines', () => {
      const hunks = parsePatch(PATCH)
      expect(hunks[0].lines).toHaveLength(3)
      expect(hunks[1].lines).toHaveLength(3)
    })

    it('lines in the second hunk belong to the second hunk only', () => {
      const hunks = parsePatch(PATCH)
      const secondContents = hunks[1].lines.map((l) => l.content)
      expect(secondContents).toContain('context B')
      expect(secondContents).toContain('old B')
      expect(secondContents).toContain('new B')
    })
  })

  // -------------------------------------------------------------------------
  // Line numbering
  // -------------------------------------------------------------------------

  describe('line numbering', () => {
    it('add lines have newLineNumber, no oldLineNumber', () => {
      const patch = '@@ -5,1 +5,2 @@\n+line one\n+line two\n'
      const [hunk] = parsePatch(patch)
      const addLines = hunk.lines.filter((l) => l.type === 'add')
      addLines.forEach((l) => {
        expect(l.newLineNumber).toBeDefined()
        expect(l.oldLineNumber).toBeUndefined()
      })
    })

    it('remove lines have oldLineNumber, no newLineNumber', () => {
      const patch = '@@ -5,2 +5,1 @@\n-line one\n-line two\n'
      const [hunk] = parsePatch(patch)
      const removeLines = hunk.lines.filter((l) => l.type === 'remove')
      removeLines.forEach((l) => {
        expect(l.oldLineNumber).toBeDefined()
        expect(l.newLineNumber).toBeUndefined()
      })
    })

    it('context lines have both oldLineNumber and newLineNumber', () => {
      const patch = '@@ -3,1 +3,1 @@\n unchanged\n'
      const [hunk] = parsePatch(patch)
      const [ctx] = hunk.lines
      expect(ctx.oldLineNumber).toBeDefined()
      expect(ctx.newLineNumber).toBeDefined()
    })

    it('newLineNumber increments sequentially for add lines', () => {
      const patch = '@@ -1,0 +1,3 @@\n+alpha\n+beta\n+gamma\n'
      const [hunk] = parsePatch(patch)
      const nums = hunk.lines.map((l) => l.newLineNumber!)
      expect(nums[1]).toBe(nums[0] + 1)
      expect(nums[2]).toBe(nums[0] + 2)
    })

    it('oldLineNumber increments sequentially for remove lines', () => {
      const patch = '@@ -10,3 +10,0 @@\n-alpha\n-beta\n-gamma\n'
      const [hunk] = parsePatch(patch)
      const nums = hunk.lines.map((l) => l.oldLineNumber!)
      expect(nums[1]).toBe(nums[0] + 1)
      expect(nums[2]).toBe(nums[0] + 2)
    })

    it('starts oldLine and newLine from the numbers in the hunk header', () => {
      const patch = '@@ -20,1 +30,1 @@\n unchanged\n'
      const [hunk] = parsePatch(patch)
      const [ctx] = hunk.lines
      expect(ctx.oldLineNumber).toBe(20)
      expect(ctx.newLineNumber).toBe(30)
    })

    it('handles a hunk header without comma (single line range)', () => {
      // Some tools emit @@ -1 +1 @@ without a count
      const patch = '@@ -1 +1 @@\n unchanged\n'
      const hunks = parsePatch(patch)
      expect(hunks).toHaveLength(1)
      expect(hunks[0].lines[0].oldLineNumber).toBe(1)
      expect(hunks[0].lines[0].newLineNumber).toBe(1)
    })

    it('increments line counters across mixed add/remove/context in one hunk', () => {
      const patch = [
        '@@ -1,4 +1,4 @@',
        ' ctx',   // old=1, new=1
        '-rem',   // old=2
        '+add',   // new=2
        ' ctx2',  // old=3, new=3
      ].join('\n')
      const [hunk] = parsePatch(patch)
      const [ctx1, rem, add, ctx2] = hunk.lines
      expect(ctx1.oldLineNumber).toBe(1)
      expect(ctx1.newLineNumber).toBe(1)
      expect(rem.oldLineNumber).toBe(2)
      expect(add.newLineNumber).toBe(2)
      expect(ctx2.oldLineNumber).toBe(3)
      expect(ctx2.newLineNumber).toBe(3)
    })
  })

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles a blank line inside a hunk as a context line', () => {
      // A bare empty string in the diff represents a blank context line
      const patch = '@@ -1,2 +1,2 @@\n first\n\n second\n'
      const [hunk] = parsePatch(patch)
      // The empty string line should be treated as context
      const types = hunk.lines.map((l) => l.type)
      expect(types).toContain('context')
    })

    it('handles a hunk with only add lines', () => {
      // The trailing \n produces one empty-string context line; filter those out
      // to assert on the actual add lines
      const patch = '@@ -0,0 +1,2 @@\n+line1\n+line2\n'
      const [hunk] = parsePatch(patch)
      const nonEmptyLines = hunk.lines.filter((l) => l.content !== '' || l.type !== 'context')
      expect(nonEmptyLines.every((l) => l.type === 'add')).toBe(true)
      expect(nonEmptyLines).toHaveLength(2)
    })

    it('handles a hunk with only remove lines', () => {
      // Same trailing \n edge: filter empty context artefacts
      const patch = '@@ -1,2 +0,0 @@\n-line1\n-line2\n'
      const [hunk] = parsePatch(patch)
      const nonEmptyLines = hunk.lines.filter((l) => l.content !== '' || l.type !== 'context')
      expect(nonEmptyLines.every((l) => l.type === 'remove')).toBe(true)
      expect(nonEmptyLines).toHaveLength(2)
    })

    it('handles a hunk with only context lines', () => {
      const patch = '@@ -1,2 +1,2 @@\n line1\n line2\n'
      const [hunk] = parsePatch(patch)
      expect(hunk.lines.every((l) => l.type === 'context')).toBe(true)
    })

    it('content is empty string for an empty add line (+)', () => {
      const patch = '@@ -0,0 +1,1 @@\n+\n'
      const [hunk] = parsePatch(patch)
      expect(hunk.lines[0].content).toBe('')
    })

    it('content is empty string for an empty remove line (-)', () => {
      const patch = '@@ -1,1 +0,0 @@\n-\n'
      const [hunk] = parsePatch(patch)
      expect(hunk.lines[0].content).toBe('')
    })

    it('processes a full realistic patch with file headers and two hunks', () => {
      const patch = [
        'diff --git a/src/index.ts b/src/index.ts',
        'index abc123..def456 100644',
        '--- a/src/index.ts',
        '+++ b/src/index.ts',
        '@@ -1,3 +1,4 @@',
        ' import React from "react"',
        '+import { useState } from "react"',
        ' ',
        ' export default function App() {',
        '@@ -10,2 +11,3 @@',
        '-  return null',
        '+  const [count, setCount] = useState(0)',
        '+  return <div>{count}</div>',
        ' }',
      ].join('\n')

      const hunks = parsePatch(patch)
      expect(hunks).toHaveLength(2)

      const firstHunk = hunks[0]
      expect(firstHunk.lines.filter((l) => l.type === 'add')).toHaveLength(1)
      expect(firstHunk.lines.filter((l) => l.type === 'context')).toHaveLength(3)

      const secondHunk = hunks[1]
      expect(secondHunk.lines.filter((l) => l.type === 'remove')).toHaveLength(1)
      expect(secondHunk.lines.filter((l) => l.type === 'add')).toHaveLength(2)
      expect(secondHunk.lines.filter((l) => l.type === 'context')).toHaveLength(1)
    })
  })

  // -------------------------------------------------------------------------
  // Return type shape
  // -------------------------------------------------------------------------

  describe('return type shape', () => {
    it('returned objects satisfy ParsedHunk interface', () => {
      const patch = '@@ -1,1 +1,1 @@\n line\n'
      const hunks: ParsedHunk[] = parsePatch(patch)
      expect(typeof hunks[0].header).toBe('string')
      expect(Array.isArray(hunks[0].lines)).toBe(true)
    })

    it('each DiffLine has type, content, and optional line numbers', () => {
      const patch = '@@ -1,1 +1,1 @@\n unchanged\n'
      const hunks = parsePatch(patch)
      const line: DiffLine = hunks[0].lines[0]
      expect(['add', 'remove', 'context']).toContain(line.type)
      expect(typeof line.content).toBe('string')
    })
  })
})

// ---------------------------------------------------------------------------
// calcDiffStats
// ---------------------------------------------------------------------------

describe('calcDiffStats', () => {
  describe('empty / trivial input', () => {
    it('returns zeros for empty string', () => {
      const stats: DiffStats = calcDiffStats('')
      expect(stats).toEqual({ additions: 0, deletions: 0, files: 0 })
    })

    it('returns zeros for whitespace-only string', () => {
      expect(calcDiffStats('   \n  \n')).toEqual({ additions: 0, deletions: 0, files: 0 })
    })

    it('returns zeros for a diff with only context lines', () => {
      const diff = [
        'diff --git a/foo.ts b/foo.ts',
        '--- a/foo.ts',
        '+++ b/foo.ts',
        '@@ -1,1 +1,1 @@',
        ' unchanged',
      ].join('\n')
      const stats = calcDiffStats(diff)
      expect(stats.additions).toBe(0)
      expect(stats.deletions).toBe(0)
    })
  })

  describe('single file diff', () => {
    const DIFF = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -1,3 +1,4 @@',
      ' context',
      '-removed one',
      '-removed two',
      '+added one',
      '+added two',
      '+added three',
    ].join('\n')

    it('counts additions correctly', () => {
      expect(calcDiffStats(DIFF).additions).toBe(3)
    })

    it('counts deletions correctly', () => {
      expect(calcDiffStats(DIFF).deletions).toBe(2)
    })

    it('counts one file', () => {
      expect(calcDiffStats(DIFF).files).toBe(1)
    })
  })

  describe('multi-file diff', () => {
    const DIFF = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,1 +1,2 @@',
      '-old a',
      '+new a1',
      '+new a2',
      'diff --git a/src/b.ts b/src/b.ts',
      '--- a/src/b.ts',
      '+++ b/src/b.ts',
      '@@ -1,1 +1,1 @@',
      '-old b',
      '+new b',
      'diff --git a/src/c.ts b/src/c.ts',
      '--- a/src/c.ts',
      '+++ b/src/c.ts',
      '@@ -0,0 +1,2 @@',
      '+brand new 1',
      '+brand new 2',
    ].join('\n')

    it('counts total additions across all files', () => {
      // a: 2, b: 1, c: 2 → 5
      expect(calcDiffStats(DIFF).additions).toBe(5)
    })

    it('counts total deletions across all files', () => {
      // a: 1, b: 1, c: 0 → 2
      expect(calcDiffStats(DIFF).deletions).toBe(2)
    })

    it('counts the number of distinct files', () => {
      expect(calcDiffStats(DIFF).files).toBe(3)
    })
  })

  describe('file header line exclusion', () => {
    it('does not count +++ header as an addition', () => {
      const diff = [
        'diff --git a/x.ts b/x.ts',
        '--- a/x.ts',
        '+++ b/x.ts',
        '@@ -1,1 +1,1 @@',
        '+real addition',
      ].join('\n')
      expect(calcDiffStats(diff).additions).toBe(1)
    })

    it('does not count --- header as a deletion', () => {
      const diff = [
        'diff --git a/x.ts b/x.ts',
        '--- a/x.ts',
        '+++ b/x.ts',
        '@@ -1,1 +1,1 @@',
        '-real deletion',
      ].join('\n')
      expect(calcDiffStats(diff).deletions).toBe(1)
    })
  })

  describe('file path extraction', () => {
    it('extracts file path after "b/" in diff --git line', () => {
      const diff = 'diff --git a/path/to/file.ts b/path/to/file.ts\n'
      expect(calcDiffStats(diff).files).toBe(1)
    })

    it('does not double-count the same file appearing twice', () => {
      // Same b/ path repeated → Set de-duplicates
      const diff = [
        'diff --git a/same.ts b/same.ts',
        'diff --git a/same.ts b/same.ts',
      ].join('\n')
      expect(calcDiffStats(diff).files).toBe(1)
    })

    it('skips diff --git lines without a "b/" segment gracefully', () => {
      // Malformed line - should not throw, files stays 0
      const diff = 'diff --git a/only\n'
      expect(() => calcDiffStats(diff)).not.toThrow()
      expect(calcDiffStats(diff).files).toBe(0)
    })
  })

  describe('return type shape', () => {
    it('returned object satisfies DiffStats interface', () => {
      const stats: DiffStats = calcDiffStats('')
      expect(typeof stats.additions).toBe('number')
      expect(typeof stats.deletions).toBe('number')
      expect(typeof stats.files).toBe('number')
    })

    it('all values are non-negative integers', () => {
      const diff = [
        'diff --git a/x.ts b/x.ts',
        '--- a/x.ts',
        '+++ b/x.ts',
        '@@ -1,2 +1,1 @@',
        '-removed',
        '+added',
      ].join('\n')
      const { additions, deletions, files } = calcDiffStats(diff)
      expect(additions).toBeGreaterThanOrEqual(0)
      expect(deletions).toBeGreaterThanOrEqual(0)
      expect(files).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(additions)).toBe(true)
      expect(Number.isInteger(deletions)).toBe(true)
      expect(Number.isInteger(files)).toBe(true)
    })
  })
})
