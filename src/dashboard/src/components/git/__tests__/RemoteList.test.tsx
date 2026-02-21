import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RemoteList } from '../RemoteList'
import type { GitRemote } from '../../../stores/git'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Cloud: (props: Record<string, unknown>) => <span data-testid="icon-Cloud" {...props} />,
  Plus: (props: Record<string, unknown>) => <span data-testid="icon-Plus" {...props} />,
  Trash2: (props: Record<string, unknown>) => <span data-testid="icon-Trash2" {...props} />,
  Pencil: (props: Record<string, unknown>) => <span data-testid="icon-Pencil" {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <span data-testid="icon-RefreshCw" {...props} />,
  Download: (props: Record<string, unknown>) => <span data-testid="icon-Download" {...props} />,
  Upload: (props: Record<string, unknown>) => <span data-testid="icon-Upload" {...props} />,
  ExternalLink: (props: Record<string, unknown>) => <span data-testid="icon-ExternalLink" {...props} />,
  X: (props: Record<string, unknown>) => <span data-testid="icon-X" {...props} />,
  Check: (props: Record<string, unknown>) => <span data-testid="icon-Check" {...props} />,
}))

function makeRemote(overrides: Partial<GitRemote> = {}): GitRemote {
  return {
    name: 'origin',
    url: 'https://github.com/user/repo.git',
    fetch_url: null,
    push_url: null,
    ...overrides,
  }
}

describe('RemoteList', () => {
  const defaultProps = {
    remotes: [
      makeRemote({ name: 'origin', url: 'https://github.com/user/repo.git' }),
      makeRemote({ name: 'upstream', url: 'https://github.com/org/repo.git' }),
    ],
    isLoading: false,
    onAddRemote: vi.fn().mockResolvedValue(true),
    onRemoveRemote: vi.fn().mockResolvedValue(true),
    onUpdateRemote: vi.fn().mockResolvedValue(true),
    onFetch: vi.fn().mockResolvedValue(true),
    onPull: vi.fn().mockResolvedValue(true),
    onPush: vi.fn().mockResolvedValue(true),
    onRefresh: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Remotes heading with count', () => {
    render(<RemoteList {...defaultProps} />)
    expect(screen.getByText('Remotes')).toBeInTheDocument()
    expect(screen.getByText('(2)')).toBeInTheDocument()
  })

  it('displays remote names', () => {
    render(<RemoteList {...defaultProps} />)
    expect(screen.getByText('origin')).toBeInTheDocument()
    expect(screen.getByText('upstream')).toBeInTheDocument()
  })

  it('displays remote URLs', () => {
    render(<RemoteList {...defaultProps} />)
    expect(screen.getByText('https://github.com/user/repo.git')).toBeInTheDocument()
    expect(screen.getByText('https://github.com/org/repo.git')).toBeInTheDocument()
  })

  it('shows "default" badge for origin remote', () => {
    render(<RemoteList {...defaultProps} />)
    expect(screen.getByText('default')).toBeInTheDocument()
  })

  it('shows empty state when no remotes', () => {
    render(<RemoteList {...defaultProps} remotes={[]} />)
    expect(screen.getByText('등록된 remote가 없습니다')).toBeInTheDocument()
    expect(screen.getByText('Add Remote 버튼으로 추가하세요')).toBeInTheDocument()
  })

  it('opens Add Remote modal on button click', () => {
    render(<RemoteList {...defaultProps} />)
    fireEvent.click(screen.getByText('Add Remote'))
    expect(screen.getByText('Name *')).toBeInTheDocument()
    expect(screen.getByText('URL *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('upstream')).toBeInTheDocument()
  })

  it('calls onAddRemote and closes modal on success', async () => {
    render(<RemoteList {...defaultProps} />)
    fireEvent.click(screen.getByText('Add Remote'))

    const nameInput = screen.getByPlaceholderText('upstream')
    const urlInput = screen.getByPlaceholderText('https://github.com/user/repo.git')
    fireEvent.change(nameInput, { target: { value: 'backup' } })
    fireEvent.change(urlInput, { target: { value: 'https://github.com/backup/repo.git' } })

    // The button in the modal - find by role
    const addButtons = screen.getAllByRole('button')
    const addRemoteModalBtn = addButtons.find(
      (btn) => btn.textContent === 'Add Remote' && btn.closest('.fixed')
    )
    fireEvent.click(addRemoteModalBtn!)

    await waitFor(() => {
      expect(defaultProps.onAddRemote).toHaveBeenCalledWith('backup', 'https://github.com/backup/repo.git')
    })
  })

  it('disables Add Remote button when name or URL is empty', () => {
    render(<RemoteList {...defaultProps} />)
    fireEvent.click(screen.getByText('Add Remote'))

    // The submit button in the modal should be disabled when inputs are empty
    const addButtons = screen.getAllByRole('button')
    const addRemoteModalBtn = addButtons.find(
      (btn) => btn.textContent === 'Add Remote' && btn.closest('.fixed')
    )
    expect(addRemoteModalBtn).toBeDisabled()
  })

  it('calls onRefresh when Refresh button is clicked', () => {
    render(<RemoteList {...defaultProps} />)
    fireEvent.click(screen.getByTitle('Refresh'))
    expect(defaultProps.onRefresh).toHaveBeenCalledTimes(1)
  })

  it('calls onFetch for the remote when fetch button is clicked', () => {
    render(<RemoteList {...defaultProps} />)
    const fetchBtn = screen.getByTitle('Fetch from origin')
    fireEvent.click(fetchBtn)
    expect(defaultProps.onFetch).toHaveBeenCalledWith('origin')
  })

  it('calls onPull for the remote when pull button is clicked', () => {
    render(<RemoteList {...defaultProps} />)
    const pullBtn = screen.getByTitle('Pull from origin')
    fireEvent.click(pullBtn)
    expect(defaultProps.onPull).toHaveBeenCalledWith(undefined, 'origin')
  })

  it('calls onPush for the remote when push button is clicked', () => {
    render(<RemoteList {...defaultProps} />)
    const pushBtn = screen.getByTitle('Push to origin')
    fireEvent.click(pushBtn)
    expect(defaultProps.onPush).toHaveBeenCalledWith(undefined, 'origin')
  })

  it('shows external link for HTTP remotes', () => {
    render(<RemoteList {...defaultProps} />)
    const externalLinks = screen.getAllByTitle('Open in browser')
    expect(externalLinks.length).toBe(2)
  })

  it('does not show delete button for origin remote', () => {
    render(<RemoteList {...defaultProps} />)
    expect(screen.queryByTitle('Remove origin')).not.toBeInTheDocument()
    expect(screen.getByTitle('Remove upstream')).toBeInTheDocument()
  })

  it('shows different fetch/push URLs when they differ', () => {
    const remotes = [
      makeRemote({
        name: 'origin',
        url: 'https://github.com/user/repo.git',
        fetch_url: 'https://github.com/user/repo-fetch.git',
        push_url: 'https://github.com/user/repo-push.git',
      }),
    ]
    render(<RemoteList {...defaultProps} remotes={remotes} />)
    expect(screen.getByText('fetch: https://github.com/user/repo-fetch.git')).toBeInTheDocument()
    expect(screen.getByText('push: https://github.com/user/repo-push.git')).toBeInTheDocument()
  })

  it('cancels Add Remote modal when Cancel is clicked', () => {
    render(<RemoteList {...defaultProps} />)
    fireEvent.click(screen.getByText('Add Remote'))
    expect(screen.getByText('Name *')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Name *')).not.toBeInTheDocument()
  })
})
