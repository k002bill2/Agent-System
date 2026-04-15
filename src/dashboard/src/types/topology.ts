/**
 * Topology map types and builder.
 *
 * Transforms diagnostics + infra status into React Flow nodes/edges.
 */

import type { Node, Edge } from '@xyflow/react'
import type { ProjectDiagnostics, DiagnosticStatus } from './diagnostics'
import type { VaultHealthResult } from './monitoring'
import type { ServiceStatus } from '../stores/infraStatus'

// ─────────────────────────────────────────────────────────────
// Custom node data
// ─────────────────────────────────────────────────────────────

export interface TopologyNodeData extends Record<string, unknown> {
  label: string
  status: DiagnosticStatus | 'running' | 'stopped' | 'unknown'
  subtitle?: string
  icon?: string
}

export type TopologyNode = Node<TopologyNodeData>
export type TopologyEdge = Edge

// ─────────────────────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────────────────────

const INFRA_ICONS: Record<string, string> = {
  PostgreSQL: 'db',
  Redis: 'cache',
  Qdrant: 'vector',
  'Backend API': 'api',
  Dashboard: 'ui',
}

function serviceStatusToDiag(status: string): DiagnosticStatus | 'running' | 'stopped' {
  if (status === 'running') return 'running'
  return 'stopped'
}

/**
 * Build React Flow nodes and edges from diagnostics and infra data.
 */
export function buildTopology(
  projectName: string,
  diagnostics: ProjectDiagnostics | null,
  infraServices: ServiceStatus[],
  vaultHealth?: VaultHealthResult | null,
): { nodes: TopologyNode[]; edges: TopologyEdge[] } {
  const nodes: TopologyNode[] = []
  const edges: TopologyEdge[] = []

  // Center: Project node
  nodes.push({
    id: 'project',
    position: { x: 300, y: 200 },
    data: {
      label: projectName,
      status: diagnostics?.overall_status ?? 'unknown',
      subtitle: 'Project',
      icon: 'project',
    },
    type: 'topology',
  })

  // Diagnostic category nodes (left side, stacked)
  const categoryPositions: Record<string, { x: number; y: number }> = {
    workspace: { x: 20, y: 60 },
    mcp: { x: 20, y: 170 },
    git: { x: 20, y: 280 },
    quota: { x: 20, y: 390 },
  }

  const categoryIcons: Record<string, string> = {
    workspace: 'folder',
    mcp: 'plug',
    git: 'git',
    quota: 'gauge',
  }

  if (diagnostics) {
    for (const [catKey, result] of Object.entries(diagnostics.categories)) {
      const pos = categoryPositions[catKey] ?? { x: 20, y: 60 }
      const healthy = result.checks.filter((c) => c.status === 'healthy').length
      const total = result.checks.length

      nodes.push({
        id: `cat-${catKey}`,
        position: pos,
        data: {
          label: catKey.charAt(0).toUpperCase() + catKey.slice(1),
          status: result.status,
          subtitle: `${healthy}/${total} checks`,
          icon: categoryIcons[catKey] ?? 'circle',
        },
        type: 'topology',
      })

      edges.push({
        id: `e-${catKey}-project`,
        source: `cat-${catKey}`,
        target: 'project',
        animated: result.status !== 'healthy',
        style: { stroke: statusColor(result.status) },
      })
    }
  }

  // Vault health node (below diagnostic categories on left side)
  if (vaultHealth) {
    const vhStatusMap: Record<string, DiagnosticStatus> = {
      healthy: 'healthy',
      degraded: 'degraded',
      unhealthy: 'unhealthy',
    }
    const passCount = vaultHealth.checks.filter((c) => c.status === 'pass').length
    const total = vaultHealth.checks.length

    nodes.push({
      id: 'vault-health',
      position: { x: 160, y: 390 },
      data: {
        label: 'Vault Health',
        status: vhStatusMap[vaultHealth.status] ?? 'unknown',
        subtitle: `${passCount}/${total} checks`,
        icon: 'folder',
      },
      type: 'topology',
    })

    edges.push({
      id: 'e-vault-health-project',
      source: 'vault-health',
      target: 'project',
      animated: vaultHealth.status !== 'healthy',
      style: { stroke: statusColor(vhStatusMap[vaultHealth.status] ?? 'unknown') },
    })
  }

  // Infra service nodes (right side, stacked)
  const infraStartY = 40
  const infraSpacing = 90
  infraServices.forEach((svc, idx) => {
    const nodeId = `infra-${svc.name.replace(/\s+/g, '-').toLowerCase()}`
    nodes.push({
      id: nodeId,
      position: { x: 580, y: infraStartY + idx * infraSpacing },
      data: {
        label: svc.name,
        status: serviceStatusToDiag(svc.status),
        subtitle: svc.status === 'running' ? `:${svc.port}` : 'stopped',
        icon: INFRA_ICONS[svc.name] ?? 'server',
      },
      type: 'topology',
    })

    edges.push({
      id: `e-project-${nodeId}`,
      source: 'project',
      target: nodeId,
      animated: svc.status !== 'running',
      style: { stroke: svc.status === 'running' ? '#22c55e' : '#ef4444' },
    })
  })

  return { nodes, edges }
}

export function statusColor(status: string): string {
  switch (status) {
    case 'healthy':
    case 'running':
      return '#22c55e'
    case 'degraded':
      return '#f59e0b'
    case 'unhealthy':
    case 'stopped':
      return '#ef4444'
    default:
      return '#9ca3af'
  }
}
