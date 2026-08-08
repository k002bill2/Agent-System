/**
 * 위임 스텁의 파라미터가 impl 시그니처(set/get 제외)와 **개수·순서까지** 같은지 전수 검사한다.
 *
 * 왜 상시 테스트인가: TypeScript 는 파라미터가 **적은** 함수를 많은 시그니처에 할당하는 것을
 * 허용한다. 따라서 아래는 tsc 통과 · 표면 스냅샷 통과(이름 동일) · 위임 이름 검사 통과
 * (대상 이름 동일)인데 런타임에 인자가 조용히 사라진다:
 *
 *   stageFiles: (projectId) => staging.stageFiles(set, get, projectId),   // paths·all 소실
 *
 * 같은 타입 파라미터의 순서 뒤바뀜도 tsc 가 못 본다:
 *
 *   checkoutBranch: (projectId, name) => branches.checkoutBranch(set, get, name, projectId)
 *
 * Task 5 실측(2026-08-08): 두 결함을 심은 트리에 `tsc --noEmit` → **에러 0건**.
 * 즉 이 검사는 tsc 와 중복이 아니라 tsc 가 구조적으로 못 보는 층위를 본다.
 * 이 불변식은 이미 분할된 스토어에도 영구히 참이므로 `git` · `projectConfigs` 양쪽에 건다.
 *
 * ── impl 대조의 기계적 사정 (2026-08-09 최종 리뷰 F-1 로 보강) ─────────────────
 *
 * 1. **개수 검사 → (개수가 같을 때만) 이름·순서 검사** 순으로 잇는다. 대체하지 않는다.
 *    개수가 다르면 `"N개 전달하지만 K개 받는다"` 라는 구체적인 메시지가 남아야 하기 때문이다
 *    (Task 8 이 후행 옵셔널 절단으로 Red-Green 한 그 메시지다). 개수가 같을 때만 순서를 보므로
 *    진짜 결함이 두 줄로 중복 보고되지도 않는다.
 * 2. **후행 `?` 를 정규화한다.** `paramNames` 가 `[:=]` 로 자르므로 impl 의 `authorName?: string`
 *    은 `authorName?` 로 남는데, 스텁 쪽엔 타입도 `?` 도 없어 정규화 없이는 영영 불일치한다
 *    (정규화 없이 넣으면 두 스토어 합계 위반 18건 → 레드 2건. 실측).
 * 3. **구조분해 파라미터(`{ a, b }: Foo`)는 오탐이 난다.** `paramNames` 가 이름을 `{ a, b }` 로
 *    내보내 전달 측 식별자와 절대 일치하지 않는다. 현재 두 스토어에 그런 파라미터는 0건이지만,
 *    새로 생기면 `paramNames` 를 먼저 고쳐야 한다.
 */
export interface ArityReport {
  /** `index.ts` 에서 찾은 액션 스텁 수. 파서가 조용히 절반만 보면 여기서 드러난다. */
  stubCount: number
  /** 도메인 모듈에서 찾은 `export function` 수. */
  implCount: number
  /** 사람이 읽을 수 있는 불일치 목록. 비어 있어야 한다. */
  problems: string[]
}

/** 깊이 인식 콤마 분할 — `{a?: x; b?: y}` · `Omit<T,'a'|'b'>` 안의 콤마를 무시한다. */
function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if ('([{'.includes(ch)) depth++
    else if (')]}'.includes(ch)) depth--
    else if (ch === '<') depth++
    else if (ch === '>' && s[i - 1] !== '=') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** `openIdx` 의 `(` 와 짝이 되는 `)` 까지의 내용. */
function paramList(text: string, openIdx: number): string {
  let depth = 0
  let i = openIdx
  for (; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')') {
      depth--
      if (depth === 0) break
    }
  }
  return text.slice(openIdx + 1, i)
}

const paramNames = (s: string): string[] =>
  splitTop(s)
    .map((p) => p.split(/[:=]/)[0].trim())
    .filter(Boolean)

/** 후행 옵셔널 마커 제거 (헤더 2번). impl 의 `authorName?` ↔ 스텁의 `authorName`. */
const stripOptional = (names: string[]): string[] => names.map((p) => p.replace(/\?$/, ''))

/**
 * 스텁 파라미터명 ≠ impl 파라미터명인 **의도적** 개명. 파라미터 이름은 관측 가능한 계약이
 * 아니므로 개명이 동작 보존을 깨지 않는다.
 *
 *   `addHookEntry`: `projectConfigs/index.ts` 에 `import * as hooks from './hooks'` 가 있어
 *   스텁 파라미터를 `hooks` 로 두면 모듈 별칭을 가린다(TS2339) → 스텁만 `hooksArg`.
 *
 * **액션을 통째로 예외 처리하지 마라.** `if (name !== 'addHookEntry')` 형태로 건너뛰면 이
 * 액션의 개수·이름·순서 대조가 전부 사라지는데, 하필 4파라미터라 순서 뒤바뀜에 가장
 * 취약한 형태다. 대가는 액션 하나가 아니라 **파라미터 이름 하나**여야 한다.
 */
const RENAMES: Record<string, Record<string, string>> = {
  addHookEntry: { hooksArg: 'hooks' },
}

/**
 * @param indexSource `<store>/index.ts` 원문
 * @param moduleSources 도메인 모듈 원문. 키는 **파일명(=`import * as` 별칭)** 이어야 한다 —
 *   스텁의 `mod.fn(...)` 호출을 impl 로 되짚는 것이 이 키다.
 */
export function parseStubArity(indexSource: string, moduleSources: Record<string, string>): ArityReport {
  const problems: string[] = []

  // ── impl 시그니처 수집 ──────────────────────────────────────────────────
  const impl = new Map<string, string[]>()
  for (const [mod, src] of Object.entries(moduleSources)) {
    const re = /export (?:async )?function ([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src)) !== null) {
      const params = paramNames(paramList(src, re.lastIndex - 1))
      // 스텁이 set/get 을 **함께** 넘겨야 위임 검사 정규식에 잡히므로 시그니처는 균일해야 한다.
      // 미사용 파라미터는 `_` 접두어가 필요하다(tsconfig `noUnusedParameters`) — 양쪽 다 허용한다.
      if (!/^_?set$/.test(params[0]) || !/^_?get$/.test(params[1])) {
        problems.push(`${mod}.${m[1]}: 시그니처가 (set, get, ...) 형태가 아니다 (${params.slice(0, 2).join(', ')})`)
      }
      impl.set(`${mod}.${m[1]}`, params.slice(2))
    }
  }

  // ── 스텁 수집 및 대조 ──────────────────────────────────────────────────
  const lines = indexSource.split('\n')
  const body = lines.slice(lines.findIndex((l) => /=\s*create[<(]/.test(l)))
  const heads: { name: string; at: number }[] = []
  body.forEach((line, i) => {
    const m = line.match(/^ {2}([a-zA-Z_][a-zA-Z0-9_]*): (?:async )?\(/)
    if (m) heads.push({ name: m[1], at: i })
  })

  heads.forEach(({ name, at }, i) => {
    const until = i + 1 < heads.length ? heads[i + 1].at : body.length
    const text = body.slice(at, until).join(' ').replace(/\s+/g, ' ')
    const declared = paramNames(paramList(text, text.indexOf('(')))
    const call = text.match(
      /([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\(\s*set\s*,\s*get\s*(?:,([^)]*))?\)/
    )
    if (!call) {
      problems.push(`${name}: 위임 호출을 못 찾음`)
      return
    }
    const key = `${call[1]}.${call[2]}`
    const forwarded = paramNames(call[3] ?? '')
    const implParams = impl.get(key)
    if (!implParams) {
      problems.push(`${name}: impl ${key} 없음`)
      return
    }
    if (declared.join('|') !== forwarded.join('|')) {
      problems.push(`${name}: 선언 (${declared.join(', ')}) → 전달 (${forwarded.join(', ')}) 불일치`)
    }
    if (forwarded.length !== implParams.length) {
      problems.push(
        `${name}: ${forwarded.length}개 전달하지만 ${key} 는 ${implParams.length}개 받는다 (${implParams.join(', ')})`
      )
    } else {
      // 개수가 같을 때만 이름·순서를 본다 (헤더 1번). 같은 타입 파라미터의 순서 뒤바뀜은
      // tsc · 표면 스냅샷 · 위임 이름 검사가 전부 못 보는 층위이므로 여기서만 잡힌다.
      const forwardedNames = stripOptional(forwarded).map((p) => RENAMES[name]?.[p] ?? p)
      const implNames = stripOptional(implParams)
      if (forwardedNames.join('|') !== implNames.join('|')) {
        problems.push(
          `${name}: 전달 (${forwardedNames.join(', ')}) 이 ${key} 의 (${implNames.join(', ')}) 와 순서·이름 불일치`
        )
      }
    }
  })

  return { stubCount: heads.length, implCount: impl.size, problems }
}
