import { useCallback, useEffect, useRef, useState } from 'react'

import { agentService, type Agent } from '@/services/agentService'
import { isApiError, userMessageForError } from '@/services/errors'

/**
 * Lifecycle of the registry fetch.
 *
 * `ready` with an empty `agents` array means "the registry really is empty" —
 * it is deliberately distinct from `error`, so an auth failure or a network
 * fault can never be rendered as "no agents registered".
 */
export type AgentRegistryState = 'loading' | 'ready' | 'error'

export interface UseAgentRegistryResult {
  /** Agents as returned by `GET /api/agents` (snake_case, untransformed). */
  agents: Agent[]
  /** First-load lifecycle. Stays `ready`/`error` across manual refreshes. */
  state: AgentRegistryState
  /** User-facing failure message, non-null only when `state === 'error'`. */
  error: string | null
  /** Epoch ms of the last successful load, or null before the first success. */
  lastUpdatedAt: number | null
  /** True while a request is in flight, including refreshes. */
  isRefreshing: boolean
  /** Re-fetch the registry. */
  refresh: () => void
}

const FALLBACK_ERROR = '에이전트 목록을 불러오지 못했습니다.'

/**
 * Read the agent registry from `GET /api/agents` via the shared apiClient
 * (its request interceptor attaches the auth token — this endpoint requires it).
 *
 * The endpoint is not a stream: this polls on mount and on explicit refresh.
 */
export function useAgentRegistry(): UseAgentRegistryResult {
  const [agents, setAgents] = useState<Agent[]>([])
  const [state, setState] = useState<AgentRegistryState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const mountedRef = useRef(true)
  // 요청 세대. 겹친 요청 중 **가장 마지막에 보낸 것**의 결과만 반영한다 —
  // `mountedRef` 만으로는 "먼저 보낸 요청이 나중에 도착"하는 경우를 못 막아
  // 낡은 응답이 최신 목록을 덮어쓴다. 지금은 새로고침 버튼이 `disabled` 라
  // 사용자가 겹쳐 쏘기 어렵지만, `refresh` 는 공개 API 이고 간격 폴링을
  // 붙이는 순간 실제 버그가 된다.
  const generationRef = useRef(0)

  const load = useCallback(async (): Promise<void> => {
    const generation = ++generationRef.current
    setIsRefreshing(true)
    try {
      const data = await agentService.getAgents()
      if (!mountedRef.current || generation !== generationRef.current) return
      // Defensive: a proxy or misconfigured backend could return a non-array.
      setAgents(Array.isArray(data) ? data : [])
      setError(null)
      setState('ready')
      setLastUpdatedAt(Date.now())
    } catch (err) {
      if (!mountedRef.current || generation !== generationRef.current) return
      // 이미 받아 둔 목록은 지우지 않는다 — 새로고침이 일시적으로 실패했다고
      // 보고 있던 데이터를 없애면 화면이 비어 버린다. `state='error'` 로 가므로
      // 빈 레지스트리로 오인될 여지는 없다(에러 UI 가 따로 뜬다).
      setError(isApiError(err) ? userMessageForError(err) : FALLBACK_ERROR)
      setState('error')
    } finally {
      // 뒤에 더 새로운 요청이 떠 있으면 플래그를 끄지 않는다 — 끄면
      // `aria-busy` 가 로딩 중인데 false 를 보고하고 버튼이 조기 재활성화된다.
      if (mountedRef.current && generation === generationRef.current) setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void load()
    return () => {
      mountedRef.current = false
    }
  }, [load])

  const refresh = useCallback((): void => {
    void load()
  }, [load])

  return { agents, state, error, lastUpdatedAt, isRefreshing, refresh }
}
