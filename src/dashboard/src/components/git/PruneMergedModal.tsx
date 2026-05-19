import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import type {
  PruneCandidate,
  PruneExecuteResult,
  PruneSkipReason,
  PruneSkipped,
} from '../../stores/git'

interface PruneMergedModalProps {
  isOpen: boolean
  projectId: string
  onClose: () => void
  pruneMergedBranches: (
    projectId: string,
    dryRun: boolean,
    extraProtected?: string[],
  ) => Promise<PruneExecuteResult | null>
}

const SKIP_REASON_LABEL: Record<PruneSkipReason, string> = {
  default_branch: '기본 브랜치 보호',
  current_head: '현재 checked-out 브랜치',
  unpushed_commits: '푸시되지 않은 커밋 있음',
  no_matching_pr: '매칭되는 머지된 PR 없음',
  protected_rule: 'Branch Protection 룰 적용됨',
}

function PruneMergedModalImpl({
  isOpen,
  projectId,
  onClose,
  pruneMergedBranches,
}: PruneMergedModalProps) {
  const [phase, setPhase] = useState<'scanning' | 'review' | 'executing' | 'done'>('scanning')
  const [scanResult, setScanResult] = useState<PruneExecuteResult | null>(null)
  const [executeResult, setExecuteResult] = useState<PruneExecuteResult | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [scanError, setScanError] = useState<string | null>(null)

  const runScan = useCallback(async () => {
    setPhase('scanning')
    setScanError(null)
    const result = await pruneMergedBranches(projectId, true)
    if (result === null) {
      setScanError('스캔 실패 — GitHub 토큰을 확인하세요.')
      return
    }
    setScanResult(result)
    setExcluded(new Set())
    setPhase('review')
  }, [projectId, pruneMergedBranches])

  useEffect(() => {
    if (isOpen) {
      runScan()
    } else {
      setScanResult(null)
      setExecuteResult(null)
      setExcluded(new Set())
      setPhase('scanning')
      setScanError(null)
    }
  }, [isOpen, runScan])

  const selectedBranches = useMemo(
    () =>
      (scanResult?.candidates ?? []).filter((c) => !excluded.has(c.branch)).map((c) => c.branch),
    [scanResult, excluded],
  )

  const handleToggle = useCallback((branch: string) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(branch)) next.delete(branch)
      else next.add(branch)
      return next
    })
  }, [])

  const handleExecute = useCallback(async () => {
    if (selectedBranches.length === 0) return
    setPhase('executing')
    const result = await pruneMergedBranches(
      projectId,
      false,
      Array.from(excluded),
    )
    setExecuteResult(result)
    setPhase('done')
  }, [projectId, pruneMergedBranches, selectedBranches.length, excluded])

  const candidates = scanResult?.candidates ?? []
  const skipped = scanResult?.skipped ?? []
  const skippedGroups = useMemo(() => groupSkipped(scanResult?.skipped ?? []), [scanResult])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={phase === 'executing' ? undefined : onClose} />

      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              머지된 브랜치 정리
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={phase === 'executing'}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            aria-label="닫기"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {phase === 'scanning' && (
            <div className="flex items-center justify-center gap-3 py-12 text-gray-500 dark:text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>스캔 중... GitHub PR과 로컬 브랜치를 대조하고 있습니다.</span>
            </div>
          )}

          {scanError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
              {scanError}
            </div>
          )}

          {phase === 'review' && scanResult && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                GitHub PR이 머지된 로컬 브랜치 {candidates.length}개가 정리 후보입니다.
                체크박스로 개별 제외할 수 있습니다.
              </p>

              {candidates.length === 0 ? (
                <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  정리할 브랜치가 없습니다.
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
                  {candidates.map((c) => (
                    <CandidateRow
                      key={c.branch}
                      candidate={c}
                      checked={!excluded.has(c.branch)}
                      onToggle={() => handleToggle(c.branch)}
                    />
                  ))}
                </div>
              )}

              {skipped.length > 0 && (
                <details className="mt-4 group" aria-label={`제외된 브랜치 ${skipped.length}개`}>
                  <summary className="cursor-pointer text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                    제외된 브랜치 ({skipped.length})
                  </summary>
                  <div className="mt-2 space-y-2 text-sm">
                    {Object.entries(skippedGroups).map(([reason, items]) => (
                      <div key={reason}>
                        <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">
                          {SKIP_REASON_LABEL[reason as PruneSkipReason] ?? reason}
                          <span className="ml-2 text-xs text-gray-500">({items.length})</span>
                        </div>
                        <ul className="pl-4 space-y-0.5">
                          {items.map((s) => (
                            <li key={s.branch} className="font-mono text-xs text-gray-600 dark:text-gray-400">
                              {s.branch}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}

          {phase === 'executing' && (
            <div className="flex items-center justify-center gap-3 py-12 text-gray-500 dark:text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{selectedBranches.length}개 브랜치 삭제 중...</span>
            </div>
          )}

          {phase === 'done' && executeResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">
                  {executeResult.deleted.length}개 브랜치 삭제 완료
                </span>
              </div>

              {executeResult.deleted.length > 0 && (
                <ul className="rounded-lg bg-gray-50 dark:bg-gray-900 p-3 space-y-1">
                  {executeResult.deleted.map((b) => (
                    <li key={b} className="font-mono text-xs text-gray-600 dark:text-gray-400">
                      {b}
                    </li>
                  ))}
                </ul>
              )}

              {executeResult.errors.length > 0 && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 space-y-2">
                  <div className="text-sm font-medium text-red-700 dark:text-red-300">
                    {executeResult.errors.length}개 실패
                  </div>
                  <ul className="space-y-1 text-xs">
                    {executeResult.errors.map((e) => (
                      <li key={e.branch} className="text-red-600 dark:text-red-400">
                        <span className="font-mono">{e.branch}</span>: {e.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          {phase === 'done' ? (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              닫기
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={phase === 'executing'}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleExecute}
                disabled={phase !== 'review' || selectedBranches.length === 0}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {phase === 'executing' && <Loader2 className="w-4 h-4 animate-spin" />}
                {selectedBranches.length}개 브랜치 삭제
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

interface CandidateRowProps {
  candidate: PruneCandidate
  checked: boolean
  onToggle: () => void
}

const CandidateRow = memo(function CandidateRow({ candidate, checked, onToggle }: CandidateRowProps) {
  return (
    <label className="flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 rounded border-gray-300 dark:border-gray-600"
        aria-label={`${candidate.branch} 삭제 선택`}
      />
      <div className="flex-1 min-w-0">
        <div className="font-mono text-sm text-gray-900 dark:text-gray-100 truncate">
          {candidate.branch}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <a
            href={candidate.pr_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400"
          >
            PR #{candidate.pr_number}
            <ExternalLink className="w-3 h-3" />
          </a>
          <span className="truncate">{candidate.pr_title}</span>
        </div>
      </div>
    </label>
  )
})

function groupSkipped(skipped: PruneSkipped[]): Record<string, PruneSkipped[]> {
  return skipped.reduce<Record<string, PruneSkipped[]>>((acc, s) => {
    ;(acc[s.reason] ??= []).push(s)
    return acc
  }, {})
}

export const PruneMergedModal = memo(PruneMergedModalImpl)
PruneMergedModal.displayName = 'PruneMergedModal'
