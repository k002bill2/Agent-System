import { create } from 'zustand'
import { apiClient } from '../services/apiClient'

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
      const data = await apiClient.get<LLMCredential[]>('/api/users/me/llm-credentials')
      set({ credentials: data, isLoading: false })
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  addCredential: async (data: LLMCredentialCreate) => {
    try {
      const cred = await apiClient.post<LLMCredential>('/api/users/me/llm-credentials', data)
      set(s => ({ credentials: [cred, ...s.credentials] }))
      return cred
    } catch (err) {
      set({ error: (err as Error).message })
      return null
    }
  },

  updateCredential: async (id: string, data: LLMCredentialUpdate) => {
    try {
      const updated = await apiClient.put<LLMCredential>(`/api/users/me/llm-credentials/${id}`, data)
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
      await apiClient.delete(`/api/users/me/llm-credentials/${id}`)
      set(s => ({ credentials: s.credentials.filter(c => c.id !== id) }))
      return true
    } catch {
      return false
    }
  },

  verifyCredential: async (id: string) => {
    try {
      const result = await apiClient.post<VerifyResult>(`/api/users/me/llm-credentials/${id}/verify`)
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
