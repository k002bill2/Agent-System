/**
 * Store Barrel Export
 *
 * 도메인별로 분리된 Zustand 스토어를 중앙에서 재export합니다.
 * 슬라이스 패턴으로 각 도메인의 관심사가 분리되어 있습니다.
 *
 * 스토어 구성:
 * - auth: 인증 상태 (로그인, 사용자 정보, 역할)
 * - agents: 에이전트 레지스트리 (목록, 상태, 통계)
 * - taskStore: 태스크 관리 (CRUD, 상태 추적, 통계)
 * - uiStore: UI 상태 (테마, 모달, 토스트, 사이드바)
 */

// Domain Stores (슬라이스 패턴)
export { useTaskStore, selectTaskById, selectTasksByStatus, selectRootTasks } from './taskStore'
export type { TaskItem, TaskStatus } from './taskStore'

export { useUIStore, selectTheme, selectActiveToasts } from './uiStore'
export type { Theme, ToastMessage, ModalConfig } from './uiStore'

// Legacy Stores (기존 호환성 유지)
export { useOrchestrationStore } from './orchestration'
export { useClaudeSessionsStore } from './claudeSessions'
export { useNavigationStore } from './navigation'
