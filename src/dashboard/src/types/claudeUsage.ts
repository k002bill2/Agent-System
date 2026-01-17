/**
 * Claude Code usage types
 *
 * Types for both local stats-cache.json and Anthropic OAuth API responses.
 */

export interface DailyActivity {
  date: string
  messageCount: number
  sessionCount: number
  toolCallCount: number
}

export interface DailyModelTokens {
  date: string
  tokensByModel: Record<string, number>
}

export interface ModelUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  webSearchRequests: number
  costUSD: number
}

/**
 * Plan limit information from Anthropic OAuth API.
 *
 * Maps to API response fields:
 * - five_hour -> fiveHour (Current session)
 * - seven_day -> sevenDay (All models)
 * - seven_day_opus -> sevenDayOpus (Opus only)
 */
export interface PlanLimitInfo {
  /** Internal name (fiveHour, sevenDay, sevenDayOpus) */
  name: string
  /** Display name (Current session, All models, Opus only) */
  displayName: string
  /** Utilization percentage (0-100) from Anthropic API */
  utilization: number
  /** ISO timestamp when this limit resets (e.g., "2025-11-04T04:59:59Z") */
  resetsAt?: string | null
  /** Hours until reset (calculated) */
  resetsInHours?: number | null
  /** Minutes until reset (calculated) */
  resetsInMinutes?: number | null
}

export interface ClaudeUsageResponse {
  // Raw stats from local cache
  lastComputedDate: string
  totalSessions: number
  totalMessages: number
  firstSessionDate?: string

  // Weekly usage from local cache
  weeklyActivity: DailyActivity[]
  weeklyModelTokens: DailyModelTokens[]

  // Model usage totals from local cache
  modelUsage: Record<string, ModelUsage>

  // Plan limits from Anthropic OAuth API (real data)
  planLimits: PlanLimitInfo[]

  // OAuth status
  oauthAvailable: boolean
  oauthError?: string | null

  // Computed stats from local cache
  weeklyTotalTokens: number
  weeklySonnetTokens: number
  weeklyOpusTokens: number
}
