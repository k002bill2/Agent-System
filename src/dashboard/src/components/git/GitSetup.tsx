import { useState, useEffect } from 'react'
import { GitBranch, FolderGit, Check, AlertCircle, Loader2, Plus, Database, Trash2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useGitStore, type GitStatus } from '../../stores/git'

interface GitSetupProps {
  projectId: string
  projectName: string
  projectPath: string
  gitStatus: GitStatus | null
  isLoading: boolean
  onUpdateGitPath: (gitPath: string | null) => Promise<boolean>
}

type PathOption = 'project' | 'registered' | 'custom'

export function GitSetup({
  projectId: _projectId,
  projectName,
  projectPath,
  gitStatus,
  isLoading,
  onUpdateGitPath,
}: GitSetupProps) {
  // _projectId is used by parent for context, not directly in this component
  void _projectId

  const {
    repositories,
    fetchRepositories,
    createRepository,
    deleteRepository,
  } = useGitStore()

  const [gitPath, setGitPath] = useState(gitStatus?.git_path || '')
  const [pathOption, setPathOption] = useState<PathOption>(
    gitStatus?.git_path ? 'custom' : 'project'
  )
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // New repository form
  const [showAddRepo, setShowAddRepo] = useState(false)
  const [newRepoName, setNewRepoName] = useState('')
  const [newRepoPath, setNewRepoPath] = useState('')
  const [addingRepo, setAddingRepo] = useState(false)

  // Load repositories on mount
  useEffect(() => {
    fetchRepositories()
  }, [fetchRepositories])

  // Check if current git path matches a registered repository
  useEffect(() => {
    if (gitStatus?.git_path && repositories.length > 0) {
      const matchingRepo = repositories.find(r => r.path === gitStatus.git_path)
      if (matchingRepo) {
        setPathOption('registered')
        setSelectedRepoId(matchingRepo.id)
      }
    }
  }, [gitStatus?.git_path, repositories])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)

    let pathToSet: string | null

    if (pathOption === 'project') {
      pathToSet = null
    } else if (pathOption === 'registered') {
      const repo = repositories.find(r => r.id === selectedRepoId)
      if (!repo) {
        setError('저장소를 선택해주세요')
        setSaving(false)
        return
      }
      pathToSet = repo.path
    } else {
      pathToSet = gitPath.trim()
      if (!pathToSet) {
        setError('Git 저장소 경로를 입력해주세요')
        setSaving(false)
        return
      }
    }

    const result = await onUpdateGitPath(pathToSet)

    if (result) {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } else {
      setError('유효한 Git 저장소가 아닙니다')
    }

    setSaving(false)
  }

  const handleAddRepository = async () => {
    if (!newRepoName.trim() || !newRepoPath.trim()) {
      setError('저장소 이름과 경로를 입력해주세요')
      return
    }

    setAddingRepo(true)
    setError(null)

    const repo = await createRepository(newRepoName.trim(), newRepoPath.trim())

    if (repo) {
      setNewRepoName('')
      setNewRepoPath('')
      setShowAddRepo(false)
      setSelectedRepoId(repo.id)
      setPathOption('registered')
    }

    setAddingRepo(false)
  }

  const handleDeleteRepository = async (repoId: string) => {
    if (confirm('이 저장소를 목록에서 삭제하시겠습니까?')) {
      await deleteRepository(repoId)
      if (selectedRepoId === repoId) {
        setSelectedRepoId(null)
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
            <FolderGit className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Git 저장소 설정
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {projectName} 프로젝트의 Git 저장소를 설정합니다
            </p>
          </div>
        </div>

        {/* Status Badge */}
        {gitStatus && (
          <div
            className={cn(
              'flex items-center gap-2 px-4 py-3 rounded-lg mb-6',
              gitStatus.is_valid_repo
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
            )}
          >
            {gitStatus.is_valid_repo ? (
              <>
                <Check className="w-5 h-5" />
                <div>
                  <span className="font-medium">Git 저장소 연결됨</span>
                  <span className="mx-2">·</span>
                  <span className="text-sm">{gitStatus.current_branch}</span>
                </div>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">Git 저장소가 설정되지 않았습니다</span>
              </>
            )}
          </div>
        )}

        {/* Configuration Form */}
        <div className="space-y-4">
          {/* Option 1: Use project path */}
          <label
            className={cn(
              'flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors',
              pathOption === 'project'
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/10'
                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50'
            )}
          >
            <input
              type="radio"
              name="gitPathOption"
              checked={pathOption === 'project'}
              onChange={() => setPathOption('project')}
              className="mt-1"
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 dark:text-white">
                프로젝트 경로 사용
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                프로젝트 경로에 Git 저장소가 있는 경우
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300 mt-2 bg-gray-100 dark:bg-gray-700 px-3 py-2 rounded break-all">
                {projectPath}
              </div>
            </div>
          </label>

          {/* Option 2: Select from registered repositories */}
          <label
            className={cn(
              'flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors',
              pathOption === 'registered'
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/10'
                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50'
            )}
          >
            <input
              type="radio"
              name="gitPathOption"
              checked={pathOption === 'registered'}
              onChange={() => setPathOption('registered')}
              className="mt-1"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                <Database className="w-4 h-4" />
                등록된 저장소에서 선택
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                미리 등록한 Git 저장소 목록에서 선택
              </div>

              {pathOption === 'registered' && (
                <div className="mt-3 space-y-3">
                  {/* Repository List */}
                  {repositories.length > 0 ? (
                    <div className="space-y-2">
                      {repositories.map((repo) => (
                        <div
                          key={repo.id}
                          onClick={() => setSelectedRepoId(repo.id)}
                          className={cn(
                            'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors',
                            selectedRepoId === repo.id
                              ? 'border-primary-400 bg-primary-100 dark:bg-primary-900/20'
                              : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 dark:text-white">
                                {repo.name}
                              </span>
                              {repo.is_valid ? (
                                <Check className="w-4 h-4 text-green-500" />
                              ) : (
                                <AlertCircle className="w-4 h-4 text-amber-500" />
                              )}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">
                              {repo.path}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteRepository(repo.id)
                            }}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                            title="저장소 삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                      등록된 저장소가 없습니다
                    </div>
                  )}

                  {/* Add New Repository */}
                  {showAddRepo ? (
                    <div className="p-3 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg space-y-3">
                      <input
                        type="text"
                        value={newRepoName}
                        onChange={(e) => setNewRepoName(e.target.value)}
                        placeholder="저장소 이름 (예: My Project)"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                      <input
                        type="text"
                        value={newRepoPath}
                        onChange={(e) => setNewRepoPath(e.target.value)}
                        placeholder="저장소 경로 (예: /path/to/repo)"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleAddRepository}
                          disabled={addingRepo}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                        >
                          {addingRepo ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Plus className="w-4 h-4" />
                          )}
                          등록
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddRepo(false)
                            setNewRepoName('')
                            setNewRepoPath('')
                          }}
                          className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAddRepo(true)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 border border-dashed border-primary-300 dark:border-primary-700 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      새 저장소 등록
                    </button>
                  )}
                </div>
              )}
            </div>
          </label>

          {/* Option 3: Custom git path */}
          <label
            className={cn(
              'flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors',
              pathOption === 'custom'
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/10'
                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50'
            )}
          >
            <input
              type="radio"
              name="gitPathOption"
              checked={pathOption === 'custom'}
              onChange={() => setPathOption('custom')}
              className="mt-1"
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 dark:text-white">
                다른 경로 지정
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Git 저장소가 프로젝트 경로와 다른 경우
              </div>
              {pathOption === 'custom' && (
                <input
                  type="text"
                  value={gitPath}
                  onChange={(e) => setGitPath(e.target.value)}
                  placeholder="/path/to/git/repository"
                  className="mt-3 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                />
              )}
            </div>
          </label>
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="flex items-center gap-2 mt-4 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">Git 저장소가 성공적으로 설정되었습니다</span>
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end mt-6">
          <button
            onClick={handleSave}
            disabled={saving || isLoading}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              'text-white bg-primary-600 hover:bg-primary-700',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                저장 중...
              </>
            ) : (
              <>
                <GitBranch className="w-4 h-4" />
                저장
              </>
            )}
          </button>
        </div>
      </div>

      {/* Help Text */}
      <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        <p className="font-medium mb-2">도움말</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Git 저장소 경로는 <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">.git</code> 폴더가 있는 디렉토리입니다</li>
          <li>경로를 입력할 때 탭 완성을 사용하려면 터미널에서 경로를 복사해오세요</li>
          <li>심볼릭 링크된 프로젝트의 경우 실제 Git 저장소 경로를 지정해야 합니다</li>
          <li><strong>등록된 저장소</strong>를 사용하면 자주 사용하는 저장소를 빠르게 선택할 수 있습니다</li>
        </ul>
      </div>
    </div>
  )
}
