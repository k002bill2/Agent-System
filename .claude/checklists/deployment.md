# Deployment Checklist

## 사전 검증
- [ ] `npm run type-check` 통과
- [ ] `npm run lint` 통과
- [ ] `npm test` 모든 테스트 통과
- [ ] 커버리지 임계값 충족

## 환경 설정
- [ ] `.env` 파일 프로덕션 값 확인
- [ ] Firebase 프로덕션 프로젝트 연결
- [ ] API 키 프로덕션 키 사용

## app.json 확인
- [ ] 버전 번호 업데이트
- [ ] 빌드 번호 증가
- [ ] 번들 ID 확인
- [ ] 권한 설정 확인

## EAS 빌드
- [ ] `eas.json` 프로파일 확인
- [ ] 프로덕션 프로파일 선택
- [ ] iOS/Android 모두 빌드

## 배포 후 확인
- [ ] 앱 설치 및 실행
- [ ] 로그인 플로우 테스트
- [ ] 핵심 기능 동작 확인
- [ ] Sentry 에러 모니터링

## 롤백 계획
- [ ] 이전 버전 백업 확인
- [ ] 롤백 절차 문서화
- [ ] 긴급 연락처 확보

## 명령어
```bash
# Preview 빌드
eas build --profile preview --platform all

# Production 빌드
eas build --profile production --platform all

# 제출
eas submit --platform all
```
