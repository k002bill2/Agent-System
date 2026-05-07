# Dashboard

AOS React 대시보드 문서입니다.

## Overview

**위치**: `src/dashboard/`
**스택**: React 18.3 + Vite 6.0 + Tailwind CSS 4.2 + Zustand 5.0 + TypeScript 5.6

## Quick Start

```bash
cd src/dashboard
npm install
npm run dev
```

## Commands

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 서버 (http://localhost:5173) |
| `npm test` | Vitest 테스트 |
| `npm run lint` | ESLint |
| `npm run type-check` | TypeScript 검사 |
| `npm run build` | 프로덕션 빌드 |

## Path Aliases

```typescript
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { useOrchestrationStore } from '@/stores/orchestration'
```

## Styling Pattern

```tsx
import { cn } from '@/lib/utils';

<div className={cn(
  'p-4 rounded-lg',
  isActive && 'bg-blue-100',
  className
)}>
  {children}
</div>
```

---

## Pages

| 페이지 | 경로 | 설명 |
|--------|------|------|
| `DashboardPage` | `/` | 메인 대시보드 (세션 상태, 태스크 요약) |
| `ProjectsPage` | `/projects` | 프로젝트 목록 및 관리, RAG 검색 |
| `ProjectConfigsPage` | `/project-configs` | 프로젝트 설정 관리 (Skills, Agents, MCP, Hooks) |
| `TasksPage` | `/tasks` | 태스크 트리 뷰, 상세 정보 (라우트 미등록) |
| `AgentsPage` | `/agents` | 에이전트 레지스트리 (글로벌+프로젝트 통합), MCP, RLHF |
| `ActivityPage` | `/activity` | ~~실시간 활동 로그~~ (deprecated → SessionsPage로 대체) |
| `MonitorPage` | `/monitor` | 프로젝트 헬스 체크 모니터링 |
| `ClaudeSessionsPage` | `/claude-sessions` | Claude Code 세션 모니터링 |
| `GitPage` | `/git` | Git 브랜치/머지/PR 관리 |
| `AnalyticsPage` | `/analytics` | 사용 통계 및 분석 대시보드 |
| `AuditPage` | `/audit` | 감사 로그 뷰어 |
| `NotificationsPage` | `/notifications` | 알림 규칙/채널 설정 |
| `PlaygroundPage` | `/playground` | 에이전트 테스트 환경 |
| `ProjectManagementPage` | `/project-management` | DB 기반 프로젝트 레지스트리 관리 (CRUD, soft-delete, 복원) |
| `OrganizationsPage` | `/organizations` | 조직 관리 (Overview/Members/Settings 3탭, 소스 유저 매핑) |
| `WorkflowsPage` | `/workflows` | 워크플로우 자동화 (CI/CD 파이프라인 관리) |
| `ExternalUsagePage` | `/external-usage` | 외부 LLM 프로바이더 사용량 모니터링 (비용, 토큰, 프로바이더별 현황) |
| `AdminPage` | `/admin` | 관리자 페이지 (사용자 관리, 메뉴 설정, 시스템 정보, External Sources) |
| `SessionsPage` | `/sessions` | 세션 활동 뷰 (ClaudeCodeActivity 래핑) |
| `SettingsPage` | `/settings` | 시스템 설정 (Claude Code OAuth 인증, 터미널 감지) |
| `LoginPage` | `/login` | OAuth/Email 로그인 |
| `RegisterPage` | `/register` | 이메일/비밀번호 회원가입 |
| `AuthCallbackPage` | `/auth/callback` | OAuth 콜백 처리 (App.tsx에서 eager 로딩) |
| `InvitationAcceptPage` | `/invitations/accept` | 조직 초대 수락 페이지 |

---

## Components

### Core Components

| 컴포넌트 | 설명 |
|----------|------|
| `Sidebar` | 메인 네비게이션 사이드바 |
| `TaskPanel` | 태스크 카드 (상태, 진행률, 액션) |
| `TaskBoard` | 태스크 보드 뷰 (칸반/리스트 레이아웃) |
| `AgentPanel` | 에이전트 패널 (레지스트리 목록, 상태 표시) |
| `ChatInput` | 메시지 입력 인터페이스 |
| `ApprovalModal` | HITL 승인/거부 모달 |
| `DiffViewer` | 파일 변경 비교 뷰 (Split/Unified) |
| `AgentCard` | 글로벌 레지스트리 에이전트 카드 (능력, 상태, 통계) |
| `ProjectAgentCard` | 프로젝트별 에이전트 카드 |
| `AgentStatsPanel` | 레지스트리 통계 패널 |
| `TaskAnalyzer` | 태스크 분석 UI |
| `DataSourceToggle` | 데이터 소스 선택 토글 |
| `ProjectFilter` | 프로젝트 필터링 UI |
| `ProjectFormModal` | 프로젝트 생성/수정 모달 |
| `ErrorBoundary` | React 에러 바운더리 |
| `DeleteTaskDialog` | 태스크 삭제 확인 다이얼로그 |
| `ExecutionProgress` | 워크플로우 실행 진행 트래커 |

### Agents Subdirectory Components

| 컴포넌트 | 경로 | 설명 |
|----------|------|------|
| `AgentCard` | `components/agents/` | 에이전트 카드 (이름, 상태 배지, 도구 수, 엔드포인트 표시) |

### Claude Code Components

| 컴포넌트 | 설명 |
|----------|------|
| `ClaudeCodeActivity` | 실시간 활동 피드 (세션 기반 필터링) |
| `ClaudeCodeTasks` | 태스크 목록 뷰 (세션별 필터) |
| `ClaudeCodeSessionSelector` | 세션 선택 드롭다운 (프로젝트 그룹핑) |
| `VerticalSplitPanel` | 세로 분할 패널 (리사이즈 가능) |

### Claude Sessions Components

| 컴포넌트 | 설명 |
|----------|------|
| `SessionList` | 세션 목록 (정렬, 자동 새로고침) |
| `SessionCard` | 세션 카드 (상태, 토큰, 비용) |
| `SessionDetails` | 상세 정보 + Recent Activity |
| `TranscriptViewer` | Raw 트랜스크립트 (JSON Tree) |
| `ProcessCleanupPanel` | 프로세스 정리 패널 |

### Project Config Components

| 컴포넌트 | 경로 | 설명 |
|----------|------|------|
| `ProjectConfigStats` | `components/` | 프로젝트 통계 |
| `ProjectList` | `components/project-configs/` | 프로젝트 목록 |
| `OverviewTab` | `components/project-configs/` | 설정 개요 탭 |
| `SkillsTab` | `components/project-configs/` | 스킬 목록 탭 |
| `SkillEditModal` | `components/project-configs/` | 스킬 편집 모달 |
| `AgentsTab` | `components/project-configs/` | 에이전트 목록 탭 |
| `AgentEditModal` | `components/project-configs/` | 에이전트 편집 모달 |
| `MCPTab` | `components/project-configs/` | MCP 서버 목록 탭 |
| `MCPServerModal` | `components/project-configs/` | MCP 서버 편집 모달 |
| `HooksTab` | `components/project-configs/` | Hook 목록 탭 |
| `HookEditModal` | `components/project-configs/` | Hook 편집 모달 |
| `CommandsTab` | `components/project-configs/` | 커맨드 목록 탭 |
| `CommandEditModal` | `components/project-configs/` | 커맨드 편집 모달 |
| `MemoryTab` | `components/project-configs/` | 메모리 엔트리 목록/MEMORY.md 인덱스 편집 |
| `MemoryEditModal` | `components/project-configs/` | 메모리 엔트리 생성/편집 모달 (YAML frontmatter) |
| `RulesTab` | `components/project-configs/` | 프로젝트/글로벌 규칙 관리 탭 |
| `RuleEditModal` | `components/project-configs/` | 규칙 생성/편집 모달 |
| `ConfirmDeleteModal` | `components/project-configs/` | 삭제 확인 범용 모달 |
| `CopyToProjectModal` | `components/project-configs/` | 프로젝트 간 복사 모달 |

### Projects Components

| 컴포넌트 | 경로 | 설명 |
|----------|------|------|
| `DeleteProjectModal` | `components/projects/` | 프로젝트 삭제 확인 모달 |
| `ProjectClaudeConfigPanel` | `components/projects/` | 프로젝트 Claude 설정 패널 |

### Workflow Components

| 컴포넌트 | 설명 |
|----------|------|
| `WorkflowList` | 워크플로우 목록 (상태, 최근 실행) |
| `WorkflowDetail` | 워크플로우 상세 (DAG + 실행 이력) |
| `WorkflowDAG` | Job 의존성 DAG 시각화 |
| `WorkflowRunsTable` | 실행 이력 테이블 |
| `WorkflowRunLogs` | 실시간 로그 뷰어 (SSE) |
| `WorkflowCreateModal` | 워크플로우 생성 모달 (YAML 에디터) |
| `YamlEditor` | YAML 편집기 (js-yaml 검증, 라인번호, Preview) |
| `EnhancedRunLogs` | 향상된 로그 뷰어 (레벨 필터, 검색, job 접기) |
| `InteractiveDAG` | 확장 가능한 DAG 시각화 (step 펼침, 상태 아이콘) |
| `TriggerConfigPanel` | 트리거 설정 패널 (Manual/Schedule/Webhook/Push/PR) |
| `CronBuilder` | Cron 표현식 빌더 (프리셋, 사람 읽기 가능 미리보기) |
| `TemplateGallery` | 템플릿 갤러리 모달 (카테고리 필터, YAML 미리보기) |
| `ArtifactBrowser` | 아티팩트 브라우저 (파일 목록, 다운로드, 삭제) |
| `SecretsManager` | 시크릿 관리 모달 (CRUD, 마스킹, scope 선택) |
| `ExecutionTimeline` | 실행 타임라인 (Gantt 차트 스타일) |
| `WorkflowYamlModal` | YAML 편집 모달 |

### Feedback Components

| 컴포넌트 | 설명 |
|----------|------|
| `FeedbackButton` | 👍/👎 피드백 버튼 |
| `FeedbackModal` | 부정 피드백 사유 선택 |
| `FeedbackHistoryPanel` | 피드백 히스토리 목록 |
| `DatasetPanel` | 데이터셋 통계 및 내보내기 |
| `AgentEvalPanel` | 에이전트 평가 패널 |
| `TaskEvaluationCard` | 태스크 평가 카드 |
| `PendingFeedbackIndicator` | 대기 중 피드백 인디케이터 |

### MCP Components

| 컴포넌트 | 설명 |
|----------|------|
| `MCPManagerTab` | MCP 서버 관리 탭 |
| `MCPServerCard` | MCP 서버 카드 |
| `MCPStatsPanel` | MCP 통계 패널 |
| `MCPToolCaller` | MCP 도구 호출 UI |

### Git Components

| 컴포넌트 | 설명 |
|----------|------|
| `GitSetup` | Git 초기 설정 안내 |
| `WorkingDirectory` | 작업 디렉토리 (staged/unstaged/untracked) |
| `BranchList` | 브랜치 목록 (local/remote 필터, ahead/behind, `worktrees` prop으로 worktree-aware 삭제, force/remote/worktree 삭제 옵션) |
| `CommitHistory` | 커밋 타임라인 (확장 가능한 상세) |
| `MergeRequestCard` | 내부 MR 카드 (승인/머지/닫기, `availableBranches` prop으로 "브랜치 삭제됨" warning badge 표시) |
| `MergePreviewPanel` | 머지 미리보기 모달 (충돌 정보) |
| `PullRequestList` | GitHub PR 목록 + 리뷰 패널 |
| `ConflictResolverPanel` | 머지 충돌 해결 UI (3-way diff, 전략 선택) |
| `FileGroup` | 파일 변경 그룹 표시 |
| `RemoteList` | Git 리모트 관리 |
| `BranchProtectionSettings` | 브랜치 보호 규칙 설정 |
| `GitAlert` | Git 관련 알림/경고 |

### Organization Components

| 컴포넌트 | 설명 |
|----------|------|
| `OrganizationCard` | 조직 카드 (이름, 플랜, 멤버 수) |
| `OrganizationFormModal` | 조직 생성/수정 모달 |
| `OrganizationStats` | 조직 통계 패널 |
| `QuotaStatusPanel` | Quota 사용량 패널 (멤버/프로젝트/세션/토큰 progress bar) |
| `MemberUsagePanel` | 멤버별 사용량 분석 패널 (기간 선택, 요약 통계, 클릭→상세) |
| `MemberDetailPanel` | 멤버 상세 슬라이드 패널 (Overview/Usage Trend/Model Breakdown 3탭, Recharts 차트) |
| `MemberList` | 멤버 목록 (클릭→MemberDetailPanel 연동, 역할순 정렬) |
| `MemberCard` | 멤버 카드 (역할 변경, 제거) |
| `InviteMemberModal` | 멤버 초대 모달 |
| `SourceUserMapping` | Claude Code OS 유저네임→조직 멤버 매핑 UI (사용량 추적용) |

### Project Management Components

| 컴포넌트 | 경로 | 설명 |
|----------|------|------|
| `ProjectMembersContent` | `components/project-management/` | 프로젝트 멤버 관리 콘텐츠 (멤버십 목록, 관리) |
| `ServiceStatusBar` | `components/project-management/` | 인프라 서비스 상태 바 (실행/중지/충돌 표시) |

### Monitor Components

| 컴포넌트 | 설명 |
|----------|------|
| `HealthOverview` | 헬스 상태 개요 |
| `ProjectsPanel` | 프로젝트 체크 패널 |
| `CheckCard` | 체크 결과 카드 |
| `ContextPanel` | 컨텍스트 정보 패널 |
| `OutputLog` | 실시간 출력 로그 |
| `ResizablePanel` | 리사이즈 가능 패널 |
| `AgentMonitorPanel` | 에이전트 모니터링 패널 |
| `MetricsChart` | 메트릭 차트 시각화 |
| `WorkflowCheckCard` | 워크플로우 체크 카드 |

### RAG Components

| 컴포넌트 | 설명 |
|----------|------|
| `RAGQueryPanel` | RAG 의미론적 검색 패널 (쿼리, 결과, 통계, 인덱스 관리) |

### Analytics Components

| 컴포넌트 | 설명 |
|----------|------|
| `ProjectMultiSelect` | 멀티 프로젝트 선택 (최대 5개, 색상 표시) |

> **Note**: Analytics 데이터는 Claude 세션 파일에서 직접 수집됩니다 (DB 모드와 무관). 트렌드 차트는 세션 `created_at` 기준으로 버킷팅되며, 에이전트 성능은 실제 모델명(claude-opus-4-6 등)으로 그룹화됩니다.

### Audit Components

| 컴포넌트 | 설명 |
|----------|------|
| `AuditLogTable` | 감사 로그 테이블 (필터링, 내보내기 포함) |

### Notification Components

| 컴포넌트 | 설명 |
|----------|------|
| `NotificationRuleEditor` | 알림 규칙 편집 (생성, 수정, 채널 설정 포함) |

### LLM Router Components

| 컴포넌트 | 설명 |
|----------|------|
| `LLMRouterSettings` | LLM 라우터 설정 (프로바이더 관리, 통계 포함) |

### Version Control Components

| 컴포넌트 | 설명 |
|----------|------|
| `VersionHistory` | 버전 히스토리 (타임라인, 비교, 롤백 포함) |

### Usage & Cost Components (`components/usage/`)

| 컴포넌트 | 설명 |
|----------|------|
| `ContextWindowMeter` | Context 창 사용량 게이지 |
| `CostMonitor` | 비용 모니터링 패널 |
| `UsageProgressBar` | 사용량 진행바 |
| `ClaudeUsageDashboard` | Claude 사용량 대시보드 |
| `DailyCostTrend` | 일간 비용 추이 차트 |
| `LLMAccountsSettings` | LLM 계정/API 키 설정 |
| `MemberUsageTable` | 멤버별 사용량 테이블 |

### Terminal Components

| 컴포넌트 | 설명 |
|----------|------|
| `TerminalSelector` | 실행 터미널 선택 (Warp/tmux 토글) |

### Admin Components

| 컴포넌트 | 설명 |
|----------|------|
| `MenuSettingsTab` | 메뉴 가시성/순서 설정 (드래그 앤 드롭) |
| `UserManagementTab` | 사용자 관리 (검색, 필터, 배치 작업, 역할 변경, 삭제, 페이지네이션) |
| `SystemInfoTab` | 시스템 정보 조회 |

### Permission Components

| 컴포넌트 | 설명 |
|----------|------|
| `PermissionTogglePanel` | 권한 토글 패널 |

### Process Monitor Components

| 컴포넌트 | 설명 |
|----------|------|
| `ProcessMonitorWidget` | 프로세스 모니터 위젯 |

### Common Components

| 컴포넌트 | 설명 |
|----------|------|
| `Pagination` | 페이지네이션 컨트롤 |
| `VirtualizedDataTable` | 가상 스크롤 데이터 테이블 |

### Skeleton Components

| 컴포넌트 | 설명 |
|----------|------|
| `DashboardSkeleton` | 대시보드 로딩 스켈레톤 |
| `ProjectsSkeleton` | 프로젝트 페이지 스켈레톤 |
| `ProjectsGridSkeleton` | 프로젝트 그리드 스켈레톤 |
| `TasksSkeleton` | 태스크 페이지 스켈레톤 |
| `AgentsSkeleton` | 에이전트 페이지 스켈레톤 |
| `ActivitySkeleton` | 활동 페이지 스켈레톤 |
| `MonitorSkeleton` | 모니터 페이지 스켈레톤 |
| `SettingsSkeleton` | 설정 페이지 스켈레톤 |
| `ClaudeSessionsSkeleton` | Claude 세션 스켈레톤 |
| `SidebarSkeleton` | 사이드바 로딩 스켈레톤 |

---

## Zustand Stores

| Store | 파일 | 설명 |
|-------|------|------|
| `useOrchestrationStore` | `orchestration.ts` | 세션/태스크 관리, WebSocket 연결 |
| `useProjectsStore` | `projects.ts` | 프로젝트 목록 및 상태 |
| `useProjectConfigsStore` | `projectConfigs.ts` | 프로젝트 설정 (Skills, Agents, MCP, Hooks) + DB 프로젝트 CRUD |
| `useAgentsStore` | `agents.ts` | 에이전트 레지스트리 |
| `useAgentMonitorStore` | `agentMonitor.ts` | 에이전트 모니터링 메트릭 |
| `useTaskStore` | `taskStore.ts` | 태스크 CRUD 관리 |
| `useFeedbackStore` | `feedback.ts` | RLHF 피드백 |
| `useClaudeSessionsStore` | `claudeSessions.ts` | Claude 세션 모니터링 |
| `useClaudeCodeActivityStore` | `claudeCodeActivity.ts` | Claude Code 실시간 활동 |
| `useClaudeUsageStore` | `claudeUsage.ts` | Context Window 사용량 |
| `useMCPStore` | `mcp.ts` | MCP 서버 관리 |
| `useAuthStore` | `auth.ts` | 인증 상태 (OAuth/Email, 토큰 관리) |
| `useDiffStore` | `diff.ts` | 파일 변경 비교 |
| `usePermissionsStore` | `permissions.ts` | 세션 권한 상태 |
| `useNavigationStore` | `navigation.ts` | 네비게이션 상태 |
| `useUIStore` | `uiStore.ts` | UI 상태 (테마, 모달, 토스트) |
| `useMonitoringStore` | `monitoring.ts` | 프로젝트 모니터링 |
| `useSettingsStore` | `settings.ts` | 설정 상태 |
| `useGitStore` | `git.ts` | Git 브랜치/머지 관리, Worktree 관리 (`GitWorktree`, `worktrees`, `selectedWorktreePath`, `fetchWorktrees`, `setSelectedWorktree`), Staging 강화 (`fetchFileDiff`, `fetchFileHunks`, `stageHunks`, `fetchStagedDiff`), Draft Commits (`DraftCommit`, `generateDraftCommits`, `clearDraftCommits`), Remote 관리 (`fetchRemotes`, `addRemote`, `removeRemote`, `updateRemote`), Commit 상세 (`fetchCommitFiles`, `fetchCommitDiff`) |
| `useOrganizationsStore` | `organizations.ts` | 조직/멤버 관리, 멤버 사용량 (`fetchMemberUsage`, `fetchMemberUsageDetail`), 소스 유저 매핑 |
| `useAuditStore` | `audit.ts` | 감사 로그 |
| `useMenuVisibilityStore` | `menuVisibility.ts` | 메뉴 가시성 및 순서 |
| `useProjectAccessStore` | `projectAccess.ts` | 프로젝트별 멤버/역할 관리 |
| `useWorkflowStore` | `workflows.ts` | 워크플로우 CRUD, 실행, 시크릿, 스케줄 |
| `useExternalUsageStore` | `externalUsage.ts` | 외부 LLM 프로바이더 사용량 추적 |
| `useLLMCredentialStore` | `llmCredentials.ts` | LLM 프로바이더 자격증명/API 키 관리 |
| `useInfraStatusStore` | `infraStatus.ts` | 인프라 서비스 상태 관리 (Docker, 포트 체크) |

### Store Pattern

```typescript
import { create } from 'zustand'

interface State {
  // State
  data: DataType | null
  loading: boolean
  error: string | null

  // Actions
  fetchData: () => Promise<void>
  setData: (data: DataType) => void
  reset: () => void
}

export const useStore = create<State>((set, get) => ({
  data: null,
  loading: false,
  error: null,

  fetchData: async () => {
    set({ loading: true, error: null })
    try {
      const response = await api.getData()
      set({ data: response, loading: false })
    } catch (error) {
      set({ error: error.message, loading: false })
    }
  },

  setData: (data) => set({ data }),
  reset: () => set({ data: null, loading: false, error: null }),
}))
```

---

## Directory Structure

```
src/dashboard/
├── src/
│   ├── pages/                  # 페이지 컴포넌트 (24개)
│   │   ├── DashboardPage.tsx
│   │   ├── ProjectsPage.tsx
│   │   ├── ProjectConfigsPage.tsx
│   │   ├── TasksPage.tsx
│   │   ├── SessionsPage.tsx       # ClaudeCodeActivity 래핑
│   │   ├── AgentsPage.tsx
│   │   ├── ActivityPage.tsx
│   │   ├── MonitorPage.tsx
│   │   ├── ClaudeSessionsPage.tsx
│   │   ├── GitPage.tsx
│   │   ├── AnalyticsPage.tsx
│   │   ├── AuditPage.tsx
│   │   ├── NotificationsPage.tsx
│   │   ├── PlaygroundPage.tsx
│   │   ├── OrganizationsPage.tsx
│   │   ├── ProjectManagementPage.tsx
│   │   ├── WorkflowsPage.tsx
│   │   ├── ExternalUsagePage.tsx
│   │   ├── AdminPage.tsx
│   │   ├── SettingsPage.tsx
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── AuthCallbackPage.tsx
│   │   └── InvitationAcceptPage.tsx
│   ├── components/             # 상위 직접 파일 (Sidebar, TaskPanel, TaskBoard, AgentPanel, 등)
│   │   ├── agents/             # 에이전트 서브디렉토리
│   │   │   └── AgentCard.tsx
│   │   ├── ui/                 # 공통 UI 컴포넌트
│   │   ├── common/             # 범용 컴포넌트
│   │   │   ├── Pagination.tsx
│   │   │   └── VirtualizedDataTable.tsx
│   │   ├── skeletons/          # 로딩 스켈레톤
│   │   │   ├── DashboardSkeleton.tsx
│   │   │   ├── ProjectsSkeleton.tsx
│   │   │   ├── ProjectsGridSkeleton.tsx
│   │   │   ├── TasksSkeleton.tsx
│   │   │   ├── AgentsSkeleton.tsx
│   │   │   ├── ActivitySkeleton.tsx
│   │   │   ├── MonitorSkeleton.tsx
│   │   │   ├── SettingsSkeleton.tsx
│   │   │   ├── ClaudeSessionsSkeleton.tsx
│   │   │   └── SidebarSkeleton.tsx
│   │   ├── feedback/           # RLHF 피드백
│   │   ├── claude-sessions/    # Claude Sessions
│   │   ├── project-configs/    # 프로젝트 설정
│   │   │   ├── ProjectList.tsx
│   │   │   ├── OverviewTab.tsx
│   │   │   ├── SkillsTab.tsx
│   │   │   ├── SkillEditModal.tsx
│   │   │   ├── AgentsTab.tsx
│   │   │   ├── AgentEditModal.tsx
│   │   │   ├── MCPTab.tsx
│   │   │   ├── MCPServerModal.tsx
│   │   │   ├── HooksTab.tsx
│   │   │   ├── HookEditModal.tsx
│   │   │   ├── CommandsTab.tsx
│   │   │   ├── CommandEditModal.tsx
│   │   │   ├── MemoryTab.tsx
│   │   │   ├── MemoryEditModal.tsx
│   │   │   ├── RulesTab.tsx
│   │   │   ├── RuleEditModal.tsx
│   │   │   ├── ConfirmDeleteModal.tsx
│   │   │   └── CopyToProjectModal.tsx
│   │   ├── workflows/          # 워크플로우
│   │   │   ├── WorkflowList.tsx
│   │   │   ├── WorkflowDetail.tsx
│   │   │   ├── WorkflowCreateModal.tsx
│   │   │   ├── WorkflowYamlModal.tsx
│   │   │   ├── TemplateGallery.tsx
│   │   │   └── ...
│   │   ├── mcp/                # MCP 관리
│   │   ├── audit/              # 감사 로그
│   │   ├── notifications/      # 알림 설정
│   │   ├── llm-router/         # LLM 라우터
│   │   ├── version-control/    # 버전 관리
│   │   ├── git/                # Git 관리
│   │   │   ├── GitSetup.tsx
│   │   │   ├── WorkingDirectory.tsx
│   │   │   ├── BranchList.tsx
│   │   │   ├── CommitHistory.tsx
│   │   │   ├── MergeRequestCard.tsx
│   │   │   ├── MergePreviewPanel.tsx
│   │   │   ├── PullRequestList.tsx
│   │   │   ├── ConflictResolverPanel.tsx
│   │   │   ├── RemoteList.tsx
│   │   │   ├── BranchProtectionSettings.tsx
│   │   │   ├── FileGroup.tsx
│   │   │   └── GitAlert.tsx
│   │   ├── projects/            # 프로젝트 관련 모달/패널
│   │   │   ├── DeleteProjectModal.tsx
│   │   │   └── ProjectClaudeConfigPanel.tsx
│   │   ├── project-management/  # 프로젝트 멤버 관리
│   │   │   ├── ProjectMembersContent.tsx
│   │   │   └── ServiceStatusBar.tsx
│   │   ├── organizations/      # 조직 관리
│   │   │   ├── OrganizationCard.tsx
│   │   │   ├── OrganizationFormModal.tsx
│   │   │   ├── OrganizationStats.tsx
│   │   │   ├── MemberList.tsx
│   │   │   ├── MemberCard.tsx
│   │   │   ├── InviteMemberModal.tsx
│   │   │   ├── QuotaStatusPanel.tsx
│   │   │   └── MemberUsagePanel.tsx
│   │   ├── monitor/            # 프로젝트 모니터링
│   │   │   ├── HealthOverview.tsx
│   │   │   ├── ProjectsPanel.tsx
│   │   │   ├── CheckCard.tsx
│   │   │   ├── ContextPanel.tsx
│   │   │   ├── OutputLog.tsx
│   │   │   ├── ResizablePanel.tsx
│   │   │   ├── AgentMonitorPanel.tsx
│   │   │   ├── MetricsChart.tsx
│   │   │   └── WorkflowCheckCard.tsx
│   │   ├── rag/                # RAG 검색
│   │   │   └── RAGQueryPanel.tsx
│   │   ├── permissions/         # 권한 관리
│   │   │   └── PermissionTogglePanel.tsx
│   │   ├── usage/              # 사용량/비용 모니터링
│   │   │   ├── ClaudeUsageDashboard.tsx
│   │   │   ├── UsageProgressBar.tsx
│   │   │   ├── ContextWindowMeter.tsx
│   │   │   ├── MemberUsageTable.tsx
│   │   │   ├── DailyCostTrend.tsx
│   │   │   └── LLMAccountsSettings.tsx
│   │   ├── admin/              # 관리자 설정
│   │   │   ├── MenuSettingsTab.tsx
│   │   │   ├── UserManagementTab.tsx
│   │   │   ├── SystemInfoTab.tsx
│   │   │   ├── api.ts
│   │   │   └── types.ts
│   │   └── analytics/          # Analytics
│   │       └── ProjectMultiSelect.tsx
│   ├── services/               # API 서비스 레이어
│   ├── stores/                 # Zustand 스토어 (27개 + index.ts)
│   │   ├── orchestration/      # 리팩토링: index.ts, types.ts, wsConnection.ts, wsHandler.ts
│   │   ├── orchestration.ts    # 재export
│   │   ├── projects.ts
│   │   ├── projectConfigs.ts
│   │   ├── agents.ts
│   │   ├── agentMonitor.ts
│   │   ├── taskStore.ts
│   │   ├── feedback.ts
│   │   ├── claudeSessions.ts
│   │   ├── claudeCodeActivity.ts
│   │   ├── claudeUsage.ts
│   │   ├── mcp.ts
│   │   ├── auth.ts
│   │   ├── diff.ts
│   │   ├── permissions.ts
│   │   ├── navigation.ts
│   │   ├── uiStore.ts
│   │   ├── monitoring.ts
│   │   ├── settings.ts
│   │   ├── git.ts
│   │   ├── organizations.ts
│   │   ├── audit.ts
│   │   ├── menuVisibility.ts
│   │   ├── projectAccess.ts
│   │   ├── externalUsage.ts
│   │   ├── llmCredentials.ts
│   │   ├── infraStatus.ts
│   │   └── workflows.ts
│   ├── config/                 # 설정 (API 엔드포인트 등)
│   │   └── api.ts
│   ├── hooks/                  # 커스텀 훅
│   │   ├── useErrorHandler.ts
│   │   └── useRealtimeMonitor.ts
│   ├── services/               # API 서비스 레이어
│   │   ├── apiClient.ts        # 중앙 HTTP 클라이언트 (인증 자동화)
│   │   ├── agentService.ts     # Agent API 호출
│   │   ├── analytics.ts        # PostHog 분석 통합
│   │   ├── errors.ts           # 에러 타입/핸들링
│   │   └── notificationService.ts # 알림 API
│   ├── lib/                    # 유틸리티
│   │   ├── utils.ts            # cn() 등 헬퍼 함수
│   │   ├── cookieStorage.ts    # 쿠키 기반 스토리지
│   │   └── fileAttachment.ts   # 파일 첨부 유틸리티
│   ├── utils/                  # 도메인 유틸리티
│   │   ├── diffParser.ts       # diff 파싱
│   │   ├── gitErrorMessages.ts # Git 에러 메시지 매핑
│   │   ├── gitGrouping.ts      # Git 파일 그룹화
│   │   ├── gitSafetyPatterns.ts # Git 안전 패턴 검증
│   │   └── gitUtils.ts         # Git 유틸리티
│   └── types/                  # TypeScript 타입
│       ├── branded.ts          # Branded types
│       ├── claudeCodeActivity.ts
│       ├── claudeSession.ts
│       ├── claudeUsage.ts
│       ├── monitoring.ts
│       └── workflow.ts
├── public/
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Custom Hooks

| Hook | 파일 | 설명 |
|------|------|------|
| `useErrorHandler` | `useErrorHandler.ts` | 에러 핸들링 유틸리티 훅 |
| `useRealtimeMonitor` | `useRealtimeMonitor.ts` | 실시간 모니터링 WebSocket 훅 |

---

## Routing

`routes.tsx`에서 `lazyWithBoundary`를 통한 Lazy Loading + ErrorBoundary 적용:
- 모든 protected 페이지는 `Suspense`로 감싸져 로딩 중 스켈레톤 표시
- `useNavigationStore` (Zustand)로 SPA 라우팅 (React Router 미사용)
- `AuthCallbackPage`만 App.tsx에서 eager 로딩 (OAuth 콜백 처리)
- 인증 게이트 + 역할 기반 접근 제어 적용

---

## Key Features

### 1. 실시간 WebSocket 통신

`useOrchestrationStore` 스토어에서 WebSocket 연결을 관리합니다.

```typescript
// 연결 상태 확인
const { isConnected } = useOrchestrationStore()

// 태스크 생성
const { submitTask } = useOrchestrationStore()
await submitTask({ title: 'My Task', description: '...' })

// 상태 업데이트 구독
useEffect(() => {
  // WebSocket 메시지가 자동으로 스토어 업데이트
}, [])
```

### 2. 인증 및 OAuth

`useAuthStore` 스토어에서 인증 상태를 관리합니다.

```typescript
const { user, isAuthenticated, login, logout } = useAuthStore()

// OAuth 로그인
await login('google')
await login('github')

// 이메일 로그인
await loginWithEmail(email, password)
```

### 3. 프로젝트 설정 관리

`useProjectConfigsStore` 스토어에서 Skills, Agents, MCP, Hooks를 관리합니다.

```typescript
const {
  skills, agents, mcpServers, hooks,
  createSkill, updateAgent, deleteMCPServer, createHook
} = useProjectConfigsStore()
```

### 4. Git 통합

`useGitStore` 스토어에서 Git 작업을 관리합니다.

```typescript
const {
  branches, commits, mergeRequests,
  createBranch, stageFiles, commitChanges, createMergeRequest
} = useGitStore()
```

### 5. 조직 관리

`useOrganizationsStore` 스토어에서 멀티테넌트 조직을 관리합니다.

```typescript
const {
  organizations, currentOrg, members,
  createOrganization, inviteMember, changeMemberRole
} = useOrganizationsStore()
```

### 6. 프로젝트 모니터링

`useMonitoringStore` 스토어에서 헬스 체크를 관리합니다.

```typescript
const {
  checkResults, isRunning,
  runCheck, stopCheck
} = useMonitoringStore()
```
