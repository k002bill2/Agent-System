import { memo, useCallback, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type NodeProps,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  FolderOpen,
  Plug,
  GitBranch,
  Gauge,
  Database,
  Server,
  Globe,
  Layers,
  HardDrive,
  Cpu,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useDiagnosticsStore } from '../../stores/diagnostics'
import { useInfraStatusStore } from '../../stores/infraStatus'
import { useMonitoringStore } from '../../stores/monitoring'
import {
  buildTopology,
  statusColor,
  type TopologyNodeData,
} from '../../types/topology'

// ─────────────────────────────────────────────────────────────
// Custom Topology Node
// ─────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  project: Layers,
  folder: FolderOpen,
  plug: Plug,
  git: GitBranch,
  gauge: Gauge,
  db: Database,
  cache: HardDrive,
  vector: Cpu,
  api: Server,
  ui: Globe,
  server: Server,
}

type TopologyNode = Node<TopologyNodeData, 'topology'>

function TopologyNodeComponent({ data }: NodeProps<TopologyNode>) {
  const Icon = ICON_MAP[data.icon ?? 'server'] ?? Server
  const color = statusColor(data.status)
  const isProject = data.icon === 'project'

  return (
    <div
      className={cn(
        'px-3 py-2 rounded-lg border-2 bg-white dark:bg-gray-800 shadow-sm',
        'flex items-center gap-2 min-w-[120px]',
        isProject && 'min-w-[160px] py-3',
      )}
      style={{ borderColor: color }}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-400 !w-2 !h-2" />

      <div
        className="p-1.5 rounded-md"
        style={{ backgroundColor: `${color}20` }}
      >
        <span style={{ color }}>
          <Icon className="w-4 h-4" />
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className={cn(
          'font-medium text-gray-900 dark:text-white truncate',
          isProject ? 'text-sm' : 'text-xs',
        )}>
          {data.label}
        </div>
        {data.subtitle && (
          <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
            {data.subtitle}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!bg-gray-400 !w-2 !h-2" />
    </div>
  )
}

const nodeTypes = { topology: memo(TopologyNodeComponent) }

// ─────────────────────────────────────────────────────────────
// TopologyMap Component
// ─────────────────────────────────────────────────────────────

interface TopologyMapProps {
  projectId: string
  projectName: string
  projectPath?: string
}

export const TopologyMap = memo(function TopologyMap({
  projectId,
  projectName,
  projectPath,
}: TopologyMapProps) {
  const { getDiagnostics, fetchDiagnostics } = useDiagnosticsStore()
  const { services, fetchStatus } = useInfraStatusStore()
  const vaultHealth = useMonitoringStore((s) => s.getVaultHealth(projectId))

  const diagnostics = getDiagnostics(projectId)

  useEffect(() => {
    fetchDiagnostics(projectId)
    fetchStatus(projectPath ?? null)
  }, [projectId, projectPath, fetchDiagnostics, fetchStatus])

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildTopology(projectName, diagnostics, services, vaultHealth),
    [projectName, diagnostics, services, vaultHealth],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Sync when data changes
  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  const onConnect = useCallback(() => {}, [])

  const isDark = document.documentElement.classList.contains('dark')

  return (
    <div className="h-[350px] w-full rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-900">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        colorMode={isDark ? 'dark' : 'light'}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background gap={16} size={1} />
        <Controls
          showInteractive={false}
          className="!bg-white dark:!bg-gray-800 !border-gray-200 dark:!border-gray-700 !shadow-sm"
        />
      </ReactFlow>
    </div>
  )
})

TopologyMap.displayName = 'TopologyMap'
