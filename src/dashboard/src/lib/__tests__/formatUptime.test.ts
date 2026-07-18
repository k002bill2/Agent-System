import { describe, it, expect } from 'vitest'

import { formatUptime } from '../formatUptime'

describe('formatUptime', () => {
  // ── Bucket: >= 1 day → "Nd Nh" ──────────────────────────
  describe('days bucket (>= 1 day)', () => {
    it('formats 2d 3h', () => {
      // 2 * 86400 + 3 * 3600 = 183600
      expect(formatUptime(183600)).toBe('2d 3h')
    })

    it('formats exactly 1 day as "1d 0h"', () => {
      expect(formatUptime(86400)).toBe('1d 0h')
    })

    it('formats 1d 1h at the 25h boundary', () => {
      expect(formatUptime(90000)).toBe('1d 1h')
    })
  })

  // ── Bucket: >= 1 hour → "Nh Nm" ─────────────────────────
  describe('hours bucket (>= 1 hour)', () => {
    it('formats 3h 42m', () => {
      // 3 * 3600 + 42 * 60 = 13320
      expect(formatUptime(13320)).toBe('3h 42m')
    })

    it('formats exactly 1 hour as "1h 0m"', () => {
      expect(formatUptime(3600)).toBe('1h 0m')
    })

    it('formats the top of the hours bucket (23h 59m)', () => {
      expect(formatUptime(86399)).toBe('23h 59m')
    })
  })

  // ── Bucket: >= 1 minute → "Nm" ──────────────────────────
  describe('minutes bucket (>= 1 minute)', () => {
    it('formats 42m', () => {
      expect(formatUptime(2520)).toBe('42m')
    })

    it('formats exactly 1 minute as "1m"', () => {
      expect(formatUptime(60)).toBe('1m')
    })

    it('formats the top of the minutes bucket (59m)', () => {
      expect(formatUptime(3599)).toBe('59m')
    })
  })

  // ── Bucket: < 1 minute → "Ns" ───────────────────────────
  describe('seconds bucket (< 1 minute)', () => {
    it('formats 45s', () => {
      expect(formatUptime(45)).toBe('45s')
    })

    it('formats zero as "0s"', () => {
      expect(formatUptime(0)).toBe('0s')
    })

    it('formats the top of the seconds bucket (59s)', () => {
      expect(formatUptime(59)).toBe('59s')
    })
  })

  // ── Fractional input is floored ─────────────────────────
  describe('fractional seconds are floored', () => {
    it('floors 45.9 to "45s"', () => {
      expect(formatUptime(45.9)).toBe('45s')
    })

    it('floors 125.9 (2m 5s) to "2m"', () => {
      expect(formatUptime(125.9)).toBe('2m')
    })
  })

  // ── Invalid input → "—" ─────────────────────────────────
  describe('invalid input yields the em dash', () => {
    it('returns "—" for null', () => {
      expect(formatUptime(null)).toBe('—')
    })

    it('returns "—" for undefined', () => {
      expect(formatUptime(undefined)).toBe('—')
    })

    it('returns "—" for NaN', () => {
      expect(formatUptime(NaN)).toBe('—')
    })

    it('returns "—" for negative values', () => {
      expect(formatUptime(-5)).toBe('—')
    })

    it('returns "—" for Infinity', () => {
      expect(formatUptime(Infinity)).toBe('—')
    })

    it('returns "—" for -Infinity', () => {
      expect(formatUptime(-Infinity)).toBe('—')
    })
  })
})
