/**
 * Project environment diagnostics types.
 *
 * Mirrors backend models/diagnostics.py.
 */

export type DiagnosticStatus = 'healthy' | 'degraded' | 'unhealthy'

export type DiagnosticCategory = 'workspace' | 'mcp' | 'git' | 'quota'

export interface DiagnosticCheck {
  name: string
  status: DiagnosticStatus
  message: string
  details: Record<string, unknown>
  fixable: boolean
  fix_action: string | null
}

export interface CategoryResult {
  category: DiagnosticCategory
  status: DiagnosticStatus
  checks: DiagnosticCheck[]
}

export interface ProjectDiagnostics {
  project_id: string
  project_name: string
  overall_status: DiagnosticStatus
  categories: Record<string, CategoryResult>
  timestamp: string
}

export interface FixRequest {
  fix_action: string
  params?: Record<string, unknown>
}

export interface FixResult {
  fix_action: string
  success: boolean
  message: string
  diagnostics: ProjectDiagnostics | null
}
