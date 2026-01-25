# Skills Guide - Claude Code & Antigravity 완벽 가이드

> **최신 업데이트**: 2025-12-28 🤖
> **환경**: macOS with Antigravity AI IDE
> **대상**: Claude Code 초보자 ~ 중급자
> **🔄 자동 업데이트**: 30일마다 자동 실행 ✅

---

## 📚 가이드 구성

이 폴더는 Claude Code와 Antigravity AI IDE를 효과적으로 활용하기 위한 완벽한 가이드 모음입니다.

### 🌟 핵심 가이드

| 파일명 | 설명 | 난이도 |
|--------|------|--------|
| **Claude Code 완벽 가이드북 2025.md** | 가장 포괄적인 통합 가이드 | 초급~중급 |
| **Quick Reference.md** | 빠른 참조용 치트시트 | 모든 레벨 |
| **실전 예제.md** | 실무 적용 예제 모음 | 중급 |

### 🛠️ 시스템 구축 가이드

| 파일명 | 설명 |
|--------|------|
| **Skills 자동 활성화 시스템.md** | Skills 강제 활성화 Hook 시스템 구축 |
| **Dev Docs 시스템.md** | 대규모 작업용 3-파일 문서 시스템 |
| **PM2 백엔드 디버깅.md** | 마이크로서비스 관리 및 디버깅 |

### 📋 템플릿

| 파일명 | 설명 |
|--------|------|
| **CLAUDE.md 템플릿.md** | 프로젝트별 컨텍스트 파일 템플릿 |
| **프로젝트별 템플릿.md** | 웹/백엔드/ML/모바일 등 프로젝트 타입별 설정 |
| **Agent Skills 예시 모음.md** | 재사용 가능한 Skills 코드 모음 |

---

## 🚀 빠른 시작

### 1단계: 기본 이해
```bash
# 먼저 읽어야 할 순서
1. Claude Code 완벽 가이드북 2025.md  # 전체 개요
2. Quick Reference.md                  # 명령어 익히기
3. CLAUDE.md 템플릿.md                 # 첫 프로젝트 설정
```

### 2단계: 시스템 구축
```bash
# 필요에 따라 선택
- Skills 자동 활성화 시스템.md   # Skills 제대로 활용하기
- Dev Docs 시스템.md            # 대규모 작업 관리
- PM2 백엔드 디버깅.md          # 백엔드 개발자용
```

### 3단계: 실전 적용
```bash
# 실무 예제로 학습
- 실전 예제.md                  # 실제 워크플로우 익히기
- 프로젝트별 템플릿.md          # 프로젝트 타입별 설정
- Agent Skills 예시 모음.md     # 재사용 가능한 코드
```

---

## 💡 핵심 개념 요약

### Claude Code란?
- Anthropic의 AI 기반 개발 도구
- 2025년 12월 기준 최신 버전: v2.0.70+
- Agent Skills, Sub-agents, Hooks 등 강력한 기능 제공

### Antigravity IDE란?
- Google DeepMind의 차세대 AI 코딩 IDE
- Claude Code와 완벽하게 통합
- Advanced Agentic Coding 기능 탑재

### 필수 3대 시스템
1. **Skills 자동 활성화**: Hook으로 강제 활성화
2. **Dev Docs 3-파일**: plan.md, context.md, tasks.md
3. **PM2 백엔드 관리**: 마이크로서비스 통합 관리

---

## 🎯 학습 로드맵

### Week 1: 기초 다지기
- [ ] Claude Code 설치 및 설정
- [ ] 기본 명령어 익히기 (Quick Reference)
- [ ] 첫 CLAUDE.md 작성

### Week 2: Skills 마스터
- [ ] Agent Skills 이해
- [ ] skill-creator로 첫 Skill 생성
- [ ] Skills 자동 활성화 시스템 구축

### Week 3: Advanced 기능
- [ ] Sub-agents 활용
- [ ] Dev Docs 시스템 도입
- [ ] Hooks와 자동화 설정

### Week 4: 실전 프로젝트
- [ ] 실전 예제로 연습
- [ ] 본인 프로젝트에 적용
- [ ] 팀과 공유

---

## 🔄 자동 업데이트 시스템

### 개요
이 Skills Guide는 **30일마다 자동으로 업데이트**되어 항상 최신 기술 스택과 버전 정보를 유지합니다.

### 주요 기능
✅ **기술 스택 버전 검증** - package.json의 모든 패키지를 최신 버전과 비교
✅ **낙후 기술 감지** - 6개월 이상 업데이트 없는 패키지 자동 감지
✅ **문서 자동 갱신** - 마크다운 파일의 버전 정보 자동 업데이트
✅ **경고 추가** - 낙후된 기술에 대한 경고 및 대안 제시
✅ **보고서 생성** - 모든 변경 사항을 담은 상세 보고서 생성

### 수동 실행
```bash
# 일반 업데이트 (30일 경과 시에만 실행)
npm run skills:update

# 강제 업데이트 (30일 대기 무시)
npm run skills:update:force

# 검사만 실행 (변경 없이 상태만 확인)
npm run skills:check
```

### GitHub Actions
- **스케줄**: 매월 1일과 15일 오전 9시 (KST 18시)
- **워크플로우**: `.github/workflows/skills-guide-update.yml`
- **수동 실행**: GitHub Actions 탭에서 "Run workflow" 버튼

### 설정 파일
- `.update-config.json` - 업데이트 설정 및 규칙
- `.last-update.json` - 마지막 업데이트 타임스탬프 (자동 생성)

📊 **최신 업데이트 보고서**: [LIVEMETRO_UPDATE_REPORT.md](./LIVEMETRO_UPDATE_REPORT.md)

---

## 🔥 자주 묻는 질문

### Q: 처음 시작하는데 어디서부터?
**A**: `Claude Code 완벽 가이드북 2025.md` → `Quick Reference.md` 순서로 읽으세요.

### Q: Skills를 만들었는데 Claude가 안 써요
**A**: `Skills 자동 활성화 시스템.md`를 보고 Hook 시스템을 구축하세요. 이게 핵심입니다!

### Q: 대규모 작업시 Claude가 길을 잃어요
**A**: `Dev Docs 시스템.md`의 3-파일 시스템을 도입하세요. Claude의 기억을 보완합니다.

### Q: 백엔드 서비스가 여러 개인데 관리가 힘들어요
**A**: `PM2 백엔드 디버깅.md`를 참고하여 PM2로 통합 관리하세요.

---

## 📊 환경 요구사항

### 필수
- macOS (Intel 또는 Apple Silicon)
- Node.js v18 이상
- Git
- Antigravity AI IDE 또는 VS Code

### 권장
- Claude Code CLI v2.0.70+
- TypeScript ^5.1.3+
- Next.js 16 (웹 개발시)
- Docker (백엔드 개발시)

---

## 🔗 유용한 링크

### 공식 문서
- [Claude Code 공식 문서](https://docs.claude.com/en/docs/claude-code)
- [Agent Skills 가이드](https://docs.claude.com/en/docs/claude-code/skills)
- [Sub-agents 문서](https://docs.claude.com/en/docs/claude-code/sub-agents)

### 커뮤니티
- [Claude Developers Discord](https://discord.gg/anthropic)
- [Awesome Claude Code](https://github.com/hesreallyhim/awesome-claude-code)
- [ClaudeLog Community](https://claudelog.com/)

---

## 📝 기여 및 피드백

이 가이드는 실전 경험을 바탕으로 지속적으로 업데이트됩니다.
- 오류 발견시: Issues 등록
- 개선 제안: Pull Request 환영
- 추가 예제: 공유 환영

---

## 📜 라이선스

이 가이드는 학습 및 참고 목적으로 자유롭게 사용 가능합니다.

---

**Happy Coding with Claude & Antigravity! 🚀**

*마지막 수동 업데이트: 2025-12-28*
*자동 업데이트 시스템: 활성화 ✅*
*다음 예정 업데이트: 2025-01-28 (30일 후)*
*환경: macOS + Antigravity AI IDE*

#claude-code #antigravity #ai-coding #guide #macos #auto-update
