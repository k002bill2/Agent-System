import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ArtifactBrowser } from '../ArtifactBrowser'

const mockArtifacts = [
  { id: 'a1', run_id: 'r1', name: 'report.txt', path: '/tmp/report.txt', size_bytes: 1024, content_type: 'text/plain', retention_days: 30, created_at: '2024-01-01' },
  { id: 'a2', run_id: 'r1', name: 'image.png', path: '/tmp/image.png', size_bytes: 2048576, content_type: 'image/png', retention_days: 7, expires_at: '2024-02-01', created_at: '2024-01-01' },
]

describe('ArtifactBrowser', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ artifacts: mockArtifacts }),
    })
  })

  it('renders artifacts heading', () => {
    render(<ArtifactBrowser runId="r1" />)
    expect(screen.getByText('Artifacts')).toBeInTheDocument()
  })

  it('shows loading state initially', () => {
    render(<ArtifactBrowser runId="r1" />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('displays artifacts after loading', async () => {
    render(<ArtifactBrowser runId="r1" />)
    await waitFor(() => {
      expect(screen.getByText('report.txt')).toBeInTheDocument()
      expect(screen.getByText('image.png')).toBeInTheDocument()
    })
  })

  it('formats file sizes', async () => {
    render(<ArtifactBrowser runId="r1" />)
    await waitFor(() => {
      expect(screen.getByText('1.0 KB')).toBeInTheDocument()
    })
  })

  it('shows total count and size', async () => {
    render(<ArtifactBrowser runId="r1" />)
    await waitFor(() => {
      expect(screen.getByText(/2 files/)).toBeInTheDocument()
    })
  })

  it('shows empty state when no artifacts', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ artifacts: [] }),
    })
    render(<ArtifactBrowser runId="r1" />)
    await waitFor(() => {
      expect(screen.getByText('No artifacts')).toBeInTheDocument()
    })
  })

  it('shows expiration date', async () => {
    render(<ArtifactBrowser runId="r1" />)
    await waitFor(() => {
      expect(screen.getByText(/Expires:/)).toBeInTheDocument()
    })
  })
})
