/**
 * 문자열에서 가장 많이 등장한 단어와 횟수를 반환한다.
 * 대소문자 무시, 구두점 제거. 동점 시 먼저 등장한 단어 우선.
 */
export function wordCounter(text: string): { word: string; count: number } | null {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0)

  if (words.length === 0) return null

  const counts = new Map<string, number>()
  for (const w of words) {
    counts.set(w, (counts.get(w) ?? 0) + 1)
  }

  let maxWord = ''
  let maxCount = 0
  for (const [w, c] of counts) {
    if (c > maxCount) {
      maxWord = w
      maxCount = c
    }
  }

  return { word: maxWord, count: maxCount }
}
