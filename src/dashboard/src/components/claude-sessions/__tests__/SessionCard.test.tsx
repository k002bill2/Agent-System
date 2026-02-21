import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { SessionCard } from '../SessionCard'
import type { ClaudeSessionInfo } from '../../../types/claudeSession'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Clock: (props: Record<string, unknown>) => <span data-testid="icon-clock" {...props} />,
  MessageSquare: (props: Record<string, unknown>) => <span data-testid="icon-message" {...props} />,
  Wrench: (props: Record<string, unknown>) => <span data-testid="icon-wrench" {...props} />,
  DollarSign: (props: Record<string, unknown>) => <span data-testid="icon-dollar" {...props} />,
  GitBranch: (props: Record<string, unknown>) => <span data-testid="icon-git" {...props} />,
  Sparkles: (props: Record<string, unknown>) => <span data-testid="icon-sparkles" {...props} />,
  Loader2: (props: Record<string, unknown>) => <span data-testid="icon-loader" {...props} />,
  Trash2: (props: Record<string, unknown>) => <span data-testid="icon-trash" {...props} />,
  User: (props: Record<string, unknown>) => <span data-testid="icon-user" {...props} />,
}))

// Mock the claudeSessions store
const mockGenerateSummary = vi.fn()
const mockDeleteSession = vi.fn()
const mockIsGhostSession = vi.fn(() => false)
const mockIsExternalSession = vi.fn(() => false)

vi.mock('../../../stores/claudeSessions', () => ({
  useClaudeSessionsStore: vi.fn(() => ({
    generateSummary: mockGenerateSummary,
    generatingSummaryFor: null,
    deleteSession: mockDeleteSession,
    isGhostSession: mockIsGhostSession,
    isExternalSession: mockIsExternalSession,
  })),
}))

const baseSession: ClaudeSessionInfo = {
  session_id: 'session-abc12345',
  slug: 'my-session',
  status: 'active',
  model: 'claude-3-opus',
  project_path: '/projects/my-app',
  project_name: 'My App',
  git_branch: 'feature/test',
  cwd: '/projects/my-app',
  version: '1.0.0',
  created_at: '2026-01-01T00:00:00Z',
  last_activity: new Date().toISOString(),
  message_count: 10,
  user_message_count: 5,
  assistant_message_count: 5,
  tool_call_count: 3,
  total_input_tokens: 1000,
  total_output_tokens: 500,
  estimated_cost: 0.05,
  file_path: '/path/to/session.jsonl',
  file_size: 2048,
  source_user: '',
  source_path: '/home/user/.claude',
}

describe('SessionCard', () => {
  const onClick = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsGhostSession.mockReturnValue(false)
    mockIsExternalSession.mockReturnValue(false)
  })

  it('renders session slug when no summary', () => {
    render(<SessionCard session={baseSession} isSelected={false} onClick={onClick} />)
    expect(screen.getByText('my-session')).toBeInTheDocument()
  })

  it('renders summary when available', () => {
    const sessionWithSummary = { ...baseSession, summary: 'This is a session summary' }
    render(<SessionCard session={sessionWithSummary} isSelected={false} onClick={onClick} />)
    expect(screen.getByText('This is a session summary')).toBeInTheDocument()
  })

  it('renders truncated session_id when no slug or summary', () => {
    const sessionNoSlug = { ...baseSession, slug: '', summary: undefined }
    render(<SessionCard session={sessionNoSlug} isSelected={false} onClick={onClick} />)
    expect(screen.getByText('session-')).toBeInTheDocument()
  })

  it('renders project name', () => {
    render(<SessionCard session={baseSession} isSelected={false} onClick={onClick} />)
    expect(screen.getByText('My App')).toBeInTheDocument()
  })

  it('renders status label', () => {
    render(<SessionCard session={baseSession} isSelected={false} onClick={onClick} />)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders message count', () => {
    render(<SessionCard session={baseSession} isSelected={false} onClick={onClick} />)
    expect(screen.getByText('10')).toBeInTheDocument()
  })

  it('renders tool call count', () => {
    render(<SessionCard session={baseSession} isSelected={false} onClick={onClick} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders formatted cost', () => {
    render(<SessionCard session={baseSession} isSelected={false} onClick={onClick} />)
    expect(screen.getByText('$0.05')).toBeInTheDocument()
  })

  it('renders cost as <$0.01 for very small amounts', () => {
    const cheapSession = { ...baseSession, estimated_cost: 0.001 }
    render(<SessionCard session={cheapSession} isSelected={false} onClick={onClick} />)
    expect(screen.getByText('<$0.01')).toBeInTheDocument()
  })

  it('renders git branch when present', () => {
    render(<SessionCard session={baseSession} isSelected={false} onClick={onClick} />)
    expect(screen.getByText('feature/test')).toBeInTheDocument()
  })

  it('does not render git branch when absent', () => {
    const noBranch = { ...baseSession, git_branch: '' }
    render(<SessionCard session={noBranch} isSelected={false} onClick={onClick} />)
    expect(screen.queryByText('feature/test')).not.toBeInTheDocument()
  })

  it('calls onClick when card is clicked', () => {
    render(<SessionCard session={baseSession} isSelected={false} onClick={onClick} />)
    // The outer button is the card itself; click by text
    fireEvent.click(screen.getByText('my-session'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('shows generate summary button when no summary', () => {
    render(<SessionCard session={baseSession} isSelected={false} onClick={onClick} />)
    expect(screen.getByTitle('AI 요약 생성')).toBeInTheDocument()
  })

  it('does not show generate summary button when summary exists', () => {
    const sessionWithSummary = { ...baseSession, summary: 'Summary' }
    render(<SessionCard session={sessionWithSummary} isSelected={false} onClick={onClick} />)
    expect(screen.queryByTitle('AI 요약 생성')).not.toBeInTheDocument()
  })

  it('shows delete button for empty sessions', () => {
    const emptySession = { ...baseSession, message_count: 0 }
    render(<SessionCard session={emptySession} isSelected={false} onClick={onClick} />)
    expect(screen.getByTitle('빈 세션 삭제')).toBeInTheDocument()
  })

  it('shows delete button for ghost sessions', () => {
    mockIsGhostSession.mockReturnValue(true)
    render(<SessionCard session={baseSession} isSelected={false} onClick={onClick} />)
    expect(screen.getByTitle('유령 세션 삭제 (실제 대화 없음)')).toBeInTheDocument()
  })

  it('does not show delete button for normal sessions with messages', () => {
    render(<SessionCard session={baseSession} isSelected={false} onClick={onClick} />)
    expect(screen.queryByTitle('빈 세션 삭제')).not.toBeInTheDocument()
    expect(screen.queryByTitle('유령 세션 삭제 (실제 대화 없음)')).not.toBeInTheDocument()
  })

  it('shows external badge for external sessions', () => {
    mockIsExternalSession.mockReturnValue(true)
    render(<SessionCard session={baseSession} isSelected={false} onClick={onClick} />)
    expect(screen.getByTitle('External session')).toBeInTheDocument()
  })

  it('shows source_user when present', () => {
    const sessionWithUser = { ...baseSession, source_user: 'johndoe' }
    render(<SessionCard session={sessionWithUser} isSelected={false} onClick={onClick} />)
    expect(screen.getByText(/johndoe/)).toBeInTheDocument()
  })

  it('renders different status colors for each status', () => {
    const completedSession = { ...baseSession, status: 'completed' as const }
    render(<SessionCard session={completedSession} isSelected={false} onClick={onClick} />)
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })
})
