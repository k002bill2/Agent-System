import { describe, it, expect } from 'vitest'
import {
  GROUP_RULES,
  groupFilesByPattern,
  generateCommitMessage,
  getGroupStats,
  draftCommitsToFileGroups,
} from '../gitGrouping'
import type { GitStatusFile, DraftCommit } from '../../stores/git'

// Helper to create mock files
function mockFile(path: string, status: GitStatusFile['status'] = 'modified'): GitStatusFile {
  return { path, status, staged: false, old_path: null }
}

describe('GROUP_RULES', () => {
  it('matches backend API files', () => {
    const rule = GROUP_RULES.find(r => r.pattern.test('src/backend/api/routes.py'))
    expect(rule?.group).toBe('Backend API')
    expect(rule?.type).toBe('feat')
    expect(rule?.scope).toBe('api')
  })

  it('matches dashboard component files', () => {
    const rule = GROUP_RULES.find(r => r.pattern.test('src/dashboard/src/components/Sidebar.tsx'))
    expect(rule?.group).toBe('Dashboard Components')
  })

  it('matches dashboard store files', () => {
    const rule = GROUP_RULES.find(r => r.pattern.test('src/dashboard/src/stores/workflows.ts'))
    expect(rule?.group).toBe('Dashboard Stores')
  })

  it('matches claude config files', () => {
    const rule = GROUP_RULES.find(r => r.pattern.test('.claude/settings.json'))
    expect(rule?.group).toBe('Claude Config')
  })

  it('matches test files', () => {
    const rule = GROUP_RULES.find(r => r.pattern.test('tests/backend/test_api.py'))
    expect(rule?.group).toBe('Tests')
  })
})

describe('generateCommitMessage', () => {
  it('generates message with scope', () => {
    const files = [mockFile('src/backend/api/routes.py', 'modified')]
    const msg = generateCommitMessage('feat', 'api', files, 'Backend API')
    expect(msg).toBe('feat(api): update 1 file')
  })

  it('generates message without scope', () => {
    const files = [mockFile('tests/test.py', 'modified')]
    const msg = generateCommitMessage('test', '', files, 'Tests')
    expect(msg).toBe('test: update 1 file')
  })

  it('uses feat type for all new files', () => {
    const files = [mockFile('src/backend/api/new.py', 'added')]
    const msg = generateCommitMessage('feat', 'api', files, 'Backend API')
    expect(msg).toContain('feat(api)')
    expect(msg).toContain('add 1 new file')
  })

  it('uses refactor type for all deleted files', () => {
    const files = [
      mockFile('src/old.py', 'deleted'),
      mockFile('src/legacy.py', 'deleted'),
    ]
    const msg = generateCommitMessage('feat', 'api', files, 'Backend API')
    expect(msg).toContain('refactor(api)')
    expect(msg).toContain('remove 2 files')
  })

  it('preserves docs type for new doc files', () => {
    const files = [mockFile('.claude/skills/new.md', 'added')]
    const msg = generateCommitMessage('docs', 'skills', files, 'Claude Skills')
    expect(msg).toContain('docs(skills)')
  })
})

describe('groupFilesByPattern', () => {
  it('groups files by matching rules', () => {
    const files = [
      mockFile('src/backend/api/routes.py'),
      mockFile('src/backend/api/auth.py'),
      mockFile('src/dashboard/src/components/Sidebar.tsx'),
    ]

    const groups = groupFilesByPattern(files)
    const apiGroup = groups.find(g => g.name === 'Backend API')
    const componentGroup = groups.find(g => g.name === 'Dashboard Components')

    expect(apiGroup?.files).toHaveLength(2)
    expect(componentGroup?.files).toHaveLength(1)
  })

  it('puts unmatched files in Other Changes group', () => {
    const files = [
      mockFile('README.md'),
      mockFile('package.json'),
    ]

    const groups = groupFilesByPattern(files)
    const otherGroup = groups.find(g => g.name === 'Other Changes')

    expect(otherGroup).toBeDefined()
    expect(otherGroup?.files).toHaveLength(2)
  })

  it('returns empty array for no files', () => {
    expect(groupFilesByPattern([])).toEqual([])
  })

  it('sorts groups by name', () => {
    const files = [
      mockFile('tests/test.py'),
      mockFile('src/backend/api/routes.py'),
      mockFile('docs/README.md'),
    ]

    const groups = groupFilesByPattern(files)
    const names = groups.map(g => g.name)
    expect(names).toEqual([...names].sort())
  })

  it('generates suggestedCommit for each group', () => {
    const files = [mockFile('src/backend/api/routes.py', 'modified')]
    const groups = groupFilesByPattern(files)

    expect(groups[0].suggestedCommit).toBeTruthy()
    expect(groups[0].suggestedCommit).toContain('api')
  })
})

describe('getGroupStats', () => {
  it('counts all status types', () => {
    const files = [
      mockFile('a.ts', 'modified'),
      mockFile('b.ts', 'modified'),
      mockFile('c.ts', 'added'),
      mockFile('d.ts', 'deleted'),
      mockFile('e.ts', 'renamed'),
      mockFile('f.ts', 'untracked'),
    ]

    const stats = getGroupStats(files)
    expect(stats).toEqual({
      modified: 2,
      added: 1,
      deleted: 1,
      renamed: 1,
      untracked: 1,
    })
  })

  it('returns zeros for empty files', () => {
    const stats = getGroupStats([])
    expect(stats).toEqual({
      modified: 0,
      added: 0,
      deleted: 0,
      renamed: 0,
      untracked: 0,
    })
  })
})

describe('draftCommitsToFileGroups', () => {
  const allFiles: GitStatusFile[] = [
    mockFile('src/backend/api/routes.py', 'modified'),
    mockFile('src/backend/services/auth.py', 'added'),
    mockFile('tests/test_api.py', 'added'),
  ]

  it('converts drafts to file groups', () => {
    const drafts: DraftCommit[] = [
      {
        type: 'feat',
        scope: 'api',
        message: 'feat(api): add auth routes',
        files: ['src/backend/api/routes.py', 'src/backend/services/auth.py'],
      },
    ]

    const groups = draftCommitsToFileGroups(drafts, allFiles)
    expect(groups.length).toBeGreaterThanOrEqual(1)

    const apiGroup = groups.find(g => g.suggestedCommit === 'feat(api): add auth routes')
    expect(apiGroup).toBeDefined()
    expect(apiGroup?.files).toHaveLength(2)
    expect(apiGroup?.isLLMGenerated).toBe(true)
  })

  it('creates Other Changes group for unincluded files', () => {
    const drafts: DraftCommit[] = [
      {
        type: 'feat',
        scope: 'api',
        message: 'feat(api): update routes',
        files: ['src/backend/api/routes.py'],
      },
    ]

    const groups = draftCommitsToFileGroups(drafts, allFiles)
    const otherGroup = groups.find(g => g.name === 'Other Changes')

    expect(otherGroup).toBeDefined()
    expect(otherGroup?.files).toHaveLength(2) // auth.py and test_api.py
    expect(otherGroup?.isLLMGenerated).toBe(false)
  })

  it('creates placeholder for files not in allFiles', () => {
    const drafts: DraftCommit[] = [
      {
        type: 'feat',
        scope: 'api',
        message: 'feat(api): update',
        files: ['nonexistent/file.py'],
      },
    ]

    const groups = draftCommitsToFileGroups(drafts, allFiles)
    const group = groups.find(g => g.isLLMGenerated)
    expect(group?.files[0].path).toBe('nonexistent/file.py')
    expect(group?.files[0].status).toBe('modified') // placeholder default
  })
})
