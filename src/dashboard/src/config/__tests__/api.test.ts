import { describe, it, expect } from 'vitest'
import { getApiUrl, getWsUrl } from '../api'

describe('API configuration', () => {

  describe('getApiUrl', () => {
    it('returns relative path when no API_BASE_URL', () => {
      const result = getApiUrl('/api/sessions')
      // In test environment, API_BASE_URL is empty
      expect(result).toBe('/api/sessions')
    })

    it('handles paths without leading slash', () => {
      const result = getApiUrl('api/sessions')
      expect(result).toBe('api/sessions')
    })
  })

  describe('getWsUrl', () => {
    it('uses current host in development', () => {
      // In test environment with jsdom
      const result = getWsUrl('/ws/events')
      expect(result).toMatch(/^wss?:\/\//)
      expect(result).toContain('/ws/events')
    })

    it('constructs correct path', () => {
      const result = getWsUrl('/api/ws/stream')
      expect(result).toContain('/api/ws/stream')
    })
  })
})
