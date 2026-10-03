"""Central LLM Model Registry.

이 파일은 모든 LLM 모델 정보의 단일 소스(Single Source of Truth)입니다.
모델 추가/수정 시 이 파일만 변경하면 전체 시스템에 반영됩니다.
"""

import logging
import os
import re
from enum import Enum
from typing import Any, NamedTuple

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class LLMProvider(str, Enum):
    """Supported LLM providers."""

    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    OPENAI = "openai"
    CODEX_CLI = "codex_cli"
    CLAUDE_CLI = "claude_cli"
    OLLAMA = "ollama"


class LLMModelConfig(BaseModel):
    """Configuration for an LLM model."""

    id: str  # "claude-sonnet-4-6"
    display_name: str  # "Claude Sonnet 4"
    provider: LLMProvider
    context_window: int  # Max context window size
    input_price: float  # USD per 1K tokens
    output_price: float  # USD per 1K tokens
    is_default: bool = False  # Default model for this provider
    is_enabled: bool = True  # Whether model is enabled
    supports_tools: bool = True  # Tool/function calling support
    supports_vision: bool = False  # Vision/image support
    # Optional code-seed metadata: 문서상 이 alias 가 라우팅하는 concrete 모델 id.
    # DB 스키마에 컬럼이 없으므로 sync_to_db 값에 포함하지 않고(no migration),
    # DB-loaded config 에서는 항상 None 이다. provider 응답으로 확인된 값이
    # 아니므로 실행 귀속(resolved_model)에는 쓰지 않는다.
    alias_for: str | None = None
    # Optional code-seed 요청 능력 (alias_for 와 같은 이유로 DB 컬럼 없음 → DB-loaded
    # config 에서는 항상 기본값 True). 직접 읽지 말고 get_request_capabilities() 로
    # 해석한다. 근거(공식 문서·SDK·smoke)가 있는 모델만 False 로 둔다.
    supports_temperature: bool = True  # False → 생성자에 temperature 미전달
    supports_forced_tool_choice: bool = True  # False → tool_choice any/tool 강제 금지


# ─────────────────────────────────────────────────────────────
# Central Model Registry
# ─────────────────────────────────────────────────────────────

# All supported models with their configurations
_MODELS: list[LLMModelConfig] = [
    # ─────────────────────────────────────────────────────────
    # Anthropic Claude Models (updated 2026-08-31)
    # Pricing: USD per 1K tokens. Docs: https://platform.claude.com/docs/en/about-claude/models/overview
    # ─────────────────────────────────────────────────────────
    LLMModelConfig(
        id="claude-opus-4-8",
        display_name="Claude Opus 4.8",
        provider=LLMProvider.ANTHROPIC,
        context_window=1000000,  # 1M tokens
        input_price=0.005,  # $5.00/1M tokens
        output_price=0.025,  # $25.00/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    # claude-opus-4-7: official model docs, verified 2026-08-31
    LLMModelConfig(
        id="claude-opus-4-7",
        display_name="Claude Opus 4.7",
        provider=LLMProvider.ANTHROPIC,
        context_window=1000000,  # 1M tokens
        input_price=0.005,  # $5.00/1M tokens
        output_price=0.025,  # $25.00/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    # claude-opus-5-5: current Opus release, verified 2026-09-23
    # Anthropic standard pricing: $4/$20 per 1M tokens; 1M context.
    # Adaptive thinking is always active; tool use remains supported, but the
    # migration guide disallows forcing tool_choice=any/tool for this model.
    # supports_forced_tool_choice 는 의도적으로 기본값 유지: langchain-anthropic 1.7.4
    # 가 이 prefix 에는 이미 강제 tool_choice 를 쓰지 않고(chat_models.py:1117-1119,
    # 2919), Opus 5.5 의 json_schema(output_config.format) 지원은 근거 미확보 —
    # 활성 모델의 structured 경로를 바꾸지 않는다.
    LLMModelConfig(
        id="claude-opus-5-5",
        display_name="Claude Opus 5.5",
        provider=LLMProvider.ANTHROPIC,
        context_window=1_000_000,
        input_price=0.004,  # $4.00/1M tokens
        output_price=0.020,  # $20.00/1M tokens
        is_default=False,
        is_enabled=True,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="claude-opus-5",
        display_name="Claude Opus 5",
        provider=LLMProvider.ANTHROPIC,
        context_window=1000000,  # 1M tokens
        input_price=0.005,  # $5.00/1M tokens
        output_price=0.025,  # $25.00/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="claude-fable-5-1",
        display_name="Claude Fable 5.1",
        provider=LLMProvider.ANTHROPIC,
        context_window=1000000,  # 1M tokens
        input_price=0.010,  # $10.00/1M tokens
        output_price=0.050,  # $50.00/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    # claude-sonnet-5-5: official docs, verified 2026-10-03 (released 2026-09-28).
    # $2/$10 per 1M (Sonnet 5 와 동일), 1M context / 128K max output.
    # 400 조건: thinking disabled·budget_tokens, 비기본 temperature/top_p/top_k,
    # assistant prefill, forced tool_choice(any/tool). 기본 경로가
    # temperature=0.7 을 보내므로(services/llm_service.py:272, agents/base.py:206)
    # 어댑터 대응 전까지 비활성 등록. 활성화는 스모크 후 관리자 조치.
    LLMModelConfig(
        id="claude-sonnet-5-5",
        display_name="Claude Sonnet 5.5",
        provider=LLMProvider.ANTHROPIC,
        context_window=1_000_000,
        input_price=0.002,  # $2.00/1M tokens
        output_price=0.010,  # $10.00/1M tokens
        is_default=False,
        is_enabled=False,
        supports_tools=True,
        # 400: 비기본 temperature, forced tool_choice(any/tool) — 위 주석·8191bdc.
        # langchain-anthropic 1.7.4 _supports_forced_tool_choice 예외 목록에 없음.
        supports_temperature=False,
        supports_forced_tool_choice=False,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="claude-sonnet-5",
        display_name="Claude Sonnet 5",
        provider=LLMProvider.ANTHROPIC,
        context_window=1000000,  # 1M tokens
        input_price=0.002,  # $2.00/1M tokens
        output_price=0.010,  # $10.00/1M tokens
        is_default=True,  # Default Anthropic model (restored, follow-up policy 2026-09-01)
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="claude-sonnet-4-6",
        display_name="Claude Sonnet 4.6",
        provider=LLMProvider.ANTHROPIC,
        context_window=1000000,  # 1M tokens
        input_price=0.003,  # $3.00/1M tokens
        output_price=0.015,  # $15.00/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="claude-haiku-4-5-20251001",
        display_name="Claude Haiku 4.5",
        provider=LLMProvider.ANTHROPIC,
        context_window=200000,
        input_price=0.001,  # $1.00/1M tokens
        output_price=0.005,  # $5.00/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    # ─────────────────────────────────────────────────────────
    # Google Gemini Models (updated 2026-08-31)
    # Pricing: USD per 1K tokens. Docs: https://ai.google.dev/gemini-api/docs/models
    # ─────────────────────────────────────────────────────────
    # gemini-3.8-flash: official model docs, verified 2026-09-05
    # 발효일 주의: 공식 가격표가 "$0.75/$3.75 through December 31, 2026,
    # $1.50/$7.50 starting January 1, 2027" 로 고지한다 (3.7-flash 도 동일).
    # 2027-01-01 에 이 두 행과 llm_proxy COST_TABLE 을 함께 올려야 한다.
    LLMModelConfig(
        id="gemini-3.8-flash",
        display_name="Gemini 3.8 Flash",
        provider=LLMProvider.GOOGLE,
        context_window=1048576,
        input_price=0.00075,  # $0.75/1M tokens
        output_price=0.00375,  # $3.75/1M tokens
        # live smoke 2026-09-22: generateContent HTTP 200,
        # 응답 modelVersion == "gemini-3.8-flash" 확인 후 승격.
        is_default=True,  # Default Google model (policy 2026-09-22)
        supports_tools=True,
        supports_vision=True,
    ),
    # gemini-3.7-flash: official model docs (current stable Flash), verified 2026-08-31
    LLMModelConfig(
        id="gemini-3.7-flash",
        display_name="Gemini 3.7 Flash",
        provider=LLMProvider.GOOGLE,
        context_window=1048576,
        input_price=0.00075,  # $0.75/1M tokens
        output_price=0.00375,  # $3.75/1M tokens
        # gemini-3.8-flash 로 대체(2026-09-22). 행은 남긴다 — 이 id 를 참조하는
        # 기존 세션이 있고, 삭제하면 로딩이 깨진다.
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gemini-3-flash-preview",
        display_name="Gemini 3 Flash",
        provider=LLMProvider.GOOGLE,
        context_window=1000000,
        input_price=0.0005,  # $0.50/1M tokens
        output_price=0.003,  # $3.00/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gemini-3.1-pro-preview",
        display_name="Gemini 3.1 Pro",
        provider=LLMProvider.GOOGLE,
        context_window=2097152,  # 2M tokens (released 2026-02-19)
        input_price=0.002,  # $2.00/1M tokens (≤200K context)
        output_price=0.012,  # $12.00/1M tokens (≤200K context)
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gemini-3.1-flash-lite-preview",
        display_name="Gemini 3.1 Flash-Lite",
        provider=LLMProvider.GOOGLE,
        context_window=1000000,
        input_price=0.00025,  # $0.25/1M tokens
        output_price=0.0015,  # $1.50/1M tokens
        is_default=False,
        # Google shutdown 2026-05-25. 현재는 서버가 stable gemini-3.1-flash-lite 로
        # redirect 하지만 언제 끊길지 모른다. 레지스트리 정책상 신규 Lite 는 등록하지 않고,
        # 과거 세션·정산 참조 호환을 위해 행은 남긴 채 비활성화한다.
        is_enabled=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gemini-2.5-pro",
        display_name="Gemini 2.5 Pro",
        provider=LLMProvider.GOOGLE,
        context_window=1000000,
        input_price=0.00125,  # $1.25/1M tokens (≤200K context)
        output_price=0.01,  # $10.00/1M tokens (≤200K context)
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gemini-2.5-flash",
        display_name="Gemini 2.5 Flash",
        provider=LLMProvider.GOOGLE,
        context_window=1000000,
        input_price=0.0003,  # $0.30/1M tokens
        output_price=0.0025,  # $2.50/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    # ─────────────────────────────────────────────────────────
    # OpenAI Models
    # Pricing: USD per 1K tokens. Docs: https://platform.openai.com/docs/pricing
    # ─────────────────────────────────────────────────────────
    LLMModelConfig(
        id="gpt-4o-mini",
        display_name="GPT-4o Mini",
        provider=LLMProvider.OPENAI,
        context_window=128000,
        input_price=0.00015,  # $0.15/1M tokens
        output_price=0.0006,  # $0.60/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gpt-4o",
        display_name="GPT-4o",
        provider=LLMProvider.OPENAI,
        context_window=128000,
        # 표준 티어 단가. $5.00/$15.00 은 gpt-4o-2024-05-13 스냅샷 가격이라
        # 현행 gpt-4o 에 쓰면 과대 집계된다 (공식 가격표 대조, 2026-09-08 교정).
        input_price=0.0025,  # $2.50/1M tokens
        output_price=0.010,  # $10.00/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gpt-6-astra",
        display_name="GPT-6 Astra",
        provider=LLMProvider.OPENAI,
        context_window=1050000,
        input_price=0.010,  # $10.00/1M tokens
        output_price=0.050,  # $50.00/1M tokens
        is_default=False,  # Do not promote without provider smoke/canary
        supports_tools=True,
        # GPT-6 guide: reasoning effort≠none(기본 medium) 이면 temperature 제거 —
        # https://developers.openai.com/api/docs/guides/latest-model.md (astra/sol/luna 공통).
        # langchain-openai 1.6.6 validate_temperature 는 gpt-5* 만 제거 → 직접 미전달.
        supports_temperature=False,
        supports_vision=True,
    ),
    # GPT-6 Sol/Luna: official model/pricing docs, verified 2026-10-03
    # (released 2026-09-22). 1,050,000 context / 128K max output. 가격은 ≤272K
    # 입력 표준가 — 272K 초과 요청은 입력·캐시 2배, 출력 1.5배(여기 미반영).
    # Chat Completions function calling 은 reasoning_effort "none" 일 때만 허용.
    # tools 요청은 langchain-openai 가 gpt-6* 를 Responses API 로 자동 전환하지만,
    # 기본 경로가 temperature=0.7 을 보내고 reasoning_effort 를 지정하지 않아(기본
    # medium — effort≠none 이면 temperature 불허) 거부될 수 있으므로 어댑터 대응 전까지
    # 비활성 등록 (services/llm_service.py:272,334). 활성화는 스모크 후 관리자 조치.
    LLMModelConfig(
        id="gpt-6-sol",
        display_name="GPT-6 Sol",
        provider=LLMProvider.OPENAI,
        context_window=1_050_000,
        input_price=0.002,  # $2.00/1M tokens
        output_price=0.010,  # $10.00/1M tokens
        is_default=False,
        is_enabled=False,
        supports_tools=True,
        # GPT-6 guide: reasoning effort≠none(기본 medium) 이면 temperature 제거 —
        # https://developers.openai.com/api/docs/guides/latest-model.md (astra/sol/luna 공통).
        # langchain-openai 1.6.6 validate_temperature 는 gpt-5* 만 제거 → 직접 미전달.
        supports_temperature=False,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gpt-6-luna",
        display_name="GPT-6 Luna",
        provider=LLMProvider.OPENAI,
        context_window=1_050_000,
        input_price=0.0001,  # $0.10/1M tokens
        output_price=0.0005,  # $0.50/1M tokens
        is_default=False,
        is_enabled=False,
        supports_tools=True,
        # GPT-6 guide: reasoning effort≠none(기본 medium) 이면 temperature 제거 —
        # https://developers.openai.com/api/docs/guides/latest-model.md (astra/sol/luna 공통).
        # langchain-openai 1.6.6 validate_temperature 는 gpt-5* 만 제거 → 직접 미전달.
        supports_temperature=False,
        supports_vision=True,
    ),
    # GPT-5.6 family: official model/pricing docs, verified 2026-08-31.
    # The gpt-5.6 alias routes to GPT-5.6 Sol.
    LLMModelConfig(
        id="gpt-5.6",
        display_name="GPT-5.6 (Sol alias)",
        provider=LLMProvider.OPENAI,
        context_window=1050000,
        input_price=0.004,  # $4.00/1M tokens
        output_price=0.02,  # $20.00/1M tokens
        is_default=True,  # Default OpenAI model (policy 2026-08-31)
        supports_tools=True,
        supports_vision=True,
        alias_for="gpt-5.6-sol",  # documented routing target (docs, not a provider response)
    ),
    LLMModelConfig(
        id="gpt-5.6-sol",
        display_name="GPT-5.6 Sol",
        provider=LLMProvider.OPENAI,
        context_window=1050000,
        input_price=0.004,  # $4.00/1M tokens
        output_price=0.02,  # $20.00/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gpt-5.6-terra",
        display_name="GPT-5.6 Terra",
        provider=LLMProvider.OPENAI,
        context_window=1050000,
        input_price=0.002,  # $2.00/1M tokens
        output_price=0.012,  # $12.00/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gpt-5.6-luna",
        display_name="GPT-5.6 Luna",
        provider=LLMProvider.OPENAI,
        context_window=1050000,
        input_price=0.0002,  # $0.20/1M tokens
        output_price=0.0012,  # $1.20/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    # gpt-5.5: retained for compatibility; disabled until a live smoke run
    # validates it (follow-up policy 2026-09-01). Enabling is an explicit
    # admin action, not a code-seed default.
    LLMModelConfig(
        id="gpt-5.5",
        display_name="GPT-5.5",
        provider=LLMProvider.OPENAI,
        context_window=1050000,
        input_price=0.005,  # $5.00/1M tokens
        output_price=0.03,  # $30.00/1M tokens
        is_default=False,
        is_enabled=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gpt-5.4",
        display_name="GPT-5.4",
        provider=LLMProvider.OPENAI,
        context_window=1050000,
        input_price=0.0025,
        output_price=0.015,
        is_default=False,
        is_enabled=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gpt-5.4-mini",
        display_name="GPT-5.4 Mini",
        provider=LLMProvider.OPENAI,
        context_window=400000,
        input_price=0.00075,
        output_price=0.0045,
        is_default=False,
        is_enabled=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="gpt-5.4-nano",
        display_name="GPT-5.4 Nano",
        provider=LLMProvider.OPENAI,
        context_window=400000,
        input_price=0.0002,
        output_price=0.00125,
        is_default=False,
        is_enabled=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="o3",
        display_name="OpenAI o3",
        provider=LLMProvider.OPENAI,
        context_window=200000,
        input_price=0.002,  # $2.00/1M tokens
        output_price=0.008,  # $8.00/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    LLMModelConfig(
        id="o4-mini",
        display_name="OpenAI o4 Mini",
        provider=LLMProvider.OPENAI,
        context_window=200000,
        # 표준 티어 단가. $0.55/$2.20 은 Batch/Flex 가격이라 표준 사용분을
        # 2배 과소 집계했다 (공식 가격표 대조, 2026-09-08 교정).
        input_price=0.0011,  # $1.10/1M tokens
        output_price=0.0044,  # $4.40/1M tokens
        is_default=False,
        supports_tools=True,
        supports_vision=True,
    ),
    # ─────────────────────────────────────────────────────────
    # Codex CLI (ChatGPT subscription-backed local CLI)
    # ─────────────────────────────────────────────────────────
    LLMModelConfig(
        id="codex-cli",
        display_name="Codex CLI",
        provider=LLMProvider.CODEX_CLI,
        context_window=200000,
        input_price=0.0,
        output_price=0.0,
        is_default=True,
        supports_tools=False,
        supports_vision=False,
    ),
    # ─────────────────────────────────────────────────────────
    # Claude CLI (Claude subscription-backed local CLI)
    # ─────────────────────────────────────────────────────────
    LLMModelConfig(
        id="claude-cli",
        display_name="Claude CLI",
        provider=LLMProvider.CLAUDE_CLI,
        context_window=200000,
        input_price=0.0,
        output_price=0.0,
        is_default=True,
        supports_tools=False,
        supports_vision=False,
    ),
    # ─────────────────────────────────────────────────────────
    # Ollama (Local) Models
    # ─────────────────────────────────────────────────────────
    LLMModelConfig(
        id="exaone3.5:7.8b",
        display_name="EXAONE 3.5 7.8B",
        provider=LLMProvider.OLLAMA,
        context_window=32768,
        input_price=0.0,  # Local - free
        output_price=0.0,
        is_default=True,  # Default Ollama model
        supports_tools=True,
        supports_vision=False,
    ),
    LLMModelConfig(
        id="llama3:8b",
        display_name="Llama 3 8B",
        provider=LLMProvider.OLLAMA,
        context_window=8192,
        input_price=0.0,
        output_price=0.0,
        is_default=False,
        supports_tools=True,
        supports_vision=False,
    ),
    LLMModelConfig(
        id="mistral:7b",
        display_name="Mistral 7B",
        provider=LLMProvider.OLLAMA,
        context_window=32768,
        input_price=0.0,
        output_price=0.0,
        is_default=False,
        supports_tools=True,
        supports_vision=False,
    ),
    LLMModelConfig(
        id="codellama:7b",
        display_name="Code Llama 7B",
        provider=LLMProvider.OLLAMA,
        context_window=16384,
        input_price=0.0,
        output_price=0.0,
        is_default=False,
        supports_tools=False,
        supports_vision=False,
    ),
]

# Index by model ID for fast lookup
_MODEL_INDEX: dict[str, LLMModelConfig] = {m.id: m for m in _MODELS}


class RequestCapabilities(NamedTuple):
    """모델별 요청 파라미터 능력 (provider 무관 공통 해석 결과)."""

    supports_temperature: bool = True
    supports_forced_tool_choice: bool = True


# OpenAI `gpt-x-YYYY-MM-DD`, Anthropic `claude-x-YYYYMMDD` 날짜 고정 스냅샷 접미사.
_DATED_SNAPSHOT_RE = re.compile(r"^(?P<base>.+)-(?:\d{4}-\d{2}-\d{2}|\d{8})$")


def get_request_capabilities(model_id: str | None) -> RequestCapabilities:
    """요청 능력의 단일 해석 지점 — 모든 호출처는 이 함수만 쓴다.

    능력 필드는 DB 컬럼이 없어 DB-loaded config 에서 기본값(True)으로 떨어지므로
    활성 레지스트리(_index)가 아니라 코드 seed(_MODEL_INDEX)를 조회한다. DB-only
    날짜 스냅샷 id(`<seed>-YYYY-MM-DD`, `<seed>-YYYYMMDD`)는 같은 모델의 고정판이므로
    seed 기본 id 로 해석한다. 그 외 seed 에 없는 모델은 근거가 없으므로 기존
    동작(모두 지원)을 유지한다.
    """
    if not model_id:
        return RequestCapabilities()
    seed = _MODEL_INDEX.get(model_id)
    if seed is None:
        snapshot = _DATED_SNAPSHOT_RE.match(model_id)
        seed = _MODEL_INDEX.get(snapshot.group("base")) if snapshot else None
    if seed is None:
        return RequestCapabilities()
    return RequestCapabilities(
        supports_temperature=seed.supports_temperature,
        supports_forced_tool_choice=seed.supports_forced_tool_choice,
    )


# Code-seed revision stamp — bump when policy-relevant seed contents change
# (defaults, enabled flags, model set, request capabilities). Recorded on
# Playground executions as optional audit metadata; see LLMModelRegistry.get_revision().
REGISTRY_REVISION = "2026-10-03.3"


class LLMModelRegistry:
    """Central registry for LLM model configurations.

    Single source of truth for all model information.
    When USE_DATABASE=true, populated from DB on startup via load_from_db().
    Falls back to in-memory _MODELS list when DB is not available.
    """

    # DB-loaded cache (None = not yet loaded from DB, use _MODELS fallback)
    _db_cache: list[LLMModelConfig] | None = None
    _db_index: dict[str, LLMModelConfig] = {}

    @classmethod
    def _models(cls) -> list[LLMModelConfig]:
        """Return active model list: DB cache if loaded, else in-memory fallback."""
        return cls._db_cache if cls._db_cache is not None else _MODELS

    @classmethod
    def _index(cls) -> dict[str, LLMModelConfig]:
        """Return active model index: DB index if loaded, else in-memory fallback."""
        return cls._db_index if cls._db_cache is not None else _MODEL_INDEX

    @classmethod
    async def load_from_db(cls, session: Any) -> None:
        """Load model configurations from DB into in-memory cache.

        Called once on application startup when USE_DATABASE=true.
        After this, all registry methods serve data from DB.
        """
        from sqlalchemy import select

        try:
            from db.models import LLMModelConfigModel

            result = await session.execute(select(LLMModelConfigModel))
            db_models = result.scalars().all()

            loaded = []
            for m in db_models:
                try:
                    loaded.append(
                        LLMModelConfig(
                            id=m.id,
                            display_name=m.display_name,
                            provider=LLMProvider(m.provider),
                            context_window=m.context_window,
                            input_price=m.input_price,
                            output_price=m.output_price,
                            is_default=m.is_default,
                            is_enabled=m.is_enabled,
                            supports_tools=m.supports_tools,
                            supports_vision=m.supports_vision,
                        )
                    )
                except Exception:
                    continue  # Skip malformed rows

            if loaded:
                cls._db_cache = loaded
                cls._db_index = {m.id: m for m in loaded}
                print(f"✅ LLMModelRegistry loaded {len(loaded)} models from DB")
            elif cls._db_cache is not None:
                # Empty but successful query while already in DB mode (e.g. the
                # last models were deleted). Honor the now-empty table so the
                # cache is not left stale — a successful empty result must clear
                # the cache, distinct from an exception (handled below).
                cls._db_cache = []
                cls._db_index = {}
                print("⚠️  llm_model_configs table is empty, cache cleared")
            else:
                # First load on a fresh/empty DB (no cache yet): keep the
                # in-memory _MODELS fallback rather than serving nothing.
                print("⚠️  llm_model_configs table is empty, using in-memory fallback")
        except Exception as e:
            # Exception (not an empty result): leave the existing cache/fallback
            # untouched rather than clobbering it with a partial/failed read.
            print(f"⚠️  Failed to load models from DB: {e}. Using in-memory fallback.")

    @classmethod
    def evict(cls, model_id: str) -> None:
        """Remove a single model id from the DB cache (immutable rebuild).

        Belt-and-suspenders for the DELETE endpoint: if a post-delete
        ``load_from_db`` fails to reflect the removal, the endpoint evicts the
        id directly so a hard-deleted model never lingers in a stale cache.
        Works even in in-memory fallback mode: when no DB cache exists yet, it
        materializes one from ``_MODELS`` minus the evicted id, so a hard-deleted
        model is not resurrected by the fallback path after a failed reload.
        """
        base = cls._db_cache if cls._db_cache is not None else _MODELS
        cls._db_cache = [m for m in base if m.id != model_id]
        cls._db_index = {m.id: m for m in cls._db_cache}

    @classmethod
    async def sync_to_db(cls, session: Any) -> dict[str, int]:
        """Sync code-defined _MODELS to DB via upsert.

        - INSERT new models that don't exist in DB
        - UPDATE metadata fields for existing models (preserving admin-controlled fields)
        - Does NOT delete models from DB that are no longer in code

        Returns:
            Dict with 'inserted' and 'updated' counts.
        """
        from sqlalchemy import delete, select
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        from db.models import LLMModelConfigModel, LLMModelSuppressionModel

        # Suppressed ids must never be re-registered (durable hard-delete).
        # Queried first so downstream inserts/defaults ignore these models.
        result = await session.execute(select(LLMModelSuppressionModel.model_id))
        suppressed_ids = {row[0] for row in result.fetchall()}

        # Self-heal: hard-remove any config row that is currently suppressed.
        # Closes the snapshot↔DELETE race — if a concurrent DELETE commits after
        # another path snapshotted suppressions and then re-INSERTed a config,
        # this bulk delete on the *next* sync removes the stray row, making the
        # "deleted stays deleted" invariant self-correcting.
        # synchronize_session=False: the WHERE uses a subquery that cannot be
        # evaluated in Python, and this fresh session has no identity map to sync.
        await session.execute(
            delete(LLMModelConfigModel)
            .where(LLMModelConfigModel.id.in_(select(LLMModelSuppressionModel.model_id)))
            .execution_options(synchronize_session=False)
        )

        # Get existing IDs to distinguish insert vs update
        result = await session.execute(select(LLMModelConfigModel.id))
        existing_ids = {row[0] for row in result.fetchall()}

        # Providers that already have ANY row in DB (after the self-heal
        # delete above). Guard: a NEW code model with is_default=True may
        # only bootstrap the provider default when the provider has ZERO
        # DB rows. Any existing row — including a disabled prior default —
        # is admin-controlled state, so the new model is inserted
        # non-default and no admin flag is cleared or overridden.
        result = await session.execute(select(LLMModelConfigModel.provider).distinct())
        providers_with_db_rows = {row[0] for row in result.fetchall()}

        inserted = 0
        updated = 0

        for model in _MODELS:
            # Skip suppressed models entirely: no upsert, no count, no default
            # clearing. This is the startup re-INSERT guard (regression a).
            if model.id in suppressed_ids:
                continue

            is_default = model.is_default
            if (
                is_default
                and model.id not in existing_ids
                and model.provider.value in providers_with_db_rows
            ):
                # The provider already has admin-controlled rows in DB
                # (possibly a disabled prior default): insert the new model
                # as non-default. Promotion is an explicit admin action, not
                # a side effect of the periodic sync. No UPDATE touches the
                # existing rows' is_default/is_enabled flags here — the only
                # bootstrap path is a provider with zero rows, where there
                # is nothing to clear.
                is_default = False

            values = {
                "id": model.id,
                "display_name": model.display_name,
                "provider": model.provider.value,
                "context_window": model.context_window,
                "input_price": model.input_price,
                "output_price": model.output_price,
                "is_default": is_default,
                "is_enabled": model.is_enabled,
                "supports_tools": model.supports_tools,
                "supports_vision": model.supports_vision,
            }

            # Metadata-only fields to update on conflict
            # Preserves admin-controlled fields: is_enabled, is_default
            update_fields = {
                "display_name": model.display_name,
                "context_window": model.context_window,
                "input_price": model.input_price,
                "output_price": model.output_price,
                "supports_tools": model.supports_tools,
                "supports_vision": model.supports_vision,
            }

            stmt = (
                pg_insert(LLMModelConfigModel)
                .values(**values)
                .on_conflict_do_update(
                    index_elements=["id"],
                    set_=update_fields,
                )
            )
            await session.execute(stmt)

            if model.id in existing_ids:
                updated += 1
            else:
                inserted += 1

        await session.commit()
        await cls.load_from_db(session)

        return {"inserted": inserted, "updated": updated}

    @classmethod
    def get_all(cls) -> list[LLMModelConfig]:
        """Get all registered models."""
        return cls._models().copy()

    @classmethod
    def get_enabled(cls) -> list[LLMModelConfig]:
        """Get all enabled models."""
        return [m for m in cls._models() if m.is_enabled]

    @classmethod
    def get_by_id(cls, model_id: str) -> LLMModelConfig | None:
        """Get a model by its ID."""
        return cls._index().get(model_id)

    @classmethod
    def get_by_provider(cls, provider: LLMProvider | str) -> list[LLMModelConfig]:
        """Get all models for a specific provider."""
        if isinstance(provider, str):
            try:
                provider = LLMProvider(provider)
            except ValueError:
                return []
        return [m for m in cls._models() if m.provider == provider and m.is_enabled]

    @classmethod
    def get_revision(cls) -> str:
        """Registry snapshot marker for execution metadata (JSON-safe string).

        ``code:`` = in-memory seed serving, ``db:`` = DB cache serving. The
        date part is the code-seed revision this process was built with.
        """
        mode = "db" if cls._db_cache is not None else "code"
        return f"{mode}:{REGISTRY_REVISION}"

    @classmethod
    def get_default(cls, provider: LLMProvider | str | None = None) -> str:
        """Get the default model ID for a provider (deterministic, fail-closed).

        - 명시적 enabled default 가 있으면 그것을 쓴다. 둘 이상이면(DB drift)
          id 순으로 결정하고 경고를 남긴다 — 충돌을 조용히 숨기지 않는다.
        - enabled default 가 없으면 목록 순서가 아니라 최저가(합산 per-1k,
          id tie-break) 모델로 결정론적 폴백하고 경고를 남긴다.
        - enabled 모델이 하나도 없으면 LookupError 로 fail-closed 한다 —
          타 provider 모델("codex-cli")을 조용히 반환하지 않는다.
        - 미지 provider 문자열도 LookupError 로 fail-closed 한다 — 임의
          문자열이 Codex 실행 경로로 조용히 라우팅되면 provider 정책·
          entitlement 게이트가 우회된다. 기동 경로의 폴백은 이 함수가 아니라
          각 호출부의 명시적 LookupError 처리로 옮겼다.

        Raises:
            LookupError: unknown provider, or the provider has zero enabled
                models.
        """
        if provider:
            if isinstance(provider, str):
                try:
                    provider = LLMProvider(provider)
                except ValueError:
                    logger.error(
                        "get_default: unknown provider %r — failing closed",
                        provider,
                    )
                    raise LookupError(f"Unknown provider: {provider}") from None

            models = cls.get_by_provider(provider)
            defaults = [m for m in models if m.is_default]
            if len(defaults) > 1:
                logger.warning(
                    "get_default: multiple enabled defaults for provider %s (%s), "
                    "resolving deterministically by id",
                    provider.value,
                    [m.id for m in defaults],
                )
            if defaults:
                return min(defaults, key=lambda m: m.id).id
            if models:
                fallback = min(models, key=lambda m: (m.input_price + m.output_price, m.id))
                logger.warning(
                    "get_default: no enabled default for provider %s, "
                    "using deterministic cheapest fallback %s",
                    provider.value,
                    fallback.id,
                )
                return fallback.id
            raise LookupError(f"No enabled models for provider {provider.value}")

        # No provider specified - resolve from the configured provider so the
        # registry default stays consistent with LLM_PROVIDER (headless deploys
        # set google/openai; local dev defaults to codex_cli). `or` guards the
        # empty-string case to avoid recursing back into this branch.
        return cls.get_default(os.getenv("LLM_PROVIDER") or "codex_cli")

    @classmethod
    def get_pricing(cls, model_id: str) -> dict[str, float]:
        """Get pricing for a model.

        Returns:
            Dict with 'input' and 'output' prices per 1K tokens.
        """
        model = cls.get_by_id(model_id)
        if model:
            return {"input": model.input_price, "output": model.output_price}

        # Try partial match for unknown models
        model_lower = model_id.lower()
        for m in cls._models():
            if m.id.lower() in model_lower or model_lower in m.id.lower():
                return {"input": m.input_price, "output": m.output_price}

        # Default pricing for unknown models
        return {"input": 0.001, "output": 0.002}

    @classmethod
    def get_context_window(cls, model_id: str) -> int:
        """Get context window size for a model."""
        model = cls.get_by_id(model_id)
        return model.context_window if model else 128000

    @classmethod
    def get_provider(cls, model_id: str) -> LLMProvider | None:
        """Get the provider for a model."""
        model = cls.get_by_id(model_id)
        return model.provider if model else None

    @classmethod
    def exists(cls, model_id: str) -> bool:
        """Check if a model exists in the registry."""
        return model_id in cls._index()

    @classmethod
    def is_available(cls, model_id: str) -> bool:
        """Check if a model is available (exists and API key is set)."""
        model = cls.get_by_id(model_id)
        if not model or not model.is_enabled:
            return False

        provider = model.provider
        if provider == LLMProvider.GOOGLE:
            return bool(os.getenv("GOOGLE_API_KEY"))
        elif provider == LLMProvider.ANTHROPIC:
            return bool(os.getenv("ANTHROPIC_API_KEY"))
        elif provider == LLMProvider.OPENAI:
            return bool(os.getenv("OPENAI_API_KEY"))
        # CLI providers report available=True to mean "no API key required"
        # (subscription-backed local CLI), NOT "binary is installed". Binary
        # presence is probed separately by LLM Access health checks. Do NOT
        # "fix" this with a shutil.which() gate: it would change existing Codex
        # API behavior and false-negative in CI where the binary is absent.
        # Deliberate rejection of Codex review P2.
        elif provider == LLMProvider.CODEX_CLI:
            return True
        elif provider == LLMProvider.CLAUDE_CLI:
            return True  # CLI subscription runtime is always "available" (local)
        elif provider == LLMProvider.OLLAMA:
            return True  # Ollama is always "available" (local)
        return False

    @classmethod
    def get_available_models(cls) -> list[dict[str, Any]]:
        """Get all models with availability info.

        Returns a list suitable for API responses.
        """
        result = []
        for model in cls._models():
            if not model.is_enabled:
                continue

            result.append(
                {
                    "id": model.id,
                    "display_name": model.display_name,
                    "provider": model.provider.value,
                    "context_window": model.context_window,
                    "pricing": {
                        "input": model.input_price,
                        "output": model.output_price,
                    },
                    "available": cls.is_available(model.id),
                    "is_default": model.is_default,
                    "supports_tools": model.supports_tools,
                    "supports_vision": model.supports_vision,
                }
            )

        return result

    @classmethod
    def get_model_ids_by_provider(cls, provider: LLMProvider | str) -> list[str]:
        """Get list of model IDs for a provider.

        Useful for frontend dropdowns.
        """
        return [m.id for m in cls.get_by_provider(provider)]


# ─────────────────────────────────────────────────────────────
# Helper Functions for Backward Compatibility
# ─────────────────────────────────────────────────────────────


def get_cost_per_1k_tokens() -> dict[str, dict[str, float]]:
    """Get pricing dict in legacy format.

    For backward compatibility with existing code that uses COST_PER_1K_TOKENS.
    """
    return {
        model.id: {"input": model.input_price, "output": model.output_price} for model in _MODELS
    }


def get_model_configs() -> dict[str, dict[str, Any]]:
    """Get model configs in legacy format.

    For backward compatibility with existing MODEL_CONFIGS usage.
    """
    return {
        model.id: {
            "provider": model.provider.value,
            "model": model.id,
            "context_window": model.context_window,
            "pricing": {"input": model.input_price, "output": model.output_price},
        }
        for model in _MODELS
    }
