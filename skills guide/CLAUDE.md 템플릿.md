# CLAUDE.md 템플릿
#template #claude-code #project-setup

## 개요
이 문서는 Claude Code가 프로젝트를 이해하고 효과적으로 작업할 수 있도록 돕는 핵심 문서입니다. 프로젝트 루트에 `CLAUDE.md` 파일로 저장하세요.

---

```markdown
# Project Context for Claude Code

## 🎯 Project Overview
- **Name**: [프로젝트 이름]
- **Purpose**: [프로젝트의 주요 목적과 목표]
- **Tech Stack**: 
  - Frontend: [React, Vue, Next.js 등]
  - Backend: [Node.js, Python, Go 등]
  - Database: [PostgreSQL, MongoDB 등]
  - Infrastructure: [AWS, Docker, Kubernetes 등]
- **Current Phase**: [개발/테스트/배포 단계]
- **Team Size**: [혼자/팀 규모]

## 📁 Project Structure
\`\`\`
project-root/
├── src/                 # 소스 코드
│   ├── components/     # UI 컴포넌트
│   ├── services/       # 비즈니스 로직
│   ├── utils/          # 유틸리티 함수
│   └── types/          # TypeScript 타입 정의
├── tests/              # 테스트 파일
│   ├── unit/          # 단위 테스트
│   └── e2e/           # E2E 테스트
├── docs/              # 문서
├── scripts/           # 빌드/배포 스크립트
└── config/            # 설정 파일
\`\`\`

## 🛠️ Development Guidelines

### Code Style
- **Language**: [JavaScript/TypeScript/Python]
- **Style Guide**: [ESLint/Prettier/Black 설정]
- **Linting**: \`npm run lint\` 또는 \`pylint\`
- **Formatting**: \`npm run format\` 또는 \`black .\`

### Naming Conventions
- **Functions**: camelCase (예: getUserData)
- **Classes**: PascalCase (예: UserService)
- **Constants**: UPPER_SNAKE_CASE (예: MAX_RETRY_COUNT)
- **Files**: 
  - Components: PascalCase.tsx
  - Utilities: camelCase.ts
  - Tests: *.test.ts 또는 *.spec.ts

### Git Workflow
- **Branch Naming**:
  - feature/[feature-name]
  - bugfix/[bug-description]
  - hotfix/[issue-number]
  - release/[version]
  
- **Commit Format**:
  \`\`\`
  [type]: [description]
  
  Types:
  - feat: 새로운 기능
  - fix: 버그 수정
  - docs: 문서 수정
  - style: 코드 포맷팅
  - refactor: 코드 리팩토링
  - test: 테스트 추가
  - chore: 빌드 관련 수정
  \`\`\`

### Testing Requirements
- **Unit Test Coverage**: 최소 80%
- **Test Framework**: [Jest/Pytest/Go test]
- **E2E Tests**: 핵심 사용자 플로우 필수
- **Test Command**: \`npm test\` 또는 \`pytest\`

## ⚡ Common Tasks

### Task 1: Add New Feature
1. Create feature branch from main
2. Implement feature in src/
3. Write unit tests (min 80% coverage)
4. Add integration tests if needed
5. Update documentation
6. Run linter and formatter
7. Create pull request with description

### Task 2: Fix Bug
1. Create bugfix branch
2. Write failing test that reproduces the bug
3. Implement fix
4. Verify all tests pass
5. Update changelog
6. Create PR with issue reference

### Task 3: Code Review
1. Check code quality and readability
2. Verify test coverage
3. Review security implications
4. Check performance impact
5. Validate documentation updates

### Task 4: Deploy
1. Run all tests
2. Build production bundle
3. Update version number
4. Generate release notes
5. Deploy to staging
6. Run smoke tests
7. Deploy to production

## 🔒 Security & Permissions

### Protected Files
- **Never Modify**:
  - .env.production
  - secrets/
  - certificates/
  
### Sensitive Operations
- **Always Test Before**:
  - Database migrations
  - API schema changes
  - Authentication changes
  - Payment processing

### Required Reviews
- Security-related changes
- Database schema modifications
- API breaking changes
- Infrastructure updates

## 🎨 Output Styles

### Error Handling
\`\`\`typescript
try {
  // Operation
} catch (error) {
  logger.error('Descriptive error message', {
    error,
    context: relevantData
  });
  // Handle gracefully
}
\`\`\`

### Logging
- Use structured logging
- Include context and metadata
- Follow log levels: ERROR, WARN, INFO, DEBUG

### Comments
- JSDoc for all public functions
- Inline comments for complex logic
- TODO comments with assignee and date

## 📊 Performance Guidelines

### Frontend
- Bundle size < 200KB (gzipped)
- First Contentful Paint < 1.5s
- Time to Interactive < 3s
- Lighthouse score > 90

### Backend
- API response time < 200ms (p95)
- Database query time < 50ms
- Memory usage < 512MB
- CPU usage < 70%

## 🔄 CI/CD Pipeline

### Stages
1. **Lint & Format Check**
2. **Unit Tests**
3. **Integration Tests**
4. **Build**
5. **Security Scan**
6. **Deploy to Staging**
7. **E2E Tests**
8. **Deploy to Production**

### Deployment Environments
- **Development**: auto-deploy from develop branch
- **Staging**: auto-deploy from main branch
- **Production**: manual approval required

## 📝 Important Notes

### Current Challenges
- [현재 직면한 기술적 과제]
- [알려진 버그나 이슈]
- [성능 병목 지점]

### Technical Debt
- [리팩토링이 필요한 부분]
- [레거시 코드 위치]
- [업데이트 필요한 의존성]

### Future Considerations
- [계획된 주요 기능]
- [아키텍처 변경 사항]
- [확장성 고려사항]

## 🔗 Resources

### Internal Documentation
- [API Documentation](./docs/api.md)
- [Architecture Guide](./docs/architecture.md)
- [Database Schema](./docs/database.md)

### External Resources
- [Design System]()
- [API Documentation]()
- [Deployment Guide]()

## 👥 Contacts

- **Project Lead**: [이름/연락처]
- **Tech Lead**: [이름/연락처]
- **DevOps**: [이름/연락처]

---

*Last Updated: [날짜]*
*Version: 1.0.0*
\`\`\`

---

## 사용 가이드

### 1. 필수 섹션
- Project Overview
- Project Structure
- Development Guidelines
- Common Tasks

### 2. 프로젝트별 커스터마이징
- 기술 스택에 맞게 수정
- 팀 규칙 반영
- 실제 디렉토리 구조 업데이트

### 3. 유지보수
- 주요 변경사항 발생시 업데이트
- 버전 관리
- 팀과 공유

### 4. 효과적인 활용
- Claude Code 세션 시작시 자동 로드
- 일관된 코드 스타일 유지
- 빠른 온보딩 지원

---

*태그: #template #claude-code #project-setup #documentation #antigravity*