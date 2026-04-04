import { describe, it, expect } from 'vitest'
import { wordCounter } from '../wordCounter'

describe('wordCounter', () => {
  // 기본 동작
  it('returns the most frequent word and its count', () => {
    expect(wordCounter('hello world hello')).toEqual({ word: 'hello', count: 2 })
  })

  // 대소문자 무시
  it('is case-insensitive', () => {
    expect(wordCounter('Hello hello HELLO')).toEqual({ word: 'hello', count: 3 })
  })

  // 구두점 제거
  it('strips punctuation', () => {
    expect(wordCounter('hi! hi. hi?')).toEqual({ word: 'hi', count: 3 })
  })

  // 빈 문자열
  it('returns null for empty string', () => {
    expect(wordCounter('')).toBeNull()
  })

  // 공백만
  it('returns null for whitespace-only string', () => {
    expect(wordCounter('   ')).toBeNull()
  })

  // 단어 1개
  it('returns the single word when only one exists', () => {
    expect(wordCounter('hello')).toEqual({ word: 'hello', count: 1 })
  })

  // 모든 단어 1번 → 첫 번째 단어
  it('returns the first word when all words appear once', () => {
    expect(wordCounter('apple banana cherry')).toEqual({ word: 'apple', count: 1 })
  })

  // 동점 → 먼저 등장한 단어
  it('returns the first-appearing word on tie', () => {
    expect(wordCounter('a b a b')).toEqual({ word: 'a', count: 2 })
  })

  // 여러 공백
  it('handles multiple spaces between words', () => {
    expect(wordCounter('hello   world   hello')).toEqual({ word: 'hello', count: 2 })
  })

  // 구두점만
  it('returns null for punctuation-only string', () => {
    expect(wordCounter('!@#$%')).toBeNull()
  })

  // 숫자 포함
  it('handles strings with numbers', () => {
    expect(wordCounter('test 123 test')).toEqual({ word: 'test', count: 2 })
  })
})
