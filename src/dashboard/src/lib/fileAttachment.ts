/**
 * File Attachment Utilities
 *
 * 이미지 및 MD 파일 첨부를 위한 공유 상수/유틸리티.
 * TaskAnalyzer, ChatInput, PlaygroundPage에서 공통 사용.
 */

// ─── Image Constants ───────────────────────────────────────

export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml',
]

export const MAX_IMAGES = 5

// ─── Markdown Constants ────────────────────────────────────

export const ALLOWED_MD_EXTENSIONS = ['.md', '.markdown']

export const MAX_MD_FILES = 3

/** 512KB per file */
export const MAX_MD_FILE_SIZE = 512 * 1024

// ─── Shared Helpers ────────────────────────────────────────

/** 파일 고유 키 생성 (상태 추적용) */
export function getFileKey(file: File): string {
  return `${file.name}_${file.size}_${file.lastModified}`
}

/** 입력 텍스트에서 특정 파일의 OCR 블록을 제거 */
export function removeOcrBlock(text: string, filename: string): string {
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `\\n?\\n?\\[이미지 OCR: ${escaped}\\][\\s\\S]*?(?=\\n\\n\\[이미지 OCR:|\\n\\n\\[문서:|$)`
  )
  return text.replace(pattern, '').trim()
}

/** 입력 텍스트에서 특정 파일의 MD 문서 블록을 제거 */
export function removeMdBlock(text: string, filename: string): string {
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `\\n?\\n?\\[문서: ${escaped}\\][\\s\\S]*?(?=\\n\\n\\[이미지 OCR:|\\n\\n\\[문서:|$)`
  )
  return text.replace(pattern, '').trim()
}

/** 파일이 MD 파일인지 확인 */
export function isMdFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return ALLOWED_MD_EXTENSIONS.some((ext) => name.endsWith(ext))
}

/** 파일이 이미지 파일인지 확인 */
export function isImageFile(file: File): boolean {
  return ALLOWED_IMAGE_TYPES.includes(file.type)
}

/** FileReader로 텍스트 파일 읽기 (Promise 래퍼) */
export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`))
    reader.readAsText(file, 'utf-8')
  })
}

/** MD 파일 유효성 검증. 에러 메시지 또는 null 반환 */
export function validateMdFile(file: File, currentCount: number): string | null {
  if (!isMdFile(file)) {
    return `${file.name}: MD 파일만 허용됩니다 (.md, .markdown)`
  }
  if (file.size > MAX_MD_FILE_SIZE) {
    return `${file.name}: 파일 크기가 512KB를 초과합니다 (${(file.size / 1024).toFixed(0)}KB)`
  }
  if (currentCount >= MAX_MD_FILES) {
    return `최대 ${MAX_MD_FILES}개의 문서만 첨부할 수 있습니다`
  }
  return null
}
