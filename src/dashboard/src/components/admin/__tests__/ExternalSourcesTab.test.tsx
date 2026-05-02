import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExternalSourcesTab } from '../ExternalSourcesTab'

vi.mock('lucide-react', () => ({
  FolderPlus: (props: Record<string, unknown>) => <span data-testid="icon-add" {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <span data-testid="icon-refresh" {...props} />,
  Trash2: (props: Record<string, unknown>) => <span data-testid="icon-trash" {...props} />,
}))

const mockFetch = vi.fn()
const mockAdd = vi.fn()
const mockRemove = vi.fn()

vi.mock('../api', () => ({
  fetchExternalSourcePaths: (...args: unknown[]) => mockFetch(...args),
  addExternalSourcePath: (...args: unknown[]) => mockAdd(...args),
  removeExternalSourcePath: (...args: unknown[]) => mockRemove(...args),
}))

describe('ExternalSourcesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state when no paths registered', async () => {
    mockFetch.mockResolvedValue({ paths: [], message: 'Found 0 external path(s)' })
    render(<ExternalSourcesTab />)

    await waitFor(() => {
      expect(screen.getByText(/등록된 외부 경로가 없습니다/)).toBeInTheDocument()
    })
    expect(screen.getByText('Registered paths (0)')).toBeInTheDocument()
  })

  it('lists registered paths returned by the API', async () => {
    mockFetch.mockResolvedValue({
      paths: ['/Volumes/work-mac/.claude/projects', '/mnt/server/.claude/projects'],
      message: 'Found 2',
    })
    render(<ExternalSourcesTab />)

    await waitFor(() => {
      expect(screen.getByText('/Volumes/work-mac/.claude/projects')).toBeInTheDocument()
      expect(screen.getByText('/mnt/server/.claude/projects')).toBeInTheDocument()
      expect(screen.getByText('Registered paths (2)')).toBeInTheDocument()
    })
  })

  it('submits a new path via the add API', async () => {
    mockFetch.mockResolvedValue({ paths: [], message: 'ok' })
    mockAdd.mockResolvedValue({ paths: ['/new/path'], message: 'Added' })
    render(<ExternalSourcesTab />)

    await waitFor(() => {
      expect(screen.getByText(/등록된 외부 경로가 없습니다/)).toBeInTheDocument()
    })

    const input = screen.getByLabelText('External Claude projects directory path')
    fireEvent.change(input, { target: { value: '/new/path' } })
    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith('/new/path')
      expect(screen.getByText('/new/path')).toBeInTheDocument()
    })
  })

  it('does not submit blank input', async () => {
    mockFetch.mockResolvedValue({ paths: [], message: 'ok' })
    render(<ExternalSourcesTab />)

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    const button = screen.getByText('Add').closest('button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('shows backend error on failed add', async () => {
    mockFetch.mockResolvedValue({ paths: [], message: 'ok' })
    mockAdd.mockRejectedValue(new Error('Invalid path'))
    render(<ExternalSourcesTab />)

    await waitFor(() => {
      expect(screen.getByText(/등록된 외부 경로가 없습니다/)).toBeInTheDocument()
    })

    const input = screen.getByLabelText('External Claude projects directory path')
    fireEvent.change(input, { target: { value: '/bad' } })
    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid path')
    })
  })

  it('removes a path via the delete API', async () => {
    mockFetch.mockResolvedValue({ paths: ['/keep'], message: 'ok' })
    mockRemove.mockResolvedValue({ paths: [], message: 'Removed' })
    render(<ExternalSourcesTab />)

    await waitFor(() => {
      expect(screen.getByText('/keep')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Remove /keep'))

    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith('/keep')
      expect(screen.getByText(/등록된 외부 경로가 없습니다/)).toBeInTheDocument()
    })
  })
})
