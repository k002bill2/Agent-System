# External LLM Usage Monitoring — Design Document

**Date:** 2026-02-19
**Status:** Approved
**Approach:** A (개인 키 + 하이브리드 수집)

---

## 1. 목적

조직 팀원들이 OpenAI(Codex), Google Gemini, Anthropic Claude를 사용할 때
토큰 사용량과 비용을 관리자가 사용자별로 모니터링할 수 있게 한다.
사용자는 자신의 LLM API Key를 직접 등록하며, 관리자는 집계된 사용량을 조회한다.

---

## 2. 아키텍처

```
사용자                      AOS Backend                  LLM Provider
────────                    ───────────                  ────────────
[My LLM Accounts]           [Credential Vault]
  └─ API Key 등록  ──▶        (DB 암호화 저장)

[외부 도구 사용]    ──폴링── [Usage Poller]    ──▶   OpenAI Usage API
(Cursor 등)          주기적                          Anthropic Admin API
                             │                        (Gemini: 불가)

[AOS Proxy 호출]    ──▶     [LLM Proxy]       ──▶   OpenAI / Gemini / Claude
                             │ 실시간 기록             (사용자 키 사용)
                             ▼
관리자 대시보드    ◀──     [Usage Aggregator]
(ExternalUsagePage)          (per-user 집계)
```

---

## 3. 공급자별 수집 방식

| 공급자 | Proxy 수집 | 폴링 수집 | 비고 |
|--------|-----------|----------|------|
| OpenAI (GPT-4o, o1, Codex) | ✅ 실시간 | ✅ Usage API | Admin Key 또는 개인 API Key |
| Google Gemini | ✅ 실시간 | ❌ 불가 | Developer API에 조직 집계 없음 |
| Anthropic Claude | ✅ 실시간 | ✅ Usage Report API | Admin Key 필요 |

---

## 4. 데이터 모델

### 4.1 UserLLMCredential (신규)

```python
class UserLLMCredentialModel(Base):
    __tablename__ = "user_llm_credentials"

    id: UUID
    user_id: UUID          # FK → users.id
    provider: str          # "openai" | "google_gemini" | "anthropic"
    key_name: str          # 사용자 표시용 이름 (e.g., "내 OpenAI 키")
    api_key_encrypted: str # Fernet 암호화
    is_active: bool        # 활성 여부
    last_verified_at: datetime | None
    created_at: datetime
    updated_at: datetime
```

### 4.2 ExternalUsageRecord (기존 확장)

기존 `ExternalUsageRecord`에 `credential_id` FK 추가:
```python
credential_id: UUID | None  # FK → user_llm_credentials.id
collection_method: str      # "proxy" | "polling"
```

---

## 5. API 설계

### 사용자 API (본인 자격증명 관리)

```
GET    /api/users/me/llm-credentials        # 내 키 목록
POST   /api/users/me/llm-credentials        # 키 등록
DELETE /api/users/me/llm-credentials/{id}   # 키 삭제
POST   /api/users/me/llm-credentials/{id}/verify  # 유효성 검증
```

### Proxy API (LLM 호출 중계)

```
POST /api/proxy/chat/completions            # OpenAI 호환 (모든 공급자)
```
- `X-Provider: openai | google_gemini | anthropic` 헤더로 공급자 선택
- 사용자의 등록 키로 실제 공급자에 전달
- 응답의 `usage` 필드 파싱 → ExternalUsageRecord 기록

### 관리자 API

```
GET /api/admin/external-usage/summary       # 전체 요약 (기존 /api/external-usage/summary 대체)
GET /api/admin/external-usage/by-user       # 사용자별 집계
GET /api/admin/external-usage/timeline      # 시계열
```

---

## 6. Frontend 설계

### 6.1 사용자 설정 페이지 (신규)

`/settings` 또는 기존 프로필 페이지에 **"LLM Accounts"** 탭 추가:

```
┌─────────────────────────────────────────────────────┐
│ LLM Accounts                               [+ Add]  │
├─────────────────────────────────────────────────────┤
│ OpenAI                                              │
│  ● 내 GPT-4o 키    sk-...xxxx   ✅ 검증됨  [삭제]  │
│                                                     │
│ Google Gemini                                       │
│  (미설정)                           [키 추가하기]  │
│                                                     │
│ Anthropic                                           │
│  ● Claude Admin   sk-ant-...xxx  ✅ 검증됨  [삭제] │
└─────────────────────────────────────────────────────┘
```

### 6.2 관리자 대시보드 (기존 ExternalUsagePage 확장)

**신규 컴포넌트:**
- `MemberUsageTable` - 사용자별 LLM 사용량 테이블
- `DailyCostTrend` - 일별 비용 추이 Area 차트 (공급자별 stacked)
- `TokenBreakdownChart` - Input/Output 토큰 비교

**Layout:**
```
[Overview Cards: Total | OpenAI | Gemini | Claude]
[Cost by Provider Pie] | [Daily Cost Trend Area Chart]
[Member Usage Table - 검색/필터/정렬]
[Model Cost Bar Chart] | [Token Breakdown Bar Chart]
```

---

## 7. 보안 고려사항

- API Key는 Fernet (symmetric encryption) 으로 암호화 저장
- 환경변수 `ENCRYPTION_KEY` 필수
- 키 조회 API는 마스킹 후 반환 (`sk-...xxxx`)
- 실제 키값은 절대 API 응답에 포함하지 않음
- 사용자는 자신의 키만 관리 가능
- 관리자도 키 원문 조회 불가 (사용량만 조회)

---

## 8. 구현 단계

### Phase 1 - 사용자 키 관리 + Admin 대시보드 강화
1. Backend: `UserLLMCredential` 모델 + API
2. Backend: `ExternalUsageRecord` 확장
3. Frontend: 사용자 LLM Accounts 설정 UI
4. Frontend: MemberUsageTable, DailyCostTrend 컴포넌트
5. Frontend: ExternalUsagePage 전체 재구성

### Phase 2 - Proxy 엔드포인트
6. Backend: `/api/proxy/chat/completions` 구현
7. 공급자별 API 호환성 레이어
8. 실시간 usage 기록

### Phase 3 - 폴링 강화
9. Anthropic AnthropicUsageCollector 구현
10. 스케줄러 연동 (1시간 주기)
11. 사용자별 키로 폴링

---

## 9. 제약 및 한계

- **Google Gemini 폴링 불가**: Developer API 특성상 조직 집계 없음. AOS Proxy 경유 시에만 추적.
- **OpenAI 개인 계정 폴링**: 조직 Admin Key 없으면 Usage API 접근 제한 가능. 개인 계정은 `GET /v1/usage` (구 엔드포인트)로 시도.
- **Anthropic 폴링**: Admin Key (`sk-ant-admin...`) 별도 발급 필요. 일반 API Key로 불가.
