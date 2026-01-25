# Skills Guide 자동 업데이트 시스템 사용 가이드

> **버전**: 1.0.0
> **최종 업데이트**: 2025-12-28
> **작성자**: LiveMetro Team

---

## 📋 목차

1. [개요](#개요)
2. [시스템 구조](#시스템-구조)
3. [사용 방법](#사용-방법)
4. [설정 커스터마이징](#설정-커스터마이징)
5. [문제 해결](#문제-해결)
6. [고급 기능](#고급-기능)

---

## 개요

### 무엇을 하는가?

Skills Guide 자동 업데이트 시스템은 **30일마다 자동으로** 다음 작업을 수행합니다:

✅ **기술 스택 검증**
- package.json의 모든 의존성 버전을 npm registry와 비교
- 최신 버전이 있는지 확인
- 낙후된 패키지 자동 감지 (6개월+ 업데이트 없음)

✅ **문서 자동 갱신**
- 마크다운 파일의 버전 정보 자동 업데이트
- 작성 날짜 갱신
- 낙후된 기술에 대한 경고 추가

✅ **보고서 생성**
- 모든 변경 사항을 담은 상세 보고서 작성
- 업데이트 가능한 패키지 목록 제공
- 권장 사항 제시

### 왜 필요한가?

1. **문서 신뢰성** - 항상 최신 기술 스택 정보 유지
2. **낙후 방지** - 오래된 기술 조기 발견
3. **자동화** - 수동 업데이트 불필요
4. **일관성** - 모든 문서의 버전 정보 동기화

---

## 시스템 구조

```
liveMetro/
├── scripts/
│   └── skillsGuideUpdater.ts        # 메인 업데이트 스크립트
│
├── .github/
│   └── workflows/
│       └── skills-guide-update.yml  # GitHub Actions 워크플로우
│
├── skills guide/
│   ├── .update-config.json          # 설정 파일
│   ├── .last-update.json            # 마지막 업데이트 타임스탬프 (자동 생성)
│   ├── LIVEMETRO_UPDATE_REPORT.md   # 최신 업데이트 보고서
│   └── *.md                         # 업데이트 대상 문서들
│
└── package.json                     # npm 스크립트 정의
```

### 핵심 컴포넌트

| 파일 | 역할 |
|------|------|
| `skillsGuideUpdater.ts` | 버전 검증, 문서 업데이트, 보고서 생성 |
| `skills-guide-update.yml` | 30일 자동 실행 스케줄링 |
| `.update-config.json` | 업데이트 규칙 및 제외 패키지 설정 |
| `LIVEMETRO_UPDATE_REPORT.md` | 업데이트 내역 보고서 |

---

## 사용 방법

### 1. 자동 실행 (기본)

GitHub Actions가 **매월 1일과 15일 오전 9시 (KST 18시)**에 자동으로 실행합니다.

**아무것도 하지 않아도 됩니다!** 🎉

### 2. 수동 실행

#### 2.1 로컬에서 실행

```bash
# 30일 경과 시에만 실행
npm run skills:update

# 강제 실행 (30일 대기 무시)
npm run skills:update:force

# 검사만 실행 (변경 없이 상태만 확인)
npm run skills:check
```

#### 2.2 GitHub Actions에서 수동 실행

1. GitHub 저장소로 이동
2. **Actions** 탭 클릭
3. **Skills Guide Auto-Update** 워크플로우 선택
4. **Run workflow** 버튼 클릭
5. 강제 업데이트 여부 선택 (옵션)
6. **Run workflow** 확인

### 3. 실행 결과 확인

#### 로컬 실행 시

터미널에 실시간 로그가 출력됩니다:

```
🚀 LiveMetro Skills Guide Auto-Updater
==================================================

📋 첫 업데이트입니다.
📦 현재 기술 스택 추출 중...
  총 50개의 패키지 발견

🔍 기술 스택 검증 중...
  검사 중: React Native
    ✅ 최신 상태
  검사 중: @expo/vector-icons
    🆕 새 버전 사용 가능: 15.0.3
  검사 중: @types/react-native
    ⚠️  낙후된 패키지: @types/react-native

📝 문서 업데이트 중...
  ✅ Claude Code 완벽 가이드북 2025.md 업데이트됨
  ⏭️  Quick Reference.md (변경 없음)

📄 보고서 생성 완료
✨ 업데이트 완료!
```

#### GitHub Actions 실행 시

1. Actions 탭에서 워크플로우 실행 상태 확인
2. Summary 섹션에서 전체 보고서 확인
3. 변경된 파일은 자동으로 커밋됨

### 4. 업데이트 보고서 확인

최신 보고서는 항상 `skills guide/LIVEMETRO_UPDATE_REPORT.md`에 저장됩니다.

**보고서 내용**:
- 📊 기술 스택 현황 (Core, Dependencies, DevDependencies)
- 🔄 업데이트된 파일 목록
- ⚠️ 낙후된 기술 경고
- 📝 권장 사항
- 🔧 다음 업데이트 예정일

---

## 설정 커스터마이징

### `.update-config.json` 편집

설정 파일을 수정하여 업데이트 동작을 커스터마이즈할 수 있습니다.

#### 업데이트 주기 변경

```json
{
  "updateSettings": {
    "intervalDays": 15,  // 30일 → 15일로 변경
    "autoCommit": true,
    "generateReport": true
  }
}
```

#### 특정 패키지 제외

```json
{
  "ignoredPackages": [
    "@types/*",           // 모든 @types 패키지 제외
    "expo-*",             // 모든 expo-* 패키지 제외
    "my-custom-package"   // 특정 패키지 제외
  ]
}
```

#### 낙후 기준 변경

```json
{
  "deprecationThresholds": {
    "critical": 12,  // 12개월 이상 → 심각
    "warning": 6,    // 6개월 이상 → 경고
    "info": 3        // 3개월 이상 → 정보
  }
}
```

#### 버전 패턴 추가

특정 기술의 버전을 추적하려면 패턴을 정의하세요:

```json
{
  "versionPatterns": {
    "react-native": "React Native ([\\d.]+)",
    "next.js": "Next\\.js ([\\d.]+)",
    "your-tech": "Your Tech ([\\d.]+)"
  }
}
```

#### 대체 패키지 정의

낙후된 패키지의 대안을 정의할 수 있습니다:

```json
{
  "alternatives": {
    "moment": {
      "reason": "더 이상 활발히 유지보수되지 않음",
      "alternatives": ["date-fns", "dayjs", "luxon"],
      "recommended": "date-fns"
    },
    "old-package": {
      "reason": "보안 취약점 발견",
      "alternatives": ["new-package"],
      "recommended": "new-package"
    }
  }
}
```

### GitHub Actions 스케줄 변경

`.github/workflows/skills-guide-update.yml` 파일에서 cron 표현식을 수정하세요:

```yaml
on:
  schedule:
    # 매주 월요일 오전 9시
    - cron: '0 9 * * 1'

    # 또는 매일 오전 2시
    - cron: '0 2 * * *'

    # 또는 매월 1일 오전 9시
    - cron: '0 9 1 * *'
```

**Cron 문법**: `분 시 일 월 요일`

---

## 문제 해결

### 문제: "30일이 지나지 않았습니다" 에러

**원인**: `.last-update.json`에 기록된 마지막 업데이트 날짜로부터 30일이 지나지 않음

**해결책**:
```bash
# 강제 실행
npm run skills:update:force

# 또는 .last-update.json 삭제
rm "skills guide/.last-update.json"
npm run skills:update
```

### 문제: TypeScript 컴파일 에러

**원인**: ts-node 또는 TypeScript 설치 문제

**해결책**:
```bash
# 의존성 재설치
npm install --save-dev ts-node @types/node typescript

# 캐시 클리어
npm cache clean --force
npm install
```

### 문제: npm view 명령 실패

**원인**: 네트워크 문제 또는 패키지 이름 오류

**해결책**:
```bash
# npm registry 연결 확인
npm ping

# 프록시 설정 확인
npm config get proxy
npm config get https-proxy

# registry URL 확인
npm config get registry
```

### 문제: GitHub Actions에서 실행 실패

**원인**: 권한 문제 또는 워크플로우 설정 오류

**해결책**:
1. Settings → Actions → General 확인
2. "Workflow permissions"을 "Read and write permissions"로 설정
3. 워크플로우 파일의 `permissions` 섹션 확인:
   ```yaml
   permissions:
     contents: write
   ```

### 문제: 보고서가 생성되지 않음

**원인**: 파일 경로 오류 또는 권한 문제

**해결책**:
```bash
# 디렉토리 존재 확인
ls "skills guide/"

# 권한 확인
ls -la "skills guide/"

# 수동으로 보고서 파일 생성
touch "skills guide/LIVEMETRO_UPDATE_REPORT.md"
```

---

## 고급 기능

### 1. 커스텀 체크 추가

특정 기술의 최소 버전을 강제할 수 있습니다:

```json
{
  "customChecks": [
    {
      "name": "React Native",
      "minVersion": "0.70.0",
      "reason": "Expo 49 호환성"
    },
    {
      "name": "TypeScript",
      "minVersion": "5.0.0",
      "reason": "최신 타입 기능 사용"
    }
  ]
}
```

이 설정은 해당 패키지가 최소 버전 이하일 경우 경고를 표시합니다.

### 2. 우선순위 파일 설정

특정 파일을 우선적으로 업데이트할 수 있습니다:

```json
{
  "priorityFiles": [
    "Claude Code 완벽 가이드북 2025.md",
    "Quick Reference.md",
    "README.md"
  ]
}
```

### 3. 알림 통합

GitHub Actions에서 Slack이나 Discord로 알림을 보내도록 설정할 수 있습니다:

```yaml
# .github/workflows/skills-guide-update.yml에 추가

- name: 🚨 Slack 알림
  if: success()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    text: 'Skills Guide가 업데이트되었습니다!'
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

### 4. 검사 전용 모드

변경을 적용하지 않고 상태만 확인하려면:

```typescript
// skillsGuideUpdater.ts에 --check-only 옵션 추가 구현
if (process.argv.includes('--check-only')) {
  // 검사만 수행하고 파일 변경 없음
  console.log('검사 전용 모드: 파일을 변경하지 않습니다');
}
```

### 5. 버전 비교 로직 커스터마이즈

semver를 사용한 고급 버전 비교:

```bash
# semver 패키지 설치
npm install --save-dev semver @types/semver
```

```typescript
import semver from 'semver';

function compareVersions(current: string, latest: string): boolean {
  const cleanCurrent = current.replace(/[~^]/g, '');
  return semver.lt(cleanCurrent, latest);
}
```

---

## 베스트 프랙티스

### ✅ 권장 사항

1. **자동 실행 활성화** - GitHub Actions를 활용한 자동화
2. **주기적 확인** - 보고서를 정기적으로 검토
3. **낙후 패키지 대응** - 경고가 나오면 빠르게 조치
4. **설정 버전 관리** - `.update-config.json`을 Git으로 추적
5. **테스트 후 배포** - 로컬에서 먼저 테스트 후 자동화 활성화

### ⚠️ 주의 사항

1. **Major 버전 업데이트** - 자동 적용하지 말고 수동 검토
2. **Expo SDK 버전** - Expo 버전과 호환성 확인 필요
3. **타입 정의 패키지** - @types/* 패키지는 메인 패키지와 동기화
4. **설정 백업** - `.update-config.json` 변경 시 백업
5. **Git 커밋 메시지** - 자동 커밋 메시지 커스터마이즈 고려

---

## FAQ

### Q1: 30일이 아닌 다른 주기로 설정할 수 있나요?

**A**: 네! `.update-config.json`의 `intervalDays`와 `.github/workflows/skills-guide-update.yml`의 cron 스케줄을 모두 변경하세요.

### Q2: 특정 파일만 업데이트 제외할 수 있나요?

**A**: 네! `.update-config.json`의 `excludePatterns`에 파일명 패턴을 추가하세요:
```json
{
  "excludePatterns": [
    "DO_NOT_UPDATE.md",
    "Archive/*.md"
  ]
}
```

### Q3: 낙후된 패키지를 자동으로 업데이트할 수 있나요?

**A**: 현재는 경고만 표시합니다. 자동 업데이트는 안전성을 위해 의도적으로 구현하지 않았습니다. 수동으로 검토 후 업데이트하세요.

### Q4: 다른 프로젝트에도 적용할 수 있나요?

**A**: 네! `scripts/skillsGuideUpdater.ts`를 복사하고 설정 파일의 경로만 수정하면 됩니다.

### Q5: 보고서를 다른 형식으로 받을 수 있나요?

**A**: `generateUpdateReport()` 함수를 수정하여 JSON, HTML, PDF 등으로 출력할 수 있습니다.

---

## 기여 가이드

시스템 개선에 기여하고 싶으신가요?

1. **이슈 제보**: 버그나 개선 사항 제안
2. **PR 제출**: 새로운 기능이나 수정사항
3. **문서 개선**: 이 가이드의 오류 수정이나 추가 설명

**주요 개선 아이디어**:
- [ ] 다른 언어 생태계 지원 (Python, Ruby, etc.)
- [ ] 대시보드 UI 추가
- [ ] 이메일 알림 기능
- [ ] 버전 업데이트 자동 PR 생성
- [ ] AI 기반 Breaking Changes 감지

---

## 라이선스

이 자동 업데이트 시스템은 LiveMetro 프로젝트의 일부로 MIT 라이선스를 따릅니다.

---

**Happy Automating! 🤖✨**

*최종 업데이트: 2025-12-28*
*버전: 1.0.0*

#automation #skills-guide #version-management #best-practices
