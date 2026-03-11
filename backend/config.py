import os
from pathlib import Path
from pydantic_settings import BaseSettings


DATA_ROOT = Path(__file__).parent.parent

TEXTS_DIR = DATA_ROOT / "טקסטים לדוגמא"
QUESTIONS_DIR = DATA_ROOT / "שאלות לדוגמא"
FOUNDATION_DOCS_DIR = DATA_ROOT / "מסמכי תשתית"
SAMPLE_EXAM_DIR = DATA_ROOT / "חומרים לדוגמה מבחן ראמה"

# Grade cluster word count bounds: {cluster: (narrative_min, narrative_max, info_min, info_max)}
GRADE_WORD_COUNTS = {
    # (narrative_min, narrative_max, info_min, info_max)
    # מבוסס על ניתוח טקסטי ראמ"ה — עדיפות למספר מילים גבוה
    "3-4": (400, 600, 330, 460),
    "5-6": (480, 680, 400, 560),
    "7-9": (560, 800, 480, 680),
}

# Map grade cluster to closest sample data grade
GRADE_CLUSTER_TO_SAMPLE = {
    "3-4": 4,
    "5-6": 5,
    "7-9": 9,
}

# Dimension folder name → canonical code
DIMENSION_FOLDER_MAP = {
    "הבנת המשמעות הגלויה": "A",
    "הבנת המשמעות המשתמעת": "B",
    "פרשנות עיבוד ויישום": "C",
    "בחינה והערכה": "D",
    "הערכה ביקורתית ורפלקציה": "D",
    "איתור מידע": "A",
    "הבנה (פרשנות והיסק)": "BC",
    "לשון": "LANG",
}

# Text type folder name → canonical code
TEXT_TYPE_FOLDER_MAP = {
    "נרטיבי": "narrative",
    "מידעי": "informational",
    "שימושי": "functional",
}

MODEL_NAME = "claude-sonnet-4-6"        # For quality tasks: text generation, questions
FAST_MODEL_NAME = "claude-haiku-4-5-20251001"  # For simple/quick tasks: theme, idea, emotions
MAX_TOKENS = 8192
FOUNDATION_CONTEXT_MAX_CHARS = 15000  # ~4k tokens per doc, 3 docs max


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    database_url: str = "sqlite+aiosqlite:///./tami.db"
    secret_key: str = "change-me-in-production-32-char-key"
    access_token_expire_minutes: int = 60 * 24 * 7  # 1 week

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
