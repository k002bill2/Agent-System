import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InteractiveDAG } from '../InteractiveDAG'
import type { WorkflowJob } from '../../../types/workflow'

const mockJobs: WorkflowJob[] = [
  {
    id: 'j1',
    run_id: 'r1',
    name: 'build',
    status: 'success',
    runner: 'local',
    needs: [],
    duration_seconds: 45,
    steps: [
      { id: 's1', job_id: 'j1', name: 'Checkout', status: 'success', duration_ms: 200 },
      { id: 's2', job_id: 'j1', name: 'Compile', status: 'success', duration_ms: 500 },
    ],
  },
  {
    id: 'j2',
    run_id: 'r1',
    name: 'test',
    status: 'failure',
    runner: 'docker',
    needs: ['build'],
    duration_seconds: 90,
    steps: [
      { id: 's3', job_id: 'j2', name: 'Run tests', status: 'failure', duration_ms: 1500 },
    ],
  },
  {
    id: 'j3',
    run_id: 'r1',
    name: 'deploy',
    status: 'skipped',
    runner: 'local',
    needs: ['test'],
    steps: [],
  },
]

describe('InteractiveDAG', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty state with no jobs', () => {
    render(<InteractiveDAG jobs={[]} />)
    expect(screen.getByText('No jobs to display')).toBeInTheDocument()
  })

  it('renders job names', () => {
    render(<InteractiveDAG jobs={mockJobs} />)
    expect(screen.getByText('build')).toBeInTheDocument()
    expect(screen.getByText('test')).toBeInTheDocument()
    expect(screen.getByText('deploy')).toBeInTheDocument()
  })

  it('shows runner info for each job', () => {
    render(<InteractiveDAG jobs={mockJobs} />)
    expect(screen.getAllByText('local')).toHaveLength(2)
    expect(screen.getByText('docker')).toBeInTheDocument()
  })

  it('shows step count', () => {
    render(<InteractiveDAG jobs={mockJobs} />)
    expect(screen.getByText('2 steps')).toBeInTheDocument()
    expect(screen.getByText('1 step')).toBeInTheDocument()
    expect(screen.getByText('0 steps')).toBeInTheDocument()
  })

  it('shows duration for completed jobs', () => {
    render(<InteractiveDAG jobs={mockJobs} />)
    expect(screen.getByText('45.0s')).toBeInTheDocument()
    expect(screen.getByText('1m 30s')).toBeInTheDocument()
  })

  it('expands job node to show steps on click', () => {
    render(<InteractiveDAG jobs={mockJobs} />)
    // Click the build job button to expand
    const buildButton = screen.getByText('build').closest('button')!
    fireEvent.click(buildButton)
    expect(screen.getByText('Checkout')).toBeInTheDocument()
    expect(screen.getByText('Compile')).toBeInTheDocument()
  })

  it('shows step duration in expanded view', () => {
    render(<InteractiveDAG jobs={mockJobs} />)
    const buildButton = screen.getByText('build').closest('button')!
    fireEvent.click(buildButton)
    expect(screen.getByText('200ms')).toBeInTheDocument()
    expect(screen.getByText('500ms')).toBeInTheDocument()
  })

  it('collapses expanded job on second click', () => {
    render(<InteractiveDAG jobs={mockJobs} />)
    const buildButton = screen.getByText('build').closest('button')!
    fireEvent.click(buildButton)
    expect(screen.getByText('Checkout')).toBeInTheDocument()
    fireEvent.click(buildButton)
    expect(screen.queryByText('Checkout')).not.toBeInTheDocument()
  })
})
