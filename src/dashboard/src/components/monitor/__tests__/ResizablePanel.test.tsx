import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResizablePanel } from '../ResizablePanel'

describe('ResizablePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  // ─── Rendering ────────────────────────────────────────────

  it('renders children content', () => {
    render(
      <ResizablePanel>
        <div>Panel Content</div>
      </ResizablePanel>
    )
    expect(screen.getByText('Panel Content')).toBeInTheDocument()
  })

  it('uses defaultWidth when no saved value in localStorage', () => {
    const { container } = render(
      <ResizablePanel defaultWidth={400}>
        <span>Test</span>
      </ResizablePanel>
    )
    expect(container.firstChild).toHaveStyle({ width: '400px' })
  })

  it('reads saved width from localStorage', () => {
    localStorage.setItem('resizable-panel-width', '600')
    const { container } = render(
      <ResizablePanel defaultWidth={400}>
        <span>Test</span>
      </ResizablePanel>
    )
    expect(container.firstChild).toHaveStyle({ width: '600px' })
  })

  it('uses default width of 525 when no defaultWidth prop is given', () => {
    const { container } = render(
      <ResizablePanel>
        <span>Test</span>
      </ResizablePanel>
    )
    expect(container.firstChild).toHaveStyle({ width: '525px' })
  })

  // ─── className ────────────────────────────────────────────

  it('applies className to the container', () => {
    const { container } = render(
      <ResizablePanel className="custom-panel">
        <span>Test</span>
      </ResizablePanel>
    )
    expect(container.firstChild).toHaveClass('custom-panel')
  })

  // ─── Fixed Mode (minWidth === maxWidth) ───────────────────

  it('hides resize handle when minWidth equals maxWidth', () => {
    const { container } = render(
      <ResizablePanel minWidth={400} maxWidth={400}>
        <span>Fixed</span>
      </ResizablePanel>
    )
    // In fixed mode, the resize handle div with cursor-col-resize should not exist
    const resizeHandle = container.querySelector('.cursor-col-resize')
    expect(resizeHandle).toBeNull()
  })

  it('uses minWidth as width in fixed mode, ignoring localStorage', () => {
    localStorage.setItem('resizable-panel-width', '600')
    const { container } = render(
      <ResizablePanel minWidth={350} maxWidth={350}>
        <span>Fixed</span>
      </ResizablePanel>
    )
    expect(container.firstChild).toHaveStyle({ width: '350px' })
  })

  // ─── Resize Handle Visible ────────────────────────────────

  it('shows resize handle when minWidth differs from maxWidth', () => {
    const { container } = render(
      <ResizablePanel minWidth={200} maxWidth={800}>
        <span>Resizable</span>
      </ResizablePanel>
    )
    const resizeHandle = container.querySelector('.cursor-col-resize')
    expect(resizeHandle).not.toBeNull()
  })

  // ─── Resize Interaction ───────────────────────────────────

  it('starts resizing on mousedown on the handle', () => {
    const { container } = render(
      <ResizablePanel minWidth={200} maxWidth={800} defaultWidth={400}>
        <span>Resizable</span>
      </ResizablePanel>
    )
    const handle = container.querySelector('.cursor-col-resize')!
    fireEvent.mouseDown(handle)

    // During resize, body should have user-select none and cursor col-resize
    expect(document.body.style.userSelect).toBe('none')
    expect(document.body.style.cursor).toBe('col-resize')
  })

  it('stops resizing on mouseup', () => {
    const { container } = render(
      <ResizablePanel minWidth={200} maxWidth={800} defaultWidth={400}>
        <span>Resizable</span>
      </ResizablePanel>
    )
    const handle = container.querySelector('.cursor-col-resize')!
    fireEvent.mouseDown(handle)

    // Simulate mouseup on window
    fireEvent.mouseUp(window)

    // Body styles should be restored
    expect(document.body.style.userSelect).toBe('')
    expect(document.body.style.cursor).toBe('')
  })

  it('cleans up event listeners on unmount during resize', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    const { container, unmount } = render(
      <ResizablePanel minWidth={200} maxWidth={800} defaultWidth={400}>
        <span>Resizable</span>
      </ResizablePanel>
    )
    const handle = container.querySelector('.cursor-col-resize')!
    fireEvent.mouseDown(handle)

    unmount()

    // Should have cleaned up mousemove and mouseup listeners
    const calls = removeEventListenerSpy.mock.calls.map(c => c[0])
    expect(calls).toContain('mousemove')
    expect(calls).toContain('mouseup')

    removeEventListenerSpy.mockRestore()
  })

  // ─── Multiple children ───────────────────────────────────

  it('renders multiple children correctly', () => {
    render(
      <ResizablePanel>
        <div>Child 1</div>
        <div>Child 2</div>
      </ResizablePanel>
    )
    expect(screen.getByText('Child 1')).toBeInTheDocument()
    expect(screen.getByText('Child 2')).toBeInTheDocument()
  })
})
