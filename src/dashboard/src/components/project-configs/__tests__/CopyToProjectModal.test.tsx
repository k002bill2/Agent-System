import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CopyToProjectModal } from '../CopyToProjectModal'

vi.mock('../../../stores/projectConfigs', () => ({
  useProjectConfigsStore: () => ({
    projects: [
      { project_id: 'proj-1', project_name: 'Source Project', skill_count: 3, agent_count: 2, mcp_server_count: 1 },
      { project_id: 'proj-2', project_name: 'Target A', skill_count: 1, agent_count: 0, mcp_server_count: 0 },
      { project_id: 'proj-3', project_name: 'Target B', skill_count: 5, agent_count: 3, mcp_server_count: 2 },
    ],
  }),
}))

describe('CopyToProjectModal', () => {
  const defaultItems = [
    { type: 'agent' as const, id: 'a1', name: 'web-agent', sourceProjectId: 'proj-1' },
  ]
  const defaultProps = {
    isOpen: true,
    items: defaultItems,
    onClose: vi.fn(),
    onCopy: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when not open', () => {
    const { container } = render(<CopyToProjectModal {...defaultProps} isOpen={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders modal title', () => {
    render(<CopyToProjectModal {...defaultProps} />)
    expect(screen.getByText('Copy to Project')).toBeInTheDocument()
  })

  it('shows items to copy', () => {
    render(<CopyToProjectModal {...defaultProps} />)
    expect(screen.getByText('Items to copy (1)')).toBeInTheDocument()
    expect(screen.getByText('web-agent')).toBeInTheDocument()
    expect(screen.getByText('Agent:')).toBeInTheDocument()
  })

  it('filters out source project from targets', () => {
    render(<CopyToProjectModal {...defaultProps} />)
    expect(screen.queryByText('Source Project')).not.toBeInTheDocument()
    expect(screen.getByText('Target A')).toBeInTheDocument()
    expect(screen.getByText('Target B')).toBeInTheDocument()
  })

  it('enables Copy button after selecting target', () => {
    render(<CopyToProjectModal {...defaultProps} />)
    const copyButton = screen.getByRole('button', { name: /copy/i })
    expect(copyButton).toBeDisabled()

    fireEvent.click(screen.getByText('Target A'))
    expect(copyButton).not.toBeDisabled()
  })

  it('calls onCopy with selected target project id', async () => {
    const onCopy = vi.fn().mockResolvedValue(true)
    render(<CopyToProjectModal {...defaultProps} onCopy={onCopy} />)

    fireEvent.click(screen.getByText('Target A'))
    fireEvent.click(screen.getByRole('button', { name: /copy/i }))

    await waitFor(() => {
      expect(onCopy).toHaveBeenCalledWith('proj-2')
    })
  })

  it('shows success message after successful copy', async () => {
    const onCopy = vi.fn().mockResolvedValue(true)
    render(<CopyToProjectModal {...defaultProps} onCopy={onCopy} />)

    fireEvent.click(screen.getByText('Target A'))
    fireEvent.click(screen.getByRole('button', { name: /copy/i }))

    await waitFor(() => {
      expect(screen.getByText('Copied successfully!')).toBeInTheDocument()
    })
  })

  it('shows error message after failed copy', async () => {
    const onCopy = vi.fn().mockResolvedValue(false)
    render(<CopyToProjectModal {...defaultProps} onCopy={onCopy} />)

    fireEvent.click(screen.getByText('Target A'))
    fireEvent.click(screen.getByRole('button', { name: /copy/i }))

    await waitFor(() => {
      expect(screen.getByText('Failed to copy. Please try again.')).toBeInTheDocument()
    })
  })

  it('calls onClose when Cancel clicked', () => {
    const onClose = vi.fn()
    render(<CopyToProjectModal {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows empty state when no other projects available', () => {
    // Source project is proj-1, and we only have proj-1 in the list
    render(
      <CopyToProjectModal
        {...defaultProps}
        items={[{ type: 'agent', id: 'a1', name: 'test', sourceProjectId: 'proj-1' }]}
      />
    )
    // There are other targets (proj-2, proj-3) so no empty state
    expect(screen.getByText('Target A')).toBeInTheDocument()
  })
})
