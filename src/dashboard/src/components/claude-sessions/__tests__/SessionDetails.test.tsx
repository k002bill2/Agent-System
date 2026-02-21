import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { ClaudeSessionDetail, SessionMessage } from '../../../types/claudeSession'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  MessageSquare: (props: Record<string, unknown>) => <span data-testid="icon-message" {...props} />,
  User: (props: Record<string, unknown>) => <span data-testid="icon-user" {...props} />,
  Bot: (props: Record<string, unknown>) => <span data-testid="icon-bot" {...props} />,
  Wrench: (props: Record<string, unknown>) => <span data-testid="icon-wrench" {...props} />,
  Clock: (props: Record<string, unknown>) => <span data-testid="icon-clock" {...props} />,
  GitBranch: (props: Record<string, unknown>) => <span data-testid="icon-git" {...props} />,
  Folder: (props: Record<string, unknown>) => <span data-testid="icon-folder" {...props} />,
  Hash: (props: Record<string, unknown>) => <span data-testid="icon-hash" {...props} />,
  Zap: (props: Record<string, unknown>) => <span data-testid="icon-zap" {...props} />,
  FileText: (props: Record<string, unknown>) => <span data-testid="icon-file" {...props} />,
  LayoutList: (props: Record<string, unknown>) => <span data-testid="icon-layout" {...props} />,
  Code2: (props: Record<string, unknown>) => <span data-testid="icon-code" {...props} />,
  CheckCircle: (props: Record<string, unknown>) => <span data-testid="icon-check" {...props} />,
  AlertTriangle: (props: Record<string, unknown>) => <span data-testid="icon-alert" {...props} />,
  Loader2: (props: Record<string, unknown>) => <span data-testid="icon-loader" {...props} />,
  Info: (props: Record<string, unknown>) => <span data-testid="icon-info" {...props} />,
}))

// Mock TranscriptViewer
vi.mock('../TranscriptViewer', () => ({
  TranscriptViewer: () => <div data-testid="transcript-viewer">Transcript Viewer</div>,
}))

const mockSession: ClaudeSessionDetail = {
  session_id: 'sess-123',
  slug: 'test-session',
  summary: 'Test session summary',
  status: 'active',
  model: 'claude-3-opus',
  project_path: '/projects/app',
  project_name: 'My App',
  git_branch: 'main',
  cwd: '/projects/app',
  version: '2.1.0',
  created_at: '2026-01-15T10:00:00Z',
  last_activity: '2026-01-15T11:00:00Z',
  message_count: 25,
  user_message_count: 10,
  assistant_message_count: 15,
  tool_call_count: 8,
  total_input_tokens: 50000,
  total_output_tokens: 20000,
  estimated_cost: 1.25,
  file_path: '/path/to/session.jsonl',
  file_size: 524288,
  source_user: '',
  source_path: '/home/user/.claude',
  current_task: 'Implementing auth flow',
  recent_messages: [
    {
      type: 'user',
      timestamp: '2026-01-15T10:55:00Z',
      content: 'Add user login',
    },
    {
      type: 'assistant',
      timestamp: '2026-01-15T10:56:00Z',
      content: 'I will implement the login flow.',
    },
    {
      type: 'tool_use',
      timestamp: '2026-01-15T10:57:00Z',
      tool_name: 'Edit',
      tool_input: { file_path: 'src/auth.ts' },
    },
  ] as SessionMessage[],
}

let storeState: {
  selectedSession: ClaudeSessionDetail | null
  isLoadingDetails: boolean
} = {
  selectedSession: null,
  isLoadingDetails: false,
}

vi.mock('../../../stores/claudeSessions', () => ({
  useClaudeSessionsStore: vi.fn(() => storeState),
}))

import { SessionDetails } from '../SessionDetails'

describe('SessionDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState = { selectedSession: null, isLoadingDetails: false }
  })

  it('shows loading spinner when isLoadingDetails', () => {
    storeState.isLoadingDetails = true
    const { container } = render(<SessionDetails />)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('shows placeholder when no session selected', () => {
    render(<SessionDetails />)
    expect(screen.getByText('Select a session to view details')).toBeInTheDocument()
  })

  it('renders session summary as title', () => {
    storeState.selectedSession = mockSession
    render(<SessionDetails />)
    expect(screen.getByText('Test session summary')).toBeInTheDocument()
  })

  it('renders session status badge', () => {
    storeState.selectedSession = mockSession
    render(<SessionDetails />)
    expect(screen.getByText('active')).toBeInTheDocument()
  })

  it('renders current task when present', () => {
    storeState.selectedSession = mockSession
    render(<SessionDetails />)
    expect(screen.getByText('Current Task')).toBeInTheDocument()
    expect(screen.getByText('Implementing auth flow')).toBeInTheDocument()
  })

  it('does not render current task when absent', () => {
    storeState.selectedSession = { ...mockSession, current_task: undefined }
    render(<SessionDetails />)
    expect(screen.queryByText('Current Task')).not.toBeInTheDocument()
  })

  it('renders message count in stats bar', () => {
    storeState.selectedSession = mockSession
    render(<SessionDetails />)
    expect(screen.getByText('25')).toBeInTheDocument()
    expect(screen.getByText('Messages')).toBeInTheDocument()
  })

  it('renders tool call count in stats bar', () => {
    storeState.selectedSession = mockSession
    render(<SessionDetails />)
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('Tool Calls')).toBeInTheDocument()
  })

  it('renders formatted token count', () => {
    storeState.selectedSession = mockSession
    render(<SessionDetails />)
    // 50000 + 20000 = 70000 -> 70.0K
    expect(screen.getByText('70.0K')).toBeInTheDocument()
    expect(screen.getByText('Tokens')).toBeInTheDocument()
  })

  it('renders estimated cost', () => {
    storeState.selectedSession = mockSession
    render(<SessionDetails />)
    expect(screen.getByText('$1.25')).toBeInTheDocument()
    expect(screen.getByText('Cost')).toBeInTheDocument()
  })

  it('renders project name', () => {
    storeState.selectedSession = mockSession
    render(<SessionDetails />)
    expect(screen.getByText('My App')).toBeInTheDocument()
  })

  it('renders git branch', () => {
    storeState.selectedSession = mockSession
    render(<SessionDetails />)
    expect(screen.getByText('main')).toBeInTheDocument()
  })

  it('renders version', () => {
    storeState.selectedSession = mockSession
    render(<SessionDetails />)
    expect(screen.getByText('v2.1.0')).toBeInTheDocument()
  })

  it('renders file size formatted as KB/MB', () => {
    storeState.selectedSession = mockSession
    render(<SessionDetails />)
    // 524288 = 512 KB
    expect(screen.getByText('512.0 KB')).toBeInTheDocument()
  })

  it('renders recent messages', () => {
    storeState.selectedSession = mockSession
    render(<SessionDetails />)
    expect(screen.getByText('Recent Activity')).toBeInTheDocument()
    expect(screen.getByText('Add user login')).toBeInTheDocument()
    expect(screen.getByText('I will implement the login flow.')).toBeInTheDocument()
  })

  it('renders tool name for tool_use messages', () => {
    storeState.selectedSession = mockSession
    render(<SessionDetails />)
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it('shows "No recent messages" when messages list is empty', () => {
    storeState.selectedSession = { ...mockSession, recent_messages: [] }
    render(<SessionDetails />)
    expect(screen.getByText('No recent messages')).toBeInTheDocument()
  })

  it('renders overview and transcript tabs', () => {
    storeState.selectedSession = mockSession
    render(<SessionDetails />)
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Raw Transcript')).toBeInTheDocument()
  })

  it('switches to transcript tab when clicked', () => {
    storeState.selectedSession = mockSession
    render(<SessionDetails />)
    fireEvent.click(screen.getByText('Raw Transcript'))
    expect(screen.getByTestId('transcript-viewer')).toBeInTheDocument()
  })

  it('shows overview by default and hides transcript', () => {
    storeState.selectedSession = mockSession
    render(<SessionDetails />)
    expect(screen.getByText('Recent Activity')).toBeInTheDocument()
    expect(screen.queryByTestId('transcript-viewer')).not.toBeInTheDocument()
  })
})
