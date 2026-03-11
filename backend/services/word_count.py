"""Hebrew word count utility."""

import re


def count_hebrew_words(text: str) -> int:
    """
    Count Hebrew words in text.
    Strips punctuation attached to words (maqaf, geresh, gershayim, etc.)
    then splits on whitespace.
    """
    # Remove common Hebrew punctuation marks that attach to words
    cleaned = re.sub(r"[״׳־–—,;:!?.()\[\]{}\"/\\]", " ", text)
    # Remove remaining non-letter, non-digit chars at word boundaries
    words = [w for w in cleaned.split() if w.strip()]
    return len(words)
