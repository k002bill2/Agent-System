import { useState, useEffect } from 'react'
import { useProjectAccessStore } from '@/stores/projectAccess'

interface Props {
  projectId: string
}

const ROLE_OPTIONS = ['owner', 'editor', 'viewer'] as const

export function MembersTab({ projectId }: Props) {
  const {
    members,
    fetchMembers,
    invitations,
    fetchInvitations,
    removeMember,
    inviteByEmail,
    cancelInvitation,
  } = useProjectAccessStore()

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('viewer')
  const [isInviting, setIsInviting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMembers(projectId)
    fetchInvitations(projectId)
  }, [projectId, fetchMembers, fetchInvitations])

  const handleInvite = async () => {
    if (!inviteEmail) return
    setIsInviting(true)
    setError(null)
    try {
      await inviteByEmail(projectId, inviteEmail, inviteRole)
      setInviteEmail('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '초대 실패')
    } finally {
      setIsInviting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 현재 멤버 */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          멤버 ({members.length})
        </h3>
        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.user_id}
              className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
            >
              <div>
                <p className="text-sm font-medium">{m.user_name || m.user_email}</p>
                <p className="text-xs text-gray-500">{m.user_email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                    m.role === 'owner'
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                      : m.role === 'editor'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {m.role}
                </span>
                {m.role !== 'owner' && (
                  <button
                    onClick={() => removeMember(projectId, m.user_id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    제거
                  </button>
                )}
              </div>
            </div>
          ))}
          {members.length === 0 && (
            <p className="text-sm text-gray-500 py-2">멤버가 없습니다</p>
          )}
        </div>
      </section>

      {/* 이메일 초대 */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          이메일 초대
        </h3>
        <div className="flex gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email@example.com"
            className="flex-1 px-3 py-2 text-sm border rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="px-3 py-2 text-sm border rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            onClick={handleInvite}
            disabled={isInviting || !inviteEmail}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isInviting ? '전송 중...' : '초대'}
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </section>

      {/* 대기 중인 초대 */}
      {invitations.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            대기 중인 초대 ({invitations.length})
          </h3>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between p-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600"
              >
                <div>
                  <p className="text-sm">{inv.email}</p>
                  <p className="text-xs text-gray-500">
                    {inv.role} · {new Date(inv.expires_at).toLocaleDateString()} 만료
                  </p>
                </div>
                <button
                  onClick={() => cancelInvitation(projectId, inv.id)}
                  className="text-xs text-gray-500 hover:text-red-500"
                >
                  취소
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
