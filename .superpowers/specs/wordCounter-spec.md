# wordCounter 스펙 문서

## 한 줄 요약
문자열을 받아서, 가장 많이 등장한 단어와 그 횟수를 알려주는 함수.

## 비유 (16살도 이해 가능)
친구들과 채팅할 때 누가 "ㅋㅋ"를 가장 많이 쓰는지 세는 것과 같다.
문장을 단어별로 쪼개고, 각 단어가 몇 번 나왔는지 세고, 가장 많은 걸 골라준다.

## 입력 / 출력

```typescript
function wordCounter(text: string): { word: string; count: number } | null
```

- **입력**: 아무 문자열 (영어 기준)
- **출력**: `{ word: "hello", count: 3 }` 또는 빈 문자열이면 `null`

## 규칙

| 규칙 | 예시 | 결과 |
|------|------|------|
| 대소문자 무시 | "Hello hello HELLO" | `{ word: "hello", count: 3 }` |
| 구두점 제거 | "hi! hi. hi?" | `{ word: "hi", count: 3 }` |
| 빈 문자열 | "" | `null` |
| 공백만 있는 문자열 | "   " | `null` |
| 동점이면 먼저 등장한 단어 | "a b a b" | `{ word: "a", count: 2 }` |
| 여러 공백 처리 | "hello   world" | 정상 동작 |

## 엣지 케이스

1. 빈 문자열 → null
2. 공백만 → null
3. 단어 1개 → 그 단어 반환
4. 모든 단어가 1번 → 첫 번째 단어
5. 구두점만 있는 문자열 ("!@#") → null
6. 숫자 포함 ("test 123 test") → "test"가 최다

## 범위 밖 (YAGNI)
- 한국어/CJK 지원 → 하지 않음
- 불용어(stopword) 필터링 → 하지 않음
- 스트리밍 입력 → 하지 않음
- 여러 최다 단어 모두 반환 → 하지 않음 (하나만)

## 파일 위치
- 코드: `src/dashboard/src/lib/wordCounter.ts`
- 테스트: `src/dashboard/src/lib/__tests__/wordCounter.test.ts`
