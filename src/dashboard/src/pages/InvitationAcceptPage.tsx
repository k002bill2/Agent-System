import { useEffect, useState } from 'react'
import { Building2, Check, AlertCircle, Loader2, LogIn, FolderOpen } from 'lucide-react'
import { useOrganizationsStore } from '../stores/organizations'
import { useProjectAccessStore } from '../stores/projectAccess'
import { useAuthStore } from '../stores/auth'
import { useNavigationStore } from '../stores/navigation'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface ProjectInvitationPreview {
  project_id: string
  project_name: string | null
  email: string
  role: string
  expires_at: string
  valid: boolean
}

export function InvitationAcceptPage() {
  const { acceptInvitation: acceptOrgInvitation } = useOrganizationsStore()
  const { acceptInvitation: acceptProjectInvitation } = useProjectAccessStore()
  const { user, accessToken, refreshToken, _hasHydrated } = useAuthStore()
  const { setView } = useNavigationStore()

  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'login-required' | 'preview'>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [projectPreview, setProjectPreview] = useState<ProjectInvitationPreview | null>(null)
  const [isAccepting, setIsAccepting] = useState(false)

  // Get token from URL
  const urlParams = new URLSearchParams(window.location.search)
  const token = urlParams.get('token')
  const type = urlParams.get('type') // 'project' or 'org' (default: 'org')

  const isLoggedIn = !!(accessToken || refreshToken)
  const isProjectInvitation = type === 'project'

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

    if (isProjectInvitation) {
      // Fetch project invitation preview
      fetch(`${API_BASE}/api/invitations/${token}`)
        .then((r) => r.json())
        .then((data: ProjectInvitationPreview) => {
          if (!data.valid) {
            setStatus('error')
            setErrorMessage('유효하지 않거나 만료된 초대입니다.')
          } else {
            setProjectPreview(data)
            setStatus('preview')
          }
        })
        .catch(() => {
          setStatus('error')
          setErrorMessage('초대 정보를 불러올 수 없습니다.')
        })
      return
    }

    // Organization invitation flow (original)
    // Check if user data is available
    if (!user?.id) {
      // Wait for user data
      return
    }

    // Accept org invitation
    const doAccept = async () => {
      const result = await acceptOrgInvitation(token, user.id, user.name || user.email)
      if (result.success && result.member) {
        setStatus('success')
      } else {
        setStatus('error')
        setErrorMessage(result.error || 'Failed to accept invitation')
      }
    }

    doAccept()
  }, [_hasHydrated, isLoggedIn, token, user, acceptOrgInvitation, isProjectInvitation])

  const handleAcceptProject = async () => {
    if (!token) return
    setIsAccepting(true)
    setErrorMessage('')
    try {
      await acceptProjectInvitation(token)
      setStatus('success')
      setTimeout(() => setView('project-management'), 2000)
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : '수락 실패')
    } finally {
      setIsAccepting(false)
    }
  }

  const handleGoToLogin = () => {
    sessionStorage.setItem('redirectAfterLogin', window.location.href)
    setView('login')
  }

  const handleGoToOrganization = () => {
    window.history.replaceState({}, '', window.location.pathname)
    setView('organizations')
  }

  const handleGoToDashboard = () => {
    window.history.replaceState({}, '', window.location.pathname)
    setView('dashboard')
  }

  // Project invitation preview screen
  if (isProjectInvitation && status === 'preview' && projectPreview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md w-full">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
            <div className="mb-6">
              <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
                <FolderOpen className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">프로젝트 초대</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              <strong>{projectPreview.project_name || projectPreview.project_id}</strong> 프로젝트에{' '}
              <strong>{projectPreview.role}</strong> 역할로 초대받았습니다.
            </p>
            <p className="text-xs text-gray-500 mb-6">
              초대 대상: {projectPreview.email} · 만료:{' '}
              {new Date(projectPreview.expires_at).toLocaleDateString('ko-KR')}
            </p>
            {errorMessage && (
              <p className="text-red-500 text-sm mb-3">{errorMessage}</p>
            )}
            <button
              onClick={handleAcceptProject}
              disabled={isAccepting}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
            >
              {isAccepting ? '처리 중...' : '초대 수락'}
            </button>
          </div>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
            Agent Orchestration Service
          </p>
        </div>
      </div>
    )
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
            {status === 'success' && (isProjectInvitation ? '초대 수락 완료!' : 'Welcome to the Team!')}
            {status === 'error' && 'Invitation Error'}
            {status === 'login-required' && 'Login Required'}
          </h1>

          {/* Description */}
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {status === 'loading' && 'Please wait while we process your invitation.'}
            {status === 'success' && (isProjectInvitation ? '프로젝트로 이동합니다...' : 'You have successfully joined the organization.')}
            {status === 'error' && errorMessage}
            {status === 'login-required' && 'Please log in to accept this invitation.'}
          </p>

          {/* Actions */}
          <div className="space-y-3">
            {status === 'success' && !isProjectInvitation && (
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
