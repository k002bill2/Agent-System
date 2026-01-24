# React Web Specific Checklist

## useEffect 패턴
- [ ] Cleanup 함수 반환 (구독, 타이머, AbortController 등)
- [ ] 의존성 배열 정확히 설정
- [ ] 빈 의존성 배열 사용 시 주의 (마운트 시 1회만 실행)
- [ ] mounted 플래그로 언마운트 후 상태 업데이트 방지

## 상태 관리
- [ ] Zustand 스토어 적절히 분리
- [ ] 불필요한 리렌더링 방지 (selector 사용)
- [ ] 상태 정규화

## 라우팅 (React Router)
- [ ] 타입 안전한 파라미터 (useParams)
- [ ] 라우트 가드 설정 (인증 체크)
- [ ] 404 페이지 처리
- [ ] 브라우저 뒤로가기 처리

## 리스트 최적화
- [ ] 대규모 리스트: @tanstack/react-virtual 사용
- [ ] key prop 올바르게 설정 (고유 ID 사용)
- [ ] 무한 스크롤 구현 시 intersection observer 사용
- [ ] 페이지네이션 고려

## 이미지 최적화
- [ ] 적절한 크기 사용 (srcset, sizes)
- [ ] loading="lazy" 설정
- [ ] 이미지 포맷 최적화 (WebP, AVIF)
- [ ] alt 텍스트 제공

## 반응형 디자인
- [ ] Tailwind 반응형 프리픽스 사용 (sm:, md:, lg:, xl:)
- [ ] 모바일 퍼스트 접근
- [ ] 터치 타겟 크기 확인 (최소 44x44px)
- [ ] 가로/세로 모드 대응

## Vite 특화
- [ ] 환경 변수 import.meta.env 사용
- [ ] 코드 스플리팅 (React.lazy, Suspense)
- [ ] HMR 활용
- [ ] 빌드 최적화 확인

## 성능
- [ ] React.memo 적절히 사용
- [ ] useMemo/useCallback 적절히 사용
- [ ] Bundle 사이즈 확인 (vite-plugin-inspect)
- [ ] Core Web Vitals 확인 (LCP, FID, CLS)

## 접근성 (a11y)
- [ ] 시맨틱 HTML 사용 (button, nav, main, section)
- [ ] aria-label 설정
- [ ] 키보드 네비게이션 지원
- [ ] 색상 대비 확인 (WCAG 2.1 AA)
- [ ] 포커스 표시자 유지

## 디버깅
- [ ] React DevTools 활용
- [ ] Network 탭 확인
- [ ] Performance 탭 프로파일링
- [ ] Lighthouse 점수 확인

## 브라우저 호환성
- [ ] Chrome/Edge 테스트
- [ ] Firefox 테스트
- [ ] Safari 테스트
- [ ] 모바일 브라우저 테스트
