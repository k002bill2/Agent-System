# Testing Checklist

## 단위 테스트
- [ ] 컴포넌트 렌더링 테스트
- [ ] 훅 동작 테스트
- [ ] 서비스 함수 테스트
- [ ] 유틸리티 함수 테스트

## 커버리지 확인
- [ ] Statements ≥ 75%
- [ ] Functions ≥ 70%
- [ ] Branches ≥ 60%

## 모킹
- [ ] Firebase 서비스 모킹
- [ ] Seoul API 응답 모킹
- [ ] AsyncStorage 모킹
- [ ] Navigation 모킹

## 엣지 케이스
- [ ] 빈 데이터 처리
- [ ] 로딩 상태 테스트
- [ ] 에러 상태 테스트
- [ ] 네트워크 오프라인 테스트

## 스냅샷 테스트
- [ ] 주요 컴포넌트 스냅샷
- [ ] 테마 변경 시 스냅샷

## 통합 테스트
- [ ] 화면 간 네비게이션
- [ ] 폼 제출 플로우
- [ ] 데이터 동기화

## 실행 확인
```bash
# 전체 테스트
npm test

# 커버리지 포함
npm test -- --coverage

# 특정 파일
npm test -- MyComponent.test.tsx
```
