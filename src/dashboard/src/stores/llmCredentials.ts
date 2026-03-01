import { create } from 'zustand'
import { authFetch } from './auth'

const API_BASE = '/api'

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

export interface LLMCredentialUpdate {
  key_name?: string
  api_key?: string
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
  updateCredential: (id: string, data: LLMCredentialUpdate) => Promise<LLMCredential | null>
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
        headers: { 'Content-Type': 'application/json' },
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

  updateCredential: async (id: string, data: LLMCredentialUpdate) => {
    try {
      const resp = await authFetch(`${API_BASE}/users/me/llm-credentials/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}))
        set({ error: (errJson as { detail?: string }).detail || 'Failed to update credential' })
        return null
      }
      const updated: LLMCredential = await resp.json()
      set(s => ({
        credentials: s.credentials.map(c => (c.id === id ? updated : c)),
      }))
      return updated
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
