import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock lib/utils
vi.mock('../../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

import { VerticalSplitPanel } from '../VerticalSplitPanel'

describe('VerticalSplitPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders top and bottom content', () => {
    render(
      <VerticalSplitPanel
        topContent={<div>Top Panel Content</div>}
        bottomContent={<div>Bottom Panel Content</div>}
      />
    )

    expect(screen.getByText('Top Panel Content')).toBeInTheDocument()
    expect(screen.getByText('Bottom Panel Content')).toBeInTheDocument()
  })

  it('renders panel headers', () => {
    render(
      <VerticalSplitPanel
        topContent={<div>Top</div>}
        bottomContent={<div>Bottom</div>}
      />
    )

    // Korean labels from component
    expect(screen.getByText(/기본 정보/)).toBeInTheDocument()
    expect(screen.getByText(/실행 결과/)).toBeInTheDocument()
  })

  it('renders resize handle', () => {
    const { container } = render(
      <VerticalSplitPanel
        topContent={<div>Top</div>}
        bottomContent={<div>Bottom</div>}
      />
    )

    // Resize handle has cursor-row-resize class
    const handle = container.querySelector('.cursor-row-resize')
    expect(handle).toBeInTheDocument()
  })

  it('uses default top height when no saved value', () => {
    const { container } = render(
      <VerticalSplitPanel
        topContent={<div>Top</div>}
        bottomContent={<div>Bottom</div>}
        defaultTopHeight={40}
      />
    )

    // Top panel should have height 40%
    const topPanel = container.firstChild!.firstChild as HTMLElement
    expect(topPanel.style.height).toBe('40%')
  })

  it('uses saved value from localStorage', () => {
    localStorage.setItem('test-split-key', '60')

    const { container } = render(
      <VerticalSplitPanel
        topContent={<div>Top</div>}
        bottomContent={<div>Bottom</div>}
        storageKey="test-split-key"
        defaultTopHeight={40}
      />
    )

    const topPanel = container.firstChild!.firstChild as HTMLElement
    expect(topPanel.style.height).toBe('60%')
  })

  it('has two collapse/maximize buttons', () => {
    render(
      <VerticalSplitPanel
        topContent={<div>Top</div>}
        bottomContent={<div>Bottom</div>}
      />
    )

    // Two buttons: one for top panel maximize, one for bottom panel maximize
    const topMaxBtn = screen.getByTitle(/상단 패널 최대화/)
    const bottomMaxBtn = screen.getByTitle(/하단 패널 최대화/)
    expect(topMaxBtn).toBeInTheDocument()
    expect(bottomMaxBtn).toBeInTheDocument()
  })

  it('maximizes top panel when top maximize button is clicked', () => {
    const { container } = render(
      <VerticalSplitPanel
        topContent={<div>Top</div>}
        bottomContent={<div>Bottom</div>}
        defaultTopHeight={40}
      />
    )

    // Click to maximize top panel (collapse bottom)
    fireEvent.click(screen.getByTitle(/상단 패널 최대화/))

    const topPanel = container.firstChild!.firstChild as HTMLElement
    expect(topPanel.style.height).toBe('100%')

    // Resize handle should be hidden
    expect(container.querySelector('.cursor-row-resize')).not.toBeInTheDocument()
  })

  it('maximizes bottom panel when bottom maximize button is clicked', () => {
    const { container } = render(
      <VerticalSplitPanel
        topContent={<div>Top</div>}
        bottomContent={<div>Bottom</div>}
        defaultTopHeight={40}
      />
    )

    // Click to maximize bottom panel (collapse top)
    fireEvent.click(screen.getByTitle(/하단 패널 최대화/))

    const topPanel = container.firstChild!.firstChild as HTMLElement
    expect(topPanel.style.height).toBe('0%')

    // Resize handle should be hidden
    expect(container.querySelector('.cursor-row-resize')).not.toBeInTheDocument()
  })

  it('restores panels after maximizing top and then clicking again', () => {
    const { container } = render(
      <VerticalSplitPanel
        topContent={<div>Top</div>}
        bottomContent={<div>Bottom</div>}
        defaultTopHeight={40}
      />
    )

    // First click maximizes top
    fireEvent.click(screen.getByTitle(/상단 패널 최대화/))
    const topPanel = container.firstChild!.firstChild as HTMLElement
    expect(topPanel.style.height).toBe('100%')

    // Button title changes to "하단 패널 펼치기" when bottom is collapsed
    fireEvent.click(screen.getByTitle(/하단 패널 펼치기/))
    expect(topPanel.style.height).toBe('40%')
  })

  it('restores panels after maximizing bottom and then clicking again', () => {
    const { container } = render(
      <VerticalSplitPanel
        topContent={<div>Top</div>}
        bottomContent={<div>Bottom</div>}
        defaultTopHeight={40}
      />
    )

    // First click maximizes bottom
    fireEvent.click(screen.getByTitle(/하단 패널 최대화/))
    const topPanel = container.firstChild!.firstChild as HTMLElement
    expect(topPanel.style.height).toBe('0%')

    // Button title changes to "상단 패널 펼치기" when top is collapsed
    fireEvent.click(screen.getByTitle(/상단 패널 펼치기/))
    expect(topPanel.style.height).toBe('40%')
  })

  it('accepts custom className', () => {
    const { container } = render(
      <VerticalSplitPanel
        topContent={<div>Top</div>}
        bottomContent={<div>Bottom</div>}
        className="custom-class"
      />
    )

    expect((container.firstChild as HTMLElement).className).toContain('custom-class')
  })

  it('uses custom storageKey', () => {
    localStorage.setItem('my-custom-key', '55')

    const { container } = render(
      <VerticalSplitPanel
        topContent={<div>Top</div>}
        bottomContent={<div>Bottom</div>}
        storageKey="my-custom-key"
      />
    )

    const topPanel = container.firstChild!.firstChild as HTMLElement
    expect(topPanel.style.height).toBe('55%')
  })
})
