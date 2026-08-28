/**
 * Fetch-based SSE transport for endpoints protected by Bearer authentication.
 *
 * Native EventSource cannot send an Authorization header. This transport keeps
 * the token out of URLs and logs, while retaining the EventSource listener
 * surface used by the stores.
 */
import { useAuthStore } from '../stores/auth'

export type AuthenticatedSseStatus =
  | 'authentication-failed'
  | 'permission-denied'
  | 'error'
  | 'closed'

export interface AuthenticatedSseOptions {
  onStatus?: (status: AuthenticatedSseStatus) => void
}

export interface AuthenticatedSseClient {
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void
  close(): void
}

type EventListener = (event: MessageEvent<string>) => void

class SseParser {
  private buffer = ''
  private eventName = 'message'
  private dataLines: string[] = []

  feed(chunk: string, dispatch: (event: MessageEvent<string>) => void): void {
    this.buffer += chunk

    while (true) {
      const lineBreak = this.buffer.match(/\r\n|\n|\r/)
      if (!lineBreak || lineBreak.index === undefined) return

      const line = this.buffer.slice(0, lineBreak.index)
      this.buffer = this.buffer.slice(lineBreak.index + lineBreak[0].length)
      this.consumeLine(line, dispatch)
    }
  }

  private consumeLine(line: string, dispatch: (event: MessageEvent<string>) => void): void {
    if (line === '') {
      if (this.dataLines.length === 0) return
      dispatch(new MessageEvent(this.eventName, { data: this.dataLines.join('\n') }))
      this.eventName = 'message'
      this.dataLines = []
      return
    }

    if (line.startsWith(':')) return

    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    let value = separator === -1 ? '' : line.slice(separator + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'event') this.eventName = value || 'message'
    if (field === 'data') this.dataLines.push(value)
  }
}

/** Open an authenticated SSE stream without placing credentials in the URL. */
export function createAuthenticatedSseClient(
  url: string,
  options: AuthenticatedSseOptions = {},
): AuthenticatedSseClient {
  const listeners = new Map<string, EventListener[]>()
  const controller = new AbortController()
  const parser = new SseParser()
  let closed = false
  let refreshAttempted = false
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined

  const emitStatus = (status: AuthenticatedSseStatus) => {
    options.onStatus?.(status)
  }

  const terminate = (status: Exclude<AuthenticatedSseStatus, 'closed'>) => {
    if (closed) return
    closed = true
    controller.abort()
    emitStatus(status)
  }

  const dispatch = (event: MessageEvent<string>) => {
    for (const listener of listeners.get(event.type) ?? []) listener(event)
  }

  const connect = async (): Promise<void> => {
    if (closed) return

    let response: Response
    try {
      const { accessToken } = useAuthStore.getState()
      const headers: Record<string, string> = {}
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`
      response = await fetch(url, { headers, signal: controller.signal })
    } catch {
      if (!closed) terminate('error')
      return
    }

    // A mocked or otherwise malformed fetch implementation must not leave an
    // unhandled rejection in consumers. Treat it as a transport failure.
    if (!response) {
      terminate('error')
      return
    }

    if (response.status === 401) {
      if (refreshAttempted) {
        terminate('authentication-failed')
        return
      }
      refreshAttempted = true
      let refreshed: boolean
      try {
        refreshed = await useAuthStore.getState().refreshAccessToken()
      } catch {
        refreshed = false
      }
      if (!refreshed) {
        terminate('authentication-failed')
        return
      }
      await connect()
      return
    }

    if (response.status === 403) {
      terminate('permission-denied')
      return
    }

    if (!response.ok || !response.body) {
      terminate('error')
      return
    }

    reader = response.body.getReader()
    const decoder = new TextDecoder()
    try {
      while (!closed) {
        const result = await reader.read()
        if (result.done) break
        parser.feed(decoder.decode(result.value, { stream: true }), dispatch)
      }
      if (!closed) {
        parser.feed(decoder.decode(), dispatch)
        closed = true
        emitStatus('closed')
      }
    } catch {
      if (!closed) terminate('error')
    } finally {
      reader = undefined
    }
  }

  const client: AuthenticatedSseClient = {
    addEventListener(type, listener) {
      const current = listeners.get(type) ?? []
      current.push(listener)
      listeners.set(type, current)
    },
    close() {
      if (closed) return
      closed = true
      controller.abort()
      void reader?.cancel().catch(() => undefined)
    },
  }

  void connect()
  return client
}
