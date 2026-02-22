import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RAGQueryPanel } from '../RAGQueryPanel'

// Mock lucide-react
vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: Record<string, unknown>) => (
    <svg data-testid={`icon-${name}`} {...props} />
  )
  return {
    Search: icon('search'),
    Database: icon('database'),
    FileCode: icon('file-code'),
    RefreshCw: icon('refresh'),
    Trash2: icon('trash'),
    ChevronDown: icon('chevron-down'),
    ChevronUp: icon('chevron-up'),
    AlertCircle: icon('alert'),
    CheckCircle: icon('check'),
    FileText: icon('file-text'),
    Hash: icon('hash'),
    Filter: icon('filter'),
    Info: icon('info'),
  }
})

const mockStats = {
  project_id: 'proj-1',
  collection_name: 'test',
  document_count: 50,
  indexed: true,
  error: null,
}

const mockQueryResult = {
  query: 'auth logic',
  documents: [
    {
      content: 'function authenticate() {}',
      source: 'src/auth/login.ts',
      chunk_index: 0,
      priority: 'high',
      score: 0.95,
    },
  ],
  total_found: 1,
}

describe('RAGQueryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title with project name', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockStats,
    } as Response)

    render(<RAGQueryPanel projectId="proj-1" projectName="My Project" />)
    expect(screen.getByText(/RAG/)).toBeInTheDocument()
    expect(screen.getByText('- My Project')).toBeInTheDocument()
  })

  it('shows indexed stats when loaded', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockStats,
    } as Response)

    render(<RAGQueryPanel projectId="proj-1" projectName="My Project" />)
    await waitFor(() => {
      expect(screen.getByText(/50/)).toBeInTheDocument()
    })
  })

  it('shows not indexed message when not indexed', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ ...mockStats, indexed: false, document_count: 0 }),
    } as Response)

    render(<RAGQueryPanel projectId="proj-1" projectName="My Project" />)
    await waitFor(() => {
      expect(screen.getByText(/인덱싱되지 않았습니다/)).toBeInTheDocument()
    })
  })

  it('shows error when stats fetch fails', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ detail: 'Server error' }),
    } as Response)

    render(<RAGQueryPanel projectId="proj-1" projectName="My Project" />)
    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })
  })

  it('renders search input', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockStats,
    } as Response)

    render(<RAGQueryPanel projectId="proj-1" projectName="My Project" />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/코드베이스에서 검색/)).toBeInTheDocument()
    })
  })

  it('shows help text when indexed and no results yet', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockStats,
    } as Response)

    render(<RAGQueryPanel projectId="proj-1" projectName="My Project" />)
    await waitFor(() => {
      expect(screen.getByText('RAG 검색 사용 방법')).toBeInTheDocument()
    })
  })

  it('renders close button when onClose provided', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockStats,
    } as Response)

    const onClose = vi.fn()
    render(<RAGQueryPanel projectId="proj-1" projectName="My Project" onClose={onClose} />)
    await waitFor(() => {
      const closeButtons = screen.getAllByText('\u00d7')
      expect(closeButtons.length).toBeGreaterThan(0)
    })
  })

  it('toggles search options', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockStats,
    } as Response)

    render(<RAGQueryPanel projectId="proj-1" projectName="My Project" />)
    await waitFor(() => {
      expect(screen.getByText(/검색 옵션/)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText(/검색 옵션/))
    expect(screen.getByText(/결과 수/)).toBeInTheDocument()
    // "우선순위" appears in both label and select option, use getAllByText
    expect(screen.getAllByText(/우선순위/).length).toBeGreaterThan(0)
  })

  it('performs search on button click', async () => {
    let _callCount = 0
    vi.mocked(global.fetch).mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes('/query')) {
        return { ok: true, json: async () => mockQueryResult } as Response
      }
      _callCount++
      return { ok: true, json: async () => mockStats } as Response
    })

    render(<RAGQueryPanel projectId="proj-1" projectName="My Project" />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/코드베이스에서 검색/)).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/코드베이스에서 검색/)
    fireEvent.change(input, { target: { value: 'auth logic' } })
    fireEvent.click(screen.getByText('검색'))

    await waitFor(() => {
      expect(screen.getByText(/검색 결과/)).toBeInTheDocument()
    })
  })
})
