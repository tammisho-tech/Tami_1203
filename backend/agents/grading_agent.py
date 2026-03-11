"""
Agent 4 — Grading Agent
Auto-grades student submissions:
- Closed questions (MC, FILL): Python-side exact match
- Open questions: AI-based rubric evaluation with partial credit
Appends student profile (performance level 1–4 + pedagogical recommendation) to GradingJob.
"""

import json
import re
from typing import List

from anthropic import AsyncAnthropic

from config import settings, MODEL_NAME


client = AsyncAnthropic(api_key=settings.anthropic_api_key)


# ─── Closed question grading ───────────────────────────────────────────────────

def grade_closed_answer(student_answer: str, correct_answer: str, max_score: int) -> dict:
    """Grade a closed-format question (MC or FILL) by exact/normalized match."""
    def normalize(s: str) -> str:
        if not s:
            return ""
        s = s.strip().lower()
        # Remove leading letter+dot pattern "א. " or "1. "
        s = re.sub(r"^[\u05d0-\u05d9א-ת\d]+[.)]\s*", "", s)
        return s.strip()

    is_correct = normalize(student_answer) == normalize(correct_answer)
    score = max_score if is_correct else 0
    return {
        "score": score,
        "rationale": "תשובה נכונה" if is_correct else f"תשובה שגויה. התשובה הנכונה: {correct_answer}",
    }


# ─── Open question grading ─────────────────────────────────────────────────────

def _build_open_grading_prompt(
    text_excerpt: str,
    grade_cluster: str,
    questions_and_answers: List[dict],
) -> str:
    qa_str = ""
    for i, item in enumerate(questions_and_answers, 1):
        q = item["question"]
        rubric = q.get("rubric", {})
        qa_str += f"""
--- שאלה {q.get('sequence_number', i)} (ממד {q.get('dimension')}, מקסימום {rubric.get('max_score', 2)} נקודות) ---
שאלה: {q.get('content', {}).get('stem', '')}
קריטריונים לניקוד מלא: {json.dumps(rubric.get('criteria', []), ensure_ascii=False)}
ניקוד חלקי: {rubric.get('partial_credit', '')}
תשובת דוגמה: {rubric.get('sample_answer', '')}
תשובת התלמיד: {item['student_answer']}
"""

    return f"""בדוק את תשובות התלמיד הבאות לפי המחוון.
אשכול כיתות: {grade_cluster}

טקסט הבחינה (קטע):
{text_excerpt[:800]}

{qa_str}

הערכה:
- הענק ציון לכל שאלה לפי הקריטריונים
- אם התלמיד ענה חלקית — תן ניקוד חלקי
- נמק בעברית (משפט קצר)

החזר JSON — מערך:
[
  {{
    "question_sequence": 1,
    "score": 2,
    "max_score": 2,
    "rationale": "נימוק בעברית"
  }}
]"""


async def grade_open_questions(
    text_excerpt: str,
    grade_cluster: str,
    questions_and_answers: List[dict],
) -> List[dict]:
    """
    Grade all open questions for a student session in one LLM call.
    questions_and_answers: [{"question": {...}, "student_answer": str}]
    Returns: [{"question_sequence": int, "score": float, "max_score": int, "rationale": str}]
    """
    if not questions_and_answers:
        return []

    system = "אתה בודק מבחן הבנת נקרא. בצע הערכה מדויקת ומנומקת. החזר JSON בלבד."
    user = _build_open_grading_prompt(text_excerpt, grade_cluster, questions_and_answers)

    response = await client.messages.create(
        model=MODEL_NAME,
        max_tokens=3000,
        system=system,
        messages=[
            {"role": "user", "content": user},
        ],
    )

    raw = response.content[0].text
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`")
    match = re.search(r"\[.*\]", cleaned, re.DOTALL)

    if match:
        return json.loads(match.group())

    return []


# ─── Student profile generation ────────────────────────────────────────────────

LEVEL_THRESHOLDS = [
    (90, 4, "מצטיין", "שליטה מלאה בכל ממדי ההבנה. מצליח במיזוג מידע מורכב ובזיהוי מניעים סמויים."),
    (75, 3, "טוב", "שליטה טובה בממדים א' וב'. מצליח לגבש עמדה אך זקוק לדיוק בממד ד'."),
    (55, 2, "בסיסי", "שולט במידע גלוי. מתקשה בקפיצות לוגיות ובקישור בין חלקי הטקסט."),
    (0,  1, "מתקשה", "מצליח לאתר פרטים מפורשים בלבד. קושי משמעותי בהבנת המכלול."),
]

RECOMMENDATIONS = {
    4: "אתגור באמצעות טקסטים דחוסים ומטלות חקר מורכבות.",
    3: "עבודה על דיוק הניסוח בטיעונים וביסוס עמוק יותר בטקסט.",
    2: "תרגול זיהוי מילות קישור ותהליכי הסקה (בין השורות).",
    1: "בניית אוצר מילים בסיסי ותיווך צמוד באסטרטגיות איתור מידע.",
}


def compute_performance_level(total_score: float, max_score: int) -> dict:
    """Compute performance level 1–4 from raw score."""
    if max_score == 0:
        pct = 0
    else:
        pct = (total_score / max_score) * 100

    for threshold, level, label, description in LEVEL_THRESHOLDS:
        if pct >= threshold:
            return {
                "level": level,
                "label": label,
                "percentage": round(pct, 1),
                "description": description,
                "recommendation": RECOMMENDATIONS[level],
            }

    return {
        "level": 1,
        "label": "מתקשה",
        "percentage": round(pct, 1),
        "description": LEVEL_THRESHOLDS[-1][3],
        "recommendation": RECOMMENDATIONS[1],
    }


async def generate_student_profile(
    student_name: str,
    grade_cluster: str,
    scores_by_dimension: dict,  # {A: (earned, max), B: ..., C: ..., D: ...}
    total_score: float,
    max_score: int,
) -> dict:
    """Generate a full student pedagogical profile."""
    level_data = compute_performance_level(total_score, max_score)

    # Find strengths and weaknesses
    dim_pcts = {}
    for dim, (earned, maximum) in scores_by_dimension.items():
        dim_pcts[dim] = round((earned / maximum * 100) if maximum > 0 else 0, 1)

    strengths = [d for d, pct in dim_pcts.items() if pct >= 75]
    weaknesses = [d for d, pct in dim_pcts.items() if pct < 55]

    # Generate personalized recommendation via AI
    prompt = f"""תלמיד/ה: {student_name}
אשכול כיתות: {grade_cluster}
ציון כולל: {level_data['percentage']}% (רמה {level_data['level']} — {level_data['label']})
ביצוע לפי ממד: {json.dumps(dim_pcts, ensure_ascii=False)}
חוזקות: {strengths}
נקודות לשיפור: {weaknesses}

כתוב המלצה פדגוגית קצרה (2-3 משפטים) עבור מורה הכיתה בעברית."""

    try:
        response = await client.messages.create(
            model=MODEL_NAME,
            max_tokens=300,
            system="כתוב המלצה פדגוגית קצרה ומעשית עבור מורה.",
            messages=[
                {"role": "user", "content": prompt},
            ],
        )
        personalized_rec = response.content[0].text.strip()
    except Exception:
        personalized_rec = level_data["recommendation"]

    return {
        "level": level_data["level"],
        "label": level_data["label"],
        "percentage": level_data["percentage"],
        "description": level_data["description"],
        "strengths": strengths,
        "weaknesses": weaknesses,
        "dim_percentages": dim_pcts,
        "recommendation": personalized_rec,
    }
