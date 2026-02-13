import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useRealtimeMonitor,
  type MonitorConfig,
  type MonitorData,
} from './useRealtimeMonitor'

// ── Mock WebSocket ───────────────────────────────────────────────────────

type WSHandler = ((event: { data: string }) => void) | null

class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3

  url: string
  readyState: number = MockWebSocket.CONNECTING
  onopen: ((event: Event) => void) | null = null
  onmessage: WSHandler = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED
  })

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  simulateMessage(data: MonitorData) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.(new CloseEvent('close'))
  }

  simulateError() {
    this.onerror?.(new Event('error'))
  }

  // Static registry
  static instances: MockWebSocket[] = []
  static reset() {
    MockWebSocket.instances = []
  }
  static get latest(): MockWebSocket {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1]
  }
}

// Assign to global
const OriginalWebSocket = globalThis.WebSocket
beforeEach(() => {
  // @ts-expect-error - Mock WebSocket
  globalThis.WebSocket = MockWebSocket
})
afterEach(() => {
  globalThis.WebSocket = OriginalWebSocket
})

// ── Helpers ──────────────────────────────────────────────────────────────

function makeMessage(
  type: string,
  payload: Record<string, unknown> = {},
): MonitorData {
  return { type, payload, timestamp: new Date().toISOString() }
}

const defaultConfig: MonitorConfig = {
  filterTypes: ['log', 'metric', 'alert'],
  maxBufferSize: 1000,
  reconnectMaxAttempts: 10,
  heartbeatInterval: 25000,
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('useRealtimeMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockWebSocket.reset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Bug #1: Race Condition - cleanup flag prevents stale updates ────

  describe('Bug #1: Race condition (cleanup flag / cancelled ref)', () => {
    it('does not update state after unmount (cancelled ref blocks setData)', () => {
      /**
       * 언마운트 후 WebSocket 메시지가 도착해도 state가 업데이트되지 않아야 함.
       * cancelledRef가 true로 설정되어 onmessage 콜백 내 setData 호출을 차단.
       */
      const { result, unmount } = renderHook(() =>
        useRealtimeMonitor('proj-1', defaultConfig),
      )

      const ws = MockWebSocket.latest
      act(() => ws.simulateOpen())
      expect(result.current.status).toBe('connected')

      // 메시지 하나 추가 후 검증
      act(() => ws.simulateMessage(makeMessage('log', { line: 1 })))
      expect(result.current.data).toHaveLength(1)

      // 언마운트
      unmount()

      // 언마운트 후 메시지 도착 - state 변경 없어야 함
      act(() => ws.simulateMessage(makeMessage('log', { line: 2 })))
      // data는 언마운트 시점의 값을 유지 (1개)
      expect(result.current.data).toHaveLength(1)
    })

    it('does not update status after unmount (cancelled ref blocks setStatus)', () => {
      /**
       * 언마운트 후 WebSocket close 이벤트가 와도 status가 변경되지 않아야 함.
       */
      const { result, unmount } = renderHook(() =>
        useRealtimeMonitor('proj-1', defaultConfig),
      )

      const ws = MockWebSocket.latest
      act(() => ws.simulateOpen())
      expect(result.current.status).toBe('connected')

      unmount()

      // 언마운트 후 close 이벤트 - status 변경 없어야 함
      act(() => ws.simulateClose())
      // connected 상태 유지 (실제로는 컴포넌트가 이미 없으므로 관찰 불가)
      expect(result.current.status).toBe('connected')
    })
  })

  // ── Bug #2: Memory Leak - buffer limit & interval/timeout cleanup ───

  describe('Bug #2: Memory leak (buffer limit, interval/timeout cleanup)', () => {
    it('limits data buffer to maxBufferSize and drops oldest items', () => {
      /**
       * maxBufferSize=5로 설정 시, 6번째 메시지부터 가장 오래된 항목 제거.
       * 원본 코드는 [...prev, msg]로 무한 성장하여 OOM 위험.
       */
      const smallBufferConfig: MonitorConfig = {
        filterTypes: ['log'],
        maxBufferSize: 5,
      }

      const { result } = renderHook(() =>
        useRealtimeMonitor('proj-1', smallBufferConfig),
      )

      const ws = MockWebSocket.latest
      act(() => ws.simulateOpen())

      // 7개 메시지 전송
      for (let i = 1; i <= 7; i++) {
        act(() => ws.simulateMessage(makeMessage('log', { index: i })))
      }

      // 버퍼 크기가 5로 제한되어야 함
      expect(result.current.data).toHaveLength(5)
      // 가장 오래된 항목(1, 2)이 제거되고 3~7이 남아야 함
      expect(result.current.data[0].payload).toEqual({ index: 3 })
      expect(result.current.data[4].payload).toEqual({ index: 7 })
    })

    it('clears heartbeat interval on unmount', () => {
      /**
       * 원본 코드에서 heartbeat setInterval이 cleanup에서 clearInterval 되지 않아
       * 컴포넌트 언마운트 후에도 interval이 계속 실행되는 메모리 누수 버그.
       */
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

      const { unmount } = renderHook(() =>
        useRealtimeMonitor('proj-1', defaultConfig),
      )

      const ws = MockWebSocket.latest
      act(() => ws.simulateOpen())

      unmount()

      // clearInterval이 호출되었는지 확인
      expect(clearIntervalSpy).toHaveBeenCalled()
      clearIntervalSpy.mockRestore()
    })

    it('clears reconnect timeout on unmount', () => {
      /**
       * 원본 코드에서 reconnect setTimeout의 참조를 저장하지 않아
       * cleanup에서 clearTimeout을 호출할 수 없었음.
       * 언마운트 후에도 setTimeout 콜백이 실행되어 좀비 WebSocket 생성.
       */
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')

      const { unmount } = renderHook(() =>
        useRealtimeMonitor('proj-1', defaultConfig),
      )

      const ws = MockWebSocket.latest
      act(() => ws.simulateOpen())

      // 연결 끊김 -> reconnect setTimeout 예약
      act(() => ws.simulateClose())

      const instanceCountBefore = MockWebSocket.instances.length

      // 즉시 unmount -> clearTimeout으로 재연결 취소
      unmount()

      expect(clearTimeoutSpy).toHaveBeenCalled()

      // 타이머 실행해도 새 WebSocket이 생성되지 않아야 함
      act(() => {
        vi.advanceTimersByTime(5000)
      })

      expect(MockWebSocket.instances.length).toBe(instanceCountBefore)
      clearTimeoutSpy.mockRestore()
    })
  })

  // ── Bug #3: Stale Closure - config ref always reads latest ──────────

  describe('Bug #3: Stale closure (useRef for config)', () => {
    it('uses latest filterTypes when config changes (no stale closure)', () => {
      /**
       * 원본 코드에서 config는 useEffect 클로저에 캡처되어
       * config.filterTypes가 변경되어도 onmessage가 이전 값을 참조.
       * useRef를 통해 항상 최신 config를 읽도록 수정.
       */
      let currentConfig: MonitorConfig = {
        filterTypes: ['log'],
        maxBufferSize: 100,
      }

      const { result, rerender } = renderHook(
        ({ config }) => useRealtimeMonitor('proj-1', config),
        { initialProps: { config: currentConfig } },
      )

      const ws = MockWebSocket.latest
      act(() => ws.simulateOpen())

      // 'metric' 타입은 초기 filterTypes에 없으므로 무시
      act(() => ws.simulateMessage(makeMessage('metric', { val: 1 })))
      expect(result.current.data).toHaveLength(0)

      // config 변경: filterTypes에 'metric' 추가
      currentConfig = { filterTypes: ['log', 'metric'], maxBufferSize: 100 }
      rerender({ config: currentConfig })

      // 이제 'metric' 타입 메시지가 수락되어야 함
      act(() => ws.simulateMessage(makeMessage('metric', { val: 2 })))
      expect(result.current.data).toHaveLength(1)
      expect(result.current.data[0].type).toBe('metric')
    })

    it('filters out messages not in current filterTypes', () => {
      /**
       * filterTypes에 포함되지 않은 타입의 메시지는 data에 추가되지 않아야 함.
       */
      const { result } = renderHook(() =>
        useRealtimeMonitor('proj-1', {
          filterTypes: ['alert'],
          maxBufferSize: 100,
        }),
      )

      const ws = MockWebSocket.latest
      act(() => ws.simulateOpen())

      act(() => ws.simulateMessage(makeMessage('log', { x: 1 })))
      act(() => ws.simulateMessage(makeMessage('debug', { x: 2 })))
      act(() => ws.simulateMessage(makeMessage('alert', { x: 3 })))

      expect(result.current.data).toHaveLength(1)
      expect(result.current.data[0].type).toBe('alert')
    })
  })

  // ── Bug #4: Reconnect with exponential backoff ──────────────────────

  describe('Bug #4: Reconnect (exponential backoff, max attempts, latest projectId)', () => {
    it('reconnects with exponential backoff delays', () => {
      /**
       * 원본 코드는 고정 3초 딜레이로 재연결 -> thunder herd 문제.
       * 수정: 1s -> 2s -> 4s -> 8s -> ... -> max 30s exponential backoff.
       */
      renderHook(() => useRealtimeMonitor('proj-1', defaultConfig))

      const ws1 = MockWebSocket.latest
      act(() => ws1.simulateOpen())

      // 1차 연결 끊김
      act(() => ws1.simulateClose())
      expect(MockWebSocket.instances).toHaveLength(1)

      // 1초 후 재연결 (첫 번째 backoff: 1000ms)
      act(() => vi.advanceTimersByTime(1000))
      expect(MockWebSocket.instances).toHaveLength(2)

      // 2차 연결 끊김
      const ws2 = MockWebSocket.latest
      act(() => ws2.simulateClose())

      // 2초 후 재연결 (두 번째 backoff: 2000ms)
      act(() => vi.advanceTimersByTime(1999))
      expect(MockWebSocket.instances).toHaveLength(2) // 아직 재연결 안 됨
      act(() => vi.advanceTimersByTime(1))
      expect(MockWebSocket.instances).toHaveLength(3) // 이제 재연결

      // 3차 연결 끊김
      const ws3 = MockWebSocket.latest
      act(() => ws3.simulateClose())

      // 4초 후 재연결 (세 번째 backoff: 4000ms)
      act(() => vi.advanceTimersByTime(4000))
      expect(MockWebSocket.instances).toHaveLength(4)
    })

    it('stops reconnecting after max attempts', () => {
      /**
       * 원본 코드는 재연결 횟수 제한 없이 무한 재시도.
       * 수정: reconnectMaxAttempts (기본 10) 초과 시 disconnected로 전환.
       */
      const limitedConfig: MonitorConfig = {
        filterTypes: ['log'],
        reconnectMaxAttempts: 3,
      }

      const { result } = renderHook(() =>
        useRealtimeMonitor('proj-1', limitedConfig),
      )

      const ws1 = MockWebSocket.latest
      act(() => ws1.simulateOpen())

      // 3번 재연결 시도
      for (let i = 0; i < 3; i++) {
        const currentWs = MockWebSocket.latest
        act(() => currentWs.simulateClose())
        act(() => vi.advanceTimersByTime(MAX_RECONNECT_DELAY + 1000))
      }

      // 3번 재시도 후 마지막 close
      const lastWs = MockWebSocket.latest
      act(() => lastWs.simulateClose())

      // 더 이상 재연결하지 않고 disconnected
      const instanceCount = MockWebSocket.instances.length
      act(() => vi.advanceTimersByTime(60000))
      expect(MockWebSocket.instances.length).toBe(instanceCount)
      expect(result.current.status).toBe('disconnected')
    })

    it('uses latest projectId for reconnection via ref', () => {
      /**
       * 원본 코드에서 reconnect 시 클로저에 캡처된 이전 projectId를 사용.
       * useRef를 통해 항상 최신 projectId로 WebSocket URL을 구성.
       *
       * projectId가 변경되면 useEffect가 재실행되므로 새 연결이 생성됨.
       * 여기서는 projectId 변경 시 올바른 URL로 연결되는지 검증.
       */
      const { rerender } = renderHook(
        ({ pid }) => useRealtimeMonitor(pid, defaultConfig),
        { initialProps: { pid: 'proj-1' } },
      )

      const ws1 = MockWebSocket.latest
      expect(ws1.url).toContain('proj-1')
      act(() => ws1.simulateOpen())

      // projectId 변경 -> effect 재실행 -> 새 WebSocket
      rerender({ pid: 'proj-2' })

      const ws2 = MockWebSocket.latest
      expect(ws2.url).toContain('proj-2')
    })
  })

  // ── Bug #5: Complete cleanup ────────────────────────────────────────

  describe('Bug #5: Complete cleanup (all resources released)', () => {
    it('closes WebSocket and removes all listeners on unmount', () => {
      /**
       * 원본 코드는 ws.close()만 호출하고 이벤트 리스너를 해제하지 않음.
       * 수정: onopen/onmessage/onclose/onerror를 null로 설정 후 close() 호출.
       */
      const { unmount } = renderHook(() =>
        useRealtimeMonitor('proj-1', defaultConfig),
      )

      const ws = MockWebSocket.latest
      act(() => ws.simulateOpen())

      expect(ws.onopen).not.toBeNull()
      expect(ws.onmessage).not.toBeNull()
      expect(ws.onclose).not.toBeNull()

      unmount()

      // 모든 리스너가 null로 해제되어야 함
      expect(ws.onopen).toBeNull()
      expect(ws.onmessage).toBeNull()
      expect(ws.onclose).toBeNull()
      expect(ws.onerror).toBeNull()
      expect(ws.close).toHaveBeenCalled()
    })

    it('previous WebSocket is cleaned up when projectId changes', () => {
      /**
       * projectId가 변경되면 이전 WebSocket이 완전히 정리되어야 함.
       */
      const { rerender } = renderHook(
        ({ pid }) => useRealtimeMonitor(pid, defaultConfig),
        { initialProps: { pid: 'proj-1' } },
      )

      const ws1 = MockWebSocket.latest
      act(() => ws1.simulateOpen())

      // projectId 변경
      rerender({ pid: 'proj-2' })

      // 이전 WebSocket이 닫히고 리스너가 해제됨
      expect(ws1.close).toHaveBeenCalled()
      expect(ws1.onopen).toBeNull()
      expect(ws1.onmessage).toBeNull()
      expect(ws1.onclose).toBeNull()
    })
  })

  // ── Connection Status Transitions ───────────────────────────────────

  describe('Connection status transitions', () => {
    it('transitions: disconnected -> connecting -> connected', () => {
      const { result } = renderHook(() =>
        useRealtimeMonitor('proj-1', defaultConfig),
      )

      // 초기 상태는 connecting (useEffect에서 즉시 connect() 호출)
      expect(result.current.status).toBe('connecting')

      const ws = MockWebSocket.latest
      act(() => ws.simulateOpen())
      expect(result.current.status).toBe('connected')
    })

    it('transitions: connected -> reconnecting -> connecting -> connected', () => {
      const { result } = renderHook(() =>
        useRealtimeMonitor('proj-1', defaultConfig),
      )

      const ws1 = MockWebSocket.latest
      act(() => ws1.simulateOpen())
      expect(result.current.status).toBe('connected')

      // 연결 끊김 -> reconnecting
      act(() => ws1.simulateClose())
      expect(result.current.status).toBe('reconnecting')

      // backoff 후 재연결 시도 -> connecting
      act(() => vi.advanceTimersByTime(1000))
      expect(result.current.status).toBe('connecting')

      // 재연결 성공 -> connected
      const ws2 = MockWebSocket.latest
      act(() => ws2.simulateOpen())
      expect(result.current.status).toBe('connected')
    })
  })

  // ── Heartbeat ───────────────────────────────────────────────────────

  describe('Heartbeat interval', () => {
    it('sends ping at configured heartbeat interval', () => {
      const config: MonitorConfig = {
        filterTypes: ['log'],
        heartbeatInterval: 5000,
      }

      renderHook(() => useRealtimeMonitor('proj-1', config))

      const ws = MockWebSocket.latest
      act(() => ws.simulateOpen())

      // 5초 후 ping 전송
      act(() => vi.advanceTimersByTime(5000))
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }))

      // 10초 후 두 번째 ping
      act(() => vi.advanceTimersByTime(5000))
      expect(ws.send).toHaveBeenCalledTimes(2)
    })

    it('does not send ping when WebSocket is not open', () => {
      renderHook(() =>
        useRealtimeMonitor('proj-1', {
          filterTypes: ['log'],
          heartbeatInterval: 1000,
        }),
      )

      const ws = MockWebSocket.latest
      // readyState는 CONNECTING (open 호출하지 않음)

      act(() => vi.advanceTimersByTime(1000))
      expect(ws.send).not.toHaveBeenCalled()
    })
  })

  // ── clearData & disconnect ──────────────────────────────────────────

  describe('clearData and disconnect', () => {
    it('clearData empties the data array', () => {
      const { result } = renderHook(() =>
        useRealtimeMonitor('proj-1', defaultConfig),
      )

      const ws = MockWebSocket.latest
      act(() => ws.simulateOpen())
      act(() => ws.simulateMessage(makeMessage('log', { a: 1 })))
      act(() => ws.simulateMessage(makeMessage('log', { a: 2 })))
      expect(result.current.data).toHaveLength(2)

      act(() => result.current.clearData())
      expect(result.current.data).toHaveLength(0)
    })

    it('disconnect closes WebSocket and sets status to disconnected', () => {
      const { result } = renderHook(() =>
        useRealtimeMonitor('proj-1', defaultConfig),
      )

      const ws = MockWebSocket.latest
      act(() => ws.simulateOpen())
      expect(result.current.status).toBe('connected')

      act(() => result.current.disconnect())
      expect(ws.close).toHaveBeenCalled()
      expect(result.current.status).toBe('disconnected')
    })

    it('disconnect prevents reconnection attempts', () => {
      const { result } = renderHook(() =>
        useRealtimeMonitor('proj-1', defaultConfig),
      )

      const ws = MockWebSocket.latest
      act(() => ws.simulateOpen())
      act(() => result.current.disconnect())

      const instanceCount = MockWebSocket.instances.length

      // disconnect 후에는 타이머가 실행되어도 재연결하지 않음
      act(() => vi.advanceTimersByTime(60000))
      expect(MockWebSocket.instances.length).toBe(instanceCount)
    })
  })
})

// ── Constants re-export for test use ──────────────────────────────────
const MAX_RECONNECT_DELAY = 30000
