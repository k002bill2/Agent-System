import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────

export interface MonitorConfig {
  filterTypes: string[]
  maxBufferSize?: number // default: 1000
  reconnectMaxAttempts?: number // default: 10
  heartbeatInterval?: number // default: 25000
}

export interface MonitorData {
  type: string
  payload: Record<string, unknown>
  timestamp: string
}

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'

// ── Default Constants ────────────────────────────────────────────────────

const DEFAULT_MAX_BUFFER_SIZE = 1000
const DEFAULT_RECONNECT_MAX_ATTEMPTS = 10
const DEFAULT_HEARTBEAT_INTERVAL = 25000
const INITIAL_RECONNECT_DELAY = 1000
const MAX_RECONNECT_DELAY = 30000

// ── Hook ─────────────────────────────────────────────────────────────────

export function useRealtimeMonitor(
  projectId: string,
  config: MonitorConfig,
) {
  const [data, setData] = useState<MonitorData[]>([])
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')

  /**
   * ROOT CAUSE ANALYSIS (근본 원인 분석) - Bug #3: Stale Closure
   *
   * [원본 버그] config와 projectId가 useEffect의 클로저에 캡처되어,
   * ws.onmessage / ws.onclose 콜백이 항상 초기 렌더 시점의 값을 참조함.
   * config가 변경되어도 filterTypes 등이 업데이트되지 않고,
   * reconnect 시에도 이전 projectId로 연결을 시도하는 문제 발생.
   *
   * [수정] useRef를 사용하여 config와 projectId의 최신 값을 항상 참조.
   * 콜백 내에서 ref.current를 읽으면 클로저 문제 없이 최신 값을 얻음.
   */
  const configRef = useRef(config)
  configRef.current = config

  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId

  /**
   * ROOT CAUSE ANALYSIS (근본 원인 분석) - Bug #1: Race Condition
   *
   * [원본 버그] 컴포넌트 언마운트 후에도 WebSocket의 onmessage/onclose
   * 콜백이 실행되어 setData/setStatus를 호출 -> React 경고 발생 및
   * 메모리 누수. cleanup 함수에서 ws.close()만 호출하고 콜백 내부에서
   * 컴포넌트 마운트 상태를 확인하지 않았음.
   *
   * [수정] cancelledRef (isMounted 패턴의 반전)를 사용하여
   * cleanup 시 true로 설정. 모든 콜백에서 cancelledRef.current를
   * 확인한 후에만 state 업데이트를 수행.
   */
  const cancelledRef = useRef(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectAttemptsRef = useRef(0)

  /**
   * clearData: 외부에서 데이터 버퍼를 수동으로 비울 수 있는 함수.
   * useCallback으로 감싸 참조 안정성 보장.
   */
  const clearData = useCallback(() => {
    setData([])
  }, [])

  /**
   * disconnect: 외부에서 명시적으로 WebSocket 연결을 종료하는 함수.
   * 재연결 시도를 막기 위해 cancelledRef를 true로 설정하고,
   * 모든 리소스(타이머, WebSocket)를 정리.
   */
  const disconnect = useCallback(() => {
    cancelledRef.current = true

    if (reconnectTimeoutRef.current !== null) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (heartbeatIntervalRef.current !== null) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }

    if (wsRef.current) {
      wsRef.current.onopen = null
      wsRef.current.onmessage = null
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.close()
      wsRef.current = null
    }

    setStatus('disconnected')
  }, [])

  useEffect(() => {
    // 새 effect 실행 시 cancelled 플래그 초기화
    cancelledRef.current = false
    reconnectAttemptsRef.current = 0

    function cleanup() {
      /**
       * ROOT CAUSE ANALYSIS (근본 원인 분석) - Bug #2 & #5: Memory Leak & Incomplete Cleanup
       *
       * [원본 버그]
       * 1) heartbeat setInterval이 cleanup에서 clearInterval 되지 않아
       *    컴포넌트 언마운트 후에도 계속 실행 -> 메모리 누수.
       * 2) reconnect setTimeout이 cleanup에서 clearTimeout 되지 않아
       *    언마운트 후에도 새 WebSocket 연결을 시도 -> 좀비 연결 생성.
       * 3) WebSocket 이벤트 리스너가 cleanup에서 해제되지 않아
       *    언마운트 후에도 콜백이 실행될 수 있음.
       *
       * [수정] cleanup 함수에서 모든 리소스를 명시적으로 해제:
       * - cancelledRef.current = true (콜백 내 상태 업데이트 차단)
       * - clearInterval(heartbeatIntervalRef) (하트비트 정리)
       * - clearTimeout(reconnectTimeoutRef) (재연결 타이머 정리)
       * - ws.onopen/onmessage/onclose/onerror = null (리스너 해제)
       * - ws.close() (WebSocket 연결 종료)
       */
      cancelledRef.current = true

      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }

      if (heartbeatIntervalRef.current !== null) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
      }

      if (wsRef.current) {
        wsRef.current.onopen = null
        wsRef.current.onmessage = null
        wsRef.current.onclose = null
        wsRef.current.onerror = null
        wsRef.current.close()
        wsRef.current = null
      }
    }

    function connect() {
      // 이미 취소된 상태이면 연결하지 않음
      if (cancelledRef.current) return

      // 이전 리소스 정리
      if (heartbeatIntervalRef.current !== null) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
      }

      if (wsRef.current) {
        wsRef.current.onopen = null
        wsRef.current.onmessage = null
        wsRef.current.onclose = null
        wsRef.current.onerror = null
        wsRef.current.close()
        wsRef.current = null
      }

      const currentProjectId = projectIdRef.current
      setStatus('connecting')

      const ws = new WebSocket(
        `ws://localhost:8000/ws/monitor/${currentProjectId}`,
      )
      wsRef.current = ws

      ws.onopen = () => {
        if (cancelledRef.current) return
        setStatus('connected')
        reconnectAttemptsRef.current = 0
      }

      ws.onmessage = (event: MessageEvent) => {
        if (cancelledRef.current) return

        const msg: MonitorData = JSON.parse(event.data as string)

        /**
         * [수정] configRef.current를 사용하여 항상 최신 config를 참조.
         * 원본 코드는 클로저에 캡처된 config를 사용하여 filterTypes가
         * 변경되어도 반영되지 않았음.
         */
        const currentConfig = configRef.current
        if (currentConfig.filterTypes.includes(msg.type)) {
          /**
           * ROOT CAUSE ANALYSIS (근본 원인 분석) - Bug #2: Unbounded Array Growth (Memory Leak)
           *
           * [원본 버그] setData(prev => [...prev, msg])로 무한히 데이터가
           * 누적되어 메모리 사용량이 계속 증가. 장시간 실행 시 OOM 발생 가능.
           *
           * [수정] maxBufferSize (기본값 1000)를 초과하면 가장 오래된 항목부터
           * 제거하여 버퍼 크기를 제한. slice를 사용해 오래된 데이터를 드롭.
           */
          const maxSize =
            currentConfig.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE

          setData((prev) => {
            const next = [...prev, msg]
            if (next.length > maxSize) {
              return next.slice(next.length - maxSize)
            }
            return next
          })
        }
      }

      ws.onclose = () => {
        if (cancelledRef.current) return

        // 하트비트 정리 (연결 끊김 시)
        if (heartbeatIntervalRef.current !== null) {
          clearInterval(heartbeatIntervalRef.current)
          heartbeatIntervalRef.current = null
        }

        const maxAttempts =
          configRef.current.reconnectMaxAttempts ?? DEFAULT_RECONNECT_MAX_ATTEMPTS

        if (reconnectAttemptsRef.current >= maxAttempts) {
          setStatus('disconnected')
          return
        }

        /**
         * ROOT CAUSE ANALYSIS (근본 원인 분석) - Bug #4: Reconnect Logic
         *
         * [원본 버그]
         * 1) reconnect에서 projectId 클로저 캡처 -> 이전 projectId로 재연결.
         * 2) 고정 3초 딜레이 -> 서버 과부하 시 thunder herd 문제 발생 가능.
         * 3) setTimeout 참조를 저장하지 않아 cleanup에서 취소 불가.
         * 4) 재연결 횟수 제한 없음 -> 무한 재연결 시도.
         *
         * [수정]
         * - projectIdRef.current 사용으로 항상 최신 projectId로 재연결.
         * - Exponential backoff: 1s -> 2s -> 4s -> 8s -> ... -> max 30s.
         * - reconnectTimeoutRef에 setTimeout ID 저장 -> cleanup에서 clearTimeout.
         * - reconnectMaxAttempts (기본 10)로 최대 재시도 횟수 제한.
         */
        setStatus('reconnecting')

        const attempt = reconnectAttemptsRef.current
        const delay = Math.min(
          INITIAL_RECONNECT_DELAY * Math.pow(2, attempt),
          MAX_RECONNECT_DELAY,
        )
        reconnectAttemptsRef.current = attempt + 1

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null
          if (!cancelledRef.current) {
            connect()
          }
        }, delay)
      }

      ws.onerror = () => {
        // onerror 후에 onclose가 자동으로 호출되므로 여기서는
        // 별도의 상태 변경 없이 onclose에 위임
      }

      // ── Heartbeat ────────────────────────────────────────────
      const heartbeatMs =
        configRef.current.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL

      heartbeatIntervalRef.current = setInterval(() => {
        if (cancelledRef.current) {
          if (heartbeatIntervalRef.current !== null) {
            clearInterval(heartbeatIntervalRef.current)
            heartbeatIntervalRef.current = null
          }
          return
        }
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, heartbeatMs)
    }

    connect()

    return cleanup
    /**
     * [수정] config를 의존성에서 제외하고 useRef로 대체.
     * projectId가 변경될 때만 effect를 재실행하여 새 WebSocket을 연결.
     * config 변경은 ref를 통해 즉시 반영되므로 effect 재실행 불필요.
     */
  }, [projectId])

  return { data, status, clearData, disconnect }
}
