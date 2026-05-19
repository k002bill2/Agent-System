import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { PruneMergedModal } from '../PruneMergedModal'
import type { PruneExecuteResult } from '@/stores/git'

function makeCandidate(branch: string, prNumber: number): PruneExecuteResult['candidates'][number] {
  return {
    branch,
    pr_number: prNumber,
    pr_url: `https://github.com/o/r/pull/${prNumber}`,
    pr_title: `PR #${prNumber}`,
    merged_at: '2026-04-12T10:30:00Z',
    last_commit_sha: 'abc123',
  }
}

function makeScanResult(
  overrides: Partial<PruneExecuteResult> = {},
): PruneExecuteResult {
  return {
    candidates: [],
    skipped: [],
    deleted: [],
    errors: [],
    ...overrides,
  }
}

describe('PruneMergedModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not render when isOpen is false', () => {
    const prune = vi.fn()
    render(
      <PruneMergedModal
        isOpen={false}
        projectId="proj-1"
        onClose={vi.fn()}
        pruneMergedBranches={prune}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(prune).not.toHaveBeenCalled()
  })

  it('triggers dry-run scan on open and shows candidates', async () => {
    const prune = vi.fn().mockResolvedValue(
      makeScanResult({
        candidates: [makeCandidate('feat/a', 1), makeCandidate('feat/b', 2)],
      }),
    )
    render(
      <PruneMergedModal
        isOpen={true}
        projectId="proj-1"
        onClose={vi.fn()}
        pruneMergedBranches={prune}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('feat/a')).toBeInTheDocument()
      expect(screen.getByText('feat/b')).toBeInTheDocument()
    })

    expect(prune).toHaveBeenCalledWith('proj-1', true)
  })

  it('groups skipped branches by reason', async () => {
    const prune = vi.fn().mockResolvedValue(
      makeScanResult({
        candidates: [makeCandidate('feat/a', 1)],
        skipped: [
          { branch: 'main', reason: 'default_branch' },
          { branch: 'master', reason: 'default_branch' },
          { branch: 'wip/x', reason: 'no_matching_pr' },
        ],
      }),
    )
    render(
      <PruneMergedModal
        isOpen={true}
        projectId="proj-1"
        onClose={vi.fn()}
        pruneMergedBranches={prune}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/제외된 브랜치 \(3\)/)).toBeInTheDocument()
    })
  })

  it('uncheck excludes branch from deletion call', async () => {
    const prune = vi
      .fn()
      .mockResolvedValueOnce(
        makeScanResult({
          candidates: [makeCandidate('feat/a', 1), makeCandidate('feat/b', 2)],
        }),
      )
      .mockResolvedValueOnce(
        makeScanResult({ deleted: ['feat/a'] }),
      )

    render(
      <PruneMergedModal
        isOpen={true}
        projectId="proj-1"
        onClose={vi.fn()}
        pruneMergedBranches={prune}
      />,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('feat/b 삭제 선택')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('feat/b 삭제 선택'))

    const deleteBtn = await screen.findByRole('button', { name: /1개 브랜치 삭제/ })
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(prune).toHaveBeenLastCalledWith('proj-1', false, ['feat/b'])
    })
  })

  it('delete button disabled when no candidates', async () => {
    const prune = vi.fn().mockResolvedValue(makeScanResult())
    render(
      <PruneMergedModal
        isOpen={true}
        projectId="proj-1"
        onClose={vi.fn()}
        pruneMergedBranches={prune}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/정리할 브랜치가 없습니다/)).toBeInTheDocument()
    })

    const deleteBtn = screen.getByRole('button', { name: /0개 브랜치 삭제/ })
    expect(deleteBtn).toBeDisabled()
  })

  it('shows error when scan fails (token missing)', async () => {
    const prune = vi.fn().mockResolvedValue(null)
    render(
      <PruneMergedModal
        isOpen={true}
        projectId="proj-1"
        onClose={vi.fn()}
        pruneMergedBranches={prune}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/GitHub 토큰을 확인하세요/)).toBeInTheDocument()
    })
  })

  it('shows deleted result and errors after execute', async () => {
    const prune = vi
      .fn()
      .mockResolvedValueOnce(
        makeScanResult({
          candidates: [makeCandidate('feat/a', 1), makeCandidate('feat/b', 2)],
        }),
      )
      .mockResolvedValueOnce(
        makeScanResult({
          deleted: ['feat/a'],
          errors: [{ branch: 'feat/b', error: 'worktree present' }],
        }),
      )

    render(
      <PruneMergedModal
        isOpen={true}
        projectId="proj-1"
        onClose={vi.fn()}
        pruneMergedBranches={prune}
      />,
    )

    await waitFor(() => screen.getByLabelText('feat/a 삭제 선택'))
    fireEvent.click(screen.getByRole('button', { name: /2개 브랜치 삭제/ }))

    await waitFor(() => {
      expect(screen.getByText(/1개 브랜치 삭제 완료/)).toBeInTheDocument()
      expect(screen.getByText(/1개 실패/)).toBeInTheDocument()
      expect(screen.getByText(/worktree present/)).toBeInTheDocument()
    })
  })
})
