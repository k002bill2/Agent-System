import { render, screen, fireEvent, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Dashboard, calculateStats } from './Dashboard'
import type { AgentSummary } from './Dashboard'

// lucide-react 아이콘 모킹
vi.mock('lucide-react', () => ({
  Activity: ({ className }: { className?: string }) => (
    <span data-testid="icon-activity" className={className} />
  ),
  CheckCircle: ({ className }: { className?: string }) => (
    <span data-testid="icon-check" className={className} />
  ),
  Clock: ({ className }: { className?: string }) => (
    <span data-testid="icon-clock" className={className} />
  ),
  AlertCircle: ({ className }: { className?: string }) => (
    <span data-testid="icon-alert" className={className} />
  ),
  RefreshCw: ({ className }: { className?: string }) => (
    <span data-testid="icon-refresh" className={className} />
  ),
}))

const mockAgents: AgentSummary[] = [
  { id: '1', name: 'Agent A', status: 'available', tools: 5, availableTools: 3 },
  { id: '2', name: 'Agent B', status: 'busy', tools: 3, availableTools: 1 },
  { id: '3', name: 'Agent C', status: 'offline', tools: 4, availableTools: 0 },
  { id: '4', name: 'Agent D', status: 'available', tools: 2, availableTools: 2 },
]

describe('Dashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the dashboard heading', () => {
    render(<Dashboard />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('renders the refresh button', () => {
    render(<Dashboard />)
    expect(screen.getByRole('button', { name: 'Refresh data' })).toBeInTheDocument()
  })

  it('renders stats cards with correct values from agents', () => {
    render(<Dashboard agents={mockAgents} />)

    // Total Agents
    expect(screen.getByText('Total Agents')).toBeInTheDocument()

    // "Available" 텍스트가 stats card와 Tool Summary 양쪽에 존재하므로 getAllByText 사용
    const availableTexts = screen.getAllByText('Available')
    expect(availableTexts.length).toBeGreaterThanOrEqual(1)

    // Busy
    expect(screen.getByText('Busy')).toBeInTheDocument()

    // Offline
    expect(screen.getByText('Offline')).toBeInTheDocument()

    // 통계값 확인 (4 total agents, 2 available, 1 busy, 1 offline)
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('renders with empty agents by default', () => {
    render(<Dashboard />)

    // All stats should be 0
    const zeroValues = screen.getAllByText('0')
    expect(zeroValues.length).toBeGreaterThanOrEqual(4)
  })

  it('renders error message when error prop is provided', () => {
    render(<Dashboard error="Something went wrong" />)

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent('Something went wrong')
  })

  it('does not render error when error is null', () => {
    render(<Dashboard error={null} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('disables refresh button when isLoading is true', () => {
    render(<Dashboard isLoading={true} />)
    expect(screen.getByRole('button', { name: 'Refresh data' })).toBeDisabled()
  })

  it('enables refresh button when isLoading is false', () => {
    render(<Dashboard isLoading={false} />)
    expect(screen.getByRole('button', { name: 'Refresh data' })).not.toBeDisabled()
  })

  it('renders tool summary section', () => {
    render(<Dashboard agents={mockAgents} />)
    expect(screen.getByText('Tool Summary')).toBeInTheDocument()
  })

  it('renders tool progress bar when totalTools > 0', () => {
    render(<Dashboard agents={mockAgents} />)
    // Total tools = 5 + 3 + 4 + 2 = 14
    expect(screen.getByText('14')).toBeInTheDocument()
    // Available tools = 3 + 1 + 0 + 2 = 6
    expect(screen.getByText('6')).toBeInTheDocument()
  })

  it('has proper ARIA attributes', () => {
    render(<Dashboard />)
    expect(screen.getByRole('main')).toHaveAttribute('aria-label', 'Dashboard')
  })
})

describe('Dashboard - useEffect infinite re-render regression', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls onRefresh only once on mount even when onRefresh is an unstable reference', async () => {
    const refreshFn = vi.fn().mockResolvedValue(undefined)
    let renderCount = 0

    /**
     * 핵심 회귀 테스트: 부모 컴포넌트가 매 렌더에 새 onRefresh 함수를 생성하는 시나리오.
     * 이전 버그에서는 useCallback([onRefresh]) 의존성으로 인해 무한 루프가 발생했음.
     */
    function ParentWithUnstableCallback() {
      renderCount++
      // 매 렌더에 새 함수를 생성 (의도적 -- 부모가 useCallback을 쓰지 않는 경우 시뮬레이션)
      return <Dashboard onRefresh={() => refreshFn()} />
    }

    await act(async () => {
      render(<ParentWithUnstableCallback />)
    })

    // 5초 타이머 실행 (hasFetchedRef 해제)
    await act(async () => {
      vi.advanceTimersByTime(6000)
    })

    // onRefresh가 1번만 호출되어야 함 (무한 루프 방지 확인)
    expect(refreshFn).toHaveBeenCalledTimes(1)

    // 렌더 횟수가 합리적 범위 내여야 함 (무한 리렌더링이 아님)
    // React StrictMode 없이 초기 렌더 + 1~2회 정도
    expect(renderCount).toBeLessThanOrEqual(5)
  })

  it('does not re-trigger useEffect when onRefresh changes', async () => {
    const refreshFn1 = vi.fn().mockResolvedValue(undefined)
    const refreshFn2 = vi.fn().mockResolvedValue(undefined)

    const { rerender } = render(<Dashboard onRefresh={refreshFn1} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(refreshFn1).toHaveBeenCalledTimes(1)

    // 부모가 새 onRefresh를 전달해도 useEffect가 다시 실행되지 않아야 함
    rerender(<Dashboard onRefresh={refreshFn2} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    // 첫 번째 함수는 한 번만 호출됨
    expect(refreshFn1).toHaveBeenCalledTimes(1)
    // 두 번째 함수는 useEffect에 의해 자동 호출되지 않음
    expect(refreshFn2).toHaveBeenCalledTimes(0)
  })

  it('uses the latest onRefresh when manually triggered via button', async () => {
    const refreshFn1 = vi.fn().mockResolvedValue(undefined)
    const refreshFn2 = vi.fn().mockResolvedValue(undefined)

    const { rerender } = render(<Dashboard onRefresh={refreshFn1} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    // 5초 대기하여 hasFetchedRef 해제
    await act(async () => {
      vi.advanceTimersByTime(6000)
    })

    // 새 onRefresh로 리렌더
    rerender(<Dashboard onRefresh={refreshFn2} />)

    // 수동 버튼 클릭 시 최신 onRefresh(refreshFn2)를 사용해야 함
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    })

    expect(refreshFn2).toHaveBeenCalledTimes(1)
  })

  it('calls onRefresh only once on mount (not multiple times)', async () => {
    const refreshFn = vi.fn().mockResolvedValue(undefined)

    await act(async () => {
      render(<Dashboard onRefresh={refreshFn} />)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(refreshFn).toHaveBeenCalledTimes(1)
  })

  it('does not call onRefresh again after state updates from parent', async () => {
    const refreshFn = vi.fn().mockResolvedValue(undefined)

    const { rerender } = render(
      <Dashboard agents={[]} onRefresh={refreshFn} isLoading={false} />
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(refreshFn).toHaveBeenCalledTimes(1)

    // 부모로부터 다른 props 변경 (agents, isLoading)
    rerender(
      <Dashboard
        agents={mockAgents}
        onRefresh={refreshFn}
        isLoading={true}
      />
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    // 여전히 1번만 호출되어야 함
    expect(refreshFn).toHaveBeenCalledTimes(1)
  })

  it('does not cause infinite renders when agents default is used', async () => {
    let renderCount = 0

    function RenderCounter() {
      renderCount++
      return <Dashboard />
    }

    await act(async () => {
      render(<RenderCounter />)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    // 무한 리렌더가 아닌 합리적 횟수
    expect(renderCount).toBeLessThanOrEqual(3)
  })

  it('prevents concurrent refresh calls via hasFetchedRef', async () => {
    let resolveRefresh: () => void
    const refreshFn = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { resolveRefresh = resolve })
    )

    render(<Dashboard onRefresh={refreshFn} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    // 첫 번째 호출이 아직 진행 중인 상태에서 버튼 클릭
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    })

    // hasFetchedRef가 true이므로 중복 호출 방지
    expect(refreshFn).toHaveBeenCalledTimes(1)

    // 첫 번째 호출 완료
    await act(async () => {
      resolveRefresh!()
    })

    // 5초 후 다시 호출 가능
    await act(async () => {
      vi.advanceTimersByTime(6000)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    })

    expect(refreshFn).toHaveBeenCalledTimes(2)
  })
})

describe('Dashboard - calculateStats', () => {
  it('returns zero stats for empty array', () => {
    const stats = calculateStats([])
    expect(stats).toEqual({
      totalAgents: 0,
      availableAgents: 0,
      busyAgents: 0,
      offlineAgents: 0,
      totalTools: 0,
      availableTools: 0,
    })
  })

  it('correctly counts agents by status', () => {
    const stats = calculateStats(mockAgents)
    expect(stats.totalAgents).toBe(4)
    expect(stats.availableAgents).toBe(2)
    expect(stats.busyAgents).toBe(1)
    expect(stats.offlineAgents).toBe(1)
  })

  it('correctly sums tools', () => {
    const stats = calculateStats(mockAgents)
    expect(stats.totalTools).toBe(14)
    expect(stats.availableTools).toBe(6)
  })

  it('handles single agent', () => {
    const stats = calculateStats([mockAgents[0]])
    expect(stats.totalAgents).toBe(1)
    expect(stats.availableAgents).toBe(1)
    expect(stats.busyAgents).toBe(0)
    expect(stats.offlineAgents).toBe(0)
    expect(stats.totalTools).toBe(5)
    expect(stats.availableTools).toBe(3)
  })
})

describe('Dashboard - useMemo stability', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not recalculate stats when agents reference is the same', () => {
    const agents = [...mockAgents]
    const { rerender } = render(<Dashboard agents={agents} />)

    // 같은 참조로 리렌더 -> useMemo가 재계산하지 않아야 함
    rerender(<Dashboard agents={agents} />)

    // 렌더링이 정상 동작하는지 확인
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('recalculates stats when agents array changes', () => {
    const { rerender } = render(<Dashboard agents={mockAgents} />)
    // 4 total agents
    expect(screen.getByText('4')).toBeInTheDocument()

    // 7개 에이전트로 변경 (5 available, 1 busy, 1 offline -- 각 값이 고유하게)
    const newAgents: AgentSummary[] = [
      { id: '1', name: 'Agent A', status: 'available', tools: 2, availableTools: 1 },
      { id: '2', name: 'Agent B', status: 'available', tools: 2, availableTools: 1 },
      { id: '3', name: 'Agent C', status: 'available', tools: 2, availableTools: 1 },
      { id: '4', name: 'Agent D', status: 'available', tools: 2, availableTools: 1 },
      { id: '5', name: 'Agent E', status: 'available', tools: 2, availableTools: 1 },
      { id: '6', name: 'Agent F', status: 'busy', tools: 2, availableTools: 0 },
      { id: '7', name: 'Agent G', status: 'offline', tools: 2, availableTools: 0 },
    ]
    rerender(<Dashboard agents={newAgents} />)

    // Total Agents = 7 (고유한 값)
    expect(screen.getByText('7')).toBeInTheDocument()
    // 이전 4는 더 이상 없어야 함
    expect(screen.queryByText('4')).not.toBeInTheDocument()
  })
})
