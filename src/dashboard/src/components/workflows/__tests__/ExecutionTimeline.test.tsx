import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExecutionTimeline } from '../ExecutionTimeline'
import type { WorkflowJob } from '../../../types/workflow'

const mockJobs: WorkflowJob[] = [
  {
    id: 'j1',
    run_id: 'r1',
    name: 'build',
    status: 'success',
    runner: 'local',
    needs: [],
    started_at: '2024-01-01T10:00:00Z',
    completed_at: '2024-01-01T10:01:00Z',
    duration_seconds: 60,
    steps: [],
  },
  {
    id: 'j2',
    run_id: 'r1',
    name: 'test',
    status: 'failure',
    runner: 'local',
    needs: ['build'],
    started_at: '2024-01-01T10:01:00Z',
    completed_at: '2024-01-01T10:02:30Z',
    duration_seconds: 90,
    steps: [],
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

describe('ExecutionTimeline', () => {
  it('renders job names', () => {
    render(<ExecutionTimeline jobs={mockJobs} />)
    expect(screen.getByText('build')).toBeInTheDocument()
    expect(screen.getByText('test')).toBeInTheDocument()
    expect(screen.getByText('deploy')).toBeInTheDocument()
  })

  it('shows duration for completed jobs', () => {
    render(<ExecutionTimeline jobs={mockJobs} />)
    expect(screen.getByText(/60\.0s|1m 0s/)).toBeInTheDocument()
  })

  it('renders empty state with no jobs', () => {
    render(<ExecutionTimeline jobs={[]} />)
    expect(screen.getByText('No execution data')).toBeInTheDocument()
  })

  it('renders heading', () => {
    render(<ExecutionTimeline jobs={mockJobs} />)
    expect(screen.getByText('Execution Timeline')).toBeInTheDocument()
  })
})
