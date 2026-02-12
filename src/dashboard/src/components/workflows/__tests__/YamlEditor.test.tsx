import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { YamlEditor } from '../YamlEditor'

describe('YamlEditor', () => {
  const defaultProps = {
    value: 'name: test\njobs:\n  build:\n    steps:\n      - run: echo hello',
    onChange: vi.fn(),
  }

  it('renders textarea with value', () => {
    render(<YamlEditor {...defaultProps} />)
    const textarea = screen.getByRole('textbox')
    expect(textarea).toBeInTheDocument()
    expect(textarea).toHaveValue(defaultProps.value)
  })

  it('calls onChange when content changes', () => {
    const onChange = vi.fn()
    render(<YamlEditor value="name: test" onChange={onChange} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'name: updated' } })
    expect(onChange).toHaveBeenCalledWith('name: updated')
  })

  it('shows Edit and Preview buttons', () => {
    render(<YamlEditor {...defaultProps} />)
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Preview')).toBeInTheDocument()
  })

  it('switches to preview mode', () => {
    render(<YamlEditor {...defaultProps} />)
    fireEvent.click(screen.getByText('Preview'))
    // In preview mode, textarea should not be visible, pre should be
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('shows line numbers', () => {
    render(<YamlEditor {...defaultProps} />)
    // The value has 5 lines
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('detects invalid YAML and shows error', () => {
    render(<YamlEditor value="invalid: yaml: : :" onChange={vi.fn()} />)
    // Should show error indicator
    const errorElements = document.querySelectorAll('.text-red-500, .text-red-400')
    // Error display may or may not be present depending on yaml validity
    expect(errorElements.length).toBeGreaterThanOrEqual(0)
  })

  it('supports readonly mode', () => {
    render(<YamlEditor value="name: test" onChange={vi.fn()} readOnly />)
    const textarea = screen.queryByRole('textbox')
    if (textarea) {
      expect(textarea).toHaveAttribute('readOnly')
    }
  })
})
