import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getFileKey,
  removeOcrBlock,
  removeMdBlock,
  isMdFile,
  isImageFile,
  readTextFile,
  validateMdFile,
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGES,
  ALLOWED_MD_EXTENSIONS,
  MAX_MD_FILES,
  MAX_MD_FILE_SIZE,
} from '../fileAttachment'

// ─── Constants ────────────────────────────────────────────────

describe('Constants', () => {
  it('ALLOWED_IMAGE_TYPES contains expected MIME types', () => {
    expect(ALLOWED_IMAGE_TYPES).toContain('image/png')
    expect(ALLOWED_IMAGE_TYPES).toContain('image/jpeg')
    expect(ALLOWED_IMAGE_TYPES).toContain('image/gif')
    expect(ALLOWED_IMAGE_TYPES).toContain('image/webp')
    expect(ALLOWED_IMAGE_TYPES).toContain('image/bmp')
    expect(ALLOWED_IMAGE_TYPES).toContain('image/svg+xml')
  })

  it('ALLOWED_IMAGE_TYPES has exactly 6 entries', () => {
    expect(ALLOWED_IMAGE_TYPES).toHaveLength(6)
  })

  it('MAX_IMAGES is 5', () => {
    expect(MAX_IMAGES).toBe(5)
  })

  it('ALLOWED_MD_EXTENSIONS contains .md and .markdown', () => {
    expect(ALLOWED_MD_EXTENSIONS).toContain('.md')
    expect(ALLOWED_MD_EXTENSIONS).toContain('.markdown')
  })

  it('ALLOWED_MD_EXTENSIONS has exactly 2 entries', () => {
    expect(ALLOWED_MD_EXTENSIONS).toHaveLength(2)
  })

  it('MAX_MD_FILES is 3', () => {
    expect(MAX_MD_FILES).toBe(3)
  })

  it('MAX_MD_FILE_SIZE is 512KB (524288 bytes)', () => {
    expect(MAX_MD_FILE_SIZE).toBe(512 * 1024)
    expect(MAX_MD_FILE_SIZE).toBe(524288)
  })
})

// ─── getFileKey ───────────────────────────────────────────────

describe('getFileKey', () => {
  it('returns a string combining name, size, and lastModified', () => {
    const file = new File(['hello'], 'test.md', { type: 'text/markdown' })
    Object.defineProperty(file, 'lastModified', { value: 1700000000000 })
    const key = getFileKey(file)
    expect(key).toBe(`test.md_${file.size}_1700000000000`)
  })

  it('includes the file name in the key', () => {
    const file = new File([''], 'document.md', { type: 'text/markdown' })
    expect(getFileKey(file)).toContain('document.md')
  })

  it('includes the file size in the key', () => {
    const file = new File(['abcde'], 'file.txt', { type: 'text/plain' })
    expect(getFileKey(file)).toContain('5')
  })

  it('produces different keys for files with the same name but different sizes', () => {
    const file1 = new File(['abc'], 'same.md')
    const file2 = new File(['abcdef'], 'same.md')
    expect(getFileKey(file1)).not.toBe(getFileKey(file2))
  })

  it('produces different keys for files with the same name and size but different lastModified', () => {
    const file1 = new File(['abc'], 'same.md')
    const file2 = new File(['abc'], 'same.md')
    Object.defineProperty(file1, 'lastModified', { value: 1000 })
    Object.defineProperty(file2, 'lastModified', { value: 2000 })
    expect(getFileKey(file1)).not.toBe(getFileKey(file2))
  })

  it('handles file with empty name', () => {
    const file = new File([''], '', { type: '' })
    const key = getFileKey(file)
    expect(key).toMatch(/^_\d+_\d+$/)
  })

  it('handles file with special characters in name', () => {
    const file = new File(['x'], 'my file (1).md')
    const key = getFileKey(file)
    expect(key).toContain('my file (1).md')
  })
})

// ─── removeOcrBlock ───────────────────────────────────────────

describe('removeOcrBlock', () => {
  it('removes a single OCR block for a given filename', () => {
    const text = '[이미지 OCR: photo.png]\nsome extracted text'
    const result = removeOcrBlock(text, 'photo.png')
    expect(result).toBe('')
  })

  it('preserves text before the OCR block', () => {
    const text = 'User question\n\n[이미지 OCR: img.png]\nocr content'
    const result = removeOcrBlock(text, 'img.png')
    expect(result).toBe('User question')
  })

  it('preserves text after the OCR block when another OCR block follows', () => {
    const text =
      '[이미지 OCR: a.png]\nocr a\n\n[이미지 OCR: b.png]\nocr b'
    const result = removeOcrBlock(text, 'a.png')
    expect(result).toContain('[이미지 OCR: b.png]')
    expect(result).toContain('ocr b')
    expect(result).not.toContain('[이미지 OCR: a.png]')
    expect(result).not.toContain('ocr a')
  })

  it('preserves a following MD document block', () => {
    const text =
      '[이미지 OCR: img.png]\nocr content\n\n[문서: doc.md]\nmd content'
    const result = removeOcrBlock(text, 'img.png')
    expect(result).toContain('[문서: doc.md]')
    expect(result).toContain('md content')
    expect(result).not.toContain('[이미지 OCR: img.png]')
  })

  it('does not modify text when the filename does not match', () => {
    const text = '[이미지 OCR: other.png]\nsome text'
    const result = removeOcrBlock(text, 'photo.png')
    expect(result).toBe(text.trim())
  })

  it('returns original text when there is no OCR block at all', () => {
    const text = 'Just a plain message with no blocks.'
    const result = removeOcrBlock(text, 'any.png')
    expect(result).toBe(text)
  })

  it('handles filenames with regex-special characters', () => {
    const filename = 'image(1).png'
    const text = `[이미지 OCR: ${filename}]\nocr text`
    const result = removeOcrBlock(text, filename)
    expect(result).toBe('')
  })

  it('handles filenames with dots', () => {
    const filename = 'my.photo.png'
    const text = `[이미지 OCR: ${filename}]\ndata`
    const result = removeOcrBlock(text, filename)
    expect(result).toBe('')
  })

  it('handles empty text input', () => {
    expect(removeOcrBlock('', 'file.png')).toBe('')
  })

  it('trims leading/trailing whitespace from result', () => {
    const text = '   \n[이미지 OCR: img.png]\nocr text\n   '
    const result = removeOcrBlock(text, 'img.png')
    expect(result).toBe(result.trim())
  })
})

// ─── removeMdBlock ────────────────────────────────────────────

describe('removeMdBlock', () => {
  it('removes a single MD document block for a given filename', () => {
    const text = '[문서: readme.md]\n# Heading\nsome content'
    const result = removeMdBlock(text, 'readme.md')
    expect(result).toBe('')
  })

  it('preserves text before the MD block', () => {
    const text = 'User question\n\n[문서: doc.md]\ndoc content'
    const result = removeMdBlock(text, 'doc.md')
    expect(result).toBe('User question')
  })

  it('preserves a following OCR block', () => {
    const text =
      '[문서: guide.md]\nmd content\n\n[이미지 OCR: pic.png]\nocr content'
    const result = removeMdBlock(text, 'guide.md')
    expect(result).toContain('[이미지 OCR: pic.png]')
    expect(result).toContain('ocr content')
    expect(result).not.toContain('[문서: guide.md]')
    expect(result).not.toContain('md content')
  })

  it('preserves a following MD block for a different file', () => {
    const text =
      '[문서: a.md]\ncontent a\n\n[문서: b.md]\ncontent b'
    const result = removeMdBlock(text, 'a.md')
    expect(result).toContain('[문서: b.md]')
    expect(result).toContain('content b')
    expect(result).not.toContain('[문서: a.md]')
    expect(result).not.toContain('content a')
  })

  it('does not modify text when filename does not match', () => {
    const text = '[문서: other.md]\ncontent'
    const result = removeMdBlock(text, 'readme.md')
    expect(result).toBe(text.trim())
  })

  it('returns original text when there is no MD block at all', () => {
    const text = 'Just plain text.'
    const result = removeMdBlock(text, 'doc.md')
    expect(result).toBe(text)
  })

  it('handles filenames with regex-special characters', () => {
    const filename = 'my[doc].md'
    const text = `[문서: ${filename}]\ncontent`
    const result = removeMdBlock(text, filename)
    expect(result).toBe('')
  })

  it('handles filenames with dots in name', () => {
    const filename = 'my.detailed.notes.md'
    const text = `[문서: ${filename}]\ncontent`
    const result = removeMdBlock(text, filename)
    expect(result).toBe('')
  })

  it('handles empty text input', () => {
    expect(removeMdBlock('', 'doc.md')).toBe('')
  })

  it('trims leading/trailing whitespace from result', () => {
    const text = '  \n[문서: doc.md]\ncontent\n  '
    const result = removeMdBlock(text, 'doc.md')
    expect(result).toBe(result.trim())
  })
})

// ─── isMdFile ─────────────────────────────────────────────────

describe('isMdFile', () => {
  it('returns true for .md extension', () => {
    const file = new File([''], 'readme.md', { type: 'text/markdown' })
    expect(isMdFile(file)).toBe(true)
  })

  it('returns true for .markdown extension', () => {
    const file = new File([''], 'guide.markdown', { type: 'text/markdown' })
    expect(isMdFile(file)).toBe(true)
  })

  it('returns true for uppercase .MD extension', () => {
    const file = new File([''], 'README.MD')
    expect(isMdFile(file)).toBe(true)
  })

  it('returns true for mixed case .Markdown extension', () => {
    const file = new File([''], 'notes.Markdown')
    expect(isMdFile(file)).toBe(true)
  })

  it('returns false for .txt file', () => {
    const file = new File([''], 'notes.txt', { type: 'text/plain' })
    expect(isMdFile(file)).toBe(false)
  })

  it('returns false for .png file', () => {
    const file = new File([''], 'image.png', { type: 'image/png' })
    expect(isMdFile(file)).toBe(false)
  })

  it('returns false for .mdx file', () => {
    const file = new File([''], 'component.mdx')
    expect(isMdFile(file)).toBe(false)
  })

  it('returns false for a file with no extension', () => {
    const file = new File([''], 'Makefile')
    expect(isMdFile(file)).toBe(false)
  })

  it('returns false for a file whose name ends with mdx but not .md or .markdown', () => {
    const file = new File([''], 'commands.cmdx')
    expect(isMdFile(file)).toBe(false)
  })

  it('returns false for empty filename', () => {
    const file = new File([''], '')
    expect(isMdFile(file)).toBe(false)
  })

  it('returns true for a file with .md in a multi-dotted name', () => {
    const file = new File([''], 'v1.2.3.md')
    expect(isMdFile(file)).toBe(true)
  })
})

// ─── isImageFile ──────────────────────────────────────────────

describe('isImageFile', () => {
  it('returns true for image/png', () => {
    const file = new File([''], 'photo.png', { type: 'image/png' })
    expect(isImageFile(file)).toBe(true)
  })

  it('returns true for image/jpeg', () => {
    const file = new File([''], 'photo.jpg', { type: 'image/jpeg' })
    expect(isImageFile(file)).toBe(true)
  })

  it('returns true for image/gif', () => {
    const file = new File([''], 'anim.gif', { type: 'image/gif' })
    expect(isImageFile(file)).toBe(true)
  })

  it('returns true for image/webp', () => {
    const file = new File([''], 'photo.webp', { type: 'image/webp' })
    expect(isImageFile(file)).toBe(true)
  })

  it('returns true for image/bmp', () => {
    const file = new File([''], 'bitmap.bmp', { type: 'image/bmp' })
    expect(isImageFile(file)).toBe(true)
  })

  it('returns true for image/svg+xml', () => {
    const file = new File([''], 'icon.svg', { type: 'image/svg+xml' })
    expect(isImageFile(file)).toBe(true)
  })

  it('returns false for text/plain', () => {
    const file = new File([''], 'notes.txt', { type: 'text/plain' })
    expect(isImageFile(file)).toBe(false)
  })

  it('returns false for application/pdf', () => {
    const file = new File([''], 'doc.pdf', { type: 'application/pdf' })
    expect(isImageFile(file)).toBe(false)
  })

  it('returns false for empty type', () => {
    const file = new File([''], 'unknown', { type: '' })
    expect(isImageFile(file)).toBe(false)
  })

  it('returns false for image/tiff (not in allowed list)', () => {
    const file = new File([''], 'photo.tiff', { type: 'image/tiff' })
    expect(isImageFile(file)).toBe(false)
  })

  it('returns false for a completely unrecognised MIME type string', () => {
    const file = new File([''], 'photo.png', { type: 'application/octet-stream' })
    expect(isImageFile(file)).toBe(false)
  })
})

// ─── readTextFile ─────────────────────────────────────────────

describe('readTextFile', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves with file content on successful read', async () => {
    class MockFileReader {
      result: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsText() {
        setTimeout(() => {
          this.result = 'file content'
          this.onload?.()
        }, 0)
      }
    }
    vi.stubGlobal('FileReader', MockFileReader)

    const file = new File(['file content'], 'test.md', { type: 'text/markdown' })
    const result = await readTextFile(file)
    expect(result).toBe('file content')
  })

  it('resolves with empty string for empty file', async () => {
    class MockFileReader {
      result: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsText() {
        setTimeout(() => {
          this.result = ''
          this.onload?.()
        }, 0)
      }
    }
    vi.stubGlobal('FileReader', MockFileReader)

    const file = new File([''], 'empty.md')
    const result = await readTextFile(file)
    expect(result).toBe('')
  })

  it('resolves with multiline content', async () => {
    const content = '# Heading\n\nParagraph one.\n\nParagraph two.'
    class MockFileReader {
      result: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsText() {
        setTimeout(() => {
          this.result = content
          this.onload?.()
        }, 0)
      }
    }
    vi.stubGlobal('FileReader', MockFileReader)

    const file = new File([content], 'doc.md')
    const result = await readTextFile(file)
    expect(result).toBe(content)
  })

  it('rejects with an error message including the filename on read failure', async () => {
    class MockFileReader {
      result: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsText() {
        setTimeout(() => {
          this.onerror?.()
        }, 0)
      }
    }
    vi.stubGlobal('FileReader', MockFileReader)

    const file = new File([''], 'broken.md')
    await expect(readTextFile(file)).rejects.toThrow('Failed to read file: broken.md')
  })

  it('rejects with an Error instance on failure', async () => {
    class MockFileReader {
      result: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsText() {
        setTimeout(() => {
          this.onerror?.()
        }, 0)
      }
    }
    vi.stubGlobal('FileReader', MockFileReader)

    const file = new File([''], 'bad.md')
    await expect(readTextFile(file)).rejects.toBeInstanceOf(Error)
  })

  it('resolves with unicode content correctly', async () => {
    const content = '한국어 텍스트\n日本語テキスト\nEmoji 🎉'
    class MockFileReader {
      result: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsText() {
        setTimeout(() => {
          this.result = content
          this.onload?.()
        }, 0)
      }
    }
    vi.stubGlobal('FileReader', MockFileReader)

    const file = new File([content], 'unicode.md')
    const result = await readTextFile(file)
    expect(result).toBe(content)
  })
})

// ─── validateMdFile ───────────────────────────────────────────

describe('validateMdFile', () => {
  it('returns null for a valid .md file within limits', () => {
    const file = new File(['# Hello'], 'valid.md', { type: 'text/markdown' })
    expect(validateMdFile(file, 0)).toBeNull()
  })

  it('returns null for a valid .markdown file within limits', () => {
    const file = new File(['content'], 'guide.markdown')
    expect(validateMdFile(file, 1)).toBeNull()
  })

  it('returns null when currentCount is MAX_MD_FILES - 1', () => {
    const file = new File(['content'], 'last.md')
    expect(validateMdFile(file, MAX_MD_FILES - 1)).toBeNull()
  })

  it('returns error for non-MD file (e.g., .txt)', () => {
    const file = new File(['text'], 'notes.txt', { type: 'text/plain' })
    const error = validateMdFile(file, 0)
    expect(error).not.toBeNull()
    expect(error).toContain('notes.txt')
    expect(error).toContain('.md')
    expect(error).toContain('.markdown')
  })

  it('returns error for image file', () => {
    const file = new File([''], 'photo.png', { type: 'image/png' })
    const error = validateMdFile(file, 0)
    expect(error).not.toBeNull()
    expect(error).toContain('photo.png')
  })

  it('returns error when file size exceeds MAX_MD_FILE_SIZE', () => {
    const file = new File(['x'], 'big.md', { type: 'text/markdown' })
    Object.defineProperty(file, 'size', { value: MAX_MD_FILE_SIZE + 1 })
    const error = validateMdFile(file, 0)
    expect(error).not.toBeNull()
    expect(error).toContain('big.md')
    expect(error).toContain('512KB')
  })

  it('error message for oversized file includes computed KB size', () => {
    const sizeBytes = MAX_MD_FILE_SIZE + 1024 // 1KB over limit
    const file = new File(['x'], 'large.md')
    Object.defineProperty(file, 'size', { value: sizeBytes })
    const error = validateMdFile(file, 0)
    expect(error).toContain(`${(sizeBytes / 1024).toFixed(0)}KB`)
  })

  it('returns null for file exactly at MAX_MD_FILE_SIZE', () => {
    const file = new File(['x'], 'exact.md')
    Object.defineProperty(file, 'size', { value: MAX_MD_FILE_SIZE })
    expect(validateMdFile(file, 0)).toBeNull()
  })

  it('returns error when currentCount equals MAX_MD_FILES', () => {
    const file = new File(['content'], 'one-more.md')
    const error = validateMdFile(file, MAX_MD_FILES)
    expect(error).not.toBeNull()
    expect(error).toContain(`${MAX_MD_FILES}`)
  })

  it('returns error when currentCount exceeds MAX_MD_FILES', () => {
    const file = new File(['content'], 'overflow.md')
    const error = validateMdFile(file, MAX_MD_FILES + 5)
    expect(error).not.toBeNull()
    expect(error).toContain(`${MAX_MD_FILES}`)
  })

  it('extension check takes priority over size check', () => {
    const file = new File(['x'], 'wrong.txt')
    Object.defineProperty(file, 'size', { value: MAX_MD_FILE_SIZE + 1 })
    const error = validateMdFile(file, 0)
    // Should report extension error, not size error
    expect(error).toContain('.md')
    expect(error).not.toContain('512KB')
  })

  it('size check takes priority over count check', () => {
    const file = new File(['x'], 'heavy.md')
    Object.defineProperty(file, 'size', { value: MAX_MD_FILE_SIZE + 1 })
    const error = validateMdFile(file, MAX_MD_FILES)
    // Should report size error, not count error
    expect(error).toContain('512KB')
    expect(error).not.toContain(`최대 ${MAX_MD_FILES}개`)
  })

  it('count error message uses MAX_MD_FILES value', () => {
    const file = new File(['ok'], 'extra.md')
    const error = validateMdFile(file, MAX_MD_FILES)
    expect(error).toContain(`최대 ${MAX_MD_FILES}개`)
  })

  it('returns null for uppercase .MD when within limits', () => {
    const file = new File(['content'], 'README.MD')
    expect(validateMdFile(file, 0)).toBeNull()
  })
})
