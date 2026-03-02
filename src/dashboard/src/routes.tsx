/**
 * Route definitions with lazy-loaded pages.
 *
 * Every page is wrapped with ErrorBoundary + Suspense
 * via the `lazyWithBoundary` utility from ErrorBoundary.tsx.
 */

import { lazyWithBoundary } from './components/ErrorBoundary'
import type { ViewType } from './stores/navigation'

// ---------------------------------------------------------------------------
// Lazy-loaded pages
// ---------------------------------------------------------------------------

const DashboardPage = lazyWithBoundary(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage as React.ComponentType<Record<string, unknown>> })),
)
const ProjectsPage = lazyWithBoundary(() =>
  import('./pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage as React.ComponentType<Record<string, unknown>> })),
)
const SessionsPage = lazyWithBoundary(() =>
  import('./pages/SessionsPage').then((m) => ({ default: m.SessionsPage as React.ComponentType<Record<string, unknown>> })),
)
const AgentsPage = lazyWithBoundary(() =>
  import('./pages/AgentsPage').then((m) => ({ default: m.AgentsPage as React.ComponentType<Record<string, unknown>> })),
)
const MonitorPage = lazyWithBoundary(() =>
  import('./pages/MonitorPage').then((m) => ({ default: m.MonitorPage as React.ComponentType<Record<string, unknown>> })),
)
const SettingsPage = lazyWithBoundary(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage as React.ComponentType<Record<string, unknown>> })),
)
const ClaudeSessionsPage = lazyWithBoundary(() =>
  import('./pages/ClaudeSessionsPage').then((m) => ({ default: m.ClaudeSessionsPage as React.ComponentType<Record<string, unknown>> })),
)
const ProjectConfigsPage = lazyWithBoundary(() =>
  import('./pages/ProjectConfigsPage').then((m) => ({ default: m.ProjectConfigsPage as React.ComponentType<Record<string, unknown>> })),
)
const ProjectManagementPage = lazyWithBoundary(() =>
  import('./pages/ProjectManagementPage').then((m) => ({ default: m.ProjectManagementPage as React.ComponentType<Record<string, unknown>> })),
)
const LoginPage = lazyWithBoundary(() =>
  import('./pages/LoginPage').then((m) => ({ default: m.LoginPage as React.ComponentType<Record<string, unknown>> })),
)
const RegisterPage = lazyWithBoundary(() =>
  import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage as React.ComponentType<Record<string, unknown>> })),
)
// AuthCallbackPage is eager-loaded in App.tsx (requires `provider` prop)
const AuditPage = lazyWithBoundary(() =>
  import('./pages/AuditPage').then((m) => ({ default: m.AuditPage as React.ComponentType<Record<string, unknown>> })),
)
const GitPage = lazyWithBoundary(() =>
  import('./pages/GitPage').then((m) => ({ default: m.GitPage as React.ComponentType<Record<string, unknown>> })),
)
const NotificationsPage = lazyWithBoundary(() =>
  import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage as React.ComponentType<Record<string, unknown>> })),
)
const AnalyticsPage = lazyWithBoundary(() =>
  import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage as React.ComponentType<Record<string, unknown>> })),
)
const PlaygroundPage = lazyWithBoundary(() =>
  import('./pages/PlaygroundPage').then((m) => ({ default: m.PlaygroundPage as React.ComponentType<Record<string, unknown>> })),
)
const OrganizationsPage = lazyWithBoundary(() =>
  import('./pages/OrganizationsPage').then((m) => ({ default: m.OrganizationsPage as React.ComponentType<Record<string, unknown>> })),
)
const AdminPage = lazyWithBoundary(() =>
  import('./pages/AdminPage').then((m) => ({ default: m.AdminPage as React.ComponentType<Record<string, unknown>> })),
)
const WorkflowsPage = lazyWithBoundary(() =>
  import('./pages/WorkflowsPage').then((m) => ({ default: m.WorkflowsPage as React.ComponentType<Record<string, unknown>> })),
)
const ExternalUsagePage = lazyWithBoundary(() =>
  import('./pages/ExternalUsagePage').then((m) => ({ default: m.ExternalUsagePage as React.ComponentType<Record<string, unknown>> })),
)
const InvitationAcceptPage = lazyWithBoundary(() =>
  import('./pages/InvitationAcceptPage').then((m) => ({ default: m.InvitationAcceptPage as React.ComponentType<Record<string, unknown>> })),
)

// ---------------------------------------------------------------------------
// Route ↔ ViewType mapping
// ---------------------------------------------------------------------------

export interface RouteConfig {
  path: string
  view: ViewType
  element: React.ComponentType<Record<string, unknown>>
  isPublic?: boolean
}

export const routes: RouteConfig[] = [
  // Public routes
  { path: '/login', view: 'login', element: LoginPage, isPublic: true },
  { path: '/register', view: 'register', element: RegisterPage, isPublic: true },
  // auth-callback-google/github are handled directly in App.tsx (require provider prop)
  { path: '/invitations/accept', view: 'invitation-accept', element: InvitationAcceptPage, isPublic: true },

  // Protected routes
  { path: '/', view: 'dashboard', element: DashboardPage },
  { path: '/projects', view: 'projects', element: ProjectsPage },
  { path: '/sessions', view: 'sessions', element: SessionsPage },
  { path: '/agents', view: 'agents', element: AgentsPage },
  { path: '/monitor', view: 'monitor', element: MonitorPage },
  { path: '/claude-sessions', view: 'claude-sessions', element: ClaudeSessionsPage },
  { path: '/project-configs', view: 'project-configs', element: ProjectConfigsPage },
  { path: '/project-management', view: 'project-management', element: ProjectManagementPage },
  { path: '/git', view: 'git', element: GitPage },
  { path: '/organizations', view: 'organizations', element: OrganizationsPage },
  { path: '/audit', view: 'audit', element: AuditPage },
  { path: '/notifications', view: 'notifications', element: NotificationsPage },
  { path: '/analytics', view: 'analytics', element: AnalyticsPage },
  { path: '/playground', view: 'playground', element: PlaygroundPage },
  { path: '/workflows', view: 'workflows', element: WorkflowsPage },
  { path: '/external-usage', view: 'external-usage', element: ExternalUsagePage },
  { path: '/admin', view: 'admin', element: AdminPage },
  { path: '/settings', view: 'settings', element: SettingsPage },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map ViewType → URL path */
export function viewToPath(view: ViewType): string {
  if (view === 'dashboard') return '/'
  const route = routes.find((r) => r.view === view)
  return route?.path ?? '/'
}

/** Map URL path → ViewType */
export function pathToView(path: string): ViewType {
  if (path === '/') return 'dashboard'
  const route = routes.find((r) => r.path === path)
  return route?.view ?? 'dashboard'
}
