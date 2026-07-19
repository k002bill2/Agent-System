import { describe, it, expect } from 'vitest'
import { formatDurationMs } from '../formatDuration'

describe('formatDurationMs', () => {
  it('returns null so callers can hide the field', () => {
    expect(formatDurationMs(null)).toBeNull()
  })

  // Representative inputs preserving CheckCard's prior output (input is ms).
  it('formats sub-second ms values', () => {
    expect(formatDurationMs(500)).toBe('500ms')
    expect(formatDurationMs(0)).toBe('0ms')
    expect(formatDurationMs(999)).toBe('999ms')
  })

  it('formats >= 1s values with one decimal', () => {
    expect(formatDurationMs(1000)).toBe('1.0s')
    expect(formatDurationMs(3500)).toBe('3.5s')
  })

  // Representative inputs preserving WorkflowCheckCard's prior output.
  // It stores seconds and now passes seconds * 1000 into this util.
  it('preserves WorkflowCheckCard seconds->ms conversion', () => {
    expect(formatDurationMs(0.5 * 1000)).toBe('500ms')
    expect(formatDurationMs(3.5 * 1000)).toBe('3.5s')
    expect(formatDurationMs(1 * 1000)).toBe('1.0s')
  })
})
