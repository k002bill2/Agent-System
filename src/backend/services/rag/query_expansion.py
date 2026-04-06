"""Query expansion for improved RAG retrieval.

Provides synonym expansion for code-domain terms to bridge
the vocabulary gap between queries and indexed documents.
"""

import re

# Code-domain synonym map: term -> related terms
CODE_SYNONYMS: dict[str, list[str]] = {
    "auth": ["authentication", "authorization", "login", "token", "session"],
    "db": ["database", "sql", "query", "model", "orm"],
    "api": ["endpoint", "route", "rest", "handler", "controller"],
    "config": ["configuration", "settings", "env", "environment"],
    "test": ["testing", "spec", "unittest", "pytest", "vitest"],
    "error": ["exception", "failure", "bug", "issue"],
    "deploy": ["deployment", "ci", "cd", "release"],
    "ui": ["frontend", "component", "view", "render"],
    "async": ["concurrent", "parallel", "await", "coroutine"],
    "cache": ["caching", "memoize", "redis", "ttl"],
    "log": ["logging", "logger", "trace", "debug"],
    "queue": ["message", "event", "worker", "job"],
    "rag": ["retrieval", "embedding", "vector", "search", "semantic"],
    "agent": ["orchestrator", "workflow", "langgraph", "node"],
}


def expand_query_synonyms(query: str) -> str:
    """Expand query with code-domain synonyms.

    Only adds terms not already present in the query.
    Used primarily to enrich BM25 keyword matching.

    Args:
        query: Original search query.

    Returns:
        Expanded query with synonym terms appended.

    Example:
        "auth config" -> "auth config authentication authorization login token session configuration settings env environment"
    """
    query_lower = query.lower()
    tokens = set(re.findall(r"\w+", query_lower))

    expansions: list[str] = []
    for term, synonyms in CODE_SYNONYMS.items():
        if term in tokens:
            # Add synonyms not already in query
            new_terms = [s for s in synonyms if s not in tokens]
            expansions.extend(new_terms)

    if not expansions:
        return query

    return f"{query} {' '.join(expansions)}"
