import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HealthOverview } from '../HealthOverview'
import type { ProjectHealth, CheckType, WorkflowCheck } from '../../../types/monitoring'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  CheckCircle2: (props: Record<string, unknown>) => <svg data-testid="icon-check-circle" {...props} />,
  XCircle: (props: Record<string, unknown>) => <svg data-testid="icon-x-circle" {...props} />,
  Loader2: (props: Record<string, unknown>) => <svg data-testid="icon-loader" {...props} />,
  Clock: (props: Record<string, unknown>) => <svg data-testid="icon-clock" {...props} />,
  Play: (props: Record<string, unknown>) => <svg data-testid="icon-play" {...props} />,
  Workflow: (props: Record<string, unknown>) => <svg data-testid="icon-workflow" {...props} />,
}))

// Mutable store state
const mockRunCheck = vi.fn()
const mockSetActiveLogView = vi.fn()
const mockRunWorkflowCheck = vi.fn()

let mockRunningChecks = new Set<CheckType>()
let mockActiveLogView: string = 'all'
let mockWorkflowChecks: WorkflowCheck[] = []
let mockRunningWorkflowIds = new Set<string>()

vi.mock('../../../stores/monitoring', () => ({
  useMonitoringStore: () => ({
    getRunningChecks: () => mockRunningChecks,
    runCheck: mockRunCheck,
    activeLogView: mockActiveLogView,
    setActiveLogView: mockSetActiveLogView,
    workflowChecks: mockWorkflowChecks,
    runningWorkflowIds: mockRunningWorkflowIds,
    runWorkflowCheck: mockRunWorkflowCheck,
  }),
}))

const makeHealth = (overrides?: Partial<ProjectHealth>): ProjectHealth => ({
  project_id: 'proj-1',
  project_name: 'Test Project',
  project_path: '/test/project',
  checks: {
    test: { project_id: 'proj-1', check_type: 'test', status: 'idle', exit_code: null, duration_ms: null, stdout: '', stderr: '' },
    lint: { project_id: 'proj-1', check_type: 'lint', status: 'success', exit_code: 0, duration_ms: 1200, stdout: '', stderr: '' },
    typecheck: { project_id: 'proj-1', check_type: 'typecheck', status: 'failure', exit_code: 1, duration_ms: 5000, stdout: '', stderr: '' },
    build: { project_id: 'proj-1', check_type: 'build', status: 'idle', exit_code: null, duration_ms: null, stdout: '', stderr: '' },
  },
  last_updated: '2024-01-01T00:00:00Z',
  ...overrides,
})

describe('HealthOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunningChecks = new Set<CheckType>()
    mockActiveLogView = 'all'
    mockWorkflowChecks = []
    mockRunningWorkflowIds = new Set<string>()
  })

  it('renders "Health Overview" heading', () => {
    render(<HealthOverview health={makeHealth()} projectId="proj-1" />)
    expect(screen.getByText('Health Overview')).toBeInTheDocument()
  })

  it('renders all 4 check type cards', () => {
    render(<HealthOverview health={makeHealth()} projectId="proj-1" />)
    expect(screen.getByText('Test')).toBeInTheDocument()
    expect(screen.getByText('Lint')).toBeInTheDocument()
    expect(screen.getByText('TypeCheck')).toBeInTheDocument()
    expect(screen.getByText('Build')).toBeInTheDocument()
  })

  it('shows correct status text for each check', () => {
    render(<HealthOverview health={makeHealth()} projectId="proj-1" />)
    const notRunTexts = screen.getAllByText('Not run')
    expect(notRunTexts).toHaveLength(2)
    expect(screen.getByText('Pass')).toBeInTheDocument()
    expect(screen.getByText('Failed (1)')).toBeInTheDocument()
  })

  it('shows "No workflows configured" when no workflows', () => {
    render(<HealthOverview health={makeHealth()} projectId="proj-1" />)
    expect(screen.getByText('No workflows configured for this project')).toBeInTheDocument()
  })

  it('renders duration for checks with durationMs', () => {
    render(<HealthOverview health={makeHealth()} projectId="proj-1" />)
    expect(screen.getByText('1.2s')).toBeInTheDocument()
    expect(screen.getByText('5.0s')).toBeInTheDocument()
  })

  it('renders workflow checks section when workflows exist', () => {
    mockWorkflowChecks = [
      { id: 'wf-1', name: 'Deploy', description: 'Deploy workflow', status: 'idle', lastRunAt: null, lastRunDuration: null },
      { id: 'wf-2', name: 'Backup', description: 'Backup workflow', status: 'success', lastRunAt: '2024-01-01', lastRunDuration: 30 },
    ]
    render(<HealthOverview health={makeHealth()} projectId="proj-1" />)
    expect(screen.getByText('Workflow Checks')).toBeInTheDocument()
    expect(screen.getByText('(2)')).toBeInTheDocument()
    expect(screen.getByText('Deploy')).toBeInTheDocument()
    expect(screen.getByText('Backup')).toBeInTheDocument()
  })

  it('handles all checks in success state', () => {
    const health = makeHealth({
      checks: {
        test: { project_id: 'proj-1', check_type: 'test', status: 'success', exit_code: 0, duration_ms: 100, stdout: '', stderr: '' },
        lint: { project_id: 'proj-1', check_type: 'lint', status: 'success', exit_code: 0, duration_ms: 200, stdout: '', stderr: '' },
        typecheck: { project_id: 'proj-1', check_type: 'typecheck', status: 'success', exit_code: 0, duration_ms: 300, stdout: '', stderr: '' },
        build: { project_id: 'proj-1', check_type: 'build', status: 'success', exit_code: 0, duration_ms: 400, stdout: '', stderr: '' },
      },
    })
    render(<HealthOverview health={health} projectId="proj-1" />)
    const passTexts = screen.getAllByText('Pass')
    expect(passTexts).toHaveLength(4)
  })

  it('shows duration in ms for fast checks', () => {
    const health = makeHealth({
      checks: {
        test: { project_id: 'proj-1', check_type: 'test', status: 'success', exit_code: 0, duration_ms: 50, stdout: '', stderr: '' },
        lint: { project_id: 'proj-1', check_type: 'lint', status: 'idle', exit_code: null, duration_ms: null, stdout: '', stderr: '' },
        typecheck: { project_id: 'proj-1', check_type: 'typecheck', status: 'idle', exit_code: null, duration_ms: null, stdout: '', stderr: '' },
        build: { project_id: 'proj-1', check_type: 'build', status: 'idle', exit_code: null, duration_ms: null, stdout: '', stderr: '' },
      },
    })
    render(<HealthOverview health={health} projectId="proj-1" />)
    expect(screen.getByText('50ms')).toBeInTheDocument()
  })
})
