"""
Agent 3 — QA Agent
Two modes:
  A) Automated validation: checks 5 rules on the complete exam
  B) Interactive chat: teacher sends natural language → agent returns action + explanation
"""

import json
import re
from typing import AsyncIterator, List
from dataclasses import dataclass, asdict

from anthropic import AsyncAnthropic

from config import settings, MODEL_NAME, MAX_TOKENS
from knowledge.engine import get_foundation_context


client = AsyncAnthropic(api_key=settings.anthropic_api_key)


@dataclass
class ValidationIssue:
    rule: str
    description: str
    severity: str  # "error" | "warning"
    question_sequence: int | None = None


@dataclass
class ValidationReport:
    passed: bool
    issues: List[ValidationIssue]
    suggestions: List[str]

    def to_dict(self):
        return {
            "passed": self.passed,
            "issues": [asdict(i) for i in self.issues],
            "suggestions": self.suggestions,
        }


# ─── Mode A: Automated Validation ─────────────────────────────────────────────

def _build_validation_prompt(texts: list, questions: list) -> str:
    texts_str = "\n\n".join([
        f"[{t.get('text_type', '')} — {t.get('title', '')}]\n{t.get('content', '')[:1500]}"
        for t in texts
    ])

    questions_str = "\n".join([
        f"שאלה {q.get('sequence_number', '?')} | ממד {q.get('dimension', '?')} | "
        f"פורמט {q.get('format', '?')} | {q.get('content', {}).get('stem', '')[:100]}"
        f" | תשובה: {q.get('content', {}).get('correct_answer', '')[:60]}"
        for q in questions
    ])

    dim_counts = {}
    for q in questions:
        d = q.get("dimension", "?")
        dim_counts[d] = dim_counts.get(d, 0) + 1
    total = len(questions)
    dist_str = " | ".join([f"ממד {k}: {v} ({round(v/total*100)}%)" for k, v in sorted(dim_counts.items())])

    return f"""בצע בקרת איכות על מבחן הבנת נקרא הבא.

הטקסטים:
{texts_str}

השאלות ({total} סה"כ):
{questions_str}

התפלגות ממדים: {dist_str}

בדוק 5 כללים ודווח:
1. עיגון (Grounding): האם כל תשובה נכונה מעוגנת בטקסט? האם ניתן להוכיח אותה מהטקסט?
2. כפילות: האם שתי שאלות שונות בודקות את אותו פרט בטקסט?
3. התפלגות 20/50/30: ממד א' כ-20%, ממד ב'+ג' כ-50%, ממד ד' כ-30%?
4. עיקרון ההלימה: האם השאלות מסודרות לפי סדר הופעת המידע בטקסט?
5. התאמת גיל: האם אוצר המילים ורמת החשיבה מתאימים לאשכול הגיל?

החזר JSON:
{{
  "passed": true/false,
  "issues": [
    {{
      "rule": "grounding/duplicate/distribution/alignment/age_match",
      "description": "תיאור הבעיה בעברית",
      "severity": "error/warning",
      "question_sequence": 5
    }}
  ],
  "suggestions": ["המלצה 1", "המלצה 2"]
}}"""


async def validate_exam(texts: list, questions: list) -> ValidationReport:
    """Run automated 5-rule validation on the complete exam."""
    system = "אתה בודק איכות פדגוגי של מבחני הבנת נקרא. החזר JSON תקני בלבד."
    user = _build_validation_prompt(texts, questions)

    response = await client.messages.create(
        model=MODEL_NAME,
        max_tokens=2000,
        system=system,
        messages=[
            {"role": "user", "content": user},
        ],
    )

    raw = response.content[0].text
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`")
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)

    if match:
        data = json.loads(match.group())
        issues = [
            ValidationIssue(
                rule=i.get("rule", ""),
                description=i.get("description", ""),
                severity=i.get("severity", "warning"),
                question_sequence=i.get("question_sequence"),
            )
            for i in data.get("issues", [])
        ]
        return ValidationReport(
            passed=data.get("passed", False),
            issues=issues,
            suggestions=data.get("suggestions", []),
        )

    # Fallback if parsing fails
    return ValidationReport(
        passed=True,
        issues=[],
        suggestions=["לא ניתן לפרסר תשובת בקרת האיכות. בצע סקירה ידנית."],
    )


# ─── Mode B: Interactive Chat ──────────────────────────────────────────────────

CHAT_SYSTEM_BASE = """אתה יועץ פדגוגי-פסיכומטרי בכיר לשיפור מבחני הבנת נקרא בסטנדרט ראמ"ה.
המורה שולחת לך הוראות לשינוי שאלות — אתה מבצע את השינוי בדיוק לפי בקשתה, תוך שמירה על עקרונות ראמ"ה.

══════════════════════════════════
כללי תיקון שאלות — עקרונות ראמ"ה
══════════════════════════════════
ממד א' (איתור): שאלה כשרה דורשת שילוב פרטים / הבחנה דקה — לא ניחוש ממשפט בודד.
  מסיחים טובים: שכן טקסטואלי / ערבוב פרטים / פרט חלקי — כולם מבוססי טקסט, לא אבסורדיים.

ממד ב' (הסקה): שאלה מבוססת על 2+ רמזים שאינם מפורשים. תשובה שלא ניתן לצטט ישירות.
  מסיחים טובים: מסקנה חלקית / סיבה שכנה / הגזמה לוגית.

ממד ג' (פרשנות): דורש עמדה מנומקת + 2 ראיות עם ציטוט. לא שאלה פתוחה מדי.
  לדוגמה: "על סמך [שתי פעולות ספציפיות], אפיינו תכונה. בססו בציטוט."

ממד ד' (הערכה): מנתח בחירות הכותב, אמצעים ספרותיים, מבנה — עם דרישת ציטוט + פרשנות.

כשהמורה מבקשת "שאלה קלה מדי":
  - אם MC: הקשה את ה-stem + שפר מסיחים לפסיכומטריים
  - אם OPEN: הוסף דרישה לציטוט + נימוק / הגבל לממד גבוה יותר

כשהמורה מבקשת "שנה לפתוחה":
  - שנה format ל-OPEN, נסח מחדש את ה-stem בהתאם, כתוב מחוון מלא עם criteria + partial_credit + sample_answer

כשהמורה מבקשת "שפר מסיחים":
  - שנה את options בלבד לפי 3 סוגי מסיחים פסיכומטריים (שכן טקסטואלי / ערבוב פרטים / פרט חלקי)

כשהמורה כותבת הערה חופשית על שאלה ספציפית:
  - שנה את השאלה לפי הבקשה המדויקת, שמור על הממד והפורמט אלא אם התבקשת לשנות

══════════════════════════════════
פורמטים של action
══════════════════════════════════
- edit_question: {"type": "edit_question", "question_id": "uuid", "updated_fields": {"stem": "...", "options": [...], "correct_answer": "...", "rubric": {...}}}
- add_question: {"type": "add_question", "question_data": {...}}
- delete_question: {"type": "delete_question", "question_id": "uuid"}
- swap_format: {"type": "swap_format", "question_id": "uuid", "new_format": "MC/OPEN/TABLE"}
- edit_text: {"type": "edit_text", "text_id": "uuid", "updated_content": "..."}

עקרונות תגובה:
1. הסבר בעברית מה שינית ומדוע (2-3 משפטים, קצרים ומקצועיים)
2. בצע שינוי מינימלי הנדרש — אל תשנה מה שלא ביקשו
3. החזר תמיד JSON תקני

{"explanation": "הסבר בעברית", "action": {...} או null אם אין פעולה}
"""


def _build_chat_user_prompt(message: str, exam_context: dict) -> str:
    questions_summary = "\n".join([
        f"שאלה {q.get('sequence_number')} (ID: {q.get('id', '')}) | "
        f"ממד {q.get('dimension')} | {q.get('format')} | {q.get('content', {}).get('stem', '')[:80]}"
        for q in exam_context.get("questions", [])
    ])

    return f"""בקשת המורה: {message}

רשימת שאלות המבחן הנוכחי:
{questions_summary}

בסס את התגובה על הבקשה ועל עקרונות ראמ"ה. החזר JSON בלבד."""


async def chat_refinement(
    message: str,
    conversation_history: list,
    exam_context: dict,
) -> dict:
    """
    Process a teacher refinement message.
    Returns {"explanation": str, "action": dict|None}
    """
    # Load foundation context for pedagogical grounding
    foundation_context = get_foundation_context(["task_component", "reader_component"])
    system = CHAT_SYSTEM_BASE + f"\n\nרקע פדגוגי — מסמכי תשתית ראמ\"ה:\n{foundation_context[:3000]}"

    messages = []
    for msg in conversation_history[-10:]:  # Last 10 messages for context
        messages.append({
            "role": "user" if msg["role"] == "TEACHER" else "assistant",
            "content": msg["content"],
        })

    messages.append({
        "role": "user",
        "content": _build_chat_user_prompt(message, exam_context),
    })

    response = await client.messages.create(
        model=MODEL_NAME,
        max_tokens=2500,
        system=system,
        messages=messages,
    )

    raw = response.content[0].text
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`")
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)

    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    return {"explanation": raw, "action": None}


# ─── Mode C: Language / Proofreading Edit ─────────────────────────────────────

LANGUAGE_EDIT_SYSTEM = """אתה עורך לשוני מקצועי המתמחה בעברית תקנית לחינוך.
תפקידך: לעבור על טקסט ולתקן שגיאות לשוניות — ללא שינוי תוכן, נושא או מבנה.

תקן אך ורק:
1. כתיב תקני: שגיאות כתיב, ניקוד שגוי, אות חסרה/מיותרת
2. פיסוק: נקודות, פסיקים, מקפים, סימני שאלה/קריאה — בהתאם לכללי האקדמיה
3. הסכמה: התאמת מין/מספר/גוף בין שם עצם לפועל, שם תואר
4. מבנה משפט: תיקון משפטים שבורים — ללא שינוי המסר
5. ניסוח: החלפת ניסוחים לא-תקניים בתקניים

חובה:
• לא לשנות את נושא הטקסט, עלילתו, רעיונותיו או מבנהו הכללי
• לא להוסיף מידע חדש או למחוק מידע קיים
• לדווח על כל שינוי: מה המקור, מה התיקון, מה הסיבה

החזר JSON תקני:
{
  "corrected_content": "הטקסט המתוקן המלא",
  "changes": [
    {
      "type": "כתיב|פיסוק|הסכמה|ניסוח",
      "original": "הניסוח המקורי",
      "corrected": "הניסוח המתוקן",
      "explanation": "הסבר קצר"
    }
  ],
  "change_count": 5,
  "summary": "2 משפטים: מה תוקן בטקסט זה"
}"""


async def language_edit_text(
    text_title: str,
    text_content: str,
    text_type: str,
) -> dict:
    """
    Run linguistic/proofreading edit on a single text.
    Returns {corrected_content, changes, change_count, summary}
    """
    type_heb = "נרטיבי" if text_type == "narrative" else "מידעי"
    user = f"""ערוך את הטקסט ה{type_heb} הבא לשונית — כתיב, פיסוק, הסכמה וניסוח.
אל תשנה את תוכן הטקסט, נושאו, עלילתו או רעיונותיו.

כותרת: {text_title}
טקסט:
{text_content}

החזר JSON בלבד."""

    response = await client.messages.create(
        model=MODEL_NAME,
        max_tokens=4096,
        system=LANGUAGE_EDIT_SYSTEM,
        messages=[{"role": "user", "content": user}],
    )

    raw = response.content[0].text
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`")
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    return {
        "corrected_content": text_content,
        "changes": [],
        "change_count": 0,
        "summary": "לא ניתן לנתח את התגובה — הטקסט לא שונה.",
    }


# ─── Mode B2: Fix a specific question ─────────────────────────────────────────

FIX_QUESTION_SYSTEM = """אתה מומחה פדגוגי-פסיכומטרי בכיר לשיפור שאלות הבנת הנקרא לפי תקן ראמ"ה.
תפקידך: לקבל שאלה, לנתח את בקשת המורה, ולהחזיר את השאלה המתוקנת בפורמט JSON מלא.

כללי תיקון לפי ממד:
• ממד א' (איתור): דרוש שילוב פרטים/הבחנה דקה; מסיחים: שכן טקסטואלי, ערבוב פרטים, פרט חלקי
• ממד ב' (הסקה): שאלה מבוססת 2+ רמזים; מסיחים: מסקנה חלקית, סיבה שכנה, הגזמה לוגית
• ממד ג' (פרשנות): דרוש עמדה + 2 ראיות עם ציטוט; אל תישאר כללי
• ממד ד' (הערכה): ניתוח בחירות הכותב + אמצעים ספרותיים + ציטוט

לכל בקשה של "שאלה קלה מדי": הקשה את ה-stem + שפר מסיחים
לבקשה "שנה לפתוחה": שנה format ל-OPEN, נסח מחדש stem, כתוב מחוון מלא
לבקשה "שפר מסיחים": שנה options בלבד לפי 3 סוגי מסיחים פסיכומטריים

חובה להחזיר JSON עם המבנה המלא:
{
  "explanation": "הסבר קצר מה שינית ומדוע",
  "updated_question": {
    "stem": "...",
    "format": "MC|OPEN|TABLE|SEQUENCE|TRUE_FALSE|VOCAB",
    "options": [...] או null,
    "correct_answer": "..." או null,
    "rubric": {"criteria": [...], "partial_credit": "...", "sample_answer": "...", "answer_lines": 4}
  }
}"""


async def fix_question_with_chat(
    question_data: dict,
    teacher_message: str,
    text_content: str,
    grade_cluster: str,
) -> dict:
    """
    Fix a specific question based on teacher's free-form message.
    Returns {explanation, updated_question:{stem, format, options, correct_answer, rubric}}
    """
    foundation = get_foundation_context(["task_component"])
    grade_age = {"3-4": "כיתות ג'–ד'", "5-6": "כיתות ה'–ו'", "7-9": "כיתות ז'–ט'"}.get(grade_cluster, grade_cluster)

    q_json = json.dumps(question_data, ensure_ascii=False, indent=2)

    system = FIX_QUESTION_SYSTEM + f"""

רקע פדגוגי:
{foundation[:1500]}

אשכול כיתות: {grade_age}"""

    user = f"""טקסט המקור (ראשית):
\"\"\"{text_content[:1500]}\"\"\"

השאלה הנוכחית:
{q_json}

בקשת המורה לתיקון:
{teacher_message}

תקן את השאלה לפי הבקשה ולפי עקרונות ראמ"ה. החזר JSON בלבד."""

    response = await client.messages.create(
        model=MODEL_NAME,
        max_tokens=2000,
        system=system,
        messages=[{"role": "user", "content": user}],
    )

    raw = response.content[0].text
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`")
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    return {"explanation": raw, "updated_question": None}


async def stream_chat_refinement(
    message: str,
    conversation_history: list,
    exam_context: dict,
) -> AsyncIterator[str]:
    """Stream the chat response token by token."""
    messages = []
    for msg in conversation_history[-10:]:
        messages.append({
            "role": "user" if msg["role"] == "TEACHER" else "assistant",
            "content": msg["content"],
        })
    messages.append({
        "role": "user",
        "content": _build_chat_user_prompt(message, exam_context),
    })

    async with client.messages.stream(
        model=MODEL_NAME,
        max_tokens=2000,
        system=CHAT_SYSTEM,
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            yield text
