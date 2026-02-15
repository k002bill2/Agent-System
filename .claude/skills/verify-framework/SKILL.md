---
name: verify-framework
description: 프로젝트 프레임워크 컨벤션(import 패턴, Zustand 패턴, 파일 구조)이 일관되게 적용되는지 검증합니다.
---

# 프레임워크 컨벤션 검증

## Purpose

1. import 패턴이 프로젝트 컨벤션을 따르는지 검증 (경로 별칭, barrel import)
2. Zustand 스토어가 일관된 패턴을 사용하는지 검증
3. 컴포넌트 파일 구조가 프로젝트 표준을 따르는지 검증
4. TypeScript strict 모드 위반 패턴이 없는지 검증

## When to Run

- 새 컴포넌트/스토어/페이지를 추가한 후
- import 구조를 변경한 후
- 프로젝트 설정(tsconfig, vite.config)을 수정한 후

## Related Files

| File | Purpose |
|------|---------|
| `src/dashboard/src/stores/*.ts` | Zustand 스토어 |
| `src/dashboard/src/components/**/*.tsx` | React 컴포넌트 |
| `src/dashboard/src/pages/*.tsx` | 페이지 컴포넌트 |
| `src/dashboard/tsconfig.json` | TypeScript 설정 |
| `src/dashboard/vite.config.ts` | Vite 설정 |

## Workflow

### Step 1: Import 패턴 검사

경로 별칭 `@/` 사용 일관성 확인:

```bash
# 상대 경로로 components 참조하는 패턴 (pages에서)
grep -rn "from '\.\./\.\./components\|from '\.\./components" src/dashboard/src/pages/ --include="*.tsx"

# @/ 별칭 사용 패턴
grep -rn "from '@/" src/dashboard/src/ --include="*.ts" --include="*.tsx" | head -10
```

**PASS 기준**: 2단계 이상 상대 경로 대신 `@/` 별칭 사용
**FAIL 기준**: `../../components` 같은 깊은 상대 경로 사용

### Step 2: Zustand 스토어 패턴 검사

스토어가 일관된 패턴을 따르는지 확인:

```bash
# create 패턴
grep -n "create<\|create(" src/dashboard/src/stores/*.ts

# persist 미들웨어 사용
grep -n "persist\|devtools" src/dashboard/src/stores/*.ts

# selector 패턴
grep -n "useShallow\|shallow" src/dashboard/src/stores/*.ts
```

**PASS 기준**: 모든 스토어가 `create<StoreType>()` 패턴 사용
**FAIL 기준**: 일부 스토어가 다른 패턴 사용 (예: `create()` 타입 없이)

### Step 3: 컴포넌트 export 패턴 검사

named export 일관성 확인:

```bash
# default export 사용 (App.tsx 제외)
grep -rn "export default" src/dashboard/src/components/ --include="*.tsx"
grep -rn "export default" src/dashboard/src/pages/ --include="*.tsx"
```

**PASS 기준**: App.tsx 제외 모든 컴포넌트가 named export 사용
**FAIL 기준**: named export와 default export 혼용

### Step 4: TypeScript 엄격 모드 위반 검사

`any` 타입 사용, 타입 단언(as) 남용 확인:

```bash
# any 타입 사용
grep -rn ": any\|as any" src/dashboard/src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules\|__tests__"

# @ts-ignore 사용
grep -rn "@ts-ignore\|@ts-nocheck\|@ts-expect-error" src/dashboard/src/ --include="*.ts" --include="*.tsx"
```

**PASS 기준**: `any` 사용이 전체 코드의 5% 미만
**FAIL 기준**: `any`나 `@ts-ignore`의 과도한 사용

### Step 5: 결과 종합

## Output Format

```markdown
## 프레임워크 컨벤션 검증 결과

| 검사 항목 | 위반 수 | 상태 |
|-----------|---------|------|
| Import 패턴 (경로 별칭) | N | PASS/FAIL |
| Zustand 패턴 일관성 | N | PASS/FAIL |
| Named export 일관성 | N | PASS/FAIL |
| TypeScript 엄격성 | N any / N ignore | PASS/WARN |
```

## Exceptions

1. **App.tsx**: 루트 컴포넌트는 default export 허용
2. **테스트 파일**: `__tests__/` 내 파일은 any 사용 허용
3. **외부 라이브러리 타입**: 라이브러리 타입 정의가 불완전한 경우 as 사용 허용
4. **stores/index.ts**: barrel export 파일은 패턴 검사 제외
5. **vite-env.d.ts**: 환경 타입 정의 파일 제외
