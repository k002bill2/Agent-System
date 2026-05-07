import { memo, useEffect, useState, type FormEvent } from 'react'
import { FolderPlus, RefreshCw, Trash2 } from 'lucide-react'
import {
  addExternalSourcePath,
  fetchExternalSourcePaths,
  removeExternalSourcePath,
} from './api'

export const ExternalSourcesTab = memo(function ExternalSourcesTab() {
  const [paths, setPaths] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchExternalSourcePaths()
      setPaths(data.paths)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load external paths')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    setSubmitting(true)
    setError(null)
    setInfo(null)
    try {
      const data = await addExternalSourcePath(trimmed)
      setPaths(data.paths)
      setInfo(data.message)
      setInput('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add path')
    } finally {
      setSubmitting(false)
    }
  }

  const onRemove = async (path: string) => {
    setSubmitting(true)
    setError(null)
    setInfo(null)
    try {
      const data = await removeExternalSourcePath(path)
      setPaths(data.paths)
      setInfo(data.message)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove path')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            External Claude Sources
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            다른 머신의 <code className="font-mono text-xs">~/.claude/projects/</code> 경로를 추가하면 분석에 합산됩니다.
            SSH 마운트(sshfs/mutagen) 또는 rsync 동기화 후 로컬 경로로 입력하세요.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          aria-label="Reload external paths"
          className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="/Volumes/work-mac/Users/me/.claude/projects"
          aria-label="External Claude projects directory path"
          className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          disabled={submitting}
        />
        <button
          type="submit"
          disabled={submitting || !input.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
        >
          <FolderPlus className="w-4 h-4" />
          Add
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm"
        >
          {error}
        </div>
      )}
      {info && !error && (
        <div
          role="status"
          className="p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-sm"
        >
          {info}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white">
            Registered paths ({paths.length})
          </h4>
        </div>
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Loading...
          </div>
        ) : paths.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            등록된 외부 경로가 없습니다. 위 입력란에 추가하세요.
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {paths.map((p) => (
              <li
                key={p}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <code className="font-mono text-xs text-gray-700 dark:text-gray-300 truncate">
                  {p}
                </code>
                <button
                  type="button"
                  onClick={() => onRemove(p)}
                  disabled={submitting}
                  aria-label={`Remove ${p}`}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50 ml-3 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
})

ExternalSourcesTab.displayName = 'ExternalSourcesTab'
