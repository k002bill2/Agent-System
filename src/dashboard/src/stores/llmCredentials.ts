import { create } from 'zustand'

const API_BASE = '/api'

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('auth_token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

export interface LLMCredential {
  id: string
  provider: 'openai' | 'google_gemini' | 'anthropic'
  key_name: string
  api_key_masked: string
  is_active: boolean
  last_verified_at: string | null
  created_at: string
}

export interface LLMCredentialCreate {
  provider: 'openai' | 'google_gemini' | 'anthropic'
  key_name: string
  api_key: string
}

export interface VerifyResult {
  is_valid: boolean
  provider: string
  error_message: string | null
  latency_ms: number | null
}

interface LLMCredentialStore {
  credentials: LLMCredential[]
  isLoading: boolean
  error: string | null

  fetchCredentials: () => Promise<void>
  addCredential: (data: LLMCredentialCreate) => Promise<LLMCredential | null>
  removeCredential: (id: string) => Promise<boolean>
  verifyCredential: (id: string) => Promise<VerifyResult | null>
}

export const useLLMCredentialStore = create<LLMCredentialStore>((set) => ({
  credentials: [],
  isLoading: false,
  error: null,

  fetchCredentials: async () => {
    set({ isLoading: true, error: null })
    try {
      const resp = await authFetch(`${API_BASE}/users/me/llm-credentials`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data: LLMCredential[] = await resp.json()
      set({ credentials: data, isLoading: false })
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  addCredential: async (data: LLMCredentialCreate) => {
    try {
      const resp = await authFetch(`${API_BASE}/users/me/llm-credentials`, {
        method: 'POST',
        body: JSON.stringify(data),
      })
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}))
        set({ error: (errJson as { detail?: string }).detail || 'Failed to add credential' })
        return null
      }
      const cred: LLMCredential = await resp.json()
      set(s => ({ credentials: [cred, ...s.credentials] }))
      return cred
    } catch (err) {
      set({ error: (err as Error).message })
      return null
    }
  },

  removeCredential: async (id: string) => {
    try {
      const resp = await authFetch(`${API_BASE}/users/me/llm-credentials/${id}`, {
        method: 'DELETE',
      })
      if (!resp.ok) return false
      set(s => ({ credentials: s.credentials.filter(c => c.id !== id) }))
      return true
    } catch {
      return false
    }
  },

  verifyCredential: async (id: string) => {
    try {
      const resp = await authFetch(`${API_BASE}/users/me/llm-credentials/${id}/verify`, {
        method: 'POST',
      })
      if (!resp.ok) return null
      const result: VerifyResult = await resp.json()
      if (result.is_valid) {
        set(s => ({
          credentials: s.credentials.map(c =>
            c.id === id ? { ...c, last_verified_at: new Date().toISOString() } : c
          ),
        }))
      }
      return result
    } catch {
      return null
    }
  },
}))
