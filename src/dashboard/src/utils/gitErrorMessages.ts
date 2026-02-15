/**
 * Git 에러 메시지 분류 및 한국어 변환 유틸리티
 *
 * Backend의 raw 에러 문자열을 패턴 매칭하여
 * 사용자 친화적인 한국어 Alert 정보로 변환한다.
 */

export type GitErrorSeverity = 'error' | 'warning' | 'info'

export type GitErrorCategory =
  // Branch (8)
  | 'checkout-uncommitted'
  | 'checkout-notfound'
  | 'delete-current'
  | 'delete-protected'
  | 'delete-unmerged'
  | 'delete-remote'
  | 'create-exists'
  | 'create-invalid'
  // Remote (6)
  | 'fetch-error'
  | 'pull-conflict'
  | 'pull-uncommitted'
  | 'push-rejected'
  | 'push-permission'
  | 'push-noupstream'
  // Merge (3)
  | 'merge-conflicts'
  | 'merge-permission'
  | 'merge-notfound'
  // General (2)
  | 'network-error'
  | 'invalid-repo'
  // Fallback
  | 'unknown'

export interface GitErrorInfo {
  category: GitErrorCategory
  severity: GitErrorSeverity
  title: string
  description: string
  solution: string
  rawError: string
}

interface ErrorPattern {
  category: GitErrorCategory
  severity: GitErrorSeverity
  patterns: RegExp[]
  title: string
  description: string
  solution: string
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // ── Branch ──────────────────────────────────────
  {
    category: 'checkout-uncommitted',
    severity: 'error',
    patterns: [/overwritten by checkout/i, /commit your changes or stash/i],
    title: '체크아웃 실패: 저장되지 않은 변경사항',
    description: '현재 브랜치에 커밋되지 않은 변경사항이 있어 브랜치를 전환할 수 없습니다.',
    solution: '변경사항을 커밋하거나 stash한 후 다시 시도하세요.',
  },
  {
    category: 'checkout-notfound',
    severity: 'error',
    patterns: [/failed to checkout.*not found/i, /pathspec.*did not match/i],
    title: '브랜치를 찾을 수 없습니다',
    description: '요청한 브랜치가 로컬 또는 원격 저장소에 존재하지 않습니다.',
    solution: '브랜치 이름을 확인하고, 원격에서 fetch한 후 다시 시도하세요.',
  },
  {
    category: 'delete-current',
    severity: 'warning',
    patterns: [/cannot delete.*current branch/i, /cannot delete branch.*checked out/i],
    title: '현재 브랜치는 삭제할 수 없습니다',
    description: '현재 체크아웃된 브랜치는 삭제할 수 없습니다.',
    solution: '다른 브랜치로 전환한 후 삭제하세요.',
  },
  {
    category: 'delete-protected',
    severity: 'warning',
    patterns: [/cannot delete protected branch/i, /protected branch/i],
    title: '보호된 브랜치입니다',
    description: '이 브랜치는 보호 규칙에 의해 삭제가 제한되어 있습니다.',
    solution: '브랜치 보호 설정을 확인하거나 관리자에게 문의하세요.',
  },
  {
    category: 'delete-unmerged',
    severity: 'warning',
    patterns: [/not fully merged/i],
    title: '머지되지 않은 브랜치입니다',
    description: '이 브랜치에 아직 머지되지 않은 커밋이 있습니다.',
    solution: '먼저 머지를 완료하거나, 강제 삭제(-D)가 필요한 경우 관리자에게 문의하세요.',
  },
  {
    category: 'delete-remote',
    severity: 'error',
    patterns: [/failed to delete remote branch/i, /remote ref.*does not exist/i],
    title: '원격 브랜치 삭제 실패',
    description: '원격 저장소의 브랜치를 삭제하는 데 실패했습니다.',
    solution: '원격 저장소 연결 상태와 권한을 확인하세요.',
  },
  {
    category: 'create-exists',
    severity: 'warning',
    patterns: [/already exists/i],
    title: '이미 존재하는 브랜치입니다',
    description: '동일한 이름의 브랜치가 이미 존재합니다.',
    solution: '다른 브랜치 이름을 사용하세요.',
  },
  {
    category: 'create-invalid',
    severity: 'warning',
    patterns: [/not a valid branch name/i, /invalid reference/i, /invalid branch name/i],
    title: '유효하지 않은 브랜치 이름',
    description: '브랜치 이름에 허용되지 않는 문자가 포함되어 있습니다.',
    solution: '공백, 특수문자(~, ^, :, ?, *, [) 등을 제거하고 다시 시도하세요.',
  },

  // ── Remote ──────────────────────────────────────
  {
    category: 'fetch-error',
    severity: 'error',
    patterns: [
      /could not read from remote/i,
      /failed to fetch from remote/i,
      /repository not found/i,
    ],
    title: '원격 저장소 연결 실패',
    description: '원격 저장소에 연결할 수 없습니다.',
    solution: '네트워크 연결, 원격 URL, 인증 정보를 확인하세요.',
  },
  {
    category: 'pull-conflict',
    severity: 'error',
    patterns: [/CONFLICT/i, /automatic merge failed/i],
    title: '병합 충돌 발생',
    description: 'Pull 중 자동 병합에 실패하여 충돌이 발생했습니다.',
    solution: '충돌 파일을 수동으로 해결한 후 커밋하세요.',
  },
  {
    category: 'pull-uncommitted',
    severity: 'error',
    patterns: [/overwritten by merge/i],
    title: 'Pull 실패: 저장되지 않은 변경사항',
    description: '커밋되지 않은 변경사항이 있어 Pull을 수행할 수 없습니다.',
    solution: '변경사항을 커밋하거나 stash한 후 다시 Pull하세요.',
  },
  {
    category: 'push-rejected',
    severity: 'error',
    patterns: [/rejected/i, /fetch first/i, /non-fast-forward/i],
    title: '푸시 거부: 원격 저장소가 더 최신',
    description: '원격 저장소에 로컬에 없는 커밋이 있어 푸시가 거부되었습니다.',
    solution: '먼저 Pull을 수행하여 원격 변경사항을 받은 후 다시 푸시하세요.',
  },
  {
    category: 'push-permission',
    severity: 'error',
    patterns: [/permission denied/i, /403/],
    title: '푸시 권한 없음',
    description: '이 저장소에 푸시할 권한이 없습니다.',
    solution: '저장소 접근 권한과 인증 정보를 확인하세요.',
  },
  {
    category: 'push-noupstream',
    severity: 'warning',
    patterns: [/no upstream/i, /no tracking information/i],
    title: '원격 추적 브랜치 미설정',
    description: '현재 브랜치에 연결된 원격 추적 브랜치가 없습니다.',
    solution: 'Push 시 --set-upstream 옵션을 사용하세요.',
  },

  // ── Merge ───────────────────────────────────────
  {
    category: 'merge-conflicts',
    severity: 'error',
    patterns: [/has conflicts/i],
    title: '병합 충돌',
    description: '브랜치 간 충돌이 발생하여 자동 머지가 불가합니다.',
    solution: '충돌을 해결한 후 다시 머지를 시도하세요.',
  },
  {
    category: 'merge-permission',
    severity: 'error',
    patterns: [/insufficient permissions/i],
    title: '머지 권한 없음',
    description: '이 브랜치에 머지할 권한이 없습니다.',
    solution: '저장소 관리자에게 머지 권한을 요청하세요.',
  },
  {
    category: 'merge-notfound',
    severity: 'error',
    patterns: [/branch.*not found/i],
    title: '브랜치를 찾을 수 없습니다',
    description: '머지 대상 브랜치가 존재하지 않습니다.',
    solution: '브랜치 이름을 확인하고 다시 시도하세요.',
  },

  // ── General ─────────────────────────────────────
  {
    category: 'network-error',
    severity: 'error',
    patterns: [/networkerror/i, /failed to fetch/i, /err_connection/i],
    title: '네트워크 오류',
    description: '서버에 연결할 수 없습니다.',
    solution: '인터넷 연결을 확인하고 잠시 후 다시 시도하세요.',
  },
  {
    category: 'invalid-repo',
    severity: 'error',
    patterns: [/not a git repository/i],
    title: 'Git 저장소가 아닙니다',
    description: '현재 프로젝트 경로가 유효한 Git 저장소가 아닙니다.',
    solution: '프로젝트 설정에서 올바른 저장소 경로를 지정하세요.',
  },
]

/**
 * raw 에러 문자열을 패턴 매칭하여 구조화된 GitErrorInfo로 변환.
 * 매칭되지 않으면 unknown 카테고리로 fallback.
 */
export function classifyGitError(rawError: string): GitErrorInfo {
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.patterns.some((re) => re.test(rawError))) {
      return {
        category: pattern.category,
        severity: pattern.severity,
        title: pattern.title,
        description: pattern.description,
        solution: pattern.solution,
        rawError,
      }
    }
  }

  return {
    category: 'unknown',
    severity: 'error',
    title: '작업 실패',
    description: '요청한 Git 작업을 수행하는 중 오류가 발생했습니다.',
    solution: '에러 메시지를 확인하고 다시 시도하세요.',
    rawError,
  }
}
