import { useEffect, useState } from 'react'
import {
  X,
  Sparkles,
  Users,
  Server,
  ChevronRight,
  Loader2,
  Power,
  PowerOff,
  AlertCircle,
  FileCode,
  ExternalLink,
  Webhook,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { Project } from '../../stores/projects'
import { useProjectConfigsStore, ProjectConfigSummary } from '../../stores/projectConfigs'

interface ProjectClaudeConfigPanelProps {
  project: Project
  onClose: () => void
}

export function ProjectClaudeConfigPanel({ project, onClose }: ProjectClaudeConfigPanelProps) {
  const {
    toggleMCPServer,
    togglingServers,
  } = useProjectConfigsStore()

  const [summary, setSummary] = useState<ProjectConfigSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<'skills' | 'agents' | 'mcp' | 'hooks'>('skills')
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(null)

  useEffect(() => {
    const loadSummary = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // Use by-path endpoint which resolves symlinks
        const encodedPath = encodeURIComponent(project.path)
        const res = await fetch(`/api/project-configs/by-path?path=${encodedPath}`)
        if (res.status === 404) {
          // Project doesn't have .claude directory
          setError('이 프로젝트에 .claude 디렉토리가 없습니다.')
          setIsLoading(false)
          return
        }
        if (!res.ok) {
          throw new Error(`Failed to fetch: ${res.statusText}`)
        }
        const data: ProjectConfigSummary = await res.json()
        setSummary(data)
        // Store the resolved project_id for MCP toggle
        setResolvedProjectId(data.project.project_id)
      } catch (e) {
        setError(e instanceof Error ? e.message : '로드 실패')
      } finally {
        setIsLoading(false)
      }
    }

    loadSummary()
  }, [project.path])

  const handleToggleMCP = async (serverId: string, enabled: boolean) => {
    if (!resolvedProjectId) return
    await toggleMCPServer(resolvedProjectId, serverId, enabled)
    // Refresh summary
    const encodedPath = encodeURIComponent(project.path)
    const res = await fetch(`/api/project-configs/by-path?path=${encodedPath}`)
    if (res.ok) {
      const data: ProjectConfigSummary = await res.json()
      setSummary(data)
    }
  }

  return (
    <div className="w-96 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">
              Claude 설정
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {project.name}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        )}

        {error && (
          <div className="p-4">
            <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-yellow-700 dark:text-yellow-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        {summary && (
          <>
            {/* Summary Stats */}
            <div className="p-4 grid grid-cols-4 gap-2 border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setActiveSection('skills')}
                className={cn(
                  'p-2 rounded-lg text-center transition-colors',
                  activeSection === 'skills'
                    ? 'bg-primary-100 dark:bg-primary-900/30'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                )}
              >
                <Sparkles className={cn(
                  'w-4 h-4 mx-auto mb-1',
                  activeSection === 'skills'
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-gray-500'
                )} />
                <div className="text-base font-semibold text-gray-900 dark:text-white">
                  {summary.skills.length}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Skills</div>
              </button>

              <button
                onClick={() => setActiveSection('agents')}
                className={cn(
                  'p-2 rounded-lg text-center transition-colors',
                  activeSection === 'agents'
                    ? 'bg-primary-100 dark:bg-primary-900/30'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                )}
              >
                <Users className={cn(
                  'w-4 h-4 mx-auto mb-1',
                  activeSection === 'agents'
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-gray-500'
                )} />
                <div className="text-base font-semibold text-gray-900 dark:text-white">
                  {summary.agents.length}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Agents</div>
              </button>

              <button
                onClick={() => setActiveSection('mcp')}
                className={cn(
                  'p-2 rounded-lg text-center transition-colors',
                  activeSection === 'mcp'
                    ? 'bg-primary-100 dark:bg-primary-900/30'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                )}
              >
                <Server className={cn(
                  'w-4 h-4 mx-auto mb-1',
                  activeSection === 'mcp'
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-gray-500'
                )} />
                <div className="text-base font-semibold text-gray-900 dark:text-white">
                  {summary.mcp_servers.length}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">MCP</div>
              </button>

              <button
                onClick={() => setActiveSection('hooks')}
                className={cn(
                  'p-2 rounded-lg text-center transition-colors',
                  activeSection === 'hooks'
                    ? 'bg-primary-100 dark:bg-primary-900/30'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                )}
              >
                <Webhook className={cn(
                  'w-4 h-4 mx-auto mb-1',
                  activeSection === 'hooks'
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-gray-500'
                )} />
                <div className="text-base font-semibold text-gray-900 dark:text-white">
                  {summary.hooks.length}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Hooks</div>
              </button>
            </div>

            {/* Section Content */}
            <div className="p-4">
              {/* Skills Section */}
              {activeSection === 'skills' && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Skills ({summary.skills.length})
                  </h4>
                  {summary.skills.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                      스킬이 없습니다
                    </p>
                  ) : (
                    summary.skills.map((skill) => (
                      <div
                        key={skill.skill_id}
                        className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                      >
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0" />
                              <span className="font-medium text-gray-900 dark:text-white text-sm truncate">
                                {skill.name}
                              </span>
                            </div>
                            {skill.description && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                {skill.description}
                              </p>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        </div>
                        {skill.tools.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {skill.tools.slice(0, 3).map((tool) => (
                              <span
                                key={tool}
                                className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs text-gray-600 dark:text-gray-300"
                              >
                                {tool}
                              </span>
                            ))}
                            {skill.tools.length > 3 && (
                              <span className="px-1.5 py-0.5 text-xs text-gray-500">
                                +{skill.tools.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Agents Section */}
              {activeSection === 'agents' && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Agents ({summary.agents.length})
                  </h4>
                  {summary.agents.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                      에이전트가 없습니다
                    </p>
                  ) : (
                    summary.agents.map((agent) => (
                      <div
                        key={agent.agent_id}
                        className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                      >
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 text-blue-500 flex-shrink-0" />
                              <span className="font-medium text-gray-900 dark:text-white text-sm truncate">
                                {agent.name}
                              </span>
                              {agent.is_shared && (
                                <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded text-xs">
                                  shared
                                </span>
                              )}
                            </div>
                            {agent.description && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                {agent.description}
                              </p>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        </div>
                        {agent.model && (
                          <div className="mt-2">
                            <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded text-xs">
                              {agent.model}
                            </span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* MCP Section */}
              {activeSection === 'mcp' && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    MCP Servers ({summary.mcp_servers.length})
                  </h4>
                  {summary.mcp_servers.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                      MCP 서버가 없습니다
                    </p>
                  ) : (
                    summary.mcp_servers.map((server) => {
                      const toggleKey = `${resolvedProjectId}:${server.server_id}`
                      const isToggling = togglingServers.has(toggleKey)

                      return (
                        <div
                          key={server.server_id}
                          className={cn(
                            'p-3 rounded-lg border',
                            server.disabled
                              ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                              : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <Server className={cn(
                                'w-4 h-4 flex-shrink-0',
                                server.disabled ? 'text-gray-400' : 'text-green-600 dark:text-green-400'
                              )} />
                              <span className={cn(
                                'font-medium text-sm truncate',
                                server.disabled
                                  ? 'text-gray-500'
                                  : 'text-gray-900 dark:text-white'
                              )}>
                                {server.server_id}
                              </span>
                            </div>
                            <button
                              onClick={() => handleToggleMCP(server.server_id, server.disabled)}
                              disabled={isToggling}
                              className={cn(
                                'p-1.5 rounded transition-colors',
                                server.disabled
                                  ? 'text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                                  : 'text-green-600 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                              )}
                              title={server.disabled ? '활성화' : '비활성화'}
                            >
                              {isToggling ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : server.disabled ? (
                                <Power className="w-4 h-4" />
                              ) : (
                                <PowerOff className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                          <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                            {server.command} {server.args.slice(0, 2).join(' ')}
                            {server.args.length > 2 && '...'}
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className={cn(
                              'px-1.5 py-0.5 rounded text-xs',
                              server.server_type === 'npx'
                                ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                                : server.server_type === 'uvx'
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                            )}>
                              {server.server_type}
                            </span>
                            {server.package_name && (
                              <span className="text-xs text-gray-500 truncate">
                                {server.package_name}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}

              {/* Hooks Section */}
              {activeSection === 'hooks' && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Hooks ({summary.hooks.length})
                  </h4>
                  {summary.hooks.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                      훅이 없습니다
                    </p>
                  ) : (
                    summary.hooks.map((hook) => (
                      <div
                        key={hook.hook_id}
                        className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                      >
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Webhook className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                              <span className="font-medium text-gray-900 dark:text-white text-sm truncate">
                                {hook.event}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono truncate">
                              {hook.matcher !== '*' ? `[${hook.matcher}] ` : ''}{hook.command}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded text-xs">
                            {hook.hook_type}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer - Link to full Project Configs page */}
      {summary && resolvedProjectId && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              // Navigate to Project Configs page with this project selected
              window.dispatchEvent(new CustomEvent('navigate-to-project-configs', {
                detail: { projectId: resolvedProjectId }
              }))
            }}
            className="flex items-center justify-center gap-2 w-full py-2 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            전체 설정 보기
          </a>
        </div>
      )}
    </div>
  )
}
