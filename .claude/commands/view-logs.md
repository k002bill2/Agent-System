---
description: Metro 번들러 또는 Expo 로그 분석
---

# View Logs

Metro 번들러 로그, Expo 로그, 또는 앱 로그를 분석합니다.

## 실행 단계

### 1. 로그 타입 확인

사용자에게 분석할 로그 타입 확인:
- **metro**: Metro 번들러 로그
- **expo**: Expo CLI 로그
- **crash**: 크래시 리포트 (Sentry)
- **test**: Jest 테스트 로그

### 2. 로그 수집

#### Metro 로그
```bash
# 최근 Metro 로그 확인
cat ~/.expo/metro-*.log 2>/dev/null | tail -100
```

#### Expo 로그
```bash
# Expo dev server 로그
npx expo start --log
```

#### 테스트 로그
```bash
# Jest 상세 로그
npm test -- --verbose 2>&1 | tail -200
```

### 3. 에러 패턴 분석

다음 패턴을 찾아서 분석:
- `ERROR` 또는 `Error:`
- `Warning:`
- `Failed to`
- `Cannot find`
- `Module not found`
- `Type error`

### 4. 결과 요약

발견된 이슈를 카테고리별로 정리:
- **Errors**: 심각한 오류
- **Warnings**: 경고
- **Deprecations**: 폐기 예정 API

### 5. 해결 제안

각 이슈에 대한 해결 방안 제안.

## 출력 형식

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 LOG ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Summary:
- Errors: 2
- Warnings: 5
- Deprecations: 1

🔴 Errors:
1. [Line 45] Module not found: @utils/helper
   → Check import path alias configuration

2. [Line 123] Type error: Property 'x' does not exist
   → Add missing type definition

🟡 Warnings:
1. Async operation without cleanup in useEffect
   → Add cleanup function

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
