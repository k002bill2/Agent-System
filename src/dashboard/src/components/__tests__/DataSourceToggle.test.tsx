import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { DataSourceToggle } from '../DataSourceToggle'

describe('DataSourceToggle', () => {
  it('renders both toggle buttons', () => {
    const onChange = vi.fn()
    render(<DataSourceToggle value="aos" onChange={onChange} />)

    expect(screen.getByText('AOS Session')).toBeInTheDocument()
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  it('highlights AOS Session when value is aos', () => {
    const onChange = vi.fn()
    render(<DataSourceToggle value="aos" onChange={onChange} />)

    const aosButton = screen.getByText('AOS Session').closest('button')
    expect(aosButton).toHaveClass('bg-white')
  })

  it('highlights Claude Code when value is claude-code', () => {
    const onChange = vi.fn()
    render(<DataSourceToggle value="claude-code" onChange={onChange} />)

    const claudeButton = screen.getByText('Claude Code').closest('button')
    expect(claudeButton).toHaveClass('bg-white')
  })

  it('calls onChange with aos when AOS Session clicked', () => {
    const onChange = vi.fn()
    render(<DataSourceToggle value="claude-code" onChange={onChange} />)

    fireEvent.click(screen.getByText('AOS Session'))
    expect(onChange).toHaveBeenCalledWith('aos')
  })

  it('calls onChange with claude-code when Claude Code clicked', () => {
    const onChange = vi.fn()
    render(<DataSourceToggle value="aos" onChange={onChange} />)

    fireEvent.click(screen.getByText('Claude Code'))
    expect(onChange).toHaveBeenCalledWith('claude-code')
  })

  it('applies custom className', () => {
    const onChange = vi.fn()
    const { container } = render(
      <DataSourceToggle value="aos" onChange={onChange} className="custom-class" />
    )

    expect(container.firstChild).toHaveClass('custom-class')
  })
})
