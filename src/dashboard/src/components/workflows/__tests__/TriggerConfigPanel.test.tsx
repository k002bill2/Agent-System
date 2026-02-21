import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TriggerConfigPanel } from '../TriggerConfigPanel'

// Mock the CronBuilder child component
vi.mock('../CronBuilder', () => ({
  CronBuilder: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <div data-testid="cron-builder">
      <span>CronBuilder: {value}</span>
      <button onClick={() => onChange('0 9 * * *')}>change-cron</button>
    </div>
  ),
}))

describe('TriggerConfigPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders trigger type tabs', () => {
    render(<TriggerConfigPanel workflowId="w1" />)
    expect(screen.getByText('Manual')).toBeInTheDocument()
    expect(screen.getByText('Schedule')).toBeInTheDocument()
    expect(screen.getByText('Webhook')).toBeInTheDocument()
    expect(screen.getByText('Push')).toBeInTheDocument()
    expect(screen.getByText('PR')).toBeInTheDocument()
  })

  it('shows manual tab content by default', () => {
    render(<TriggerConfigPanel workflowId="w1" />)
    expect(screen.getByText(/수동으로만 트리거/)).toBeInTheDocument()
  })

  it('shows schedule tab with CronBuilder on click', () => {
    render(<TriggerConfigPanel workflowId="w1" />)
    fireEvent.click(screen.getByText('Schedule'))
    expect(screen.getByTestId('cron-builder')).toBeInTheDocument()
    expect(screen.getByText('Timezone')).toBeInTheDocument()
  })

  it('shows webhook tab with URL on click', () => {
    render(<TriggerConfigPanel workflowId="w1" />)
    fireEvent.click(screen.getByText('Webhook'))
    expect(screen.getByText('Webhook URL')).toBeInTheDocument()
  })

  it('shows branches input on push tab click', () => {
    render(<TriggerConfigPanel workflowId="w1" />)
    fireEvent.click(screen.getByText('Push'))
    expect(screen.getByText(/Branches/)).toBeInTheDocument()
    expect(screen.getByText(/Paths/)).toBeInTheDocument()
  })

  it('shows branches input on PR tab click', () => {
    render(<TriggerConfigPanel workflowId="w1" />)
    fireEvent.click(screen.getByText('PR'))
    expect(screen.getByText(/Branches/)).toBeInTheDocument()
  })

  it('renders save button', () => {
    render(<TriggerConfigPanel workflowId="w1" />)
    expect(screen.getByText('설정 저장')).toBeInTheDocument()
  })

  it('calls onSave with manual config by default', () => {
    const onSave = vi.fn()
    render(<TriggerConfigPanel workflowId="w1" onSave={onSave} />)
    fireEvent.click(screen.getByText('설정 저장'))
    expect(onSave).toHaveBeenCalledWith({ manual: {} })
  })

  it('calls onSave with schedule config when schedule tab is active', () => {
    const onSave = vi.fn()
    render(<TriggerConfigPanel workflowId="w1" onSave={onSave} />)
    fireEvent.click(screen.getByText('Schedule'))
    fireEvent.click(screen.getByText('설정 저장'))
    expect(onSave).toHaveBeenCalledWith({ schedule: [{ cron: '0 * * * *' }] })
  })

  it('calls onSave with push config when push tab is active', () => {
    const onSave = vi.fn()
    render(<TriggerConfigPanel workflowId="w1" onSave={onSave} />)
    fireEvent.click(screen.getByText('Push'))
    fireEvent.click(screen.getByText('설정 저장'))
    expect(onSave).toHaveBeenCalledWith({ push: { branches: ['main'] } })
  })
})
