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
| `ProjectsPage` | `/projects` | 프로젝트 목록 및 관리 |
| `ProjectConfigsPage` | `/project-configs` | 프로젝트 설정 관리 |
| `TasksPage` | `/tasks` | 태스크 트리 뷰, 상세 정보 |
| `AgentsPage` | `/agents` | 에이전트 레지스트리, MCP, RLHF |
| `ActivityPage` | `/activity` | 실시간 활동 로그 |
| `MonitorPage` | `/monitor` | 시스템 모니터링 |
| `ClaudeSessionsPage` | `/claude-sessions` | Claude Code 세션 모니터링 |
| `LoginPage` | `/login` | OAuth/Email 로그인 |
| `RegisterPage` | `/register` | 이메일/비밀번호 회원가입 |
| `AuthCallbackPage` | `/auth/callback` | OAuth 콜백 처리 |
| `AuditPage` | `/audit` | 감사 로그 뷰어 |
| `NotificationsPage` | `/notifications` | 알림 규칙/채널 설정 |
| `AnalyticsPage` | `/analytics` | 분석 대시보드 |
| `PlaygroundPage` | `/playground` | 에이전트 테스트 환경 |
| `GitPage` | `/git` | Git 브랜치/머지 관리 |
| `OrganizationsPage` | `/organizations` | 조직 관리 (멤버, 역할, 통계) |
| `SettingsPage` | `/settings` | 시스템 설정 |

---

## Components

### Core Components

| 컴포넌트 | 설명 |
|----------|------|
| `TaskPanel` | 태스크 카드 (상태, 진행률, 액션) |
| `DiffViewer` | 파일 변경 비교 뷰 (Split/Unified) |
| `AgentCard` | 에이전트 카드 (능력, 상태, 통계) |
| `AgentStatsPanel` | 레지스트리 통계 패널 |
| `TaskAnalyzer` | 태스크 분석 UI |

### Claude Code Components

| 컴포넌트 | 설명 |
|----------|------|
| `ClaudeCodeActivity` | 실시간 활동 피드 |
| `ClaudeCodeTasks` | 태스크 목록 뷰 |
| `ClaudeCodeSessionSelector` | 세션 선택 드롭다운 |

### Claude Sessions Components

| 컴포넌트 | 설명 |
|----------|------|
| `SessionList` | 세션 목록 (정렬, 자동 새로고침) |
| `SessionCard` | 세션 카드 (상태, 토큰, 비용) |
| `SessionDetails` | 상세 정보 + Recent Activity |
| `TranscriptViewer` | Raw 트랜스크립트 (JSON Tree) |

### Project Config Components

| 컴포넌트 | 설명 |
|----------|------|
| `ProjectConfigStats` | 프로젝트 통계 |
| `ProjectList` | 프로젝트 목록 |
| `SkillEditModal` | 스킬 편집 모달 |
| `AgentEditModal` | 에이전트 편집 모달 |
| `CommandEditModal` | 명령어 편집 모달 |

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
| `MCPToolCaller` | MCP 도구 호출 UI |

### Git Components

| 컴포넌트 | 설명 |
|----------|------|
| `BranchList` | 브랜치 목록 (local/remote 필터, ahead/behind) |
| `MergeRequestCard` | 내부 MR 카드 (승인/머지/닫기) |
| `MergePreviewPanel` | 머지 미리보기 모달 (충돌 정보) |
| `PullRequestList` | GitHub PR 목록 + 리뷰 패널 |
| `CommitHistory` | 커밋 타임라인 (확장 가능한 상세) |

### Organization Components

| 컴포넌트 | 설명 |
|----------|------|
| `OrganizationCard` | 조직 카드 (이름, 플랜, 멤버 수) |
| `OrganizationFormModal` | 조직 생성/수정 모달 |
| `MemberList` | 멤버 목록 컨테이너 |
| `MemberCard` | 멤버 카드 (역할 변경, 제거) |
| `InviteMemberModal` | 멤버 초대 모달 |
| `OrganizationStats` | 조직 통계 패널 |

### RAG Components

| 컴포넌트 | 설명 |
|----------|------|
| `RAGQueryPanel` | RAG 의미론적 검색 패널 (쿼리, 결과, 통계, 인덱스 관리) |

### Other Components

| 컴포넌트 | 설명 |
|----------|------|
| `ContextWindowMeter` | Context 창 사용량 게이지 |
| `PermissionTogglePanel` | 권한 토글 패널 |
| `AuditLogTable` | 감사 로그 테이블 |
| `NotificationRuleEditor` | 알림 규칙 에디터 |
| `LLMRouterSettings` | LLM 라우터 설정 |
| `VersionHistory` | 버전 타임라인 |

---

## Zustand Stores

| Store | 파일 | 설명 |
|-------|------|------|
| `useOrchestration` | `orchestration.ts` | 세션/태스크 관리 |
| `useAgents` | `agents.ts` | 에이전트 레지스트리 |
| `useFeedback` | `feedback.ts` | RLHF 피드백 |
| `useClaudeSessions` | `claudeSessions.ts` | Claude 세션 모니터링 |
| `useClaudeCodeActivity` | `claudeCodeActivity.ts` | Claude Code 실시간 활동 |
| `useClaudeUsage` | `claudeUsage.ts` | Context Window 사용량 |
| `useMCP` | `mcp.ts` | MCP 서버 관리 |
| `useAuth` | `auth.ts` | 인증 상태 |
| `useDiff` | `diff.ts` | 파일 변경 비교 |
| `usePermissions` | `permissions.ts` | 세션 권한 상태 |
| `useProjects` | `projects.ts` | 프로젝트 상태 |
| `useProjectConfigs` | `projectConfigs.ts` | 프로젝트 설정 상태 |
| `useNavigation` | `navigation.ts` | 네비게이션 상태 |
| `useMonitoring` | `monitoring.ts` | 시스템 모니터링 |
| `useSettings` | `settings.ts` | 설정 상태 |
| `useGit` | `git.ts` | Git 브랜치/머지 관리 |
| `useOrganizations` | `organizations.ts` | 조직/멤버 관리 |

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
│   ├── pages/              # 페이지 컴포넌트
│   ├── components/
│   │   ├── ui/             # 공통 UI 컴포넌트
│   │   ├── feedback/       # RLHF 피드백
│   │   ├── claude-sessions/# Claude Sessions
│   │   ├── project-configs/# 프로젝트 설정
│   │   ├── mcp/            # MCP 관리
│   │   ├── audit/          # 감사 로그
│   │   ├── notifications/  # 알림 설정
│   │   ├── llm-router/     # LLM 라우터
│   │   ├── version-control/# 버전 관리
│   │   ├── git/            # Git 관리
│   │   ├── organizations/  # 조직 관리
│   │   └── rag/            # RAG 검색
│   ├── stores/             # Zustand 스토어
│   ├── hooks/              # 커스텀 훅
│   ├── lib/                # 유틸리티
│   └── types/              # TypeScript 타입
├── public/
├── index.html
├── vite.config.ts
├── tailwind.config.js
└── package.json
```
