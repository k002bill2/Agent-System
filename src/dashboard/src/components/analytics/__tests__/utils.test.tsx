/**
 * `buildModelTokenBreakdown` 의 provider 귀속 회귀 테스트.
 *
 * 감사 §1 계열: 백엔드가 `provider_source` 로 "귀속 실패"를 말했을 때
 * 프론트가 모델 문자열로 다시 추측하면 안 된다. CostMonitor.groupByProvider 는
 * 이미 이 규칙을 지키지만 AnalyticsPage 경로(이 함수)는 빠져 있었다.
 */

import { describe, it, expect } from 'vitest'
import { buildModelTokenBreakdown } from '../utils'
import type { CostBreakdown } from '../types'

function makeModel(overrides: Partial<CostBreakdown> = {}): CostBreakdown {
  return {
    category: 'model',
    value: 'gpt-4o',
    provider: null,
    cost: 0.02,
    tokens: 1500,
    percentage: 100,
    ...overrides,
  }
}

describe('buildModelTokenBreakdown provider attribution', () => {
  it('fails closed to unknown when the backend says unattributed', () => {
    const result = buildModelTokenBreakdown(
      [makeModel({ value: 'gpt-4o', provider: null, provider_source: 'unattributed' })],
      null,
    )

    expect(result).toHaveLength(1)
    expect(result[0].model).toBe('gpt-4o')
    expect(result[0].provider).toBe('unknown')
    expect(result[0].providerLabel).toBe('Unknown')
  })

  it('ignores a provider_source of unattributed even when a provider value is present', () => {
    const result = buildModelTokenBreakdown(
      [makeModel({ value: 'gpt-4o', provider: 'openai', provider_source: 'unattributed' })],
      null,
    )

    expect(result[0].provider).toBe('unknown')
  })

  it('fails closed when a non-legacy source carries no usable provider', () => {
    const result = buildModelTokenBreakdown(
      [makeModel({ value: 'claude-sonnet-4-6', provider: '  ', provider_source: 'ledger' })],
      null,
    )

    expect(result[0].provider).toBe('unknown')
    expect(result[0].providerLabel).toBe('Unknown')
  })

  it('keeps model-string inference for legacy payloads without provider_source', () => {
    const result = buildModelTokenBreakdown(
      [makeModel({ value: 'gpt-4o', provider: null })],
      null,
    )

    expect(result[0].provider).toBe('openai')
    expect(result[0].providerLabel).toBe('OpenAI')
  })

  it('keeps a backend-supplied provider when the source is not unattributed', () => {
    const result = buildModelTokenBreakdown(
      [makeModel({ value: 'claude-sonnet-4-6', provider: 'claude_cli', provider_source: 'session_transcript' })],
      null,
    )

    expect(result[0].provider).toBe('claude_cli')
    expect(result[0].providerLabel).toBe('Claude CLI')
  })

  it('does not group an unattributed gpt-4o together with an attributed openai model', () => {
    const result = buildModelTokenBreakdown(
      [
        makeModel({ value: 'gpt-4o', provider: null, provider_source: 'unattributed', tokens: 1000, cost: 0.01 }),
        makeModel({ value: 'gpt-4o', provider: 'openai', provider_source: 'ledger', tokens: 500, cost: 0.005 }),
      ],
      null,
    )

    expect(result).toHaveLength(2)
    expect(result.map((entry) => entry.provider).sort()).toEqual(['openai', 'unknown'])
  })
})
