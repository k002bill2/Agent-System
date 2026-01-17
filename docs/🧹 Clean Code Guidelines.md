

## 🧭 Core Principles

- **DRY** — 중복 제거
- **KISS** — 단순하게 유지
- **YAGNI** — 지금 필요한 것만 구현
- **SOLID** — 객체지향 설계 5대 원칙 준수
- **Boy Scout Rule** — 기존 코드보다 깨끗하게 남기기

***

## 🏷 Naming Conventions

- 의도를 드러내는 이름 사용
- 약어는 일반적 약칭(API, URL 등)만 허용
- **클래스** → 명사
- **메서드** → 동사
- **불린값** → `is / has / can` 접두어
- 상수 → `UPPER_SNAKE_CASE`
- 매직 넘버 금지 (명명된 상수 사용)

***

## ⚙️ Functions \& Methods

- 단일 책임 원칙
- 10~20줄 이하 유지
- 파라미터 최대 3개까지
- 부작용 없는 순수 함수 유지
- 중첩보다 *early return* 선호

***

## 🧩 Code Structure

- **Cyclomatic complexity** < 10
- 중첩 깊이 ≤ 3
- 기능 단위로 디렉토리 구성
- 의존성은 안쪽(도메인)으로 향해야 함
- 인터페이스 사용, 구현 의존 최소화

***

## 🗒 Comments \& Documentation

- 코드 자체로 의도 드러내기
- 주석은 *왜(Why)* 를 설명
- 코드 변경 시 주석 동기화
- 주석 처리된 코드는 즉시 삭제
- 외부 공개 API는 문서화 필수

***

## 🚨 Error Handling

- 명확한 메시지로 빠르게 실패
- 오류코드 대신 예외(Exception) 사용
- 적합한 계층에서 에러 처리
- `catch(Exception e)`와 같은 포괄 예외 금지
- 로그에 충분한 문맥 정보 포함

***

## 🧪 Testing

- TDD 지향
- 구현이 아닌 **행동(Behavior)** 테스트
- 테스트당 한 개의 assert
- 테스트 이름: `should_X_when_Y`
- **AAA 패턴** (Arrange / Act / Assert) 적용
- 테스트 커버리지 80% 이상 유지

***

## ⚡ Performance \& Optimization

- 프로파일링 후 최적화
- 알고리즘 우선 최적화
- 비용이 큰 연산은 캐싱
- Lazy Loading 적용
- 조기 최적화 금지

***

## 🔒 Security

- 사용자 입력 절대 신뢰 금지
- 입력값 검증 및 세정 필수
- SQL은 반드시 파라미터 바인딩
- 최소 권한 원칙 적용
- 의존성 최신 버전 유지
- 비밀 정보는 코드 내에 금지

***

## 🌿 Version Control

- 커밋은 **하나의 논리 단위로 원자적**
- 커밋 메시지: 명령형으로 작성
- 이슈 번호 포함
- 브랜치 네이밍: `type/description`
- Merge 전 Rebase 필수

***

## 🔍 Code Reviews

- 정확성 우선 리뷰
- 엣지 케이스 확인
- 이름 명확성 검토
- 스타일 일관성 유지
- 피드백은 건설적, 구체적으로 제시

***

## ♻️ Refactoring Triggers

- 중복 코드
- 지나치게 긴 메서드/클래스
- Feature Envy / Data Clumps
- Divergent Change / Shotgun Surgery

***

## ✅ Final Checklist

- [ ] 모든 테스트 통과
- [ ] 린트 에러 없음
- [ ] 콘솔 로그 없음
- [ ] 주석 처리 코드 제거
- [ ] 티켓 없는 TODO 제거
- [ ] 성능 검토 완료
- [ ] 보안 점검 완료
- [ ] 문서 최신화 완료

***

> 💡 **핵심 철학:**
> 깨끗한 코드는 잘 쓰인 글처럼 읽혀야 한다.
> **가독성 > cleverness.**

***
