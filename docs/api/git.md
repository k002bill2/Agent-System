# API Reference - Git

Git 상태, 브랜치, 커밋, 머지, MR, 브랜치 보호, GitHub 통합 API입니다.

## Base URL
- Development: `http://localhost:8000`

---

## Git 상태 & 경로

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/projects/{id}/status` | Git 상태 조회 (현재 브랜치, 변경 파일 등) |
| PUT | `/api/git/projects/{id}/git-path` | Git 경로 업데이트 |
| GET | `/api/git/projects/{id}/worktrees` | Worktree 목록 조회 |

---

## Working Directory

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/projects/{id}/working-status` | 작업 디렉토리 상태 (staged/unstaged/untracked) |
| POST | `/api/git/projects/{id}/add` | 파일 스테이징 (git add) |
| POST | `/api/git/projects/{id}/commit` | 커밋 생성 (git commit) |
| POST | `/api/git/projects/{id}/unstage` | 파일 언스테이징 |
| POST | `/api/git/projects/{id}/draft-commits` | LLM 기반 커밋 초안 생성 |

---

## Staging Area (Hunk 단위)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/projects/{id}/file-diff` | 파일 diff 조회 |
| GET | `/api/git/projects/{id}/staged-diff` | 스테이지된 변경사항 diff |
| GET | `/api/git/projects/{id}/file-hunks` | 파일 hunk 목록 조회 |
| POST | `/api/git/projects/{id}/stage-hunks` | Hunk 단위 스테이징 |

**Add 요청 본문**:
```json
{
  "paths": ["file1.txt", "src/"],
  "all": false
}
```

**Commit 요청 본문**:
```json
{
  "message": "feat: Add new feature",
  "author_name": "John Doe",
  "author_email": "john@example.com"
}
```

**Draft Commits 요청 본문**:
```json
{
  "staged_only": false
}
```

**Draft Commits 응답**:
```json
{
  "drafts": [
    {
      "message": "feat(auth): add OAuth login support",
      "files": ["src/auth/oauth.py", "src/auth/config.py"],
      "type": "feat",
      "scope": "auth"
    }
  ],
  "total_files": 5,
  "token_usage": 1234
}
```

---

## Branches & Commits

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/projects/{id}/branches` | 브랜치 목록 조회 |
| POST | `/api/git/projects/{id}/branches` | 브랜치 생성 |
| DELETE | `/api/git/projects/{id}/branches/{name}` | 브랜치 삭제 |
| POST | `/api/git/projects/{id}/branches/{name}/checkout` | 브랜치 체크아웃 |
| GET | `/api/git/projects/{id}/branches/{name}/diff` | 브랜치 diff (base 대비) |
| GET | `/api/git/projects/{id}/commits` | 커밋 히스토리 |
| GET | `/api/git/projects/{id}/commits/{sha}` | 커밋 상세 조회 |
| GET | `/api/git/projects/{id}/commits/{sha}/files` | 커밋 파일 목록 |
| GET | `/api/git/projects/{id}/commits/{sha}/diff` | 커밋 diff |

**브랜치 삭제 쿼리 파라미터** (`DELETE /api/git/projects/{id}/branches/{name}`):
- `force`: 머지되지 않은 브랜치 강제 삭제 (기본: `false`)
- `delete_remote`: 원격 추적 브랜치도 삭제 (기본: `false`)
- `remove_worktree`: 연관 worktree 제거 후 삭제 (기본: `false`)

**삭제 시 동작**: 삭제된 브랜치가 source_branch인 열린 MR을 자동으로 닫음

**응답**:
```json
{
  "success": true,
  "message": "Branch 'feature/old' deleted (2 open MR(s) auto-closed)"
}
```

---

## Remote Operations

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/git/projects/{id}/fetch` | 리모트 fetch |
| POST | `/api/git/projects/{id}/pull` | 리모트 pull |
| POST | `/api/git/projects/{id}/push` | 리모트 push |

---

## Merge

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/git/projects/{id}/merge/preview` | 머지 미리보기 (충돌 체크) |
| POST | `/api/git/projects/{id}/merge` | 머지 실행 |
| GET | `/api/git/projects/{id}/merge/conflicts` | 충돌 파일 상세 조회 |
| GET | `/api/git/projects/{id}/merge/three-way-diff` | 3-way diff 조회 |
| GET | `/api/git/projects/{id}/merge/status` | 진행 중인 머지 상태 |
| POST | `/api/git/projects/{id}/merge/resolve` | 단일 파일 충돌 해결 |
| POST | `/api/git/projects/{id}/merge/abort` | 진행 중 머지 취소 |
| POST | `/api/git/projects/{id}/merge/complete` | 모든 충돌 해결 후 머지 완료 |

**충돌 해결 요청 본문** (`POST /merge/resolve`):
```json
{
  "file_path": "src/example.py",
  "strategy": "ours",
  "resolved_content": null,
  "source_branch": "feature/new-feature",
  "target_branch": "main"
}
```

**해결 전략**:
- `ours`: Target 브랜치(머지 대상) 버전 유지
- `theirs`: Source 브랜치(머지 소스) 버전 유지
- `custom`: 사용자가 직접 `resolved_content`에 해결된 내용 제공

**충돌 해결 응답**:
```json
{
  "success": true,
  "file_path": "src/example.py",
  "message": "Conflict resolved using 'ours' strategy",
  "resolved_content": "..."
}
```

---

## Merge Requests (내부 MR)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/projects/{id}/merge-requests` | MR 목록 |
| POST | `/api/git/projects/{id}/merge-requests` | MR 생성 |
| GET | `/api/git/projects/{id}/merge-requests/{mr_id}` | MR 상세 |
| PUT | `/api/git/projects/{id}/merge-requests/{mr_id}` | MR 수정 |
| POST | `/api/git/projects/{id}/merge-requests/{mr_id}/approve` | MR 승인 |
| POST | `/api/git/projects/{id}/merge-requests/{mr_id}/merge` | MR 머지 |
| POST | `/api/git/projects/{id}/merge-requests/{mr_id}/close` | MR 닫기 |
| POST | `/api/git/projects/{id}/merge-requests/{mr_id}/refresh-conflicts` | 충돌 상태 갱신 |

**MR 상태**: `open`, `merged`, `closed`, `draft`

**충돌 상태**: `unknown`, `no_conflicts`, `has_conflicts`

**MR 생성 시 `auto_merge: true`**: 승인 조건 충족 시 자동 머지 실행

**Auto-Deploy**: 브랜치 보호 규칙에 `auto_deploy` 설정 시 머지 후 GitHub Actions workflow 자동 트리거

---

## Branch Protection Rules

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/projects/{id}/branch-protection` | 보호 규칙 목록 |
| POST | `/api/git/projects/{id}/branch-protection` | 보호 규칙 생성 |
| PUT | `/api/git/projects/{id}/branch-protection/{rule_id}` | 보호 규칙 수정 |
| DELETE | `/api/git/projects/{id}/branch-protection/{rule_id}` | 보호 규칙 삭제 |

**규칙 필드**: `branch_pattern`, `require_approvals`, `require_no_conflicts`, `allowed_merge_roles`, `allow_force_push`, `allow_deletion`, `auto_deploy`, `deploy_workflow`, `enabled`

---

## Remote Management

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/projects/{id}/remotes` | 리모트 목록 조회 |
| POST | `/api/git/projects/{id}/remotes` | 리모트 추가 |
| PUT | `/api/git/projects/{id}/remotes/{remote_name}` | 리모트 수정 |
| DELETE | `/api/git/projects/{id}/remotes/{remote_name}` | 리모트 삭제 |

---

## Git Repository Registry

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/repositories` | 등록된 Git 저장소 목록 |
| POST | `/api/git/repositories` | Git 저장소 등록 |
| GET | `/api/git/repositories/{repo_id}` | 저장소 상세 조회 |
| PUT | `/api/git/repositories/{repo_id}` | 저장소 정보 수정 |
| DELETE | `/api/git/repositories/{repo_id}` | 저장소 삭제 |

---

## GitHub Integration

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/git/github/{owner}/{repo}/pulls` | GitHub PR 목록 |
| GET | `/api/git/github/{owner}/{repo}/pulls/{number}` | GitHub PR 상세 |
| POST | `/api/git/github/{owner}/{repo}/pulls/{number}/merge` | GitHub PR 머지 |
| GET | `/api/git/github/{owner}/{repo}/pulls/{number}/reviews` | GitHub PR 리뷰 목록 |
| POST | `/api/git/github/{owner}/{repo}/pulls/{number}/reviews` | GitHub PR 리뷰 생성 |
| GET | `/api/git/github/{owner}/{repo}/pulls/{number}/mergeable` | PR 머지 가능 여부 |
| GET | `/api/git/github/{owner}/{repo}/info` | 저장소 정보 |
| GET | `/api/git/github/{owner}/{repo}/branches` | 저장소 브랜치 목록 |

**GitHub 머지 방식**: `merge`, `squash`, `rebase`
