import { useEffect, useState, useRef } from 'react'
import { useAuthStore, exchangeOAuthCode } from '../stores/auth'
import { useNavigationStore } from '../stores/navigation'
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react'

interface AuthCallbackPageProps {
  provider: 'google' | 'github'
}

export function AuthCallbackPage({ provider }: AuthCallbackPageProps) {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const hasProcessed = useRef(false) // Prevent double execution in Strict Mode

  const { setTokens, setUser } = useAuthStore()
  const { setView } = useNavigationStore()

  useEffect(() => {
    // Prevent double execution (React Strict Mode calls useEffect twice)
    if (hasProcessed.current) {
      return
    }
    hasProcessed.current = true

    const handleCallback = async () => {
      // Get code from URL query params
      const urlParams = new URLSearchParams(window.location.search)
      const code = urlParams.get('code')
      const errorParam = urlParams.get('error')
      const errorDescription = urlParams.get('error_description')

      // Check for OAuth error
      if (errorParam) {
        setStatus('error')
        setError(errorDescription || errorParam || 'Authentication failed')
        return
      }

      // Check for missing code
      if (!code) {
        // If no code and status is still loading, it might be a redirect after success
        // Don't show error, just redirect to dashboard
        // No code found, redirecting to dashboard
        setView('dashboard')
        return
      }

      try {
        // Get the current redirect URI (where we are now)
        const redirectUri = `${window.location.origin}/auth/callback/${provider}`
        // Exchanging code for tokens

        // Exchange code for tokens
        const result = await exchangeOAuthCode(provider, code, redirectUri)
        // Token exchange success

        // Store tokens and user
        setTokens(result.accessToken, result.refreshToken, result.expiresIn)
        setUser(result.user)
        // Tokens stored, navigating to dashboard

        setStatus('success')

        // Clean up URL and redirect (invitation or dashboard)
        window.history.replaceState({}, '', '/')
        setTimeout(() => {
          const redirectUrl = sessionStorage.getItem('redirectAfterLogin')
          if (redirectUrl) {
            sessionStorage.removeItem('redirectAfterLogin')
            window.location.href = redirectUrl
          } else {
            setView('dashboard')
          }
        }, 1500)
      } catch (err) {
        console.error('OAuth callback error:', err)
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Authentication failed')
      }
    }

    handleCallback()
  }, [provider, setTokens, setUser, setView])

  const handleRetry = () => {
    // Clear URL and go back to login
    window.history.replaceState({}, '', '/')
    setView('login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center">
          {status === 'loading' && (
            <>
              <div className="mx-auto w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mb-4">
                <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                로그인 중...
              </h2>
              <p className="text-gray-500 dark:text-gray-400">
                {provider === 'google' ? 'Google' : 'GitHub'} 인증을 처리하고 있습니다
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                로그인 성공!
              </h2>
              <p className="text-gray-500 dark:text-gray-400">
                대시보드로 이동합니다...
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                로그인 실패
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {error || '알 수 없는 오류가 발생했습니다'}
              </p>
              <button
                onClick={handleRetry}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
              >
                다시 시도
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
