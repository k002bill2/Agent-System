import { useState, useEffect } from 'react'
import {
  Search, X, Code, Rocket, CheckCircle, Zap,
  Activity, Database, GitPullRequest, Box, Shield,
  Tag, Trash2, Gauge, GitBranch, Monitor, Hexagon,
  FolderKanban, AlertCircle,
  type LucideIcon,
} from 'lucide-react'
import { useProjectsStore } from '../../stores/projects'
import { useWorkflowStore } from '../../stores/workflows'

export interface Template {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  yaml_content: string
  icon: string
  popularity: number
}

interface TemplateGalleryProps {
  onSelect: (template: Template, projectId: string) => void
  onClose: () => void
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  ci: { label: 'CI', icon: Code, color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' },
  deploy: { label: 'Deploy', icon: Rocket, color: 'text-green-500 bg-green-50 dark:bg-green-900/20' },
  test: { label: 'Test', icon: CheckCircle, color: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20' },
  utility: { label: 'Utility', icon: Zap, color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20' },
}

const ICON_MAP: Record<string, LucideIcon> = {
  code: Code,
  hexagon: Hexagon,
  rocket: Rocket,
  'check-circle': CheckCircle,
  zap: Zap,
  monitor: Monitor,
  activity: Activity,
  database: Database,
  'git-pull-request': GitPullRequest,
  box: Box,
  shield: Shield,
  tag: Tag,
  'trash-2': Trash2,
  gauge: Gauge,
  'git-branch': GitBranch,
}

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export function TemplateGallery({ onSelect, onClose }: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [showProjectError, setShowProjectError] = useState(false)
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false)
  const { projects, fetchProjects } = useProjectsStore()
  const { workflows } = useWorkflowStore()

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  useEffect(() => {
    fetchTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, search])

  const fetchTemplates = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (category) params.set('category', category)
      if (search) params.set('search', search)
      const res = await fetch(`${API_BASE}/workflows/templates?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTemplates(data.templates || [])
      }
    } catch (e) {
      console.error('Failed to fetch templates:', e)
    }
    setIsLoading(false)
  }

  const previewTemplate = templates.find(t => t.id === previewId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-[800px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Template Gallery</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Search + Filters */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="템플릿 검색..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
            />
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setCategory(null)}
              className={`px-2.5 py-1 text-xs rounded-full ${
                !category ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              All
            </button>
            {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setCategory(category === key ? null : key)}
                className={`px-2.5 py-1 text-xs rounded-full flex items-center gap-1 ${
                  category === key
                    ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Loading...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-gray-400">No templates found</div>
          ) : previewId ? (
            <div className="space-y-3">
              <button
                onClick={() => setPreviewId(null)}
                className="text-xs text-primary-600 hover:text-primary-700"
              >
                ← Back to gallery
              </button>
              {previewTemplate && (
                <div>
                  <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mb-1">
                    {previewTemplate.name}
                  </h3>
                  <p className="text-sm text-gray-500 mb-3">{previewTemplate.description}</p>
                  <pre className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg font-mono text-xs text-gray-700 dark:text-gray-300 overflow-auto max-h-[250px]">
                    {previewTemplate.yaml_content}
                  </pre>

                  {/* Project Selection (Required) */}
                  {(() => {
                    const isDuplicate = selectedProjectId && workflows.some(
                      w => w.project_id === selectedProjectId && w.name === previewTemplate.name
                    )
                    return (
                      <>
                        <div className="mt-4 p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            <FolderKanban className="w-4 h-4 inline-block mr-1 -mt-0.5" />
                            프로젝트 <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={selectedProjectId}
                            onChange={e => {
                              setSelectedProjectId(e.target.value)
                              setShowProjectError(false)
                              setDuplicateConfirmed(false)
                            }}
                            className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                              showProjectError
                                ? 'border-red-400 dark:border-red-500'
                                : isDuplicate && !duplicateConfirmed
                                  ? 'border-amber-400 dark:border-amber-500'
                                  : 'border-gray-300 dark:border-gray-600'
                            }`}
                          >
                            <option value="">프로젝트를 선택하세요</option>
                            {projects.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          {showProjectError && (
                            <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              프로젝트를 선택해주세요
                            </p>
                          )}
                        </div>

                        {isDuplicate && !duplicateConfirmed && (
                          <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                            <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                              <AlertCircle className="w-4 h-4 flex-shrink-0" />
                              이 프로젝트에 &quot;{previewTemplate.name}&quot; 워크플로우가 이미 존재합니다.
                            </p>
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => setDuplicateConfirmed(true)}
                                className="px-3 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700"
                              >
                                그래도 생성
                              </button>
                              <button
                                onClick={() => setSelectedProjectId('')}
                                className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                              >
                                다른 프로젝트 선택
                              </button>
                            </div>
                          </div>
                        )}

                        <button
                          onClick={() => {
                            if (!selectedProjectId) {
                              setShowProjectError(true)
                              return
                            }
                            if (isDuplicate && !duplicateConfirmed) {
                              return
                            }
                            onSelect(previewTemplate, selectedProjectId)
                          }}
                          disabled={!!isDuplicate && !duplicateConfirmed}
                          className="mt-3 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          이 템플릿 사용
                        </button>
                      </>
                    )
                  })()}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {templates.map(tpl => {
                const catConfig = CATEGORY_CONFIG[tpl.category] || CATEGORY_CONFIG.utility
                const TplIcon = ICON_MAP[tpl.icon] || catConfig.icon
                return (
                  <div
                    key={tpl.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:border-primary-300 dark:hover:border-primary-600 transition-colors cursor-pointer group"
                    onClick={() => setPreviewId(tpl.id)}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`p-2 rounded-lg ${catConfig.color}`}>
                        <TplIcon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{tpl.name}</h4>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{tpl.description}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {tpl.tags.map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
