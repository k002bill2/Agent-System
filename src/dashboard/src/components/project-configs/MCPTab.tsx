import { cn } from '../../lib/utils'
import { Server, Power, PowerOff, Package, Terminal, Info } from 'lucide-react'
import { useProjectConfigsStore, MCPServerConfig } from '../../stores/projectConfigs'

export function MCPTab() {
  const { selectedProject, isLoadingProject, toggleMCPServer, togglingServers } =
    useProjectConfigsStore()

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

  const { mcp_servers } = selectedProject
  const enabledCount = mcp_servers.filter((s) => !s.disabled).length

  const handleToggle = async (server: MCPServerConfig) => {
    await toggleMCPServer(server.project_id, server.server_id, server.disabled)
  }

  return (
    <div className="p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Server className="w-5 h-5 text-green-500" />
          MCP Servers ({mcp_servers.length})
        </h3>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {enabledCount} enabled
        </span>
      </div>

      {mcp_servers.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No MCP servers configured</p>
          <p className="text-sm mt-1">Add servers in .claude/mcp.json</p>
        </div>
      ) : (
        <div className="space-y-3">
          {mcp_servers.map((server) => (
            <MCPServerCard
              key={server.server_id}
              server={server}
              isToggling={togglingServers.has(`${server.project_id}:${server.server_id}`)}
              onToggle={() => handleToggle(server)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface MCPServerCardProps {
  server: MCPServerConfig
  isToggling: boolean
  onToggle: () => void
}

function MCPServerCard({ server, isToggling, onToggle }: MCPServerCardProps) {
  const typeIcons: Record<string, typeof Package> = {
    npx: Package,
    uvx: Package,
    command: Terminal,
  }

  const TypeIcon = typeIcons[server.server_type] || Terminal

  return (
    <div
      className={cn(
        'bg-white dark:bg-gray-800 rounded-lg border overflow-hidden transition-colors',
        server.disabled
          ? 'border-gray-200 dark:border-gray-700 opacity-60'
          : 'border-green-200 dark:border-green-800'
      )}
    >
      <div className="p-4 flex items-start gap-4">
        <div
          className={cn(
            'p-2 rounded-lg',
            server.disabled
              ? 'bg-gray-100 dark:bg-gray-700'
              : 'bg-green-100 dark:bg-green-900/30'
          )}
        >
          <TypeIcon
            className={cn(
              'w-5 h-5',
              server.disabled
                ? 'text-gray-500 dark:text-gray-400'
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
                  : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              )}
            >
              {server.disabled ? 'disabled' : 'enabled'}
            </span>
            <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
              {server.server_type}
            </span>
          </div>

          {server.package_name && (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 font-mono">
              {server.package_name}
            </p>
          )}

          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 font-mono">
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
    </div>
  )
}
