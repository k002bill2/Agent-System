/**
 * WorkingDirectory 의 props 와 내부 뷰 모드 타입.
 *
 * index.ts 는 재노출하지 않는다 — 소비자는 메인 컴포넌트 하나뿐이다(실측).
 */

import { GitWorkingStatus, DraftCommit, DiffHunk } from '@/stores/git'

export type ViewMode = 'list' | 'grouped'

export interface WorkingDirectoryProps {
  workingStatus: GitWorkingStatus | null
  isLoading: boolean
  onRefresh: () => void
  onStageFiles: (paths: string[]) => Promise<boolean>
  onStageAll: () => Promise<boolean>
  onUnstageFiles: (paths: string[]) => Promise<boolean>
  onUnstageAll: () => Promise<boolean>
  onCommit: (message: string) => Promise<boolean>
  onCommitAndPush?: (message: string) => Promise<boolean>
  // Diff
  onFetchFileDiff: (filePath: string, staged: boolean) => Promise<string>
  fileDiffs: Record<string, string>
  isLoadingDiff: boolean
  // Staged diff review
  onFetchStagedDiff: () => Promise<string | null>
  stagedDiff: string | null
  // Hunk staging
  onFetchFileHunks: (filePath: string, staged: boolean) => Promise<DiffHunk[]>
  onStageHunks: (filePath: string, hunkIndices: number[]) => Promise<boolean>
  fileHunks: Record<string, DiffHunk[]>
  // LLM Draft Commits
  draftCommits: DraftCommit[]
  isGeneratingDrafts: boolean
  onGenerateDrafts: () => Promise<DraftCommit[]>
  onClearDrafts: () => void
}
