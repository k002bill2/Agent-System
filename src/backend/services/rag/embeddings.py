"""Embedding provider creation and dimension detection."""

import logging
import os
from typing import Any

from .config import DEFAULT_EMBEDDING_MODEL, EMBEDDING_PROVIDER, Embeddings

logger = logging.getLogger(__name__)


def create_embeddings(model_name: str | None = None) -> Any:
    """Create embeddings instance based on EMBEDDING_PROVIDER.

    Falls back through providers: configured → OpenAI → Google → HuggingFace.

    Args:
        model_name: Override model name. If None, uses DEFAULT_EMBEDDING_MODEL.

    Returns:
        A LangChain Embeddings instance.

    Raises:
        ValueError: If no embedding provider is available.
    """
    model = model_name or DEFAULT_EMBEDDING_MODEL

    if (
        EMBEDDING_PROVIDER == "huggingface"
        or "sentence-transformers" in model
        or "all-MiniLM" in model
    ):
        try:
            from langchain_huggingface import HuggingFaceEmbeddings

            hf_model = (
                model
                if "sentence-transformers" in model
                else "sentence-transformers/all-MiniLM-L6-v2"
            )
            logger.info("[RAG] Using HuggingFace embeddings: %s", hf_model)
            return HuggingFaceEmbeddings(model_name=hf_model)
        except ImportError:
            logger.warning("[RAG] langchain-huggingface not installed, trying alternatives...")

    if EMBEDDING_PROVIDER == "openai" or os.getenv("OPENAI_API_KEY"):
        try:
            from langchain_openai import OpenAIEmbeddings

            openai_model = model if "text-embedding" in model else "text-embedding-3-small"
            logger.info("[RAG] Using OpenAI embeddings: %s", openai_model)
            return OpenAIEmbeddings(model=openai_model)
        except ImportError:
            logger.warning("[RAG] langchain-openai not installed, trying alternatives...")

    google_api_key = os.getenv("GOOGLE_API_KEY")
    if EMBEDDING_PROVIDER == "google" and google_api_key:
        try:
            from langchain_google_genai import GoogleGenerativeAIEmbeddings

            google_model = model if "text-embedding" in model else "models/text-embedding-004"
            logger.info("[RAG] Using Google embeddings: %s", google_model)
            return GoogleGenerativeAIEmbeddings(
                model=google_model, google_api_key=google_api_key
            )
        except ImportError:
            logger.warning("[RAG] langchain-google-genai not installed, trying alternatives...")

    try:
        from langchain_huggingface import HuggingFaceEmbeddings

        logger.info("[RAG] Fallback to HuggingFace embeddings")
        return HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    except ImportError:
        pass

    raise ValueError(
        "No embedding provider available. Install langchain-huggingface for local embeddings, "
        "or set OPENAI_API_KEY/GOOGLE_API_KEY for cloud embeddings."
    )
