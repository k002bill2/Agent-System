# Dashboard

AOS React 대시보드 문서입니다.

## Overview

**위치**: `src/dashboard/`
**스택**: React 18.3 + Vite 6.0 + Tailwind CSS 3.4 + Zustand 5.0 + TypeScript 5.6

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
import { useOrchestration } from '@/stores/orchestration'
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
| `TasksPage` | `/tasks` | 태스크 트리 뷰, 상세 정보 |
| `AgentsPage` | `/agents` | 에이전트 레지스트리 (글로벌+프로젝트 통합), MCP, RLHF |
| `ActivityPage` | `/activity` | 실시간 활동 로그 |
| `MonitorPage` | `/monitor` | 프로젝트 헬스 체크 모니터링 |
| `ClaudeSessionsPage` | `/claude-sessions` | Claude Code 세션 모니터링 |
| `GitPage` | `/git` | Git 브랜치/머지/PR 관리 |
| `AnalyticsPage` | `/analytics` | 사용 통계 및 분석 대시보드 |
| `AuditPage` | `/audit` | 감사 로그 뷰어 |
| `NotificationsPage` | `/notifications` | 알림 규칙/채널 설정 |
| `PlaygroundPage` | `/playground` | 에이전트 테스트 환경 |
| `OrganizationsPage` | `/organizations` | 조직 관리 (멤버, 역할, 통계) |
| `WorkflowsPage` | `/workflows` | 워크플로우 자동화 (CI/CD 파이프라인 관리) |
| `AdminPage` | `/admin` | 관리자 페이지 (사용자 관리, 메뉴 설정, 시스템 정보) |
| `SettingsPage` | `/settings` | 시스템 설정 |
| `LoginPage` | `/login` | OAuth/Email 로그인 |
| `RegisterPage` | `/register` | 이메일/비밀번호 회원가입 |
| `AuthCallbackPage` | `/auth/callback` | OAuth 콜백 처리 |
| `InvitationAcceptPage` | `/invitations/accept` | 조직 초대 수락 페이지 |

---

## Components

### Core Components

| 컴포넌트 | 설명 |
|----------|------|
| `Sidebar` | 메인 네비게이션 사이드바 |
| `TaskPanel` | 태스크 카드 (상태, 진행률, 액션) |
| `ChatInput` | 메시지 입력 인터페이스 |
| `ApprovalModal` | HITL 승인/거부 모달 |
| `DiffViewer` | 파일 변경 비교 뷰 (Split/Unified) |
| `AgentCard` | 글로벌 레지스트리 에이전트 카드 (능력, 상태, 통계) |
| `ProjectAgentCard` | 프로젝트별 에이전트 카드 |
| `AgentStatsPanel` | 레지스트리 통계 패널 |
| `TaskAnalyzer` | 태스크 분석 UI |
| `DataSourceToggle` | 데이터 소스 선택 토글 |

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

| 컴포넌트 | 설명 |
|----------|------|
| `ProjectConfigStats` | 프로젝트 통계 |
| `ProjectList` | 프로젝트 목록 |
| `OverviewTab` | 설정 개요 탭 |
| `SkillsTab` | 스킬 목록 탭 |
| `SkillEditModal` | 스킬 편집 모달 |
| `AgentsTab` | 에이전트 목록 탭 |
| `AgentEditModal` | 에이전트 편집 모달 |
| `MCPTab` | MCP 서버 목록 탭 |
| `MCPServerModal` | MCP 서버 편집 모달 |
| `HooksTab` | Hook 목록 탭 |
| `HookEditModal` | Hook 편집 모달 |

### Workflow Components

| 컴포넌트 | 설명 |
|----------|------|
| `WorkflowList` | 워크플로우 목록 (상태, 최근 실행) |
| `WorkflowDetail` | 워크플로우 상세 (DAG + 실행 이력) |
| `WorkflowDAG` | Job 의존성 DAG 시각화 |
| `WorkflowRunsTable` | 실행 이력 테이블 |
| `WorkflowRunLogs` | 실시간 로그 뷰어 (SSE) |
| `WorkflowCreateModal` | 워크플로우 생성 모달 (YAML 에디터) |
| `CopyToProjectModal` | 프로젝트 간 복사 모달 |
| `YamlEditor` | YAML 편집기 (js-yaml 검증, 라인번호, Preview) |
| `EnhancedRunLogs` | 향상된 로그 뷰어 (레벨 필터, 검색, job 접기) |
| `InteractiveDAG` | 확장 가능한 DAG 시각화 (step 펼침, 상태 아이콘) |
| `TriggerConfigPanel` | 트리거 설정 패널 (Manual/Schedule/Webhook/Push/PR) |
| `CronBuilder` | Cron 표현식 빌더 (프리셋, 사람 읽기 가능 미리보기) |
| `TemplateGallery` | 템플릿 갤러리 모달 (카테고리 필터, YAML 미리보기) |
| `ArtifactBrowser` | 아티팩트 브라우저 (파일 목록, 다운로드, 삭제) |
| `SecretsManager` | 시크릿 관리 모달 (CRUD, 마스킹, scope 선택) |
| `ExecutionTimeline` | 실행 타임라인 (Gantt 차트 스타일) |

### Feedback Components

| 컴포넌트 | 설명 |
|----------|------|
| `FeedbackButton` | 👍/👎 피드백 버튼 |
| `FeedbackModal` | 부정 피드백 사유 선택 |
| `FeedbackHistoryPanel` | 피드백 히스토리 목록 |
| `DatasetPanel` | 데이터셋 통계 및 내보내기 |

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
| `BranchList` | 브랜치 목록 (local/remote 필터, ahead/behind, 원격 브랜치 삭제) |
| `CommitHistory` | 커밋 타임라인 (확장 가능한 상세) |
| `MergeRequestCard` | 내부 MR 카드 (승인/머지/닫기) |
| `MergePreviewPanel` | 머지 미리보기 모달 (충돌 정보) |
| `PullRequestList` | GitHub PR 목록 + 리뷰 패널 |

### Organization Components

| 컴포넌트 | 설명 |
|----------|------|
| `OrganizationCard` | 조직 카드 (이름, 플랜, 멤버 수) |
| `OrganizationFormModal` | 조직 생성/수정 모달 |
| `OrganizationStats` | 조직 통계 패널 |
| `QuotaStatusPanel` | Quota 사용량 패널 (멤버/프로젝트/세션/토큰 progress bar) |
| `MemberUsagePanel` | 멤버별 사용량 분석 패널 (토큰/세션 per-member, 기간 선택) |
| `MemberList` | 멤버 목록 컨테이너 |
| `MemberCard` | 멤버 카드 (역할 변경, 제거) |
| `InviteMemberModal` | 멤버 초대 모달 |

### Project Access Components

| 컴포넌트 | 설명 |
|----------|------|
| `ProjectMembersPanel` | 프로젝트 멤버 관리 (목록, 추가, 역할 변경, 제거) |

### Monitor Components

| 컴포넌트 | 설명 |
|----------|------|
| `HealthOverview` | 헬스 상태 개요 |
| `ProjectsPanel` | 프로젝트 체크 패널 |
| `CheckCard` | 체크 결과 카드 |
| `ContextPanel` | 컨텍스트 정보 패널 |
| `OutputLog` | 실시간 출력 로그 |
| `ResizablePanel` | 리사이즈 가능 패널 |

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
| `AuditLogTable` | 감사 로그 테이블 |
| `AuditFilters` | 감사 로그 필터 |
| `AuditExport` | 감사 로그 내보내기 |

### Notification Components

| 컴포넌트 | 설명 |
|----------|------|
| `NotificationRuleEditor` | 알림 규칙 에디터 |
| `NotificationHistory` | 알림 히스토리 |
| `ChannelSettings` | 채널 설정 |

### LLM Router Components

| 컴포넌트 | 설명 |
|----------|------|
| `LLMRouterSettings` | LLM 라우터 설정 |
| `ProviderCard` | 프로바이더 카드 |
| `RoutingStats` | 라우팅 통계 |

### Version Control Components

| 컴포넌트 | 설명 |
|----------|------|
| `VersionHistory` | 버전 타임라인 |
| `VersionCompare` | 버전 비교 (diff) |
| `RollbackModal` | 롤백 모달 |

### Usage & Cost Components

| 컴포넌트 | 설명 |
|----------|------|
| `ContextWindowMeter` | Context 창 사용량 게이지 |
| `CostMonitor` | 비용 모니터링 패널 |
| `UsageProgressBar` | 사용량 진행바 |
| `ClaudeUsageDashboard` | Claude 사용량 대시보드 |

### Admin Components

| 컴포넌트 | 설명 |
|----------|------|
| `MenuSettingsTab` | 메뉴 가시성/순서 설정 (드래그 앤 드롭) |
| `UserManagementTab` | 사용자 관리 (역할 변경, 활성화) |
| `SystemInfoTab` | 시스템 정보 조회 |

### Permission Components

| 컴포넌트 | 설명 |
|----------|------|
| `PermissionTogglePanel` | 권한 토글 패널 |

### Process Monitor Components

| 컴포넌트 | 설명 |
|----------|------|
| `ProcessMonitorWidget` | 프로세스 모니터 위젯 |

---

## Zustand Stores

| Store | 파일 | 설명 |
|-------|------|------|
| `useOrchestration` | `orchestration.ts` | 세션/태스크 관리, WebSocket 연결 |
| `useProjects` | `projects.ts` | 프로젝트 목록 및 상태 |
| `useProjectConfigs` | `projectConfigs.ts` | 프로젝트 설정 (Skills, Agents, MCP, Hooks) |
| `useAgents` | `agents.ts` | 에이전트 레지스트리 |
| `useTasks` | `tasks.ts` | 태스크 관리 |
| `useFeedback` | `feedback.ts` | RLHF 피드백 |
| `useClaudeSessions` | `claudeSessions.ts` | Claude 세션 모니터링 |
| `useClaudeCodeActivity` | `claudeCodeActivity.ts` | Claude Code 실시간 활동 |
| `useClaudeUsage` | `claudeUsage.ts` | Context Window 사용량 |
| `useMCP` | `mcp.ts` | MCP 서버 관리 |
| `useAuth` | `auth.ts` | 인증 상태 |
| `useDiff` | `diff.ts` | 파일 변경 비교 |
| `usePermissions` | `permissions.ts` | 세션 권한 상태 |
| `useNavigation` | `navigation.ts` | 네비게이션 상태 |
| `useMonitoring` | `monitoring.ts` | 프로젝트 모니터링 |
| `useSettings` | `settings.ts` | 설정 상태 |
| `useGit` | `git.ts` | Git 브랜치/머지 관리 |
| `useOrganizations` | `organizations.ts` | 조직/멤버 관리 |
| `useAudit` | `audit.ts` | 감사 로그 |
| `useMenuVisibilityStore` | `menuVisibility.ts` | 메뉴 가시성 및 순서 (visibility, menuOrder) |
| `useProjectAccess` | `projectAccess.ts` | 프로젝트별 멤버/역할 관리 |
| `useWorkflowStore` | `workflows.ts` | 워크플로우 CRUD, 실행, 시크릿, 스케줄, 웹훅, 아티팩트, 템플릿 |

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
│   ├── pages/                  # 페이지 컴포넌트 (19개)
│   │   ├── DashboardPage.tsx
│   │   ├── ProjectsPage.tsx
│   │   ├── ProjectConfigsPage.tsx
│   │   ├── TasksPage.tsx
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
│   │   ├── SettingsPage.tsx
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── AuthCallbackPage.tsx
│   │   └── InvitationAcceptPage.tsx
│   ├── components/
│   │   ├── ui/                 # 공통 UI 컴포넌트
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
│   │   │   └── CopyToProjectModal.tsx
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
│   │   │   └── PullRequestList.tsx
│   │   ├── projects/            # 프로젝트 접근제어
│   │   │   └── ProjectMembersPanel.tsx
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
│   │   │   └── ResizablePanel.tsx
│   │   ├── rag/                # RAG 검색
│   │   │   └── RAGQueryPanel.tsx
│   │   ├── admin/              # 관리자 설정
│   │   │   ├── MenuSettingsTab.tsx
│   │   │   ├── UserManagementTab.tsx
│   │   │   ├── SystemInfoTab.tsx
│   │   │   ├── api.ts
│   │   │   └── types.ts
│   │   └── analytics/          # Analytics
│   │       └── ProjectMultiSelect.tsx
│   ├── stores/                 # Zustand 스토어 (22개)
│   │   ├── orchestration.ts
│   │   ├── projects.ts
│   │   ├── projectConfigs.ts
│   │   ├── agents.ts
│   │   ├── tasks.ts
│   │   ├── feedback.ts
│   │   ├── claudeSessions.ts
│   │   ├── claudeCodeActivity.ts
│   │   ├── claudeUsage.ts
│   │   ├── mcp.ts
│   │   ├── auth.ts
│   │   ├── diff.ts
│   │   ├── permissions.ts
│   │   ├── navigation.ts
│   │   ├── monitoring.ts
│   │   ├── settings.ts
│   │   ├── git.ts
│   │   ├── organizations.ts
│   │   ├── audit.ts
│   │   ├── menuVisibility.ts
│   │   └── projectAccess.ts
│   ├── hooks/                  # 커스텀 훅
│   ├── lib/                    # 유틸리티
│   │   ├── utils.ts            # cn() 등 헬퍼 함수
│   │   └── api.ts              # API 클라이언트
│   └── types/                  # TypeScript 타입
├── public/
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## Key Features

### 1. 실시간 WebSocket 통신

`useOrchestration` 스토어에서 WebSocket 연결을 관리합니다.

```typescript
// 연결 상태 확인
const { isConnected } = useOrchestration()

// 태스크 생성
const { submitTask } = useOrchestration()
await submitTask({ title: 'My Task', description: '...' })

// 상태 업데이트 구독
useEffect(() => {
  // WebSocket 메시지가 자동으로 스토어 업데이트
}, [])
```

### 2. 인증 및 OAuth

`useAuth` 스토어에서 인증 상태를 관리합니다.

```typescript
const { user, isAuthenticated, login, logout } = useAuth()

// OAuth 로그인
await login('google')
await login('github')

// 이메일 로그인
await loginWithEmail(email, password)
```

### 3. 프로젝트 설정 관리

`useProjectConfigs` 스토어에서 Skills, Agents, MCP, Hooks를 관리합니다.

```typescript
const {
  skills, agents, mcpServers, hooks,
  createSkill, updateAgent, deleteMCPServer, createHook
} = useProjectConfigs()
```

### 4. Git 통합

`useGit` 스토어에서 Git 작업을 관리합니다.

```typescript
const {
  branches, commits, mergeRequests,
  createBranch, stageFiles, commit, createMergeRequest
} = useGit()
```

### 5. 조직 관리

`useOrganizations` 스토어에서 멀티테넌트 조직을 관리합니다.

```typescript
const {
  organizations, currentOrg, members,
  createOrganization, inviteMember, changeMemberRole
} = useOrganizations()
```

### 6. 프로젝트 모니터링

`useMonitoring` 스토어에서 헬스 체크를 관리합니다.

```typescript
const {
  checkResults, isRunning,
  runCheck, stopCheck
} = useMonitoring()
```
