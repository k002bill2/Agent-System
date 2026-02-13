import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDiffStore, processFileChangedEvent } from '../diff'

function resetStore() {
  useDiffStore.setState({
    entries: [],
    selectedEntryId: null,
    viewMode: 'split',
  })
}

describe('diff store', () => {
  beforeEach(() => {
    resetStore()
  })

  // ── Initial State ──────────────────────────────────────

  describe('initial state', () => {
    it('has empty entries', () => {
      expect(useDiffStore.getState().entries).toEqual([])
    })

    it('has no selected entry', () => {
      expect(useDiffStore.getState().selectedEntryId).toBeNull()
    })

    it('has split view mode by default', () => {
      expect(useDiffStore.getState().viewMode).toBe('split')
    })
  })

  // ── addEntry ───────────────────────────────────────────

  describe('addEntry', () => {
    it('adds entry with generated id and createdAt', () => {
      useDiffStore.getState().addEntry({
        taskId: 'task-1',
        filePath: 'src/index.ts',
        oldContent: 'old',
        newContent: 'new',
        status: 'pending',
      })

      const entries = useDiffStore.getState().entries
      expect(entries).toHaveLength(1)
      expect(entries[0].id).toMatch(/^diff-/)
      expect(entries[0].createdAt).toBeTruthy()
      expect(entries[0].taskId).toBe('task-1')
      expect(entries[0].filePath).toBe('src/index.ts')
    })

    it('appends multiple entries', () => {
      const { addEntry } = useDiffStore.getState()

      addEntry({ taskId: 't1', filePath: 'a.ts', oldContent: '', newContent: '', status: 'pending' })
      addEntry({ taskId: 't2', filePath: 'b.ts', oldContent: '', newContent: '', status: 'pending' })

      expect(useDiffStore.getState().entries).toHaveLength(2)
    })
  })

  // ── removeEntry ────────────────────────────────────────

  describe('removeEntry', () => {
    it('removes entry by id', () => {
      useDiffStore.getState().addEntry({
        taskId: 't1', filePath: 'a.ts', oldContent: '', newContent: '', status: 'pending',
      })
      const id = useDiffStore.getState().entries[0].id

      useDiffStore.getState().removeEntry(id)
      expect(useDiffStore.getState().entries).toHaveLength(0)
    })

    it('clears selectedEntryId if removed entry was selected', () => {
      useDiffStore.getState().addEntry({
        taskId: 't1', filePath: 'a.ts', oldContent: '', newContent: '', status: 'pending',
      })
      const id = useDiffStore.getState().entries[0].id
      useDiffStore.getState().selectEntry(id)

      useDiffStore.getState().removeEntry(id)
      expect(useDiffStore.getState().selectedEntryId).toBeNull()
    })

    it('preserves selectedEntryId if other entry removed', () => {
      const { addEntry } = useDiffStore.getState()
      addEntry({ taskId: 't1', filePath: 'a.ts', oldContent: '', newContent: '', status: 'pending' })
      addEntry({ taskId: 't2', filePath: 'b.ts', oldContent: '', newContent: '', status: 'pending' })

      const entries = useDiffStore.getState().entries
      useDiffStore.getState().selectEntry(entries[0].id)
      useDiffStore.getState().removeEntry(entries[1].id)

      expect(useDiffStore.getState().selectedEntryId).toBe(entries[0].id)
    })
  })

  // ── clearEntries ───────────────────────────────────────

  describe('clearEntries', () => {
    it('clears all entries and selection', () => {
      useDiffStore.getState().addEntry({
        taskId: 't1', filePath: 'a.ts', oldContent: '', newContent: '', status: 'pending',
      })
      const id = useDiffStore.getState().entries[0].id
      useDiffStore.getState().selectEntry(id)

      useDiffStore.getState().clearEntries()

      expect(useDiffStore.getState().entries).toEqual([])
      expect(useDiffStore.getState().selectedEntryId).toBeNull()
    })
  })

  // ── updateEntryStatus ──────────────────────────────────

  describe('updateEntryStatus', () => {
    it('updates status of entry', () => {
      useDiffStore.getState().addEntry({
        taskId: 't1', filePath: 'a.ts', oldContent: '', newContent: '', status: 'pending',
      })
      const id = useDiffStore.getState().entries[0].id

      useDiffStore.getState().updateEntryStatus(id, 'rejected')

      expect(useDiffStore.getState().entries[0].status).toBe('rejected')
    })

    it('sets appliedAt when status is applied', () => {
      useDiffStore.getState().addEntry({
        taskId: 't1', filePath: 'a.ts', oldContent: '', newContent: '', status: 'pending',
      })
      const id = useDiffStore.getState().entries[0].id

      useDiffStore.getState().updateEntryStatus(id, 'applied')

      const entry = useDiffStore.getState().entries[0]
      expect(entry.status).toBe('applied')
      expect(entry.appliedAt).toBeTruthy()
    })

    it('does not set appliedAt for rejected status', () => {
      useDiffStore.getState().addEntry({
        taskId: 't1', filePath: 'a.ts', oldContent: '', newContent: '', status: 'pending',
      })
      const id = useDiffStore.getState().entries[0].id

      useDiffStore.getState().updateEntryStatus(id, 'rejected')

      expect(useDiffStore.getState().entries[0].appliedAt).toBeUndefined()
    })

    it('does not affect other entries', () => {
      const { addEntry } = useDiffStore.getState()
      addEntry({ taskId: 't1', filePath: 'a.ts', oldContent: '', newContent: '', status: 'pending' })
      addEntry({ taskId: 't2', filePath: 'b.ts', oldContent: '', newContent: '', status: 'pending' })

      const entries = useDiffStore.getState().entries
      useDiffStore.getState().updateEntryStatus(entries[0].id, 'applied')

      expect(useDiffStore.getState().entries[1].status).toBe('pending')
    })
  })

  // ── selectEntry ────────────────────────────────────────

  describe('selectEntry', () => {
    it('sets selectedEntryId', () => {
      useDiffStore.getState().selectEntry('some-id')
      expect(useDiffStore.getState().selectedEntryId).toBe('some-id')
    })

    it('clears with null', () => {
      useDiffStore.getState().selectEntry('some-id')
      useDiffStore.getState().selectEntry(null)
      expect(useDiffStore.getState().selectedEntryId).toBeNull()
    })
  })

  // ── setViewMode ────────────────────────────────────────

  describe('setViewMode', () => {
    it('sets unified mode', () => {
      useDiffStore.getState().setViewMode('unified')
      expect(useDiffStore.getState().viewMode).toBe('unified')
    })

    it('sets split mode', () => {
      useDiffStore.getState().setViewMode('unified')
      useDiffStore.getState().setViewMode('split')
      expect(useDiffStore.getState().viewMode).toBe('split')
    })
  })

  // ── getEntryById ───────────────────────────────────────

  describe('getEntryById', () => {
    it('returns entry if found', () => {
      useDiffStore.getState().addEntry({
        taskId: 't1', filePath: 'a.ts', oldContent: 'old', newContent: 'new', status: 'pending',
      })
      const id = useDiffStore.getState().entries[0].id

      expect(useDiffStore.getState().getEntryById(id)?.filePath).toBe('a.ts')
    })

    it('returns undefined if not found', () => {
      expect(useDiffStore.getState().getEntryById('nonexistent')).toBeUndefined()
    })
  })

  // ── getEntriesByTaskId ─────────────────────────────────

  describe('getEntriesByTaskId', () => {
    it('returns entries matching taskId', () => {
      const { addEntry } = useDiffStore.getState()
      addEntry({ taskId: 't1', filePath: 'a.ts', oldContent: '', newContent: '', status: 'pending' })
      addEntry({ taskId: 't1', filePath: 'b.ts', oldContent: '', newContent: '', status: 'pending' })
      addEntry({ taskId: 't2', filePath: 'c.ts', oldContent: '', newContent: '', status: 'pending' })

      expect(useDiffStore.getState().getEntriesByTaskId('t1')).toHaveLength(2)
      expect(useDiffStore.getState().getEntriesByTaskId('t2')).toHaveLength(1)
    })

    it('returns empty array for unknown taskId', () => {
      expect(useDiffStore.getState().getEntriesByTaskId('unknown')).toEqual([])
    })
  })

  // ── getPendingEntries ──────────────────────────────────

  describe('getPendingEntries', () => {
    it('returns only pending entries', () => {
      const { addEntry } = useDiffStore.getState()
      addEntry({ taskId: 't1', filePath: 'a.ts', oldContent: '', newContent: '', status: 'pending' })
      addEntry({ taskId: 't2', filePath: 'b.ts', oldContent: '', newContent: '', status: 'pending' })

      const id = useDiffStore.getState().entries[0].id
      useDiffStore.getState().updateEntryStatus(id, 'applied')

      expect(useDiffStore.getState().getPendingEntries()).toHaveLength(1)
    })

    it('returns empty when no pending entries', () => {
      expect(useDiffStore.getState().getPendingEntries()).toEqual([])
    })
  })
})

// ── processFileChangedEvent ────────────────────────────

describe('processFileChangedEvent', () => {
  beforeEach(() => {
    resetStore()
  })

  it('adds a pending entry via the helper', () => {
    processFileChangedEvent('task-1', 'src/main.ts', 'old code', 'new code')

    const entries = useDiffStore.getState().entries
    expect(entries).toHaveLength(1)
    expect(entries[0].taskId).toBe('task-1')
    expect(entries[0].filePath).toBe('src/main.ts')
    expect(entries[0].oldContent).toBe('old code')
    expect(entries[0].newContent).toBe('new code')
    expect(entries[0].status).toBe('pending')
  })
})
