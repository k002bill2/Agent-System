import type { UsageCoverage, UsageSourceCoverage, UsageSummary } from '../stores/externalUsage'

/**
 * 기간 기본값. store·헤더 배지·상세 페이지가 같은 값을 쓴다.
 *
 * store 모듈이 아니라 여기 두는 이유: 컴포넌트 테스트가 `vi.mock('../stores/externalUsage')`
 * 로 store 를 통째로 대체하면 store 에서 가져오는 상수가 `undefined` 가 된다.
 * 이 모듈은 타입만 import 하므로(런타임 의존 없음) 모킹의 영향을 받지 않는다.
 */
export const DEFAULT_PERIOD_DAYS = 30

/**
 * 사용량 수집 경로(provenance)를 사람이 읽는 한국어로 옮긴다.
 *
 * 헤더 배지와 상세 페이지가 같은 문자열을 써야 두 표면을 같은 모집단으로 오독하지 않는다.
 * 라벨을 각 컴포넌트에 복사하면 한쪽만 바뀌어도 조용히 어긋나므로 여기 한 곳에 둔다.
 */
export const COLLECTION_SOURCE_LABELS: Record<string, string> = {
  internal_ledger: 'AOS 내부 원장',
  claude_session_snapshot: 'Claude 세션 스냅샷',
  provider_billing: '프로바이더 청구',
  proxy: '프록시 집계',
  unknown: '출처 미확인',
}

/** 두 카드를 같은 모집단으로 읽지 못하게 막는 짧은 단서 (감사 §3). */
export const COLLECTION_SOURCE_NOTES: Record<string, string> = {
  internal_ledger: 'AOS 내부 호출만',
  claude_session_snapshot: '호스트 세션 스냅샷',
  provider_billing: '프로바이더 청구 기준',
  proxy: '프록시 경유 호출만',
}

/** `total_requests` 의 단위. Claude 의 1건은 세션, Codex 의 1건은 원장 레코드다. */
export const REQUEST_UNIT_LABELS: Record<string, string> = {
  ledger_record: '건',
  session: '세션',
  unknown: '건',
}

/** timestamp 가 무엇을 가리키는지. */
export const DATE_BASIS_LABELS: Record<string, string> = {
  event: '발생 시각 기준',
  session_last_activity: '세션 마지막 활동일 기준',
}

export function collectionSourceLabel(source: string | null | undefined): string {
  if (!source) return COLLECTION_SOURCE_LABELS.unknown
  return COLLECTION_SOURCE_LABELS[source] ?? source
}

export function collectionSourceNote(source: string | null | undefined): string | null {
  if (!source) return null
  return COLLECTION_SOURCE_NOTES[source] ?? null
}

export function requestUnitLabel(unit: string | null | undefined): string {
  if (!unit) return REQUEST_UNIT_LABELS.unknown
  return REQUEST_UNIT_LABELS[unit] ?? REQUEST_UNIT_LABELS.unknown
}

/** 예: `AOS 내부 원장 16건`. */
export function formatCoverageSource(source: UsageSourceCoverage): string {
  return `${collectionSourceLabel(source.collection_source)} ${source.record_count.toLocaleString()}${requestUnitLabel(source.request_unit)}`
}

/** 예: `AOS 내부 원장 16건 · Claude 세션 스냅샷 3세션`. 소스가 없으면 `null`. */
export function summarizeCoverage(coverage: UsageCoverage | null | undefined): string | null {
  const sources = coverage?.sources ?? []
  if (sources.length === 0) return null
  return sources.map(formatCoverageSource).join(' · ')
}

/** 비용이 측정되지 않은 레코드 총 건수. 구버전 응답에서는 0. */
export function countUnknownCostRequests(providers: UsageSummary[]): number {
  return providers.reduce((total, provider) => total + (provider.unknown_cost_requests ?? 0), 0)
}

/** 사용자에 귀속되지 않은 레코드 총 건수 (감사 §8). 구버전 응답에서는 0. */
export function countUnattributedMemberRequests(providers: UsageSummary[]): number {
  return providers.reduce((total, provider) => total + (provider.unattributed_member_requests ?? 0), 0)
}

/** `cost_state` 가 명시적으로 known 이 아닌 경우 = 비용을 "안다"고 주장할 수 없다. */
export function isCostMeasured(costState: string | null | undefined): boolean {
  // 구버전 응답(필드 부재)은 기존 동작을 유지하기 위해 측정된 것으로 본다.
  return costState == null || costState === 'known'
}
