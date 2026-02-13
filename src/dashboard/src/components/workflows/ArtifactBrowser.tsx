import { useState, useEffect } from 'react'
import { File, Download, Trash2, FileText, Image, Archive, RefreshCw } from 'lucide-react'
import type { Artifact } from '../../types/workflow'

interface ArtifactBrowserProps {
  runId: string
}

const API_BASE = import.meta.env.VITE_API_URL || '/api'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(contentType: string) {
  if (contentType.startsWith('image/')) return Image
  if (contentType.includes('zip') || contentType.includes('tar') || contentType.includes('gzip')) return Archive
  if (contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('xml')) return FileText
  return File
}

export function ArtifactBrowser({ runId }: ArtifactBrowserProps) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchArtifacts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  const fetchArtifacts = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/workflows/runs/${runId}/artifacts`)
      if (res.ok) {
        const data = await res.json()
        setArtifacts(data.artifacts || [])
      }
    } catch (e) {
      console.error('Failed to fetch artifacts:', e)
    }
    setIsLoading(false)
  }

  const handleDelete = async (artifactId: string) => {
    try {
      const res = await fetch(`${API_BASE}/workflows/artifacts/${artifactId}`, { method: 'DELETE' })
      if (res.ok) {
        setArtifacts(prev => prev.filter(a => a.id !== artifactId))
      }
    } catch (e) {
      console.error('Failed to delete artifact:', e)
    }
  }

  const totalSize = artifacts.reduce((sum, a) => sum + a.size_bytes, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Artifacts</h3>
          <span className="text-xs text-gray-400">
            {artifacts.length} file{artifacts.length !== 1 ? 's' : ''} ({formatSize(totalSize)})
          </span>
        </div>
        <button
          onClick={fetchArtifacts}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-4 text-gray-400 text-sm">Loading...</div>
      ) : artifacts.length === 0 ? (
        <div className="text-center py-4 text-gray-400 text-sm">No artifacts</div>
      ) : (
        <div className="space-y-1">
          {artifacts.map(artifact => {
            const FileIcon = getFileIcon(artifact.content_type)
            return (
              <div
                key={artifact.id}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 group"
              >
                <FileIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{artifact.name}</p>
                  <p className="text-xs text-gray-400">
                    {formatSize(artifact.size_bytes)}
                    {artifact.expires_at && ` · Expires: ${new Date(artifact.expires_at).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={`${API_BASE}/workflows/artifacts/${artifact.id}/download`}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5 text-gray-500" />
                  </a>
                  <button
                    onClick={() => handleDelete(artifact.id)}
                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
