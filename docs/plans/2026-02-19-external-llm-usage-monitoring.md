# External LLM Usage Monitoring — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 팀원이 각자 LLM API Key를 등록하고, 관리자는 사용자별 토큰 사용량을 모니터링하는 시스템 구현

**Architecture:** 사용자가 Settings에서 OpenAI/Gemini/Claude API Key를 등록하면, AOS Proxy 호출 시 실시간 기록 + OpenAI/Anthropic Usage API 주기적 폴링으로 하이브리드 수집. 관리자는 ExternalUsagePage에서 사용자별/공급자별 집계 확인.

**Tech Stack:** Python (FastAPI, SQLAlchemy, httpx), TypeScript (React, Zustand, Recharts, Tailwind CSS)

---

## 사전 확인

**기존 파일 (수정 대상):**
- `src/backend/db/models.py` — SQLAlchemy ORM 모델 추가
- `src/backend/models/external_usage.py` — Pydantic 모델 추가
- `src/backend/services/external_usage_service.py` — Anthropic Collector 추가
- `src/backend/api/app.py` — 새 라우터 등록
- `src/dashboard/src/stores/externalUsage.ts` — 파생 상태 추가
- `src/dashboard/src/pages/ExternalUsagePage.tsx` — 새 섹션 추가

**신규 생성 파일:**
- `src/backend/services/credential_service.py`
- `src/backend/api/llm_credentials.py`
- `src/backend/api/llm_proxy.py`
- `src/dashboard/src/stores/llmCredentials.ts`
- `src/dashboard/src/components/usage/LLMAccountsSettings.tsx`
- `src/dashboard/src/components/usage/MemberUsageTable.tsx`
- `src/dashboard/src/components/usage/DailyCostTrend.tsx`

**환경변수 (필수 확인):**
```bash
ENCRYPTION_MASTER_KEY=<hex>      # 이미 사용 중 — EncryptedString이 자동 암호화
EXTERNAL_OPENAI_ADMIN_KEY=       # OpenAI 폴링용 (선택)
```

---

## Task 1: DB 모델 — UserLLMCredentialModel

**Files:**
- Modify: `src/backend/db/models.py` (파일 끝에 추가)

**Step 1: 기존 파일 읽기**

```bash
# 파일 끝 부분 확인
tail -30 src/backend/db/models.py
```

**Step 2: UserLLMCredentialModel 추가**

`src/backend/db/models.py` 파일 끝에 추가:

```python
class UserLLMCredentialModel(Base):
    """User's personal LLM API credentials (encrypted)."""

    __tablename__ = "user_llm_credentials"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    provider = Column(String(50), nullable=False)          # "openai" | "google_gemini" | "anthropic"
    key_name = Column(String(255), nullable=False)         # 사용자 표시용 이름
    api_key = Column(EncryptedString(1024), nullable=False)  # Fernet 자동 암호화
    is_active = Column(Boolean, default=True, nullable=False)
    last_verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "provider", "key_name", name="uq_user_provider_key_name"),
        Index("ix_user_llm_cred_user_provider", "user_id", "provider"),
    )
```

`import uuid`가 없으면 파일 상단 import에 추가.

**Step 3: Alembic 없이 테이블 자동 생성 확인**

```bash
cd src/backend
python -c "
from db.database import engine, Base
from db.models import UserLLMCredentialModel
import asyncio

async def create():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print('OK')

asyncio.run(create())
"
```

Expected: `OK` 출력, 에러 없음

**Step 4: Commit**

```bash
git add src/backend/db/models.py
git commit -m "feat: add UserLLMCredentialModel for personal LLM API keys"
```

---

## Task 2: Pydantic 모델 — LLM Credential API 스키마

**Files:**
- Modify: `src/backend/models/external_usage.py`

**Step 1: 기존 파일 끝에 추가**

```python
# ── LLM Credential 관련 스키마 ────────────────────────────────────

class LLMCredentialCreate(BaseModel):
    """사용자가 API Key 등록 시 전달하는 요청 바디."""
    provider: ExternalProvider
    key_name: str = Field(min_length=1, max_length=100, description="표시용 이름 (예: '내 GPT-4o 키')")
    api_key: str = Field(min_length=10, description="실제 API Key")


class LLMCredentialResponse(BaseModel):
    """API 응답 — api_key는 마스킹 처리."""
    id: str
    provider: ExternalProvider
    key_name: str
    api_key_masked: str          # "sk-...xxxx" 형태
    is_active: bool
    last_verified_at: datetime | None
    created_at: datetime


class LLMCredentialVerifyResponse(BaseModel):
    """API Key 유효성 검증 결과."""
    is_valid: bool
    provider: ExternalProvider
    error_message: str | None = None
    latency_ms: float | None = None
```

**Step 2: Commit**

```bash
git add src/backend/models/external_usage.py
git commit -m "feat: add Pydantic schemas for LLM credential management"
```

---

## Task 3: Credential Service

**Files:**
- Create: `src/backend/services/credential_service.py`

**Step 1: 파일 생성**

```python
"""Service for managing user LLM credentials."""

from __future__ import annotations

import time
from datetime import datetime

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from db.models import UserLLMCredentialModel
from models.external_usage import (
    ExternalProvider,
    LLMCredentialCreate,
    LLMCredentialResponse,
    LLMCredentialVerifyResponse,
)


def _mask_key(key: str) -> str:
    """Return masked version: first 6 chars + '...' + last 4 chars."""
    if len(key) <= 12:
        return key[:3] + "..." + key[-2:]
    return key[:6] + "..." + key[-4:]


async def list_user_credentials(
    db: AsyncSession, user_id: str
) -> list[LLMCredentialResponse]:
    """Return all active credentials for a user (keys masked)."""
    result = await db.execute(
        select(UserLLMCredentialModel).where(
            and_(
                UserLLMCredentialModel.user_id == user_id,
                UserLLMCredentialModel.is_active == True,  # noqa: E712
            )
        ).order_by(UserLLMCredentialModel.created_at.desc())
    )
    rows = result.scalars().all()
    return [
        LLMCredentialResponse(
            id=row.id,
            provider=ExternalProvider(row.provider),
            key_name=row.key_name,
            api_key_masked=_mask_key(row.api_key),
            is_active=row.is_active,
            last_verified_at=row.last_verified_at,
            created_at=row.created_at,
        )
        for row in rows
    ]


async def create_credential(
    db: AsyncSession, user_id: str, data: LLMCredentialCreate
) -> LLMCredentialResponse:
    """Store a new LLM API Key (encrypted by EncryptedString column type)."""
    row = UserLLMCredentialModel(
        user_id=user_id,
        provider=data.provider.value,
        key_name=data.key_name,
        api_key=data.api_key,  # EncryptedString handles encryption
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return LLMCredentialResponse(
        id=row.id,
        provider=ExternalProvider(row.provider),
        key_name=row.key_name,
        api_key_masked=_mask_key(data.api_key),
        is_active=row.is_active,
        last_verified_at=row.last_verified_at,
        created_at=row.created_at,
    )


async def delete_credential(
    db: AsyncSession, user_id: str, credential_id: str
) -> bool:
    """Soft-delete (deactivate) a credential. Returns False if not found/owned."""
    result = await db.execute(
        select(UserLLMCredentialModel).where(
            and_(
                UserLLMCredentialModel.id == credential_id,
                UserLLMCredentialModel.user_id == user_id,
            )
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return False
    row.is_active = False
    await db.commit()
    return True


async def verify_credential(
    db: AsyncSession, user_id: str, credential_id: str
) -> LLMCredentialVerifyResponse:
    """Test if the stored API key is valid by making a lightweight API call."""
    result = await db.execute(
        select(UserLLMCredentialModel).where(
            and_(
                UserLLMCredentialModel.id == credential_id,
                UserLLMCredentialModel.user_id == user_id,
            )
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return LLMCredentialVerifyResponse(
            is_valid=False,
            provider=ExternalProvider.OPENAI,
            error_message="Credential not found",
        )

    provider = ExternalProvider(row.provider)
    api_key = row.api_key  # decrypted automatically

    t0 = time.monotonic()
    try:
        is_valid, error = await _test_key(provider, api_key)
        latency = (time.monotonic() - t0) * 1000
        if is_valid:
            row.last_verified_at = datetime.utcnow()
            await db.commit()
        return LLMCredentialVerifyResponse(
            is_valid=is_valid,
            provider=provider,
            error_message=error,
            latency_ms=round(latency, 1),
        )
    except Exception as e:
        return LLMCredentialVerifyResponse(
            is_valid=False,
            provider=provider,
            error_message=str(e),
        )


async def _test_key(provider: ExternalProvider, api_key: str) -> tuple[bool, str | None]:
    """Make a minimal API call to verify the key. Returns (is_valid, error_msg)."""
    async with httpx.AsyncClient(timeout=10) as client:
        if provider == ExternalProvider.OPENAI:
            resp = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if resp.status_code == 200:
                return True, None
            return False, f"OpenAI: HTTP {resp.status_code}"

        elif provider == ExternalProvider.ANTHROPIC:
            resp = await client.get(
                "https://api.anthropic.com/v1/models",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                },
            )
            if resp.status_code == 200:
                return True, None
            return False, f"Anthropic: HTTP {resp.status_code}"

        elif provider == ExternalProvider.GOOGLE_GEMINI:
            resp = await client.get(
                f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}",
            )
            if resp.status_code == 200:
                return True, None
            return False, f"Gemini: HTTP {resp.status_code}"

    return False, f"Unsupported provider: {provider}"


async def get_raw_key(
    db: AsyncSession, user_id: str, provider: ExternalProvider
) -> str | None:
    """Return decrypted API key for a user+provider (for proxy use). None if not found."""
    result = await db.execute(
        select(UserLLMCredentialModel).where(
            and_(
                UserLLMCredentialModel.user_id == user_id,
                UserLLMCredentialModel.provider == provider.value,
                UserLLMCredentialModel.is_active == True,  # noqa: E712
            )
        ).order_by(UserLLMCredentialModel.created_at.desc()).limit(1)
    )
    row = result.scalar_one_or_none()
    return row.api_key if row else None  # EncryptedString decrypts automatically
```

**Step 2: Commit**

```bash
git add src/backend/services/credential_service.py
git commit -m "feat: credential service for LLM API key CRUD and verification"
```

---

## Task 4: LLM Credentials API 라우터

**Files:**
- Create: `src/backend/api/llm_credentials.py`

**Step 1: 파일 생성**

```python
"""API endpoints for user LLM credential management."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from models.external_usage import (
    LLMCredentialCreate,
    LLMCredentialResponse,
    LLMCredentialVerifyResponse,
)
from services.credential_service import (
    create_credential,
    delete_credential,
    list_user_credentials,
    verify_credential,
)

# Import current user from auth (adjust path if different)
try:
    from api.auth import get_current_user
    from models.organization import UserResponse
    AUTH_AVAILABLE = True
except ImportError:
    AUTH_AVAILABLE = False

router = APIRouter(prefix="/users/me/llm-credentials", tags=["llm-credentials"])


def _require_auth():
    """Dependency: returns current user_id or raises 401."""
    if not AUTH_AVAILABLE:
        raise HTTPException(status_code=501, detail="Auth not available")
    return Depends(get_current_user)


@router.get("", response_model=list[LLMCredentialResponse])
async def list_credentials(
    current_user=Depends(get_current_user) if AUTH_AVAILABLE else None,
    db: AsyncSession = Depends(get_db),
) -> list[LLMCredentialResponse]:
    """List all my registered LLM API keys (masked)."""
    user_id = current_user.id if current_user else "anonymous"
    return await list_user_credentials(db, user_id)


@router.post("", response_model=LLMCredentialResponse, status_code=201)
async def add_credential(
    body: LLMCredentialCreate,
    current_user=Depends(get_current_user) if AUTH_AVAILABLE else None,
    db: AsyncSession = Depends(get_db),
) -> LLMCredentialResponse:
    """Register a new LLM API key."""
    user_id = current_user.id if current_user else "anonymous"
    return await create_credential(db, user_id, body)


@router.delete("/{credential_id}", status_code=204)
async def remove_credential(
    credential_id: str,
    current_user=Depends(get_current_user) if AUTH_AVAILABLE else None,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Deactivate (soft-delete) an API key."""
    user_id = current_user.id if current_user else "anonymous"
    found = await delete_credential(db, user_id, credential_id)
    if not found:
        raise HTTPException(status_code=404, detail="Credential not found")


@router.post("/{credential_id}/verify", response_model=LLMCredentialVerifyResponse)
async def verify_cred(
    credential_id: str,
    current_user=Depends(get_current_user) if AUTH_AVAILABLE else None,
    db: AsyncSession = Depends(get_db),
) -> LLMCredentialVerifyResponse:
    """Test if the stored API key is valid."""
    user_id = current_user.id if current_user else "anonymous"
    return await verify_credential(db, user_id, credential_id)
```

**Step 2: app.py에 라우터 등록**

`src/backend/api/app.py`에서 `external_usage_router` 등록 패턴 근처에 추가:

```python
# 기존 패턴과 동일하게 safe_import 사용
llm_credentials_router = safe_import("api.llm_credentials", "router")
```

그리고 include_router 섹션에:

```python
if llm_credentials_router:
    app.include_router(llm_credentials_router, prefix="/api")
```

**Step 3: 서버 실행 및 엔드포인트 확인**

```bash
cd src/backend && uvicorn api.app:app --reload &
curl -s http://localhost:8000/api/users/me/llm-credentials | python3 -m json.tool
# Expected: [] 또는 401 (auth 필요 시)
```

**Step 4: Commit**

```bash
git add src/backend/api/llm_credentials.py src/backend/api/app.py
git commit -m "feat: LLM credentials API endpoints (CRUD + verify)"
```

---

## Task 5: LLM Proxy 엔드포인트

**Files:**
- Create: `src/backend/api/llm_proxy.py`

**Step 1: 파일 생성**

```python
"""Transparent LLM proxy — records token usage per user."""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from models.external_usage import ExternalProvider, UnifiedUsageRecord
from services.credential_service import get_raw_key
from services.external_usage_service import get_external_usage_service

try:
    from api.auth import get_current_user
    AUTH_AVAILABLE = True
except ImportError:
    AUTH_AVAILABLE = False

router = APIRouter(prefix="/proxy", tags=["llm-proxy"])

PROVIDER_BASE_URLS: dict[ExternalProvider, str] = {
    ExternalProvider.OPENAI: "https://api.openai.com/v1",
    ExternalProvider.ANTHROPIC: "https://api.anthropic.com/v1",
    ExternalProvider.GOOGLE_GEMINI: "https://generativelanguage.googleapis.com/v1beta",
}

# 모델별 비용 (per 1K tokens)
COST_TABLE: dict[str, tuple[float, float]] = {
    "gpt-4o": (0.005, 0.015),
    "gpt-4o-mini": (0.00015, 0.0006),
    "o1": (0.015, 0.060),
    "o1-mini": (0.003, 0.012),
    "codex": (0.002, 0.006),
    "claude-opus-4-6": (0.015, 0.075),
    "claude-sonnet-4-6": (0.003, 0.015),
    "claude-haiku-4-5-20251001": (0.00025, 0.00125),
    "gemini-2.0-flash": (0.00025, 0.001),
    "gemini-1.5-pro": (0.00125, 0.005),
}


def _calc_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Calculate cost in USD."""
    for prefix, (cost_in, cost_out) in COST_TABLE.items():
        if model.startswith(prefix):
            return (input_tokens / 1000) * cost_in + (output_tokens / 1000) * cost_out
    return 0.0


@router.post("/chat/completions")
async def proxy_chat(
    request: Request,
    current_user=Depends(get_current_user) if AUTH_AVAILABLE else None,
    db: AsyncSession = Depends(get_db),
):
    """
    OpenAI-compatible proxy endpoint.
    Header: X-Provider: openai | anthropic | google_gemini (default: openai)
    """
    provider_header = request.headers.get("X-Provider", "openai")
    try:
        provider = ExternalProvider(provider_header)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider_header}")

    user_id = (current_user.id if current_user else None) or "anonymous"

    # 사용자 키 조회
    api_key = await get_raw_key(db, user_id, provider)
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail=f"No API key configured for {provider.value}. Register at /api/users/me/llm-credentials",
        )

    body = await request.body()
    try:
        body_json = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    model = body_json.get("model", "unknown")
    base_url = PROVIDER_BASE_URLS[provider]

    # Forward to actual provider
    headers = _build_headers(provider, api_key)
    t0 = time.monotonic()

    async with httpx.AsyncClient(timeout=60) as client:
        try:
            resp = await client.post(
                f"{base_url}/chat/completions",
                headers=headers,
                content=body,
            )
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Provider unreachable: {e}")

    latency_ms = (time.monotonic() - t0) * 1000

    # Record usage if successful
    if resp.status_code == 200:
        try:
            resp_json = resp.json()
            usage = resp_json.get("usage", {})
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)
            total_tokens = input_tokens + output_tokens
            cost = _calc_cost(model, input_tokens, output_tokens)

            record = UnifiedUsageRecord(
                provider=provider,
                timestamp=datetime.now(tz=timezone.utc),
                bucket_width="1h",
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                cost_usd=cost,
                request_count=1,
                model=model,
                user_id=user_id,
                raw_data={"latency_ms": latency_ms, "via": "proxy"},
            )
            svc = get_external_usage_service()
            svc.add_record(record)
        except Exception:
            pass  # Usage recording is best-effort

    return resp.json() if resp.status_code == 200 else HTTPException(
        status_code=resp.status_code, detail=resp.text
    )


def _build_headers(provider: ExternalProvider, api_key: str) -> dict[str, str]:
    if provider == ExternalProvider.OPENAI:
        return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    elif provider == ExternalProvider.ANTHROPIC:
        return {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
    elif provider == ExternalProvider.GOOGLE_GEMINI:
        return {"Content-Type": "application/json"}  # key in URL for Gemini
    return {"Content-Type": "application/json"}
```

**Step 2: ExternalUsageService에 `add_record` 메서드 추가**

`src/backend/services/external_usage_service.py` 내 `ExternalUsageService` 클래스에:

```python
def add_record(self, record: UnifiedUsageRecord) -> None:
    """Add a proxy-collected record to in-memory store."""
    self._proxy_records.append(record)

# __init__에도 추가:
self._proxy_records: list[UnifiedUsageRecord] = []
```

그리고 `get_summary` 메서드에서 `_proxy_records`를 포함하도록 수정.

**Step 3: app.py에 proxy 라우터 등록**

```python
llm_proxy_router = safe_import("api.llm_proxy", "router")
# ...
if llm_proxy_router:
    app.include_router(llm_proxy_router, prefix="/api")
```

**Step 4: Commit**

```bash
git add src/backend/api/llm_proxy.py src/backend/services/external_usage_service.py src/backend/api/app.py
git commit -m "feat: LLM proxy endpoint with real-time token usage recording"
```

---

## Task 6: Anthropic Usage Collector 추가

**Files:**
- Modify: `src/backend/services/external_usage_service.py`

**Step 1: `AnthropicUsageCollector` 클래스 추가**

OpenAIUsageCollector 다음에 추가:

```python
class AnthropicUsageCollector(BaseUsageCollector):
    """Collects usage from Anthropic Usage Report API."""

    BASE_URL = "https://api.anthropic.com/v1"

    def __init__(self, admin_key: str) -> None:
        self._admin_key = admin_key

    def get_provider(self) -> ExternalProvider:
        return ExternalProvider.ANTHROPIC

    async def health_check(self) -> ProviderHealthStatus:
        import time
        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{self.BASE_URL}/models",
                    headers={
                        "x-api-key": self._admin_key,
                        "anthropic-version": "2023-06-01",
                    },
                )
                latency = (time.monotonic() - t0) * 1000
                if resp.status_code == 200:
                    return ProviderHealthStatus(
                        provider=ExternalProvider.ANTHROPIC,
                        is_healthy=True,
                        latency_ms=latency,
                    )
                return ProviderHealthStatus(
                    provider=ExternalProvider.ANTHROPIC,
                    is_healthy=False,
                    error_message=f"HTTP {resp.status_code}",
                )
        except Exception as e:
            return ProviderHealthStatus(
                provider=ExternalProvider.ANTHROPIC,
                is_healthy=False,
                error_message=str(e),
            )

    async def collect(self, start_time: datetime, end_time: datetime) -> list[UnifiedUsageRecord]:
        """Collect from Anthropic Usage Report API."""
        records: list[UnifiedUsageRecord] = []
        page_token: str | None = None

        # Cost table (input_per_1k, output_per_1k)
        COSTS = {
            "claude-opus-4-6": (0.015, 0.075),
            "claude-sonnet-4-6": (0.003, 0.015),
            "claude-haiku-4-5": (0.00025, 0.00125),
        }

        async with httpx.AsyncClient(timeout=30) as client:
            while True:
                params: dict = {
                    "starting_at": start_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "ending_at": end_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "bucket_width": "1d",
                    "limit": 100,
                }
                if page_token:
                    params["page"] = page_token

                resp = await client.get(
                    f"{self.BASE_URL}/organizations/usage_report/messages",
                    headers={
                        "x-api-key": self._admin_key,
                        "anthropic-version": "2023-06-01",
                    },
                    params=params,
                )

                if resp.status_code != 200:
                    break

                data = resp.json()
                for bucket in data.get("data", []):
                    bucket_end = datetime.fromisoformat(
                        bucket["bucket_end_time"].replace("Z", "+00:00")
                    )
                    for item in bucket.get("items", []):
                        model = item.get("model", "unknown")
                        input_tok = item.get("input_tokens", 0)
                        output_tok = item.get("output_tokens", 0)
                        # Calculate cost
                        cost = 0.0
                        for prefix, (ci, co) in COSTS.items():
                            if model.startswith(prefix):
                                cost = (input_tok / 1000) * ci + (output_tok / 1000) * co
                                break
                        records.append(UnifiedUsageRecord(
                            provider=ExternalProvider.ANTHROPIC,
                            timestamp=bucket_end,
                            bucket_width="1d",
                            input_tokens=input_tok,
                            output_tokens=output_tok,
                            total_tokens=input_tok + output_tok,
                            cost_usd=cost,
                            request_count=item.get("num_requests", 0),
                            model=model,
                            raw_data=item,
                        ))

                if not data.get("has_more"):
                    break
                page_token = data.get("next_page")

        return records
```

**Step 2: `get_external_usage_service()` 팩토리에 Anthropic 추가**

```python
# 기존 팩토리 함수 찾아서 Anthropic 추가
anthropic_key = os.getenv("EXTERNAL_ANTHROPIC_ADMIN_KEY", "")
if anthropic_key:
    collectors.append(AnthropicUsageCollector(anthropic_key))
```

**Step 3: Commit**

```bash
git add src/backend/services/external_usage_service.py
git commit -m "feat: Anthropic usage collector via Admin Key polling"
```

---

## Task 7: Frontend — LLM Credentials Zustand Store

**Files:**
- Create: `src/dashboard/src/stores/llmCredentials.ts`

**Step 1: 파일 생성**

```typescript
import { create } from 'zustand'

const API_BASE = '/api'

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('auth_token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

export interface LLMCredential {
  id: string
  provider: 'openai' | 'google_gemini' | 'anthropic'
  key_name: string
  api_key_masked: string
  is_active: boolean
  last_verified_at: string | null
  created_at: string
}

export interface LLMCredentialCreate {
  provider: 'openai' | 'google_gemini' | 'anthropic'
  key_name: string
  api_key: string
}

export interface VerifyResult {
  is_valid: boolean
  provider: string
  error_message: string | null
  latency_ms: number | null
}

interface LLMCredentialStore {
  credentials: LLMCredential[]
  isLoading: boolean
  error: string | null

  fetchCredentials: () => Promise<void>
  addCredential: (data: LLMCredentialCreate) => Promise<LLMCredential | null>
  removeCredential: (id: string) => Promise<boolean>
  verifyCredential: (id: string) => Promise<VerifyResult | null>
}

export const useLLMCredentialStore = create<LLMCredentialStore>((set, get) => ({
  credentials: [],
  isLoading: false,
  error: null,

  fetchCredentials: async () => {
    set({ isLoading: true, error: null })
    try {
      const resp = await authFetch(`${API_BASE}/users/me/llm-credentials`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data: LLMCredential[] = await resp.json()
      set({ credentials: data, isLoading: false })
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  addCredential: async (data: LLMCredentialCreate) => {
    try {
      const resp = await authFetch(`${API_BASE}/users/me/llm-credentials`, {
        method: 'POST',
        body: JSON.stringify(data),
      })
      if (!resp.ok) {
        const err = await resp.json()
        set({ error: err.detail || 'Failed to add credential' })
        return null
      }
      const cred: LLMCredential = await resp.json()
      set(s => ({ credentials: [cred, ...s.credentials] }))
      return cred
    } catch (err) {
      set({ error: (err as Error).message })
      return null
    }
  },

  removeCredential: async (id: string) => {
    try {
      const resp = await authFetch(`${API_BASE}/users/me/llm-credentials/${id}`, {
        method: 'DELETE',
      })
      if (!resp.ok) return false
      set(s => ({ credentials: s.credentials.filter(c => c.id !== id) }))
      return true
    } catch {
      return false
    }
  },

  verifyCredential: async (id: string) => {
    try {
      const resp = await authFetch(`${API_BASE}/users/me/llm-credentials/${id}/verify`, {
        method: 'POST',
      })
      if (!resp.ok) return null
      const result: VerifyResult = await resp.json()
      // Update last_verified_at in local state
      if (result.is_valid) {
        set(s => ({
          credentials: s.credentials.map(c =>
            c.id === id ? { ...c, last_verified_at: new Date().toISOString() } : c
          ),
        }))
      }
      return result
    } catch {
      return null
    }
  },
}))
```

**Step 2: Commit**

```bash
git add src/dashboard/src/stores/llmCredentials.ts
git commit -m "feat: LLM credentials Zustand store"
```

---

## Task 8: Frontend — LLM Accounts 설정 컴포넌트

**Files:**
- Create: `src/dashboard/src/components/usage/LLMAccountsSettings.tsx`

**Step 1: 파일 생성**

```tsx
import { useEffect, useState } from 'react'
import { Key, Plus, Trash2, CheckCircle, XCircle, Loader2, Eye, EyeOff } from 'lucide-react'
import { useLLMCredentialStore, LLMCredentialCreate } from '../../stores/llmCredentials'

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI (GPT-4o, o1, Codex)', placeholder: 'sk-...' },
  { value: 'google_gemini', label: 'Google Gemini', placeholder: 'AIza...' },
  { value: 'anthropic', label: 'Anthropic Claude', placeholder: 'sk-ant-...' },
] as const

const PROVIDER_COLORS: Record<string, string> = {
  openai: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  google_gemini: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  anthropic: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

export function LLMAccountsSettings() {
  const { credentials, isLoading, fetchCredentials, addCredential, removeCredential, verifyCredential } =
    useLLMCredentialStore()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<LLMCredentialCreate>({
    provider: 'openai',
    key_name: '',
    api_key: '',
  })
  const [showKey, setShowKey] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [verifying, setVerifying] = useState<string | null>(null)
  const [verifyResults, setVerifyResults] = useState<Record<string, boolean | null>>({})

  useEffect(() => {
    fetchCredentials()
  }, [fetchCredentials])

  const handleAdd = async () => {
    if (!form.key_name.trim() || !form.api_key.trim()) return
    setSubmitting(true)
    const result = await addCredential(form)
    setSubmitting(false)
    if (result) {
      setShowForm(false)
      setForm({ provider: 'openai', key_name: '', api_key: '' })
    }
  }

  const handleVerify = async (id: string) => {
    setVerifying(id)
    const result = await verifyCredential(id)
    setVerifyResults(prev => ({ ...prev, [id]: result?.is_valid ?? false }))
    setVerifying(null)
  }

  const selectedProvider = PROVIDER_OPTIONS.find(p => p.value === form.provider)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Key className="h-4 w-4" />
            LLM Accounts
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            등록한 API Key로 AOS Proxy를 통해 LLM을 호출하면 사용량이 자동으로 기록됩니다.
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Key
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Provider</label>
              <select
                value={form.provider}
                onChange={e => setForm(p => ({ ...p, provider: e.target.value as any }))}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                {PROVIDER_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">이름</label>
              <input
                value={form.key_name}
                onChange={e => setForm(p => ({ ...p, key_name: e.target.value }))}
                placeholder="예: 내 GPT-4o 키"
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">API Key</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={form.api_key}
                onChange={e => setForm(p => ({ ...p, api_key: e.target.value }))}
                placeholder={selectedProvider?.placeholder || 'API Key...'}
                className="w-full px-2.5 py-1.5 pr-8 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400"
            >
              취소
            </button>
            <button
              onClick={handleAdd}
              disabled={submitting || !form.key_name || !form.api_key}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-md"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              저장
            </button>
          </div>
        </div>
      )}

      {/* Credential List */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          로딩 중...
        </div>
      ) : credentials.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
          등록된 API Key가 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {credentials.map(cred => (
            <div
              key={cred.id}
              className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PROVIDER_COLORS[cred.provider]}`}>
                  {cred.provider === 'openai' ? 'OpenAI' : cred.provider === 'google_gemini' ? 'Gemini' : 'Claude'}
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{cred.key_name}</p>
                  <p className="text-xs text-gray-400 font-mono">{cred.api_key_masked}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Verify status */}
                {verifyResults[cred.id] === true && <CheckCircle className="h-4 w-4 text-emerald-500" />}
                {verifyResults[cred.id] === false && <XCircle className="h-4 w-4 text-red-500" />}
                {cred.last_verified_at && verifyResults[cred.id] === undefined && (
                  <CheckCircle className="h-4 w-4 text-emerald-400" title={`검증됨: ${new Date(cred.last_verified_at).toLocaleDateString()}`} />
                )}
                <button
                  onClick={() => handleVerify(cred.id)}
                  disabled={verifying === cred.id}
                  className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 disabled:opacity-50"
                >
                  {verifying === cred.id ? <Loader2 className="h-3 w-3 animate-spin" /> : '검증'}
                </button>
                <button
                  onClick={() => removeCredential(cred.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/dashboard/src/components/usage/LLMAccountsSettings.tsx
git commit -m "feat: LLMAccountsSettings UI component"
```

---

## Task 9: Frontend — MemberUsageTable 컴포넌트

**Files:**
- Create: `src/dashboard/src/components/usage/MemberUsageTable.tsx`

**Step 1: 파일 생성**

```tsx
import { useMemo, useState } from 'react'
import { Search, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import type { UnifiedUsageRecord } from '../../stores/externalUsage'

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  github_copilot: 'Copilot',
  google_gemini: 'Gemini',
  anthropic: 'Claude',
}

const COST_ALERT_THRESHOLD = 50 // USD per period

function formatCost(v: number): string {
  if (v === 0) return '—'
  if (v < 0.01) return `$${v.toFixed(4)}`
  return `$${v.toFixed(2)}`
}

function formatTokens(v: number): string {
  if (v === 0) return '—'
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

interface MemberSummary {
  key: string
  userId: string | null
  userEmail: string | null
  byProvider: Record<string, { cost: number; tokens: number; requests: number; suggestions?: number; acceptances?: number }>
  totalCost: number
  totalTokens: number
}

function aggregateByMember(records: UnifiedUsageRecord[]): MemberSummary[] {
  const map = new Map<string, MemberSummary>()
  for (const rec of records) {
    const key = rec.user_id ?? rec.user_email ?? null
    if (!key) continue
    const existing = map.get(key) ?? {
      key,
      userId: rec.user_id,
      userEmail: rec.user_email,
      byProvider: {},
      totalCost: 0,
      totalTokens: 0,
    }
    const prev = existing.byProvider[rec.provider] ?? { cost: 0, tokens: 0, requests: 0 }
    existing.byProvider[rec.provider] = {
      cost: prev.cost + rec.cost_usd,
      tokens: prev.tokens + rec.total_tokens,
      requests: prev.requests + rec.request_count,
      suggestions: (prev.suggestions ?? 0) + (rec.code_suggestions ?? 0),
      acceptances: (prev.acceptances ?? 0) + (rec.code_acceptances ?? 0),
    }
    existing.totalCost += rec.cost_usd
    existing.totalTokens += rec.total_tokens
    map.set(key, existing)
  }
  return Array.from(map.values())
}

interface Props {
  records: UnifiedUsageRecord[]
  isLoading: boolean
}

export function MemberUsageTable({ records, isLoading }: Props) {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<'totalCost' | 'totalTokens'>('totalCost')
  const [sortAsc, setSortAsc] = useState(false)

  const members = useMemo(() => {
    const all = aggregateByMember(records)
    return all
      .filter(m => {
        if (!search) return true
        const label = (m.userEmail ?? m.userId ?? '').toLowerCase()
        return label.includes(search.toLowerCase())
      })
      .sort((a, b) => {
        const diff = a[sortField] - b[sortField]
        return sortAsc ? diff : -diff
      })
  }, [records, search, sortField, sortAsc])

  const providers = useMemo(() => {
    const set = new Set<string>()
    records.forEach(r => set.add(r.provider))
    return Array.from(set)
  }, [records])

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortAsc(v => !v)
    else { setSortField(field); setSortAsc(false) }
  }

  const SortIcon = ({ field }: { field: typeof sortField }) =>
    sortField === field
      ? sortAsc ? <ChevronUp className="h-3 w-3 inline ml-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5" />
      : null

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-400 text-center">로딩 중...</div>
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">팀원별 사용량</h3>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="사용자 검색..."
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-44"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                사용자
              </th>
              {providers.map(p => (
                <th key={p} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {PROVIDER_LABELS[p] ?? p}
                </th>
              ))}
              <th
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                onClick={() => toggleSort('totalCost')}
              >
                총 비용 <SortIcon field="totalCost" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                알림
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {members.length === 0 ? (
              <tr>
                <td colSpan={providers.length + 3} className="px-4 py-8 text-center text-sm text-gray-400">
                  {search ? '검색 결과 없음' : '사용자별 데이터 없음'}
                </td>
              </tr>
            ) : (
              members.map(m => (
                <tr key={m.key} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-medium">
                        {(m.userEmail ?? m.userId ?? '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {m.userEmail ?? m.userId ?? 'Unknown'}
                        </p>
                        {m.userEmail && m.userId && (
                          <p className="text-xs text-gray-400">{m.userId}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  {providers.map(p => {
                    const pd = m.byProvider[p]
                    if (!pd) return <td key={p} className="px-4 py-3 text-sm text-gray-300">—</td>
                    if (p === 'github_copilot') {
                      const rate = pd.suggestions && pd.suggestions > 0
                        ? ((pd.acceptances ?? 0) / pd.suggestions * 100).toFixed(0)
                        : null
                      return (
                        <td key={p} className="px-4 py-3">
                          <p className="text-sm text-gray-900 dark:text-white">{pd.suggestions?.toLocaleString()} sugg</p>
                          {rate && <p className="text-xs text-gray-400">{rate}% 수락</p>}
                        </td>
                      )
                    }
                    return (
                      <td key={p} className="px-4 py-3">
                        <p className="text-sm text-gray-900 dark:text-white">{formatCost(pd.cost)}</p>
                        <p className="text-xs text-gray-400">{formatTokens(pd.tokens)} tok</p>
                      </td>
                    )
                  })}
                  <td className="px-4 py-3">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatCost(m.totalCost)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {m.totalCost > COST_ALERT_THRESHOLD && (
                      <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span className="text-xs">초과</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/dashboard/src/components/usage/MemberUsageTable.tsx
git commit -m "feat: MemberUsageTable component with per-user LLM cost breakdown"
```

---

## Task 10: Frontend — DailyCostTrend 차트

**Files:**
- Create: `src/dashboard/src/components/usage/DailyCostTrend.tsx`

**Step 1: 파일 생성**

```tsx
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { UnifiedUsageRecord } from '../../stores/externalUsage'

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f',
  github_copilot: '#6e7681',
  google_gemini: '#4285f4',
  anthropic: '#d97706',
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  github_copilot: 'Copilot',
  google_gemini: 'Gemini',
  anthropic: 'Claude',
}

interface DailyPoint {
  date: string
  openai: number
  github_copilot: number
  google_gemini: number
  anthropic: number
  total: number
}

function buildDailyTrend(records: UnifiedUsageRecord[]): DailyPoint[] {
  const map = new Map<string, DailyPoint>()
  for (const rec of records) {
    const d = new Date(rec.timestamp)
    const key = d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    const existing: DailyPoint = map.get(key) ?? {
      date: key,
      openai: 0,
      github_copilot: 0,
      google_gemini: 0,
      anthropic: 0,
      total: 0,
    }
    const pkey = rec.provider as keyof Omit<DailyPoint, 'date' | 'total'>
    existing[pkey] = (existing[pkey] ?? 0) + rec.cost_usd
    existing.total += rec.cost_usd
    map.set(key, existing)
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )
}

interface Props {
  records: UnifiedUsageRecord[]
}

export function DailyCostTrend({ records }: Props) {
  const data = buildDailyTrend(records)
  const providers = Array.from(new Set(records.map(r => r.provider)))

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
        일별 비용 추이
      </h3>
      {data.length === 0 ? (
        <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">
          데이터 없음
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              {providers.map(p => (
                <linearGradient key={p} id={`grad-${p}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PROVIDER_COLORS[p]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={PROVIDER_COLORS[p]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={v => v === 0 ? '$0' : `$${v.toFixed(2)}`}
              tickLine={false}
              axisLine={false}
              width={45}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                `$${value.toFixed(4)}`,
                PROVIDER_LABELS[name] ?? name,
              ]}
              contentStyle={{
                backgroundColor: 'var(--tooltip-bg, #fff)',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Legend formatter={name => PROVIDER_LABELS[name] ?? name} />
            {providers.map(p => (
              <Area
                key={p}
                type="monotone"
                dataKey={p}
                stackId="cost"
                stroke={PROVIDER_COLORS[p]}
                fill={`url(#grad-${p})`}
                strokeWidth={1.5}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/dashboard/src/components/usage/DailyCostTrend.tsx
git commit -m "feat: DailyCostTrend area chart component"
```

---

## Task 11: Frontend — ExternalUsagePage 통합 업데이트

**Files:**
- Modify: `src/dashboard/src/pages/ExternalUsagePage.tsx`

**Step 1: 기존 파일 전체 확인**

```bash
wc -l src/dashboard/src/pages/ExternalUsagePage.tsx
```

**Step 2: import 블록에 추가**

```tsx
import { MemberUsageTable } from '../components/usage/MemberUsageTable'
import { DailyCostTrend } from '../components/usage/DailyCostTrend'
```

**Step 3: 기존 Overview 카드 섹션 뒤에 새 섹션 추가**

기존 Model Breakdown 섹션 위에:

```tsx
{/* Daily Cost Trend + Provider Pie (2 columns) */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
  <DailyCostTrend records={summary?.records ?? []} />
  {/* 기존 Cost by Provider PieChart 섹션 여기로 이동 */}
</div>

{/* Member Usage Table */}
<MemberUsageTable
  records={summary?.records ?? []}
  isLoading={isLoading}
/>
```

**Step 4: 빌드 확인**

```bash
cd src/dashboard && npx tsc --noEmit 2>&1 | head -20
```

Expected: 에러 0

**Step 5: Commit**

```bash
git add src/dashboard/src/pages/ExternalUsagePage.tsx
git commit -m "feat: integrate MemberUsageTable and DailyCostTrend into ExternalUsagePage"
```

---

## Task 12: Settings 페이지에 LLM Accounts 탭 추가

**Step 1: 기존 Settings 페이지 또는 Profile 페이지 찾기**

```bash
find src/dashboard/src -name "Settings*.tsx" -o -name "Profile*.tsx" 2>/dev/null
grep -r "settings\|profile" src/dashboard/src/stores/navigation.ts | head -5
```

**Step 2: 해당 페이지에 LLMAccountsSettings 컴포넌트 추가**

찾은 페이지 파일에:

```tsx
import { LLMAccountsSettings } from '../components/usage/LLMAccountsSettings'
```

그리고 적절한 탭 섹션에 `<LLMAccountsSettings />` 추가.

Settings 페이지가 없는 경우 — App.tsx의 라우팅 또는 navigation store에서 `settings` view 확인 후 페이지 생성.

**Step 3: Commit**

```bash
git add .
git commit -m "feat: add LLM Accounts settings tab"
```

---

## Task 13: 최종 검증

**Step 1: TypeScript 타입 체크**

```bash
cd src/dashboard && npx tsc --noEmit
```

Expected: 에러 0

**Step 2: Backend 서버 시작 및 API 확인**

```bash
cd src/backend && uvicorn api.app:app --reload &
sleep 3
curl -s http://localhost:8000/docs | grep -c "llm-credentials"
# Expected: 1 이상
```

**Step 3: 대시보드 빌드**

```bash
cd src/dashboard && npm run build
```

Expected: 빌드 성공

**Step 4: 환경변수 가이드 문서화**

`.env.example` 또는 README에 추가:

```bash
# External LLM Usage Monitoring
EXTERNAL_OPENAI_ADMIN_KEY=sk-admin-...    # OpenAI Organization Admin Key
EXTERNAL_ANTHROPIC_ADMIN_KEY=sk-ant-admin-...  # Anthropic Admin Key (선택)
EXTERNAL_GITHUB_TOKEN=ghp_...             # GitHub Token
EXTERNAL_GITHUB_ORG=your-org             # GitHub Org 이름
ENCRYPTION_MASTER_KEY=<64-hex-chars>      # 이미 설정 완료 시 재사용
```

**Step 5: 최종 Commit**

```bash
git add .
git commit -m "docs: add env var guide for external LLM monitoring"
```

---

## 구현 완료 체크리스트

- [ ] Task 1: DB 모델 `UserLLMCredentialModel`
- [ ] Task 2: Pydantic 스키마 추가
- [ ] Task 3: `credential_service.py`
- [ ] Task 4: `llm_credentials.py` API + app.py 등록
- [ ] Task 5: `llm_proxy.py` + `add_record` 메서드
- [ ] Task 6: `AnthropicUsageCollector`
- [ ] Task 7: `llmCredentials.ts` Zustand 스토어
- [ ] Task 8: `LLMAccountsSettings.tsx`
- [ ] Task 9: `MemberUsageTable.tsx`
- [ ] Task 10: `DailyCostTrend.tsx`
- [ ] Task 11: `ExternalUsagePage.tsx` 통합
- [ ] Task 12: Settings 탭 연결
- [ ] Task 13: 최종 검증
