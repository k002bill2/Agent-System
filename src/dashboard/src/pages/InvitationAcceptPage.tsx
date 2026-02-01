import { useEffect, useState } from 'react'
import { Building2, Check, AlertCircle, Loader2, LogIn } from 'lucide-react'
import { useOrganizationsStore } from '../stores/organizations'
import { useAuthStore } from '../stores/auth'
import { useNavigationStore } from '../stores/navigation'

export function InvitationAcceptPage() {
  const { acceptInvitation } = useOrganizationsStore()
  const { user, accessToken, refreshToken, _hasHydrated } = useAuthStore()
  const { setView } = useNavigationStore()

  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'login-required'>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')

  // Get token from URL
  const urlParams = new URLSearchParams(window.location.search)
  const token = urlParams.get('token')

  const isLoggedIn = !!(accessToken || refreshToken)

  useEffect(() => {
    if (!_hasHydrated) return

    // Check if logged in
    if (!isLoggedIn) {
      setStatus('login-required')
      return
    }

    // Check if token exists
    if (!token) {
      setStatus('error')
      setErrorMessage('Invalid invitation link. Token is missing.')
      return
    }

    // Check if user data is available
    if (!user?.id) {
      // Wait for user data
      return
    }

    // Accept invitation
    const doAccept = async () => {
      const result = await acceptInvitation(token, user.id, user.name || user.email)
      if (result.success && result.member) {
        setStatus('success')
      } else {
        setStatus('error')
        setErrorMessage(result.error || 'Failed to accept invitation')
      }
    }

    doAccept()
  }, [_hasHydrated, isLoggedIn, token, user, acceptInvitation])

  const handleGoToLogin = () => {
    // Store the current URL for redirect after login
    sessionStorage.setItem('redirectAfterLogin', window.location.href)
    setView('login')
  }

  const handleGoToOrganization = () => {
    // Clear URL params
    window.history.replaceState({}, '', window.location.pathname)
    setView('organizations')
  }

  const handleGoToDashboard = () => {
    window.history.replaceState({}, '', window.location.pathname)
    setView('dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          {/* Logo/Icon */}
          <div className="mb-6">
            <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${
              status === 'success' ? 'bg-green-100 dark:bg-green-900/30' :
              status === 'error' ? 'bg-red-100 dark:bg-red-900/30' :
              status === 'login-required' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
              'bg-blue-100 dark:bg-blue-900/30'
            }`}>
              {status === 'loading' && (
                <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
              )}
              {status === 'success' && (
                <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
              )}
              {status === 'error' && (
                <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
              )}
              {status === 'login-required' && (
                <LogIn className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
              )}
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {status === 'loading' && 'Processing Invitation...'}
            {status === 'success' && 'Welcome to the Team!'}
            {status === 'error' && 'Invitation Error'}
            {status === 'login-required' && 'Login Required'}
          </h1>

          {/* Description */}
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {status === 'loading' && 'Please wait while we process your invitation.'}
            {status === 'success' && 'You have successfully joined the organization.'}
            {status === 'error' && errorMessage}
            {status === 'login-required' && 'Please log in to accept this invitation.'}
          </p>

          {/* Actions */}
          <div className="space-y-3">
            {status === 'success' && (
              <>
                <button
                  onClick={handleGoToOrganization}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <Building2 className="w-5 h-5" />
                  View Organization
                </button>
                <button
                  onClick={handleGoToDashboard}
                  className="w-full px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Go to Dashboard
                </button>
              </>
            )}
            {status === 'error' && (
              <button
                onClick={handleGoToDashboard}
                className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Go to Dashboard
              </button>
            )}
            {status === 'login-required' && (
              <button
                onClick={handleGoToLogin}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                <LogIn className="w-5 h-5" />
                Log In
              </button>
            )}
          </div>
        </div>

        {/* Footer text */}
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
          Agent Orchestration Service
        </p>
      </div>
    </div>
  )
}
