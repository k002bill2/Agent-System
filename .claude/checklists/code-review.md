# Code Review Checklist

## TypeScript 품질
- [ ] `any` 타입 사용 없음
- [ ] 명시적 반환 타입 정의
- [ ] Props 인터페이스 정의
- [ ] 적절한 타입 가드 사용

## React Native 패턴
- [ ] useEffect에 cleanup 함수 존재
- [ ] 구독/타이머 정리 완료
- [ ] 메모리 누수 방지 (mounted 플래그)
- [ ] 적절한 useMemo/useCallback 사용

## 에러 처리
- [ ] try-catch 블록 적절히 사용
- [ ] 에러 시 빈 배열/null 반환
- [ ] Sentry 에러 리포팅 연동
- [ ] 사용자 친화적 에러 메시지

## 코드 품질
- [ ] console.log 제거
- [ ] 주석 불필요한 코드 제거
- [ ] 함수 길이 50줄 이하
- [ ] 중복 코드 없음

## 네비게이션
- [ ] 타입 안전한 파라미터 전달
- [ ] 뒤로가기 처리 확인
- [ ] 딥링크 지원 확인

## 성능
- [ ] 불필요한 리렌더링 방지
- [ ] 큰 리스트 FlatList 사용
- [ ] 이미지 최적화

## 접근성
- [ ] accessibilityLabel 설정
- [ ] 터치 영역 44x44 이상
- [ ] 색상 대비 충분
