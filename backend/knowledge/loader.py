"""
Knowledge base loader — runs once at application startup.

Loads:
1. DOCX foundation documents → FOUNDATION_DOCS dict
2. Sample texts (120 .txt files) → SAMPLE_TEXTS[(grade, type)] = [list of str]
3. Sample questions (216 .txt files) → SAMPLE_QUESTIONS[(grade, dim)] = [list of str]
"""

import os
import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple


def _safe_print(msg: str):
    """Print safely on Windows by replacing unencodable chars."""
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode(sys.stdout.encoding or 'ascii', errors='replace').decode(sys.stdout.encoding or 'ascii'))

from config import (
    FOUNDATION_DOCS_DIR,
    TEXTS_DIR,
    QUESTIONS_DIR,
    DIMENSION_FOLDER_MAP,
    TEXT_TYPE_FOLDER_MAP,
)

# ─── Types ────────────────────────────────────────────────────────────────────

FOUNDATION_DOCS: Dict[str, str] = {}
SAMPLE_TEXTS: Dict[Tuple[int, str], List[str]] = {}
SAMPLE_QUESTIONS: Dict[Tuple[int, str], List[str]] = {}


# ─── DOCX loading ─────────────────────────────────────────────────────────────

DOC_KEY_MAP = {
    "אוריינות_קריאה": "reading_literacy",
    "רכיב _המשימה": "task_component",
    "רכיב_המשימה": "task_component",
    "רכיב הקורא חדש": "reader_component",
    "רכיב_הטקסט_ נספח": "text_appendix",
    "רכיב_הטקסט_נספח": "text_appendix",
    "רכיב_הטקסט": "text_component",
}


def _load_docx(path: Path) -> str:
    try:
        from docx import Document
        doc = Document(str(path))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n".join(paragraphs)
    except Exception as e:
        _safe_print(f"  [WARN] Could not load {path.name}: {e}")
        return ""


def _load_foundation_docs():
    if not FOUNDATION_DOCS_DIR.exists():
        _safe_print(f"  [WARN] Foundation docs dir not found: {FOUNDATION_DOCS_DIR}")
        return

    for docx_path in FOUNDATION_DOCS_DIR.glob("*.docx"):
        stem = docx_path.stem
        # Try to match a key — try exact then partial
        key = None
        for pattern, canonical in DOC_KEY_MAP.items():
            if pattern in stem:
                key = canonical
                break
        if key is None:
            key = stem  # fallback to filename
        content = _load_docx(docx_path)
        if key in FOUNDATION_DOCS:
            # Append if key already set (e.g., duplicate match)
            FOUNDATION_DOCS[key] += "\n\n" + content
        else:
            FOUNDATION_DOCS[key] = content
        _safe_print(f"  Loaded foundation doc: {docx_path.name} -> {key} ({len(content)} chars)")


# ─── Grade parsing ────────────────────────────────────────────────────────────

def _parse_grade_from_folder(folder_name: str) -> int | None:
    """Extract grade number from Hebrew folder names like 'כיתה ד_ עברית'."""
    hebrew_digits = {
        "א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5,
        "ו": 6, "ז": 7, "ח": 8, "ט": 9,
    }
    # Try to match "כיתה X" pattern
    match = re.search(r"כיתה\s+([א-ת])", folder_name)
    if match:
        letter = match.group(1)
        return hebrew_digits.get(letter)
    # Try Arabic digits
    match = re.search(r"כיתה\s+(\d+)", folder_name)
    if match:
        return int(match.group(1))
    return None


def _normalize_folder_name(name: str) -> str:
    """Strip RTL marks and extra whitespace from folder names."""
    # Remove Unicode bidirectional marks (U+200E, U+200F, U+202A–202E, U+2066–206F)
    cleaned = re.sub(r"[\u200e\u200f\u202a-\u202e\u2066-\u206f]", "", name)
    return cleaned.strip()


# ─── Text loading ─────────────────────────────────────────────────────────────

def _load_sample_texts():
    if not TEXTS_DIR.exists():
        _safe_print(f"  [WARN] Texts dir not found: {TEXTS_DIR}")
        return

    count = 0
    for grade_folder in TEXTS_DIR.iterdir():
        if not grade_folder.is_dir():
            continue
        folder_name = _normalize_folder_name(grade_folder.name)
        grade = _parse_grade_from_folder(folder_name)
        if grade is None:
            continue

        for type_folder in grade_folder.iterdir():
            if not type_folder.is_dir():
                continue
            type_name = _normalize_folder_name(type_folder.name)
            text_type = TEXT_TYPE_FOLDER_MAP.get(type_name)
            if text_type is None:
                continue

            key = (grade, text_type)
            if key not in SAMPLE_TEXTS:
                SAMPLE_TEXTS[key] = []

            for txt_file in type_folder.glob("*.txt"):
                try:
                    content = txt_file.read_text(encoding="utf-8", errors="ignore").strip()
                    if content:
                        SAMPLE_TEXTS[key].append(content)
                        count += 1
                except Exception as e:
                    _safe_print(f"  [WARN] Could not read {txt_file}: {e}")

    _safe_print(f"  Loaded {count} sample texts across {len(SAMPLE_TEXTS)} (grade, type) buckets")


# ─── Question loading ─────────────────────────────────────────────────────────

def _load_sample_questions():
    if not QUESTIONS_DIR.exists():
        _safe_print(f"  [WARN] Questions dir not found: {QUESTIONS_DIR}")
        return

    count = 0
    for grade_folder in QUESTIONS_DIR.iterdir():
        if not grade_folder.is_dir():
            continue
        folder_name = _normalize_folder_name(grade_folder.name)
        grade = _parse_grade_from_folder(folder_name)
        if grade is None:
            continue

        for dim_folder in grade_folder.iterdir():
            if not dim_folder.is_dir():
                continue
            dim_name = _normalize_folder_name(dim_folder.name)
            dim_code = DIMENSION_FOLDER_MAP.get(dim_name)
            if dim_code is None:
                # Try partial match
                for pattern, code in DIMENSION_FOLDER_MAP.items():
                    if pattern in dim_name:
                        dim_code = code
                        break
            if dim_code is None:
                continue

            key = (grade, dim_code)
            if key not in SAMPLE_QUESTIONS:
                SAMPLE_QUESTIONS[key] = []

            for txt_file in dim_folder.glob("*.txt"):
                try:
                    content = txt_file.read_text(encoding="utf-8", errors="ignore").strip()
                    if content:
                        SAMPLE_QUESTIONS[key].append(content)
                        count += 1
                except Exception as e:
                    _safe_print(f"  [WARN] Could not read {txt_file}: {e}")

    _safe_print(f"  Loaded {count} sample questions across {len(SAMPLE_QUESTIONS)} (grade, dim) buckets")


# ─── Public entry point ───────────────────────────────────────────────────────

def load_all():
    """Load all knowledge base data. Call once at startup."""
    _safe_print("[Knowledge Engine] Loading foundation documents...")
    _load_foundation_docs()
    _safe_print("[Knowledge Engine] Loading sample texts...")
    _load_sample_texts()
    _safe_print("[Knowledge Engine] Loading sample questions...")
    _load_sample_questions()
    _safe_print(f"[Knowledge Engine] Ready. Docs={len(FOUNDATION_DOCS)}, "
                f"TextBuckets={len(SAMPLE_TEXTS)}, QuestionBuckets={len(SAMPLE_QUESTIONS)}")
