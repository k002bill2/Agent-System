# React Native Specific Checklist

## useEffect 패턴
- [ ] Cleanup 함수 반환
- [ ] 의존성 배열 정확히 설정
- [ ] 빈 의존성 배열 사용 시 주의 (마운트 시 1회만 실행)
- [ ] mounted 플래그로 언마운트 후 상태 업데이트 방지

## 상태 관리
- [ ] Context API 적절히 분리
- [ ] 불필요한 리렌더링 방지
- [ ] 상태 정규화

## 네비게이션
- [ ] 타입 안전한 파라미터
- [ ] Screen options 적절히 설정
- [ ] 하드웨어 뒤로가기 처리 (Android)
- [ ] Deep linking 지원

## 리스트 최적화
- [ ] FlatList 사용 (ScrollView 대신)
- [ ] keyExtractor 설정
- [ ] getItemLayout 설정 (가능한 경우)
- [ ] initialNumToRender 적절히 설정

## 이미지 최적화
- [ ] 적절한 크기 사용
- [ ] resizeMode 설정
- [ ] 캐싱 활용

## 플랫폼 대응
- [ ] Platform.select 사용
- [ ] iOS/Android 스타일 차이 확인
- [ ] SafeAreaView 적용

## Expo 특화
- [ ] expo-constants 활용
- [ ] expo-updates 설정
- [ ] 권한 요청 적절히 처리

## 성능
- [ ] InteractionManager 사용 (무거운 작업)
- [ ] useMemo/useCallback 적절히 사용
- [ ] Hermes 엔진 활성화 확인

## 디버깅
- [ ] React DevTools 활용
- [ ] Flipper 연동
- [ ] 성능 모니터 확인
