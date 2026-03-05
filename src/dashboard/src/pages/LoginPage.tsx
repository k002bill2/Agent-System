import { useState, useEffect } from 'react'
import { getGoogleAuthUrl, getGitHubAuthUrl, loginWithEmail, useAuthStore } from '../stores/auth'
import { useNavigationStore } from '../stores/navigation'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [authStatus, setAuthStatus] = useState<{
    oauth_enabled: boolean
    google_enabled: boolean
    github_enabled: boolean
    email_enabled: boolean
  } | null>(null)

  const { setTokens, setUser } = useAuthStore()
  const { setView } = useNavigationStore()

  // Fetch auth status to determine which login methods to show
  useEffect(() => {
    const fetchAuthStatus = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'
        const response = await fetch(`${API_BASE_URL}/auth/status`)
        if (response.ok) {
          setAuthStatus(await response.json())
        }
      } catch {
        // Default: show email only
        setAuthStatus({ oauth_enabled: false, google_enabled: false, github_enabled: false, email_enabled: true })
      }
    }
    fetchAuthStatus()
  }, [])

  const handleGoogleLogin = () => {
    window.location.href = getGoogleAuthUrl()
  }

  const handleGitHubLogin = () => {
    window.location.href = getGitHubAuthUrl()
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const { user, accessToken, refreshToken, expiresIn } = await loginWithEmail(email, password)
      setTokens(accessToken, refreshToken, expiresIn)
      setUser(user)

      // Check for redirect URL (e.g., from invitation)
      const redirectUrl = sessionStorage.getItem('redirectAfterLogin')
      if (redirectUrl) {
        sessionStorage.removeItem('redirectAfterLogin')
        window.location.href = redirectUrl
      } else {
        setView('dashboard')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        {/* Logo and Title */}
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary-500 to-accent rounded-2xl flex items-center justify-center mb-4">
            <span className="text-white font-bold text-2xl">AOS</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Agent Orchestration Service
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            AI 에이전트 오케스트레이션 플랫폼
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 text-center">
            로그인
          </h2>

          {/* Email/Password Form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                이메일
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                placeholder="email@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '로그인 중...' : '로그인'}
            </button>
          </form>

          {/* Register Link */}
          <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
            계정이 없으신가요?{' '}
            <button
              onClick={() => setView('register')}
              className="text-primary-600 hover:text-primary-500 font-medium"
            >
              회원가입
            </button>
          </p>

          {/* OAuth Section - only visible when configured */}
          {authStatus?.oauth_enabled && (
            <>
              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white dark:bg-gray-800 text-gray-500">
                    또는
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {/* Google Login Button */}
                {authStatus.google_enabled && (
                  <button
                    onClick={handleGoogleLogin}
                    className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                  >
                    <GoogleIcon className="w-5 h-5" />
                    Google로 계속하기
                  </button>
                )}

                {/* GitHub Login Button */}
                {authStatus.github_enabled && (
                  <button
                    onClick={handleGitHubLogin}
                    className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gray-900 dark:bg-gray-700 rounded-lg text-white hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors font-medium"
                  >
                    <GitHubIcon className="w-5 h-5" />
                    GitHub로 계속하기
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          로그인하면{' '}
          <a href="#" className="text-primary-600 hover:text-primary-500">
            서비스 이용약관
          </a>
          {' '}및{' '}
          <a href="#" className="text-primary-600 hover:text-primary-500">
            개인정보처리방침
          </a>
          에 동의하게 됩니다.
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.341-3.369-1.341-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"
      />
    </svg>
  )
}
