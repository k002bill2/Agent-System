/**
 * AnalyticsPage 의 표시용 상수 — 시간 범위 · 차트/프로바이더 색상 · 요일 라벨 ·
 * effort/strategy 배지 (뒤 둘은 TaskAnalyzer 와 표기를 맞춘다).
 */

import { ArrowRight, GitBranch, Zap } from 'lucide-react'
import type { TimeRange } from './types'

export const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: '1 Hour', value: '1h' },
  { label: '24 Hours', value: '24h' },
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: 'All Time', value: 'all' },
]

export const CHART_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#06B6D4', // cyan
]

export const PROVIDER_COLORS: Record<string, string> = {
  codex_cli: '#8B5CF6',
  claude_cli: '#F59E0B',
  anthropic: '#F97316',
  openai: '#10B981',
  google: '#3B82F6',
  github_copilot: '#111827',
  ollama: '#64748B',
  unknown: '#6B7280',
}

export const PROVIDER_LABELS: Record<string, string> = {
  codex_cli: 'Codex CLI',
  claude_cli: 'Claude CLI',
  anthropic: 'Anthropic Claude',
  openai: 'OpenAI',
  google: 'Google Gemini',
  github_copilot: 'GitHub Copilot',
  ollama: 'Ollama',
  unknown: 'Unknown',
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Effort level colors (matches TaskAnalyzer)
export const effortColors: Record<string, string> = {
  quick: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  thorough: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

// Strategy icons (matches TaskAnalyzer)
export const strategyIcons: Record<string, typeof GitBranch> = {
  sequential: ArrowRight,
  parallel: Zap,
  mixed: GitBranch,
}
