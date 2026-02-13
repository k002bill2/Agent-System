import { describe, it, expect } from 'vitest'
import { extractGitHubRepo } from '../gitUtils'

describe('extractGitHubRepo', () => {
  describe('SSH format', () => {
    it('extracts owner/repo from SSH URL', () => {
      expect(extractGitHubRepo('git@github.com:owner/repo.git')).toBe('owner/repo')
    })

    it('extracts owner/repo from SSH URL without .git', () => {
      expect(extractGitHubRepo('git@github.com:owner/repo')).toBe('owner/repo')
    })

    it('handles org names with hyphens', () => {
      expect(extractGitHubRepo('git@github.com:my-org/my-repo.git')).toBe('my-org/my-repo')
    })
  })

  describe('HTTPS format', () => {
    it('extracts owner/repo from HTTPS URL', () => {
      expect(extractGitHubRepo('https://github.com/owner/repo')).toBe('owner/repo')
    })

    it('extracts owner/repo from HTTPS URL with .git', () => {
      expect(extractGitHubRepo('https://github.com/owner/repo.git')).toBe('owner/repo')
    })

    it('handles trailing slash', () => {
      expect(extractGitHubRepo('https://github.com/owner/repo/')).toBe('owner/repo')
    })

    it('handles HTTP URLs', () => {
      expect(extractGitHubRepo('http://github.com/owner/repo')).toBe('owner/repo')
    })
  })

  describe('owner/repo format', () => {
    it('accepts plain owner/repo format', () => {
      expect(extractGitHubRepo('owner/repo')).toBe('owner/repo')
    })

    it('strips .git suffix', () => {
      expect(extractGitHubRepo('owner/repo.git')).toBe('owner/repo')
    })
  })

  describe('edge cases', () => {
    it('returns null for empty string', () => {
      expect(extractGitHubRepo('')).toBeNull()
    })

    it('returns null for invalid URL', () => {
      expect(extractGitHubRepo('not-a-url')).toBeNull()
    })

    it('returns null for non-GitHub URL', () => {
      expect(extractGitHubRepo('https://gitlab.com/owner/repo')).toBeNull()
    })

    it('trims whitespace', () => {
      expect(extractGitHubRepo('  owner/repo  ')).toBe('owner/repo')
    })
  })
})
