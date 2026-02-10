/**
 * GitHub URL에서 owner/repo 형식의 저장소 정보를 추출합니다.
 * SSH (git@github.com:owner/repo.git) 및 HTTPS (https://github.com/owner/repo) 포맷 모두 지원.
 *
 * @param url - Git remote URL
 * @returns "owner/repo" 형식 문자열 또는 null
 */
export function extractGitHubRepo(url: string): string | null {
  if (!url) return null

  const trimmed = url.trim()

  // SSH format: git@github.com:owner/repo.git
  const sshMatch = trimmed.match(/git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/)
  if (sshMatch) {
    return sshMatch[1]
  }

  // HTTPS format: https://github.com/owner/repo
  const httpsMatch = trimmed.match(/https?:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?(?:\/)?$/)
  if (httpsMatch) {
    return httpsMatch[1]
  }

  // Already in owner/repo format (no slashes beyond one)
  const ownerRepoMatch = trimmed.match(/^([^/\s]+\/[^/\s]+?)(?:\.git)?$/)
  if (ownerRepoMatch && !trimmed.includes(':') && !trimmed.includes('//')) {
    return ownerRepoMatch[1]
  }

  return null
}
