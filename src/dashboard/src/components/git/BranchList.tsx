import { useState, useCallback } from 'react'
import {
  GitBranch as GitBranchIcon,
  Shield,
  MoreVertical,
  Trash2,
  GitMerge,
  RefreshCw,
  Plus,
  ArrowUp,
  ArrowDown,
  Cloud,
  AlertTriangle,
  Loader2,
  ArrowRightLeft,
  FolderGit,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { GitAlert } from './GitAlert'
import type { GitBranch, GitWorktree, ConflictStatus } from '../../stores/git'

interface DeleteConfirmState {
  branchName: string
  isProtected: boolean
  isUnmerged: boolean
  isRemote: boolean
  hasTracking: boolean
  hasWorktree: boolean
  worktreePath: string | null
}

interface BranchListProps {
  branches: GitBranch[]
  currentBranch: string
  protectedBranches: string[]
  isLoading: boolean
  onCreateBranch: (name: string, startPoint?: string) => Promise<boolean>
  onCheckoutBranch: (name: string) => Promise<boolean>
  onDeleteBranch: (name: string, force?: boolean, deleteRemote?: boolean, removeWorktree?: boolean) => Promise<boolean>
  onMergeClick: (source: string) => void
  onRefresh: () => void
  conflictStatuses?: Record<string, ConflictStatus>
  worktrees?: GitWorktree[]
}

export function BranchList({
  branches,
  currentBranch,
  protectedBranches,
  isLoading,
  onCreateBranch,
  onCheckoutBranch,
  onDeleteBranch,
  onMergeClick,
  onRefresh,
  conflictStatuses = {},
  worktrees = [],
}: BranchListProps) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [startPoint, setStartPoint] = useState('HEAD')
  const [creating, setCreating] = useState(false)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'local' | 'remote'>('local')
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null)
  const [forceDelete, setForceDelete] = useState(false)
  const [deleteRemote, setDeleteRemote] = useState(false)
  const [removeWorktree, setRemoveWorktree] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [checkingOut, setCheckingOut] = useState<string | null>(null)

  const filteredBranches = branches.filter((b) => {
    if (filter === 'local') return !b.is_remote
    if (filter === 'remote') return b.is_remote
    return true
  })

  const handleCreate = async () => {
    if (!newBranchName.trim()) return
    setCreating(true)
    const success = await onCreateBranch(newBranchName.trim(), startPoint)
    if (success) {
      setShowCreateModal(false)
      setNewBranchName('')
      setStartPoint('HEAD')
    }
    setCreating(false)
  }

  const isBranchProtected = useCallback(
    (name: string) => protectedBranches.includes(name),
    [protectedBranches]
  )

  const canDeleteBranch = useCallback(
    (branch: GitBranch) =>
      !branch.is_current && branch.name !== currentBranch,
    [currentBranch]
  )

  const openDeleteConfirm = useCallback((branch: GitBranch) => {
    const matchingWorktree = worktrees.find(
      (wt) => wt.branch === branch.name && !wt.is_main
    ) ?? null

    setDeleteConfirm({
      branchName: branch.name,
      isProtected: branch.is_protected || isBranchProtected(branch.name),
      isUnmerged: (branch.ahead ?? 0) > 0,
      isRemote: branch.is_remote,
      hasTracking: !!branch.tracking_branch,
      hasWorktree: !!matchingWorktree,
      worktreePath: matchingWorktree?.path ?? null,
    })
    setForceDelete(false)
    setDeleteRemote(false)
    setRemoveWorktree(false)
    setDeleteError(null)
    setMenuOpen(null)
  }, [isBranchProtected, worktrees])

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const needsForce = forceDelete || deleteConfirm.isProtected
      const shouldDeleteRemote = deleteConfirm.isRemote || deleteRemote
      const shouldRemoveWorktree = deleteConfirm.hasWorktree && removeWorktree
      const success = await onDeleteBranch(deleteConfirm.branchName, needsForce, shouldDeleteRemote, shouldRemoveWorktree)
      if (success) {
        setDeleteConfirm(null)
      } else {
        setDeleteError('브랜치 삭제에 실패했습니다. 강제 삭제를 시도해보세요.')
      }
    } catch {
      setDeleteError('브랜치 삭제 중 오류가 발생했습니다.')
    } finally {
      setDeleting(false)
    }
  }

  const getConflictBadge = (branchName: string) => {
    const status = conflictStatuses[branchName]
    if (!status || status === 'unknown') return null

    if (status === 'has_conflicts') {
      return (
        <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
          충돌
        </span>
      )
    }

    return (
      <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        머지 가능
      </span>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Branches</h3>
          <span className="text-sm text-gray-500">({branches.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter */}
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {(['local', 'remote', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  filter === f
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                )}
              >
                {f === 'local' ? 'Local' : f === 'remote' ? 'Remote' : 'All'}
              </button>
            ))}
          </div>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Branch
          </button>
        </div>
      </div>

      {/* Branch List */}
      <div className="space-y-2">
        {filteredBranches.map((branch) => (
          <div
            key={branch.name}
            className={cn(
              'flex items-center justify-between p-3 rounded-lg border transition-colors',
              branch.is_current
                ? 'bg-primary-50 border-primary-200 dark:bg-primary-900/10 dark:border-primary-800'
                : 'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
            )}
          >
            {/* Left: Branch info */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <GitBranchIcon
                className={cn(
                  'w-5 h-5 flex-shrink-0',
                  branch.is_current
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-gray-400'
                )}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'font-medium truncate',
                      branch.is_current
                        ? 'text-primary-700 dark:text-primary-300'
                        : 'text-gray-900 dark:text-white'
                    )}
                  >
                    {branch.name}
                  </span>

                  {branch.is_current && (
                    <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                      current
                    </span>
                  )}

                  {branch.is_protected && (
                    <span title="Protected branch">
                      <Shield className="w-4 h-4 text-amber-500" />
                    </span>
                  )}

                  {branch.is_remote && (
                    <span title="Remote branch">
                      <Cloud className="w-4 h-4 text-blue-500" />
                    </span>
                  )}

                  {getConflictBadge(branch.name)}
                </div>

                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  <span className="truncate">{branch.commit_message}</span>
                  {branch.tracking_branch && (
                    <span className="flex-shrink-0">tracking: {branch.tracking_branch}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Middle: Ahead/Behind */}
            {!branch.is_remote && (branch.ahead > 0 || branch.behind > 0) && (
              <div className="flex items-center gap-2 px-3">
                {branch.ahead > 0 && (
                  <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <ArrowUp className="w-3 h-3" />
                    {branch.ahead}
                  </span>
                )}
                {branch.behind > 0 && (
                  <span className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                    <ArrowDown className="w-3 h-3" />
                    {branch.behind}
                  </span>
                )}
              </div>
            )}

            {/* Right: Actions */}
            <div className="flex items-center gap-1">
              {!branch.is_current && !branch.is_remote && !branch.is_protected && (
                <button
                  onClick={() => onMergeClick(branch.name)}
                  className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                  title="Merge to main"
                >
                  <GitMerge className="w-4 h-4" />
                </button>
              )}

              {canDeleteBranch(branch) && (
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(menuOpen === branch.name ? null : branch.name)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {menuOpen === branch.name && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setMenuOpen(null)}
                      />
                      <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[140px]">
                        <button
                          onClick={async () => {
                            setMenuOpen(null)
                            setCheckingOut(branch.name)
                            await onCheckoutBranch(branch.name)
                            setCheckingOut(null)
                          }}
                          disabled={checkingOut === branch.name}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                        >
                          {checkingOut === branch.name ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <ArrowRightLeft className="w-4 h-4" />
                          )}
                          체크아웃
                        </button>
                        <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                        <button
                          onClick={() => openDeleteConfirm(branch)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                          삭제
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {filteredBranches.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No branches found
          </div>
        )}
      </div>

      {/* Create Branch Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              New Branch
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Branch Name
                </label>
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="feature/my-feature"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start Point
                </label>
                <select
                  value={startPoint}
                  onChange={(e) => setStartPoint(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="HEAD">HEAD (current)</option>
                  {branches
                    .filter((b) => !b.is_remote)
                    .map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newBranchName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Branch Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  브랜치 삭제
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  이 작업은 되돌릴 수 없습니다
                </p>
              </div>
            </div>

            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex items-center gap-2">
                <GitBranchIcon className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {deleteConfirm.branchName}
                </span>
              </div>
            </div>

            {/* Warnings */}
            {(deleteConfirm.isProtected || deleteConfirm.isUnmerged || deleteConfirm.isRemote || deleteConfirm.hasWorktree) && (
              <div className="mb-4 space-y-2">
                {deleteConfirm.hasWorktree && (
                  <div className="flex items-start gap-2 p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg">
                    <FolderGit className="w-4 h-4 text-violet-600 dark:text-violet-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-violet-700 dark:text-violet-300">
                        이 브랜치에 연결된 worktree가 있습니다. 삭제하려면 worktree를 먼저 제거해야 합니다.
                      </p>
                      <p className="text-xs text-violet-600 dark:text-violet-400 mt-1 truncate" title={deleteConfirm.worktreePath ?? undefined}>
                        {deleteConfirm.worktreePath}
                      </p>
                    </div>
                  </div>
                )}
                {deleteConfirm.isRemote && (
                  <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <Cloud className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      원격 브랜치입니다. 삭제 시 리모트에서도 제거됩니다.
                    </p>
                  </div>
                )}
                {deleteConfirm.isProtected && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      보호된 브랜치입니다. 강제 삭제가 필요합니다.
                    </p>
                  </div>
                )}
                {deleteConfirm.isUnmerged && (
                  <div className="flex items-start gap-2 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-orange-700 dark:text-orange-300">
                      머지되지 않은 커밋이 있습니다. 삭제 시 변경사항이 손실될 수 있습니다.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Options */}
            <div className="mb-4 space-y-2">
              {/* Remove worktree checkbox */}
              {deleteConfirm.hasWorktree && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={removeWorktree}
                    onChange={(e) => setRemoveWorktree(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Worktree 먼저 제거 후 브랜치 삭제
                  </span>
                </label>
              )}

              {/* Force delete checkbox */}
              {!deleteConfirm.isRemote && (deleteConfirm.isProtected || deleteConfirm.isUnmerged) && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forceDelete}
                    onChange={(e) => setForceDelete(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    강제 삭제 (머지 여부와 관계없이 삭제)
                  </span>
                </label>
              )}

              {/* Delete remote tracking branch checkbox */}
              {!deleteConfirm.isRemote && deleteConfirm.hasTracking && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteRemote}
                    onChange={(e) => setDeleteRemote(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    원격 브랜치도 함께 삭제
                  </span>
                </label>
              )}
            </div>

            {/* Error message */}
            {deleteError && (
              <GitAlert error={deleteError} onClose={() => setDeleteError(null)} className="mb-4" />
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || (deleteConfirm.isProtected && !forceDelete) || (deleteConfirm.hasWorktree && !removeWorktree)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    삭제 중...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    {forceDelete ? '강제 삭제' : '삭제'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
