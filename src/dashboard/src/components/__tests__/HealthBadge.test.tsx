import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { HealthState } from '@/services/health'

// The badge is a thin view over `useBackendHealth`; mock the hook so each
// render state can be driven directly.
vi.mock('@/hooks/useBackendHealth', () => ({
  useBackendHealth: vi.fn(),
}))

import { useBackendHealth } from '@/hooks/useBackendHealth'
import { HealthBadge } from '../HealthBadge'

const mockUseBackendHealth = vi.mocked(useBackendHealth)

function setHealth(state: Partial<HealthState> & Pick<HealthState, 'state'>): void {
  mockUseBackendHealth.mockReturnValue({
    version: null,
    uptimeSeconds: null,
    checkedAt: 0,
    ...state,
  })
}

describe('HealthBadge', () => {
  beforeEach(() => {
    mockUseBackendHealth.mockReset()
  })

  // ── Per-state labels ──────────────────────────────────────
  describe('state → label', () => {
    it('renders "Healthy" with a version suffix', () => {
      setHealth({ state: 'healthy', version: '1.2.3', uptimeSeconds: 4200, checkedAt: 1000 })

      render(<HealthBadge />)

      expect(screen.getByText('Healthy')).toBeInTheDocument()
      expect(screen.getByText('v1.2.3')).toBeInTheDocument()
    })

    it('renders "Degraded"', () => {
      setHealth({ state: 'degraded', version: '1.2.3', uptimeSeconds: 90, checkedAt: 1000 })

      render(<HealthBadge />)

      expect(screen.getByText('Degraded')).toBeInTheDocument()
    })

    it('renders "Unhealthy"', () => {
      setHealth({ state: 'unhealthy', version: '9.9.9', uptimeSeconds: 1, checkedAt: 1000 })

      render(<HealthBadge />)

      expect(screen.getByText('Unhealthy')).toBeInTheDocument()
    })

    it('renders "Offline"', () => {
      setHealth({ state: 'offline' })

      render(<HealthBadge />)

      expect(screen.getByText('Offline')).toBeInTheDocument()
    })

    it('renders "Checking…" with a pulse animation', () => {
      setHealth({ state: 'checking' })

      render(<HealthBadge />)

      expect(screen.getByText('Checking…')).toBeInTheDocument()
      expect(screen.getByRole('status').className).toContain('animate-pulse')
    })
  })

  // ── Accessibility ─────────────────────────────────────────
  describe('accessibility', () => {
    it('exposes role="status" with a descriptive aria-label', () => {
      setHealth({ state: 'healthy', version: '1.2.3', uptimeSeconds: 4200, checkedAt: 1000 })

      render(<HealthBadge />)

      const badge = screen.getByRole('status')
      expect(badge).toHaveAttribute('aria-label', 'Backend health: Healthy')
      expect(badge).toHaveAttribute('aria-live', 'polite')
    })
  })

  // ── Dark-mode styling ─────────────────────────────────────
  describe('dark-mode classes', () => {
    it('applies dark: variants on the healthy pill', () => {
      setHealth({ state: 'healthy', version: '1.2.3', uptimeSeconds: 4200, checkedAt: 1000 })

      render(<HealthBadge />)

      const className = screen.getByRole('status').className
      expect(className).toContain('dark:bg-green-900/30')
      expect(className).toContain('dark:text-green-400')
    })

    it('applies dark: variants on the offline pill', () => {
      setHealth({ state: 'offline' })

      render(<HealthBadge />)

      const className = screen.getByRole('status').className
      expect(className).toContain('dark:bg-gray-700')
      expect(className).toContain('dark:text-gray-400')
    })
  })

  // ── Edge case: offline with null version/uptime ───────────
  describe('edge cases', () => {
    it('renders offline with null version/uptime without crashing or a version suffix', () => {
      setHealth({ state: 'offline', version: null, uptimeSeconds: null, checkedAt: 0 })

      expect(() => render(<HealthBadge />)).not.toThrow()

      expect(screen.getByText('Offline')).toBeInTheDocument()
      // No version → no "vX.Y.Z" suffix element.
      expect(screen.queryByText(/^v\d/)).toBeNull()
      // formatUptime(null) → "—" surfaces in the native tooltip.
      expect(screen.getByRole('status').getAttribute('title')).toContain('Uptime: —')
    })
  })
})
