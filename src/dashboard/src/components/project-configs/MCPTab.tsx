import { useState, useEffect } from 'react'
import { cn } from '../../lib/utils'
import { Server, Power, PowerOff, Package, Terminal, Info, Plus, Pencil, Trash2, Globe, FolderCode, Copy } from 'lucide-react'
import { useProjectConfigsStore, MCPServerConfig } from '../../stores/projectConfigs'
import { MCPServerModal } from './MCPServerModal'
import { ConfirmDeleteModal } from './ConfirmDeleteModal'
import { CopyToProjectModal, CopyItemType } from './CopyToProjectModal'

export function MCPTab() {
  const {
    selectedProject,
    isLoadingProject,
    toggleMCPServer,
    togglingServers,
    openMCPModal,
    deleteMCPServer,
    deletingMCP,
    copyMCPServer,
    globalConfigs,
    fetchGlobalConfigs,
  } = useProjectConfigsStore()

  const [deleteTarget, setDeleteTarget] = useState<MCPServerConfig | null>(null)
  const [copyTarget, setCopyTarget] = useState<MCPServerConfig | null>(null)

  useEffect(() => {
    if (!globalConfigs) {
      fetchGlobalConfigs()
    }
  }, [globalConfigs, fetchGlobalConfigs])

  if (isLoadingProject) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (!selectedProject) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        Select a project to view MCP servers
      </div>
    )
  }

  const { mcp_servers, user_mcp_servers } = selectedProject
  const totalCount = mcp_servers.length + (user_mcp_servers?.length || 0)
  const enabledCount = mcp_servers.filter((s) => !s.disabled).length +
    (user_mcp_servers?.filter((s) => !s.disabled).length || 0)

  const handleToggle = async (server: MCPServerConfig) => {
    await toggleMCPServer(server.project_id, server.server_id, server.disabled)
  }

  const handleDelete = async () => {
    if (!deleteTarget || !selectedProject) return
    await deleteMCPServer(selectedProject.project.project_id, deleteTarget.server_id)
    setDeleteTarget(null)
  }

  const handleCopy = async (targetProjectId: string) => {
    if (!copyTarget || !selectedProject) return false
    const success = await copyMCPServer(selectedProject.project.project_id, copyTarget.server_id, targetProjectId)
    if (success) {
      setCopyTarget(null)
    }
    return success
  }

  return (
    <>
      <div className="p-6 h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Server className="w-5 h-5 text-green-500" />
            MCP Servers ({totalCount})
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {enabledCount} enabled
            </span>
            <button
              onClick={() => openMCPModal('create')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
            >
              <Plus className="w-4 h-4" />
              Add Server
            </button>
          </div>
        </div>

        {/* Global MCP Servers Section */}
        {globalConfigs && globalConfigs.mcp_servers.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4 text-teal-500" />
              Global MCPs
              <span className="text-xs text-gray-500 dark:text-gray-400">
                (~/.claude.json)
              </span>
              <span className="text-xs px-1.5 py-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 rounded">
                {globalConfigs.mcp_servers.length}
              </span>
            </h4>
            <div className="space-y-3">
              {globalConfigs.mcp_servers.map((server) => (
                <MCPServerCard
                  key={`global-${server.server_id}`}
                  server={server}
                  isToggling={false}
                  isDeleting={false}
                  isReadOnly={true}
                  isGlobal={true}
                  onToggle={() => {}}
                  onEdit={() => {}}
                  onDelete={() => {}}
                />
              ))}
            </div>
          </div>
        )}

        {/* Project MCP Servers Section */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <FolderCode className="w-4 h-4 text-green-500" />
            Project MCPs
            <span className="text-xs text-gray-500 dark:text-gray-400">
              (.claude/mcp.json)
            </span>
            <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
              {mcp_servers.length}
            </span>
          </h4>

          {mcp_servers.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <Server className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No project MCP servers configured</p>
              <p className="text-xs mt-1">Click "Add Server" to create one</p>
            </div>
          ) : (
            <div className="space-y-3">
              {mcp_servers.map((server) => (
                <MCPServerCard
                  key={server.server_id}
                  server={server}
                  isToggling={togglingServers.has(`${server.project_id}:${server.server_id}`)}
                  isDeleting={deletingMCP.has(`${server.project_id}:${server.server_id}`)}
                  isReadOnly={false}
                  onToggle={() => handleToggle(server)}
                  onEdit={() => openMCPModal('edit', server)}
                  onDelete={() => setDeleteTarget(server)}
                  onCopy={() => setCopyTarget(server)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <MCPServerModal />
      <ConfirmDeleteModal
        isOpen={deleteTarget !== null}
        title="Delete MCP Server"
        message="Are you sure you want to delete this MCP server? This action cannot be undone."
        itemName={deleteTarget?.server_id || ''}
        isDeleting={deleteTarget ? deletingMCP.has(`${selectedProject?.project.project_id}:${deleteTarget.server_id}`) : false}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <CopyToProjectModal
        isOpen={copyTarget !== null}
        items={copyTarget ? [{
          type: 'mcp' as CopyItemType,
          id: copyTarget.server_id,
          name: copyTarget.server_id,
          sourceProjectId: copyTarget.project_id,
        }] : []}
        onClose={() => setCopyTarget(null)}
        onCopy={handleCopy}
      />
    </>
  )
}

interface MCPServerCardProps {
  server: MCPServerConfig
  isToggling: boolean
  isDeleting: boolean
  isReadOnly?: boolean
  isGlobal?: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onCopy?: () => void
}

function MCPServerCard({ server, isToggling, isDeleting, isReadOnly = false, isGlobal = false, onToggle, onEdit, onDelete, onCopy }: MCPServerCardProps) {
  const typeIcons: Record<string, typeof Package> = {
    npx: Package,
    uvx: Package,
    command: Terminal,
  }

  const TypeIcon = typeIcons[server.server_type] || Terminal
  const isUserMCP = server.source === 'user'

  return (
    <div
      className={cn(
        'bg-white dark:bg-gray-800 rounded-lg border overflow-hidden transition-colors',
        server.disabled
          ? 'border-gray-200 dark:border-gray-700 opacity-60'
          : isGlobal
            ? 'border-teal-200 dark:border-teal-800 opacity-80'
            : isUserMCP
              ? 'border-blue-200 dark:border-blue-800'
              : 'border-green-200 dark:border-green-800'
      )}
    >
      <div className="p-4 flex items-start gap-4">
        <div
          className={cn(
            'p-2 rounded-lg',
            server.disabled
              ? 'bg-gray-100 dark:bg-gray-700'
              : isGlobal
                ? 'bg-teal-100 dark:bg-teal-900/30'
                : isUserMCP
                  ? 'bg-blue-100 dark:bg-blue-900/30'
                  : 'bg-green-100 dark:bg-green-900/30'
          )}
        >
          <TypeIcon
            className={cn(
              'w-5 h-5',
              server.disabled
                ? 'text-gray-500 dark:text-gray-400'
                : isGlobal
                  ? 'text-teal-600 dark:text-teal-400'
                  : isUserMCP
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-green-600 dark:text-green-400'
            )}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-gray-900 dark:text-white">{server.server_id}</h4>
            <span
              className={cn(
                'text-xs px-1.5 py-0.5 rounded font-medium',
                server.disabled
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  : isGlobal
                    ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400'
                    : isUserMCP
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              )}
            >
              {server.disabled ? 'disabled' : 'enabled'}
            </span>
            {isGlobal && (
              <span className="text-xs px-1.5 py-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 rounded">
                global
              </span>
            )}
            <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
              {server.server_type}
            </span>
          </div>

          {server.package_name && (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              {server.package_name}
            </p>
          )}

          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {server.command} {server.args.join(' ')}
          </div>

          {server.note && (
            <div className="flex items-start gap-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
              <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{server.note}</span>
            </div>
          )}

          {Object.keys(server.env).length > 0 && (
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium">Env:</span>{' '}
              {Object.keys(server.env).join(', ')}
            </div>
          )}
        </div>

        {isReadOnly ? (
          <div className="flex items-center">
            <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">
              Read-only
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {onCopy && (
              <button
                onClick={onCopy}
                className="p-2 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                title="Copy to another project"
              >
                <Copy className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onEdit}
              className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
              title="Edit server"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className={cn(
                'p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors',
                isDeleting && 'opacity-50 cursor-not-allowed'
              )}
              title="Delete server"
            >
              {isDeleting ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={onToggle}
              disabled={isToggling}
              className={cn(
                'p-2 rounded-lg transition-colors',
                server.disabled
                  ? 'hover:bg-green-100 dark:hover:bg-green-900/30 text-gray-400 hover:text-green-600'
                  : 'hover:bg-red-100 dark:hover:bg-red-900/30 text-green-600 hover:text-red-600',
                isToggling && 'opacity-50 cursor-not-allowed'
              )}
              title={server.disabled ? 'Enable server' : 'Disable server'}
            >
              {isToggling ? (
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : server.disabled ? (
                <Power className="w-5 h-5" />
              ) : (
                <PowerOff className="w-5 h-5" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
