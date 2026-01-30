import { describe, it, expect } from 'vitest'
import { cn, formatTime, truncate } from '../utils'

describe('cn (className merger)', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    const showHidden = false
    const showVisible = true
    expect(cn('base', showHidden && 'hidden', showVisible && 'visible')).toBe('base visible')
  })

  it('merges Tailwind classes correctly', () => {
    // twMerge should handle conflicting Tailwind classes
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('handles arrays of classes', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })

  it('handles undefined and null values', () => {
    expect(cn('base', undefined, null, 'end')).toBe('base end')
  })

  it('handles empty input', () => {
    expect(cn()).toBe('')
  })
})

describe('formatTime', () => {
  it('formats Date object to Korean time string', () => {
    const date = new Date('2024-01-15T14:30:45')
    const result = formatTime(date)
    // Format: "오후 02:30:45" or "02:30:45" depending on locale
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}/)
  })

  it('formats string date to Korean time string', () => {
    const dateString = '2024-01-15T09:15:30'
    const result = formatTime(dateString)
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}/)
  })

  it('handles ISO date strings', () => {
    const isoString = '2024-06-20T12:00:00.000Z'
    const result = formatTime(isoString)
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}/)
  })
})

describe('truncate', () => {
  it('returns original string if shorter than length', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })

  it('returns original string if equal to length', () => {
    expect(truncate('hello', 5)).toBe('hello')
  })

  it('truncates string longer than length', () => {
    expect(truncate('hello world', 5)).toBe('hello...')
  })

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('')
  })

  it('handles length of 0', () => {
    expect(truncate('hello', 0)).toBe('...')
  })

  it('handles long strings', () => {
    const longString = 'a'.repeat(100)
    const result = truncate(longString, 10)
    expect(result).toBe('aaaaaaaaaa...')
    expect(result.length).toBe(13) // 10 + '...'
  })
})
