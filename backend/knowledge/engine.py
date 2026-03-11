"""
Knowledge Engine — retrieval API for AI agents.

Uses the in-memory data loaded by loader.py.
"""

import random
from typing import List

from config import GRADE_CLUSTER_TO_SAMPLE, FOUNDATION_CONTEXT_MAX_CHARS
from knowledge.loader import FOUNDATION_DOCS, SAMPLE_TEXTS, SAMPLE_QUESTIONS


def _cluster_to_grade(grade_cluster: str) -> int:
    """Map grade cluster string to the closest sample data grade number."""
    return GRADE_CLUSTER_TO_SAMPLE.get(grade_cluster, 5)


def get_text_examples(grade_cluster: str, text_type: str, n: int = 3) -> List[str]:
    """
    Return up to n sample texts for the given grade cluster and text type.
    Falls back to adjacent grades if exact match has fewer than n texts.
    """
    grade = _cluster_to_grade(grade_cluster)
    results = list(SAMPLE_TEXTS.get((grade, text_type), []))

    # Fallback: try adjacent grades
    if len(results) < n:
        for fallback_grade in [4, 5, 8, 9, 2]:
            if fallback_grade != grade:
                extra = SAMPLE_TEXTS.get((fallback_grade, text_type), [])
                results.extend(extra)
            if len(results) >= n:
                break

    if not results:
        return []

    # Shuffle for diversity then return n
    sample = random.sample(results, min(n, len(results)))
    return sample


def get_question_examples(grade_cluster: str, dimension: str, n: int = 2) -> List[str]:
    """
    Return up to n sample questions for the given grade cluster and dimension.
    Dimension should be one of: A, B, C, D, BC, LANG
    """
    grade = _cluster_to_grade(grade_cluster)
    results = list(SAMPLE_QUESTIONS.get((grade, dimension), []))

    # Handle BC: combine B and C
    if dimension == "BC" and not results:
        b = SAMPLE_QUESTIONS.get((grade, "B"), [])
        c = SAMPLE_QUESTIONS.get((grade, "C"), [])
        results = list(b) + list(c)

    # Fallback to adjacent grades
    if len(results) < n:
        for fallback_grade in [4, 5, 8, 9, 2]:
            if fallback_grade != grade:
                extra = SAMPLE_QUESTIONS.get((fallback_grade, dimension), [])
                results.extend(extra)
            if len(results) >= n:
                break

    if not results:
        return []

    return random.sample(results, min(n, len(results)))


def get_foundation_context(keys: List[str]) -> str:
    """
    Concatenate sections of the foundation documents.
    Truncates each doc to FOUNDATION_CONTEXT_MAX_CHARS / len(keys) characters.
    """
    if not keys:
        return ""

    per_doc_limit = FOUNDATION_CONTEXT_MAX_CHARS // max(len(keys), 1)
    parts = []

    for key in keys:
        content = FOUNDATION_DOCS.get(key, "")
        if content:
            truncated = content[:per_doc_limit]
            parts.append(f"=== {key} ===\n{truncated}")

    return "\n\n".join(parts)


def get_all_foundation_keys() -> List[str]:
    """Return all loaded foundation document keys."""
    return list(FOUNDATION_DOCS.keys())
