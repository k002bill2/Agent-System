import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { PermissionInfo, AgentPermission } from '../../../stores/permissions'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Shield: (props: Record<string, unknown>) => <span data-testid="icon-shield" {...props} />,
  ShieldAlert: (props: Record<string, unknown>) => <span data-testid="icon-shield-alert" {...props} />,
  ShieldCheck: (props: Record<string, unknown>) => <span data-testid="icon-shield-check" {...props} />,
  Terminal: (props: Record<string, unknown>) => <span data-testid="icon-terminal" {...props} />,
  FileEdit: (props: Record<string, unknown>) => <span data-testid="icon-file-edit" {...props} />,
  FileSearch: (props: Record<string, unknown>) => <span data-testid="icon-file-search" {...props} />,
  Trash2: (props: Record<string, unknown>) => <span data-testid="icon-trash" {...props} />,
  Globe: (props: Record<string, unknown>) => <span data-testid="icon-globe" {...props} />,
  Wrench: (props: Record<string, unknown>) => <span data-testid="icon-wrench" {...props} />,
  Plus: (props: Record<string, unknown>) => <span data-testid="icon-plus" {...props} />,
  ListTodo: (props: Record<string, unknown>) => <span data-testid="icon-list" {...props} />,
  CheckSquare: (props: Record<string, unknown>) => <span data-testid="icon-check-sq" {...props} />,
  Loader2: (props: Record<string, unknown>) => <span data-testid="icon-loader" {...props} />,
  ChevronDown: (props: Record<string, unknown>) => <span data-testid="icon-chevron-down" {...props} />,
  ChevronUp: (props: Record<string, unknown>) => <span data-testid="icon-chevron-up" {...props} />,
  AlertTriangle: (props: Record<string, unknown>) => <span data-testid="icon-alert" {...props} />,
}))

const mockPermissions: PermissionInfo[] = [
  { permission: 'execute_bash', enabled: true, title: 'Execute Bash', description: 'Run shell commands', risk: 'high' },
  { permission: 'write_file', enabled: true, title: 'Write File', description: 'Create and modify files', risk: 'medium' },
  { permission: 'read_file', enabled: true, title: 'Read File', description: 'Read file contents', risk: 'low' },
  { permission: 'delete_file', enabled: false, title: 'Delete File', description: 'Remove files', risk: 'high' },
  { permission: 'network_access', enabled: false, title: 'Network Access', description: 'Make network calls', risk: 'medium' },
]

const mockFetchPermissions = vi.fn()
const mockTogglePermission = vi.fn().mockResolvedValue(true)

let storeState = {
  permissions: mockPermissions,
  disabledAgents: [] as string[],
  loading: false,
  error: null as string | null,
  fetchPermissions: mockFetchPermissions,
  togglePermission: mockTogglePermission,
}

vi.mock('../../../stores/permissions', () => ({
  usePermissionsStore: vi.fn(() => storeState),
}))

import { PermissionTogglePanel } from '../PermissionTogglePanel'

describe('PermissionTogglePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState = {
      permissions: mockPermissions,
      disabledAgents: [],
      loading: false,
      error: null,
      fetchPermissions: mockFetchPermissions,
      togglePermission: mockTogglePermission,
    }
  })

  it('returns null when no sessionId', () => {
    const { container } = render(<PermissionTogglePanel sessionId={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows error message when error is set', () => {
    storeState.error = 'Something went wrong'
    render(<PermissionTogglePanel sessionId="sess-1" />)
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument()
  })

  it('fetches permissions when sessionId changes', () => {
    render(<PermissionTogglePanel sessionId="sess-1" />)
    expect(mockFetchPermissions).toHaveBeenCalledWith('sess-1')
  })

  it('renders header with "Permissions" title', () => {
    render(<PermissionTogglePanel sessionId="sess-1" />)
    expect(screen.getByText('Permissions')).toBeInTheDocument()
  })

  it('displays enabled/total count', () => {
    render(<PermissionTogglePanel sessionId="sess-1" />)
    // 3 enabled out of 5
    expect(screen.getByText('3/5')).toBeInTheDocument()
  })

  it('displays high-risk warning when high-risk permissions are enabled', () => {
    render(<PermissionTogglePanel sessionId="sess-1" />)
    // execute_bash is high-risk and enabled
    expect(screen.getByText('1 high-risk')).toBeInTheDocument()
  })

  it('renders all permission rows', () => {
    render(<PermissionTogglePanel sessionId="sess-1" />)
    expect(screen.getByText('Execute Bash')).toBeInTheDocument()
    expect(screen.getByText('Write File')).toBeInTheDocument()
    expect(screen.getByText('Read File')).toBeInTheDocument()
    expect(screen.getByText('Delete File')).toBeInTheDocument()
    expect(screen.getByText('Network Access')).toBeInTheDocument()
  })

  it('renders permission descriptions', () => {
    render(<PermissionTogglePanel sessionId="sess-1" />)
    expect(screen.getByText('Run shell commands')).toBeInTheDocument()
    expect(screen.getByText('Read file contents')).toBeInTheDocument()
  })

  it('renders risk badges', () => {
    render(<PermissionTogglePanel sessionId="sess-1" />)
    expect(screen.getAllByText('high')).toHaveLength(2) // execute_bash and delete_file
    expect(screen.getAllByText('medium')).toHaveLength(2) // write_file and network_access
    expect(screen.getByText('low')).toBeInTheDocument()
  })

  it('renders toggle switches for each permission', () => {
    render(<PermissionTogglePanel sessionId="sess-1" />)
    // Each permission has a toggle button (besides the header area)
    const toggleButtons = screen.getAllByRole('button')
    // Filter out the header click area: there's one for header and 5 for toggles
    expect(toggleButtons.length).toBeGreaterThanOrEqual(5)
  })

  it('calls togglePermission when toggle is clicked', async () => {
    render(<PermissionTogglePanel sessionId="sess-1" />)
    // Find all toggle buttons and click one
    // The PermissionRow toggle buttons are the smaller ones
    const buttons = screen.getAllByRole('button')
    // Last 5 buttons should be toggles (one per permission)
    const toggleBtn = buttons[buttons.length - 1] // last toggle
    fireEvent.click(toggleBtn)
    await waitFor(() => {
      expect(mockTogglePermission).toHaveBeenCalled()
    })
  })

  it('shows loading spinner during loading', () => {
    storeState.loading = true
    render(<PermissionTogglePanel sessionId="sess-1" />)
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument()
  })

  it('renders disabled agents section when present', () => {
    storeState.disabledAgents = ['agent-1', 'agent-2']
    render(<PermissionTogglePanel sessionId="sess-1" />)
    expect(screen.getByText('Disabled Agents')).toBeInTheDocument()
    expect(screen.getByText('agent-1')).toBeInTheDocument()
    expect(screen.getByText('agent-2')).toBeInTheDocument()
  })

  it('does not render disabled agents section when empty', () => {
    render(<PermissionTogglePanel sessionId="sess-1" />)
    expect(screen.queryByText('Disabled Agents')).not.toBeInTheDocument()
  })

  // Compact mode tests
  it('renders compact collapsed view showing summary', () => {
    render(<PermissionTogglePanel sessionId="sess-1" compact />)
    expect(screen.getByText('3/5 permissions')).toBeInTheDocument()
  })

  it('expands compact view when clicked', () => {
    render(<PermissionTogglePanel sessionId="sess-1" compact />)
    fireEvent.click(screen.getByText('3/5 permissions'))
    // After expanding, should show full panel with permission titles
    expect(screen.getByText('Execute Bash')).toBeInTheDocument()
  })

  it('shows ShieldAlert icon in compact mode when high-risk enabled', () => {
    render(<PermissionTogglePanel sessionId="sess-1" compact />)
    expect(screen.getByTestId('icon-shield-alert')).toBeInTheDocument()
  })

  it('shows ShieldCheck icon in compact mode when no high-risk enabled', () => {
    const noHighRisk = mockPermissions.map(p =>
      p.permission === 'execute_bash' ? { ...p, enabled: false } : p
    )
    storeState.permissions = noHighRisk
    render(<PermissionTogglePanel sessionId="sess-1" compact />)
    expect(screen.getByTestId('icon-shield-check')).toBeInTheDocument()
  })
})
