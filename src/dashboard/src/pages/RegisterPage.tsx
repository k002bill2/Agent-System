import { useState } from 'react'
import { registerWithEmail, useAuthStore } from '../stores/auth'
import { useNavigationStore } from '../stores/navigation'

export function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const { setTokens, setUser } = useAuthStore()
  const { setView } = useNavigationStore()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다')
      return
    }

    // Validate password length
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다')
      return
    }

    setIsLoading(true)

    try {
      const { user, accessToken, refreshToken, expiresIn } = await registerWithEmail(
        email,
        password,
        name || undefined
      )
      setTokens(accessToken, refreshToken, expiresIn)
      setUser(user)
      setView('dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원가입에 실패했습니다')
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

        {/* Register Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 text-center">
            회원가입
          </h2>

          <form onSubmit={handleRegister} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                이름 <span className="text-gray-400">(선택)</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                placeholder="홍길동"
              />
            </div>

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
                minLength={6}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                placeholder="6자 이상 입력"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                비밀번호 확인
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                placeholder="비밀번호 다시 입력"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '가입 중...' : '회원가입'}
            </button>
          </form>

          {/* Login Link */}
          <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
            이미 계정이 있으신가요?{' '}
            <button
              onClick={() => setView('login')}
              className="text-primary-600 hover:text-primary-500 font-medium"
            >
              로그인
            </button>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          회원가입하면{' '}
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
