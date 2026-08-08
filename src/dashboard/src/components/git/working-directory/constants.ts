/**
 * 파일 상태·민감도 표시용 상수 — WorkingDirectory 내부 전용.
 */

import { FileEdit, FilePlus, FileX, FileQuestion, Check, ShieldAlert, Shield, AlertTriangle } from 'lucide-react'
import { FileStatusType } from '@/stores/git'
import type { SensitivityLevel } from '@/utils/gitSafetyPatterns'

export const statusIcons: Record<FileStatusType, typeof FileEdit> = {
  modified: FileEdit,
  added: FilePlus,
  deleted: FileX,
  renamed: FileEdit,
  untracked: FileQuestion,
  staged: Check,
}

export const statusColors: Record<FileStatusType, string> = {
  modified: 'text-yellow-500',
  added: 'text-green-500',
  deleted: 'text-red-500',
  renamed: 'text-blue-500',
  untracked: 'text-gray-400',
  staged: 'text-green-500',
}

export const statusLabels: Record<FileStatusType, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
  staged: 'S',
}

export const sensitivityIcons: Record<SensitivityLevel, typeof Shield | null> = {
  danger: ShieldAlert,
  warning: AlertTriangle,
  safe: null,
}

export const sensitivityColors: Record<SensitivityLevel, string> = {
  danger: 'text-red-500',
  warning: 'text-yellow-500',
  safe: '',
}
