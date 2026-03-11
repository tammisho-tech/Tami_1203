"""
Agent 2 — Task Agent
Generates 10-12 questions per text (20-24 total) with rubric and spec table.
Distribution: 20% dim A, 50% dims B+C, 30% dim D.
"""

import asyncio
import json
import re
from typing import List

from anthropic import AsyncAnthropic

from config import settings, MODEL_NAME, FAST_MODEL_NAME, MAX_TOKENS
from knowledge.engine import get_question_examples, get_foundation_context
from services.word_count import count_hebrew_words


client = AsyncAnthropic(api_key=settings.anthropic_api_key)


def _unpack_text_content(content: str) -> str:
    """
    If content is a non-continuous JSON blob ({"__nc": true, "main":..., "sidebars":[...]}),
    return a human-readable representation showing the main article followed by labeled
    sidebar boxes.  Otherwise return the content unchanged.
    This ensures the LLM sees the full text — including sidebar content — when generating questions.
    """
    if not content.startswith('{"__nc":'):
        return content
    try:
        nc = json.loads(content)
        parts = [nc.get("main", "")]
        for sb in nc.get("sidebars", []):
            sb_type = sb.get("type", "")
            sb_title = sb.get("title", "")
            sb_content = sb.get("content", "")
            type_labels = {
                "definition": "הגדרה מילונית",
                "editorial": "עמדה",
                "news_item": "כתבה חדשותית",
                "survey": "סקר",
                "example": "הדגמה",
                "fact_box": "עובדות",
                "diary": "קטע מיומן",
                "list": "רשימה",
                "knowledge_link": "קשר לתחום דעת",
            }
            label = type_labels.get(sb_type, sb_type)
            parts.append(f"\n\n[{label}: {sb_title}]\n{sb_content}")
        return "".join(parts)
    except Exception:
        return content


async def _call_with_tool(
    system: str, user: str, tool_def: dict, max_tokens: int, model: str = MODEL_NAME
) -> dict:
    """Call Claude with tool use — guarantees structured output."""
    response = await client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
        tools=[tool_def],
        tool_choice={"type": "any"},
    )
    for block in response.content:
        if block.type == "tool_use":
            return block.input  # type: ignore[return-value]
    raise ValueError("Claude did not call the tool as expected")


# Target question counts per text
TARGET_PER_TEXT = 11  # 10-12


def _build_question_system_prompt(foundation_context: str) -> str:
    return f"""אתה מומחה פסיכומטרי בכיר וכותב פריטים למבחני "תנופה" ומיצ"ב (ראמ"ה) — עם ניסיון של שנים בבניית מבחני הישג ברמה לאומית.
תפקידך לנסח מארג שאלות מאתגר, תקף ומהימן בסטנדרט ראמ"ה המדויק.

══════════════════════════════════════
 ארבעת ממדי ההבנה — ראמ"ה + עקרונות פסיכומטריים
══════════════════════════════════════

ממד א — איתור מידע (גלוי, ~20%):
  המטרה: לאתר מידע מפורש מהטקסט — אך לא בצורה טריוויאלית.
  שאלת ממד א' טובה מחייבת קריאה קפדנית: המידע נמצא בטקסט אך דורש:
    - שילוב שני פרטים ממשפטים שונים / מפסקאות שונות
    - הבחנה בין פרט מרכזי לפרטים מסיחים בסביבתו הטקסטואלית
    - זיהוי מדויק (שם, נתון, תכונה, פעולה) שקל לבלבל עם פרטים דומים

  ⛔ שאלות פסולות לממד א' — כל אחת מאלה היא שאלה לא תקפה:
    "מה שם הגיבור?" | "לאן נסעו?" | "כמה X הביאה?" | "מה היה ב...?"
    כל שאלה שאפשר לענות עליה בלי לקרוא את הטקסט, או ממשפט בודד אחד — פסולה.

  ✅ שאלה כשרה לממד א': מחייבת קריאה מדויקת + שילוב פרטים / הבחנה דקה.

  ⚠️ CRITICAL לפי שכבת גיל:
    כיתות ג'-ד': שאלות פשוטות יחסית — עדיין צריכות שילוב שני פרטים
    כיתות ה'-ו': שאלה חייבת לדרוש קריאת 2+ פסקאות ושילוב פרטים מרוחקים בטקסט
    כיתות ז'-ט': שאלה חייבת לדרוש הבחנה דקה בין פרטים דומים (names, dates, causes)
                  — ממש כמו שאלות מיצ"ב בפועל בכיתות ז'-ט'

  מילות הוראה: ציינו, פרטו, אתרו, כתבו, מה/מי/כיצד (רק כשהתשובה מפורשת בטקסט).
  פורמט: MC בלבד. תשובה חד-משמעית אחת.

  ⚠️ בניית מסיחים לממד א' — חובה פסיכומטרית:
    כל 3 מסיחים חייבים להיות מבוססי טקסט, לא המצאה:
    סוג 1 — "שכן טקסטואלי": פרט נכון שמופיע בטקסט אך שייך לאירוע/דמות/זמן אחר
    סוג 2 — "ערבוב תכונות": שילוב של שתי עובדות נכונות שנכתבו בנפרד
    סוג 3 — "פרט חלקי": חלק מהתשובה הנכונה בלבד, ללא השלמה

ממד ב — הבנת המשמעות המשתמעת (~25%):
  מסקנות שאינן כתובות מפורשות, יחסי סיבה–תוצאה לא מפורשים, מניעי דמויות.
  דורש: הסקה מ-2 עדויות לפחות; לא ניתן לצטט ישירות
  מילות הוראה: מדוע, מה הסיבה ל, הסבירו, מה אפשר ללמוד, מה גרם.
  פורמט: MC עם מסיחים תחרותיים / OPEN קצרה (1-2 נקודות).

  ⚠️ בניית מסיחים לממד ב' — חובה פסיכומטרית:
    סוג 1 — "מסקנה חלקית": נכון בחלקו אך מחסיר גורם מרכזי
    סוג 2 — "סיבה שכנה": גורם שמוזכר בטקסט אך אינו הגורם הישיר
    סוג 3 — "הגזמה לוגית": הרחבה לא-מוצדקת של מה שכתוב
    המסיחים לא יהיו "אבסורדיים" — כל מסיח יהיה בר-הגנה לתלמיד שלא קרא מספיק טוב

ממד ג — פרשנות, עיבוד ויישום (~25%):
  דורש: עיבוד ועמדה מנומקת. התלמיד מייצר הבנה משלו — לא מוצא ציטוט.
  כלול: אפיון דמות/תופעה, השוואה בין פרטים, הכללה, גיבוש עמדה מנומקת, יישום.
  מילות הוראה: אפיינו, השוו, בססו, לפי דעתכם, הסיקו, מה המסר, מה ניתן ללמוד.
  פורמט: OPEN רחבה (2-4 נקודות), TABLE, SEQUENCE, VOCAB.

  ⚠️ ניסוח שאלות ממד ג' — סגנון מיצ"ב:
    שאלה פסולה: "מה לדעתכם חשוב לדעת על X?" — פתוחה מדי
    שאלה פסולה: "אפיינו את הגיבור" — כללי מדי
    שאלה פסולה: "על סמך שתי בחירות של יותם בסיפור — (א) כאשר הוא אומר בפסקה 4... ו-(ב) כאשר..." — STEM ארוך ומסורבל, מכיל ראיות שהתלמיד צריך למצוא
    שאלה כשרה: "אפיינו תכונה מרכזית אחת של [שם הדמות]. בססו את תשובתכם בשתי דוגמאות מהטקסט."
    שאלה כשרה: "מה ניתן ללמוד על [תופעה/רעיון] מן הטקסט? בססו ב-2 ראיות."
    שאלה כשרה: "מה המסר המרכזי של הטקסט לדעתכם? הסבירו ובססו בציטוט."
    כלל ה-STEM הקצר: הגדירו מה לעשות, אל תפרטו איפה למצוא — זה תפקיד התלמיד.
    מחוון: תשובה לדוגמה מלאה ומנומקת + קריטריונים ברורים לציון חלקי

ממד ד — הערכה ביקורתית ורפלקציה (~30%):
  דורש: ניתוח בחירות הכותב, אמצעים ספרותיים/לשוניים, מבנה, מטרת הטקסט.
  מילות הוראה: מהי מטרת הכותב, מה תפקיד ה..., הסבירו את השפעת בחירת ה..., הערכה מנומקת.
  פורמט: OPEN רחבה עם דרישת ציטוט + פרשנות (3-4 נקודות).
  ⚠️ השאלה האחרונה תמיד ממד ד' ותתייחס לטקסט כמכלול.

══════════════════════════════════════
 פורמטי שאלות — הנחיות מפורטות
══════════════════════════════════════

MC (שאלת רב-ברירה):
  • 4 אפשרויות בפורמט: "1. טקסט", "2. טקסט", "3. טקסט", "4. טקסט"
  • כל 3 מסיחים: קצרים, חד-משמעיים, מבוססי הטקסט עצמו — ראה כללי מסיחים לפי ממד לעיל
  • correct_answer חייב להיות IDENTICAL לאחד מה-options (כולל המספר)
  • אסור: שאלות שליליות ("איזה מהבאים אינו"), אפשרות "כל הנ"ל", מסיחים אבסורדיים
  • ⚠️ distractor_rationale: לכל מסיח — סוג הטעות (ראה 3 סוגים לפי ממד) + הסבר מדוע תלמיד עלול לבחור בו

OPEN — צרה (narrow, 1-2 נקודות):
  • "ציינו שתי סיבות ל...", "הסבירו מדוע...", "תארו כיצד X הגיב כאשר..."
  • answer_lines: 2-3
  • מחוון: קריטריון מדויק לכל נקודה + תשובה לדוגמה מלאה עם ציטוט

OPEN — רחבה (broad, 3-4 נקודות):
  • "אפיינו את [X] וצטטו דוגמה לכל תכונה", "נמקו את עמדתכם לגבי... תוך ביסוס ב-2 ראיות"
  • answer_lines: 5-8
  • מחוון: 2-4 קריטריונים מדורגים; ציון חלקי מפורט; תשובה לדוגמה מפורטת

TABLE (טבלה להשלמה):
  • stem: "מלאו את הטבלה על פי הטקסט:" + הסבר מה ממלאים
  • table_headers: 2-3 שמות עמודות ברורים
  • table_rows: 2-4 שורות; תאים ריקים = "" (ימולאו ע"י תלמיד); תאים קבועים = ערך
  • ממד ב' או ג'; score_points = מספר התאים הריקים

SEQUENCE (רצף אירועים):
  • stem: "מספרו את האירועים לפי סדר התרחשותם בטקסט. כתבו 1 ליד הראשון, 2 ליד השני וכו'."
  • items: 4-5 אירועים מהטקסט בסדר מעורבב
  • correct_order: אינדקסים בסדר הנכון (0-based), למשל [2,0,3,1,4]

TRUE_FALSE (נכון / לא נכון + תיקון):
  • stem: "קראו את ההיגדים הבאים. סמנו V (נכון) או X (לא נכון). כאשר ההיגד שגוי — תקנו אותו בשורה המיועדת לכך."
  • statements: 4-5 משפטים; לפחות 2 נכונים ו-2 שגויים; ההיגדים השגויים יהיו "כמעט נכונים" (שינוי פרט אחד)
  • אל תכלול "לא" בגוף ההיגד עצמו
  • score_points: מספר ההיגדים (V/X נקודה, תיקון נקודה נוספת לשגוי)

VOCAB (אוצר מילים בהקשר):
  • stem: "בשורה ___ מופיעה המילה '___'. הסבירו את משמעות המילה על פי ההקשר."
  • בחרו מילה/ביטוי מעניין מנדבך 2 (עיוני-כללי) — לא מילה פשוטה שכל ילד יודע
  • word: המילה/ביטוי המדויק
  • context_sentence: המשפט המלא מהטקסט
  • ממד ג'; score_points: 2

══════════════════════════════════════
 ניסוח שאלות — עקרונות מיצ"ב
══════════════════════════════════════
כל שאלה חייבת להיות קצרה, ישירה וקריאה. התלמיד צריך להבין מיד מה עליו לעשות.

✅ כללי ניסוח חובה:
1. STEM קצר וברור: משפט או שניים לכל היותר. כל מידע מיותר — מחוץ ל-STEM.
2. אל תכלילו ראיות בשאלה: "בססו ב-2 ראיות מהטקסט" — כן. "על סמך (א) פסקה 2... ו-(ב) פסקה 5..." — לא.
3. מילת הוראה ברורה בסוף: "פרטו." / "הסבירו." / "אפיינו." / "בססו." / "סמנו."
4. לא לשאול שאלות שליליות ("מה אינו") — מבלבלות.
5. לא לשאול "מדוע, לפי דעתכם, חשוב ש..." — כללי מדי.

❌ לא:  "על סמך שתי בחירות של יותם — (א) כשהוא אומר בפסקה 4: '...' ו-(ב) כשהוא אינו... — אפיינו..."
✅ כן:  "אפיינו תכונה מרכזית אחת של יותם. בססו ב-2 דוגמאות מהטקסט."

❌ לא:  "כיצד ניתן לדעת על סמך קריאת הפסקה השלישית בשילוב עם הפסקה השישית ש..."
✅ כן:  "מה ניתן ללמוד מהטקסט על [נושא]? הסבירו."

══════════════════════════════════════
 כללי איכות חובה — פסיכומטריה
══════════════════════════════════════
1. כל שאלה מעוגנת למקום ספציפי ("בשורות X-Y", "בפסקה X") — ללא עיגון: השאלה לא תקפה
2. סדר שאלות: עוקב אחרי סדר הופעת המידע בטקסט (לא לפי ממד!)
3. שאלה אחרונה: תמיד ממד ד', OPEN רחבה, על הטקסט כמכלול
4. גיוון חובה: לפחות 4 MC, לפחות 2 OPEN, בדיוק 1 TABLE, לפחות 1 SEQUENCE או TRUE_FALSE, לפחות 1 VOCAB
5. MC: אסור שתי שאלות רצופות על אותה פסקה
6. OPEN: כל שאלת OPEN חייבת תשובת דוגמה מפורטת במחוון
7. מחוון אמין: ציון max_score = סכום הנקודות בקריטריונים; partial_credit מפורש
8. ⚠️ בדיקת איכות לפני הגשה: לכל שאלת MC — שאל את עצמך: "האם תלמיד חכם יכול לבחור כל אחד מהמסיחים אם לא קרא מספיק טוב?" — אם לא, שפר את המסיח.
9. ⚠️ בדיקת שאלות ממד א' לפני הגשה: "האם שאלה זו טריוויאלית?" — אם כן, הוסף דרישה לשילוב פרטים או הבחנה דקה.

══════════════════════════════════════
 שפה — עברית תקנית ומקצועית
══════════════════════════════════════
• ניסוח השאלות, המסיחים והמחוונים חייב להיות בעברית תקנית — ללא שגיאות דקדוק.
• האתר מיועד לאנשי חינוך — שפה עילגת פוגעת באמון במערכת.

רקע פדגוגי:
{foundation_context}

חובה: החזר JSON תקני בלבד — מערך של אובייקטי שאלה.
"""


def _build_question_user_prompt(
    text_content: str,
    text_title: str,
    text_type: str,
    anchor_map: dict,
    grade_cluster: str,
    num_questions: int,
    dim_examples: dict,
    sequence_start: int = 1,
    only_dimension: str | None = None,
) -> str:
    bounds = _get_dim_bounds(num_questions) if not only_dimension else {only_dimension: num_questions}
    type_heb = 'נרטיבי' if text_type == 'narrative' else 'מידעי'

    examples_str = ""
    for dim, examples in dim_examples.items():
        if examples:
            examples_str += f"\n\n══ דוגמאות שאלות ממד {dim} ממיצ\"ב/תנופה — לניסוח, רמה וסגנון ══\n"
            for ex in examples[:3]:
                examples_str += f"---\n{ex[:700]}\n"

    grade_note = {
        "3-4": "⚠️ כיתות ג'-ד': שאלות ממד א' פשוטות יחסית — עדיין שילוב 2 פרטים. שאלות ממד ב'-ד' מוצגות בשפה קלה ופשוטה.",
        "5-6": "⚠️ כיתות ה'-ו': שאלות ממד א' דורשות קריאת שתי פסקאות לפחות. שאלות ממד ג'-ד' דורשות ניתוח ועמדה מנומקת. ❌ אסור לשאול שאלות ילדותיות כמו 'כמה X הביאה'.",
        "7-9": "⚠️ כיתות ז'-ט': שאלות ממד א' דורשות הבחנה דקה בין פרטים דומים. שאלות ממד ג'-ד' דורשות ניתוח ביקורתי, אמצעים ספרותיים ועמדה מבוססת. ❌ אסור לשאול שאלות בסגנון כיתות ג'-ד'.",
    }.get(grade_cluster, "")

    dim_names = {"A": "א' — גלוי", "B": "ב' — משתמע", "C": "ג' — פרשנות", "D": "ד' — הערכה"}
    if only_dimension:
        dim_instruction = (
            f"צור {num_questions} שאלות ממד {dim_names.get(only_dimension, only_dimension)} בלבד.\n"
            f"מספור: מתחיל מ-{sequence_start}."
        )
        format_rules = {
            "A": "  • פורמט: MC בלבד (חובה). כל שאלה דורשת שילוב של לפחות 2 פרטים.",
            "B": "  • פורמט: חובה גיוון! אם num_questions ≥ 2 — כלול בדיוק 1 שאלת TABLE (טבלה: table_headers כמו ['קטגוריה','פרט מהטקסט','משמעות'] + table_rows עם תאים ריקים \"\" להשלמה). אם num_questions ≥ 3 — גם TRUE_FALSE (3-4 היגדים) ו-MC.",
            "C": "  • פורמט: OPEN רחבה, VOCAB, SEQUENCE. גוון — אל תחזור על פורמט.",
            "D": "  • פורמט: OPEN רחבה עם ציטוט. השאלה האחרונה על הטקסט כמכלול.",
        }.get(only_dimension, "")
        anchor_relevant = json.dumps(anchor_map.get(only_dimension, []), ensure_ascii=False)
        task_header = f"""צור {num_questions} שאלות הבנת נקרא לממד {dim_names.get(only_dimension, only_dimension)} בסטנדרט ראמ"ה.

{grade_note}
{dim_instruction}
{format_rules}"""
        anchor_section = f"עוגנים לממד {only_dimension}: {anchor_relevant}"
    else:
        task_header = f"""בנה מארג של {num_questions} שאלות הבנת נקרא לטקסט הבא בסטנדרט ראמ"ה המדויק.

{grade_note}"""
        anchor_section = f"""מפת עוגנים מהטקסט (השתמש בהם לבסיס השאלות):
ממד א' (גלוי): {json.dumps(anchor_map.get('A', []), ensure_ascii=False)}
ממד ב' (משתמע): {json.dumps(anchor_map.get('B', []), ensure_ascii=False)}
ממד ג' (פרשנות): {json.dumps(anchor_map.get('C', []), ensure_ascii=False)}
ממד ד' (הערכה): {json.dumps(anchor_map.get('D', []), ensure_ascii=False)}"""

    format_section = "" if only_dimension else f"""
גיוון פורמטים (חובה לעמוד בכולם — אי-עמידה = שגיאה):
  ✓ לפחות 4 שאלות MC
  ✓ לפחות 2 שאלות OPEN (לפחות 1 צרה ו-1 רחבה)
  ✓ בדיוק 1 שאלת TABLE — חובה! טבלה עם table_headers (2-3 עמודות) ו-table_rows (2-4 שורות). תאים ריקים = "" להשלמה ע"י תלמיד. דוגמה: השוואת דמויות, מיון פרטים, מילוי לפי הטקסט.
  ✓ בדיוק 1 שאלת TRUE_FALSE עם 3-4 היגדים ודרישת תיקון להיגדים השגויים (ממד א'/ב')
  ✓ בדיוק 1 שאלת VOCAB (ממד ג')
  ✓ במידת האפשר: שאלת SEQUENCE (סדר אירועים/צעדים) — אם מתאים לטקסט
בשאלות: השתמשו בטבלאות כשיש השוואה/מיון; הדגישו מילות הוראה (נמקו, הסבירו, ציינו) בשאלות פתוחות."""

    last_q_note = "" if only_dimension else f"  • שאלה מספר {sequence_start + num_questions - 1} (האחרונה): חייבת להיות ממד ד', OPEN רחבה, על הטקסט כמכלול\n"

    # Detect if informational text has sidebars (non-continuous) and add guidance
    has_sidebars = text_type == "informational" and "\n\n[" in text_content and "]" in text_content
    sidebar_note = (
        "\n⚠️ הטקסט המידעי כולל רכיבים נלווים (מסומנים ב-[...]). "
        "חובה לכלול לפחות שאלה אחת-שתיים המתייחסות לרכיב נלווה ספציפי — "
        "לדוגמה: 'במה הרכיב X מוסיף להבנת הטקסט המרכזי?' / 'מה תפקידו של הנתון שמופיע ב...?' / 'כיצד הרכיב הנלווה ממחיש את הרעיון המרכזי?'"
    ) if has_sidebars else ""

    return f"""{task_header}{sidebar_note}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
הטקסט:
כותרת: {text_title}
סוג: {type_heb}
אשכול כיתות: {grade_cluster}

{text_content}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{anchor_section}
{format_section}
סדר:
  • כל השאלות מסודרות לפי סדר הופעת המידע בטקסט
{last_q_note}  • מספור: מתחיל מ-{sequence_start}
{examples_str}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
החזר JSON — מערך שאלות בפורמט הבא (כל סוג מוצג):

[
  {{
    "sequence": {sequence_start},
    "dimension": "A",
    "format": "MC",
    "stem": "על פי הטקסט, [שאלה שדורשת שילוב/הבחנה של פרטים — לא שאלה ניתן לענות ממשפט בודד]?",
    "options": [
      "1. תשובה נכונה — פרט ספציפי מהטקסט",
      "2. מסיח: פרט נכון מהטקסט אך שייך להקשר אחר (שכן טקסטואלי)",
      "3. מסיח: שילוב שגוי של שני פרטים נכונים (ערבוב תכונות)",
      "4. מסיח: חלק מהתשובה הנכונה בלבד (פרט חלקי)"
    ],
    "correct_answer": "1. תשובה נכונה — פרט ספציפי מהטקסט",
    "distractor_rationale": {{
      "2. מסיח: פרט נכון...": "סוג: שכן טקסטואלי — תלמיד שקרא בחיפזון יבלבל עם [X מהטקסט]",
      "3. מסיח: שילוב...": "סוג: ערבוב תכונות — מחבר בין [עובדה A] ו-[עובדה B] שמופיעות בנפרד",
      "4. מסיח: חלק...": "סוג: פרט חלקי — נכון אך חסר את [המידע המשלים] שמופיע בהמשך"
    }},
    "rubric": {{"max_score": 1, "criteria": ["בחירת התשובה הנכונה"], "partial_credit": "", "sample_answer": "", "answer_lines": 0}},
    "score_points": 1,
    "text_reference": "שורות X-Y",
    "anchor_type": "A"
  }},
  {{
    "sequence": {sequence_start + 1},
    "dimension": "B",
    "format": "MC",
    "stem": "מדוע [דמות/תופעה מהטקסט] [פעולה/מצב]? (מסקנה שאינה כתובה מפורשות)",
    "options": [
      "1. הסבר הנכון — מסקנה המבוססת על 2 רמזים בטקסט",
      "2. מסיח: מסקנה חלקית — נכונה בחלקה אך מחסירה גורם מרכזי",
      "3. מסיח: סיבה שכנה — מוזכרת בטקסט אך אינה הגורם הישיר",
      "4. מסיח: הגזמה לוגית — הרחבה לא-מוצדקת של הכתוב"
    ],
    "correct_answer": "1. הסבר הנכון — מסקנה המבוססת על 2 רמזים בטקסט",
    "distractor_rationale": {{
      "2. מסיח: מסקנה חלקית": "סוג: מסקנה חלקית — תלמיד שקרא רק פסקה 1 יבחר בזה; חסר [הגורם X]",
      "3. מסיח: סיבה שכנה": "סוג: סיבה שכנה — [X] מוזכר ב[פסקה Y] אך אינו מסביר את [ה-Z]",
      "4. מסיח: הגזמה לוגית": "סוג: הגזמה — תלמיד שמסיק יותר מדי מהנאמר עלול לבחור בזה"
    }},
    "rubric": {{"max_score": 1, "criteria": ["בחירת ההסבר הנכון"], "partial_credit": "", "sample_answer": "", "answer_lines": 0}},
    "score_points": 1,
    "text_reference": "פסקאות X-Y",
    "anchor_type": "B"
  }},
  {{
    "sequence": {sequence_start + 2},
    "dimension": "B",
    "format": "OPEN",
    "stem": "הסבירו מדוע [דמות/תופעה מהטקסט] [פעולה/מצב]. ציינו שתי סיבות ועגנו כל אחת בטקסט.",
    "options": null,
    "correct_answer": "",
    "distractor_rationale": {{}},
    "rubric": {{
      "max_score": 2,
      "criteria": ["סיבה ראשונה מנומקת — מבוססת על רמז מפסקה X (1 נקודה)", "סיבה שנייה מנומקת — מבוססת על רמז מפסקה Y (1 נקודה)"],
      "partial_credit": "1 נקודה: ציון סיבה אחת בלבד עם עיגון",
      "sample_answer": "סיבה א — '...[ציטוט]' — כלומר [הסבר]. סיבה ב — '[ציטוט]' — כלומר [הסבר].",
      "answer_lines": 4
    }},
    "score_points": 2,
    "text_reference": "פסקה X",
    "anchor_type": "B"
  }},
  {{
    "sequence": {sequence_start + 3},
    "dimension": "B",
    "format": "TRUE_FALSE",
    "stem": "קראו את ההיגדים הבאים. סמנו V (נכון) או X (לא נכון) לצד כל היגד. כאשר ההיגד שגוי — תקנו אותו בשורה המיועדת לכך.",
    "statements": [
      {{"text": "היגד נכון — מבוסס על פרט מהטקסט", "correct": true, "correction": ""}},
      {{"text": "היגד כמעט-נכון — שינוי פרט אחד הופך אותו לשגוי", "correct": false, "correction": "התיקון: [הניסוח הנכון]"}},
      {{"text": "היגד נכון שני", "correct": true, "correction": ""}},
      {{"text": "היגד כמעט-נכון שני — שינוי פרט אחד הופך אותו לשגוי", "correct": false, "correction": "התיקון: [הניסוח הנכון]"}}
    ],
    "options": null,
    "correct_answer": "",
    "distractor_rationale": {{}},
    "rubric": {{
      "max_score": 6,
      "criteria": ["V/X נכון לכל היגד (4 נקודות — נקודה לכל היגד)", "תיקון מדויק לכל היגד שגוי (2 נקודות — נקודה לכל תיקון)"],
      "partial_credit": "1 נקודה לכל V/X נכון; 1 נקודה לכל תיקון מדויק",
      "sample_answer": "היגד 1: V | היגד 2: X — תיקון: [הניסוח הנכון] | היגד 3: V | היגד 4: X — תיקון: [הניסוח הנכון]",
      "answer_lines": 0
    }},
    "score_points": 6,
    "text_reference": "כל הטקסט",
    "anchor_type": "B"
  }},
  {{
    "sequence": {sequence_start + 4},
    "dimension": "B",
    "format": "TABLE",
    "stem": "מלאו את הטבלה על פי הטקסט:",
    "options": null,
    "correct_answer": "",
    "distractor_rationale": {{}},
    "table_headers": ["קטגוריה", "פרט מהטקסט", "משמעות/תוצאה"],
    "table_rows": [["קטגוריה ראשונה (קבוע)", "", ""], ["קטגוריה שנייה (קבוע)", "", ""]],
    "rubric": {{
      "max_score": 4,
      "criteria": ["שורה 1, עמודה 2: פרט נכון (1 נקודה)", "שורה 1, עמודה 3: משמעות נכונה (1 נקודה)", "שורה 2, עמודה 2: פרט נכון (1 נקודה)", "שורה 2, עמודה 3: משמעות נכונה (1 נקודה)"],
      "partial_credit": "1 נקודה לכל תא מולא נכון",
      "sample_answer": "",
      "answer_lines": 0
    }},
    "score_points": 4,
    "text_reference": "פסקאות 1-3",
    "anchor_type": "B"
  }},
  {{
    "sequence": {sequence_start + 5},
    "dimension": "C",
    "format": "VOCAB",
    "stem": "בטקסט מופיע הביטוי '[מילה/ביטוי מנדבך 2 — לא מילה שגרתית]'. הסבירו את משמעותו על פי ההקשר.",
    "word": "הביטוי/המילה",
    "context_sentence": "המשפט המלא מהטקסט.",
    "options": null,
    "correct_answer": "",
    "distractor_rationale": {{}},
    "rubric": {{
      "max_score": 2,
      "criteria": ["פירוש מדויק של הביטוי (1 נקודה)", "ביסוס על ההקשר הטקסטואלי — קישור לנאמר לפני/אחרי (1 נקודה)"],
      "partial_credit": "1 נקודה: פירוש כללי נכון ללא ביסוס הקשר",
      "sample_answer": "הביטוי '[X]' משמעותו ___ בהקשר זה מכיוון ש___ [ציטוט קצר מהטקסט].",
      "answer_lines": 3
    }},
    "score_points": 2,
    "text_reference": "שורה X",
    "anchor_type": "C"
  }},
  {{
    "sequence": {sequence_start + 6},
    "dimension": "C",
    "format": "OPEN",
    "stem": "על סמך [שתי בחירות/מצבים/פעולות ספציפיות שצוינו מהטקסט], אפיינו תכונה מרכזית אחת של [דמות/תופעה]. בססו כל ראיה בציטוט מהטקסט.",
    "options": null,
    "correct_answer": "",
    "distractor_rationale": {{}},
    "rubric": {{
      "max_score": 3,
      "criteria": [
        "זיהוי תכונה רלוונטית ומנומקת (1 נקודה)",
        "ראיה ראשונה: ציטוט מהטקסט + פרשנות ברורה (1 נקודה)",
        "ראיה שנייה: ציטוט מהטקסט + פרשנות ברורה (1 נקודה)"
      ],
      "partial_credit": "1 נקודה: תכונה בלבד ללא ראיות. 2 נקודות: תכונה + ראיה אחת עם ציטוט.",
      "sample_answer": "תכונה: [X]. ראיה א: '[ציטוט]' — כלומר [פרשנות]. ראיה ב: '[ציטוט]' — כלומר [פרשנות].",
      "answer_lines": 6
    }},
    "score_points": 3,
    "text_reference": "פסקאות X-Y",
    "anchor_type": "C"
  }},
  {{
    "sequence": {sequence_start + num_questions - 1},
    "dimension": "D",
    "format": "OPEN",
    "stem": "[שאלה על בחירת הכותב/אמצעי ספרותי/מבנה הטקסט]. הסבירו את השפעת הבחירה הזו על הקורא. הביאו שתי דוגמאות מהטקסט ונמקו.",
    "options": null,
    "correct_answer": "",
    "distractor_rationale": {{}},
    "rubric": {{
      "max_score": 4,
      "criteria": [
        "זיהוי הבחירה הרטורית/הספרותית וניסוחה (1 נקודה)",
        "דוגמה ראשונה: ציטוט + הסבר ההשפעה על הקורא (1.5 נקודות)",
        "דוגמה שנייה: ציטוט + הסבר ההשפעה על הקורא (1.5 נקודות)"
      ],
      "partial_credit": "2 נקודות: זיהוי + דוגמה אחת עם ציטוט. 3 נקודות: שתי דוגמאות ללא ניתוח השפעה מספק.",
      "sample_answer": "הכותב בחר ב[X]. דוגמה א: '[ציטוט]' — הבחירה יוצרת [השפעה על הקורא]. דוגמה ב: '[ציטוט]' — [פרשנות].",
      "answer_lines": 8
    }},
    "score_points": 4,
    "text_reference": "הטקסט כמכלול",
    "anchor_type": "D"
  }}
]"""


def _get_dim_bounds(n: int) -> dict:
    """Calculate target question count per dimension for n total questions."""
    a = max(1, round(n * 0.20))
    d = max(2, round(n * 0.30))
    bc = n - a - d
    b = max(1, bc // 2)
    c = bc - b
    return {"A": a, "B": b, "C": c, "D": d}


def _extract_json_array(raw: str) -> list:
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`").strip()
    # Fix Python-style literals that GPT sometimes emits
    cleaned = cleaned.replace(": True", ": true").replace(": False", ": false").replace(": None", ": null")

    def _fix_and_parse(text: str) -> list:
        text = re.sub(r",\s*([}\]])", r"\1", text)
        return json.loads(text)

    # Strategy 1: regex match [...]
    match = re.search(r"\[.*\]", cleaned, re.DOTALL)
    if match:
        try:
            return _fix_and_parse(match.group())
        except json.JSONDecodeError:
            pass

    # Strategy 2: direct parse
    try:
        result = json.loads(cleaned)
        if isinstance(result, list):
            return result
    except json.JSONDecodeError:
        pass

    # Strategy 3: first [ to last ]
    start = cleaned.find("[")
    end = cleaned.rfind("]")
    if start != -1 and end > start:
        try:
            return _fix_and_parse(cleaned[start:end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"No valid JSON array found. Response preview: {raw[:300]}")


async def _generate_for_dim(
    text_content: str,
    text_title: str,
    text_type: str,
    anchor_map: dict,
    grade_cluster: str,
    dimension: str,
    num_questions: int,
    sequence_start: int,
    foundation_context: str,
    system_prompt: str,
) -> list:
    """Generate questions for ONE dimension — intended to run in parallel with other dims."""
    # Use fast model for simple retrieval/inference (A/B), slow model for deep analysis (C/D)
    model = FAST_MODEL_NAME if dimension in ("A", "B") else MODEL_NAME

    dim_examples = {dimension: get_question_examples(grade_cluster, dimension, n=3)}
    user = _build_question_user_prompt(
        text_content, text_title, text_type, anchor_map,
        grade_cluster, num_questions, dim_examples, sequence_start,
        only_dimension=dimension,
    )

    rubric_schema = {
        "type": "object",
        "properties": {
            "max_score": {"type": "integer"},
            "criteria": {"type": "array", "items": {"type": "string"}},
            "partial_credit": {"type": "string"},
            "sample_answer": {"type": "string"},
            "answer_lines": {"type": "integer"},
        },
        "required": ["max_score", "criteria", "partial_credit", "sample_answer", "answer_lines"],
    }
    question_schema = {
        "type": "object",
        "properties": {
            "sequence": {"type": "integer"},
            "dimension": {"type": "string"},
            "format": {"type": "string"},
            "stem": {"type": "string"},
            "options": {"type": "array", "items": {"type": "string"}},
            "correct_answer": {"type": "string"},
            "distractor_rationale": {"type": "object"},
            "table_headers": {"type": "array", "items": {"type": "string"}},
            "table_rows": {"type": "array", "items": {"type": "array", "items": {"type": "string"}}},
            "items": {"type": "array", "items": {"type": "string"}},
            "correct_order": {"type": "array", "items": {"type": "integer"}},
            "statements": {"type": "array"},
            "word": {"type": "string"},
            "context_sentence": {"type": "string"},
            "rubric": rubric_schema,
            "score_points": {"type": "integer"},
            "text_reference": {"type": "string"},
            "anchor_type": {"type": "string"},
            "is_cross_text": {"type": "boolean"},
        },
        "required": ["sequence", "dimension", "format", "stem", "correct_answer", "rubric", "score_points"],
    }
    tool_def = {
        "name": "submit_questions",
        "description": f"הגש את שאלות ממד {dimension} שנוצרו",
        "input_schema": {
            "type": "object",
            "properties": {"questions": {"type": "array", "items": question_schema}},
            "required": ["questions"],
        },
    }
    # Use smaller max_tokens for simpler dimensions
    max_tok = 4000 if dimension in ("A", "B") else 6000
    result = await _call_with_tool(system_prompt, user, tool_def, max_tok, model=model)
    questions = result.get("questions", [])
    for i, q in enumerate(questions):
        q["sequence"] = sequence_start + i
        if "options" not in q:
            q["options"] = None
        if "distractor_rationale" not in q:
            q["distractor_rationale"] = {}
        if "rubric" not in q:
            q["rubric"] = {"max_score": 1, "criteria": [], "partial_credit": "", "sample_answer": "", "answer_lines": 0}
        # Ensure TABLE questions have table_headers and table_rows (AI sometimes omits them)
        if (q.get("format") or "").upper() == "TABLE":
            if not q.get("table_headers") or not isinstance(q["table_headers"], list):
                q["table_headers"] = ["קטגוריה", "פרט מהטקסט", "משמעות/הסבר"]
            if not q.get("table_rows") or not isinstance(q["table_rows"], list):
                q["table_rows"] = [["", "", ""], ["", "", ""]]
    # Dimension B: if 2+ questions and no TABLE, convert one to TABLE
    if dimension == "B" and num_questions >= 2:
        has_table = any((q.get("format") or "").upper() == "TABLE" for q in questions)
        if not has_table:
            # Convert second question to TABLE (fallback when AI omits TABLE)
            idx = min(1, len(questions) - 1)
            q = questions[idx]
            q["format"] = "TABLE"
            q["stem"] = "מלאו את הטבלה על פי הטקסט (השוואה בין פרטים/דמויות/מצבים):"
            q["table_headers"] = ["קטגוריה", "פרט מהטקסט", "משמעות/תוצאה"]
            q["table_rows"] = [["", "", ""], ["", "", ""]]
            q["options"] = None
            q["correct_answer"] = ""
            if "rubric" in q and isinstance(q["rubric"], dict):
                q["rubric"]["max_score"] = q["rubric"].get("max_score", 4)
                q["rubric"]["criteria"] = ["שורה 1: פרט נכון + משמעות (2 נקודות)", "שורה 2: פרט נכון + משמעות (2 נקודות)"]
                q["rubric"]["answer_lines"] = 0
    return questions


async def _generate_for_text(
    text_content: str,
    text_title: str,
    text_type: str,
    anchor_map: dict,
    grade_cluster: str,
    num_questions: int,
    sequence_start: int,
) -> list:
    """Generate questions for a single text — parallelized across dimensions."""
    # Pre-load shared resources once
    foundation_context = get_foundation_context(["task_component", "reader_component"])
    system_prompt = _build_question_system_prompt(foundation_context)

    bounds = _get_dim_bounds(num_questions)

    # Build per-dim tasks with correct sequence offsets
    tasks = []
    seq = sequence_start
    for dim in ("A", "B", "C", "D"):
        n = bounds[dim]
        if n > 0:
            tasks.append(_generate_for_dim(
                text_content, text_title, text_type, anchor_map,
                grade_cluster, dim, n, seq, foundation_context, system_prompt,
            ))
            seq += n

    results = await asyncio.gather(*tasks, return_exceptions=True)

    import logging
    _log = logging.getLogger(__name__)

    all_questions: list = []
    for dim, result in zip(("A", "B", "C", "D"), results):
        if isinstance(result, list):
            all_questions.extend(result)
        elif isinstance(result, Exception):
            _log.error("Dim %s question generation failed: %s", dim, result, exc_info=result)

    # Re-sort by sequence number
    all_questions.sort(key=lambda q: q.get("sequence", 9999))
    return all_questions


async def _generate_cross_text_question(
    narrative_content: str,
    narrative_title: str,
    info_content: str,
    info_title: str,
    grade_cluster: str,
    sequence_number: int,
) -> dict:
    """Generate one cross-text question requiring both texts."""
    system = (
        "אתה מומחה פסיכומטרי בסטנדרט ראמ\"ה. "
        "צור שאלת מיזוג מידע ברמת ממד ג' או ד' הדורשת שימוש בשני הטקסטים גם יחד. "
        "השאלה תדרוש ציטוט/עדות מכל אחד מהטקסטים ונימוק מפורט."
    )
    # Use readable (unpacked) text snippets
    narr_snippet = _unpack_text_content(narrative_content)[:700]
    info_snippet = _unpack_text_content(info_content)[:700]

    user = f"""צור שאלת מיזוג מידע אחת — ממד ג' (פרשנות) או ד' (הערכה ביקורתית) — הדורשת שימוש בשני הטקסטים.

טקסט נרטיבי: "{narrative_title}"
{narr_snippet}

טקסט מידעי: "{info_title}"
{info_snippet}

הנחיות:
• ממד ג' — השוואה, הסקת מסקנה משותפת, יישום מהמידעי על הנרטיבי
• ממד ד' — הערכה: מה תרומת כל טקסט להבנת הנושא? כיצד המסר המידעי מחזק/מאיר את הסיפור?
• חובה לציין "בססו את תשובתכם בעדות מכל אחד מהטקסטים"
• מחוון עם 3 קריטריונים: זיהוי + עדות מטקסט 1 + עדות מטקסט 2

החזר JSON של שאלה אחת (לא מערך):
{{
  "sequence": {sequence_number},
  "dimension": "C",
  "format": "OPEN",
  "stem": "שאלה מעמיקה הדורשת שימוש בשני הטקסטים... בססו את תשובתכם בעדות מכל אחד מהטקסטים.",
  "options": null,
  "correct_answer": "",
  "distractor_rationale": {{}},
  "rubric": {{
    "max_score": 4,
    "criteria": [
      "זיהוי הקשר התמטי בין שני הטקסטים (1 נקודה)",
      "עדות/ציטוט מהטקסט הנרטיבי עם פרשנות (1.5 נקודות)",
      "עדות/ציטוט מהטקסט המידעי עם פרשנות (1.5 נקודות)"
    ],
    "partial_credit": "2 נקודות: זיהוי + עדות מטקסט אחד בלבד. 3 נקודות: עדויות משני הטקסטים ללא פרשנות מספקת.",
    "sample_answer": "הטקסטים קשורים ב___. בטקסט הנרטיבי: '...' — כלומר ___. בטקסט המידעי: '...' — כלומר ___.",
    "answer_lines": 8
  }},
  "score_points": 4,
  "text_reference": "שני הטקסטים",
  "anchor_type": "C",
  "is_cross_text": true
}}"""

    tool_def = {
        "name": "submit_cross_question",
        "description": "הגש את שאלת המיזוג",
        "input_schema": {
            "type": "object",
            "properties": {
                "sequence": {"type": "integer"},
                "dimension": {"type": "string"},
                "format": {"type": "string"},
                "stem": {"type": "string"},
                "options": {"type": "array", "items": {"type": "string"}},
                "correct_answer": {"type": "string"},
                "distractor_rationale": {"type": "object"},
                "rubric": {
                    "type": "object",
                    "properties": {
                        "max_score": {"type": "integer"},
                        "criteria": {"type": "array", "items": {"type": "string"}},
                        "partial_credit": {"type": "string"},
                        "sample_answer": {"type": "string"},
                        "answer_lines": {"type": "integer"},
                    },
                    "required": ["max_score", "criteria", "partial_credit", "sample_answer", "answer_lines"],
                },
                "score_points": {"type": "integer"},
                "text_reference": {"type": "string"},
                "anchor_type": {"type": "string"},
            },
            "required": ["sequence", "dimension", "format", "stem", "rubric", "score_points"],
        },
    }
    try:
        q = await _call_with_tool(system, user, tool_def, 1000)
        q["is_cross_text"] = True
        return q
    except Exception:
        pass
    # Fallback
    return {
        "sequence": sequence_number,
        "dimension": "C",
        "format": "OPEN",
        "stem": f"השוו בין הרעיון המרכזי ב\"{narrative_title}\" לבין המידע המוצג ב\"{info_title}\". מה הזיקה ביניהם? בססו את תשובתכם בעדות מכל אחד מהטקסטים.",
        "options": None,
        "correct_answer": "",
        "distractor_rationale": {},
        "rubric": {
            "max_score": 4,
            "criteria": [
                "זיהוי הקשר התמטי בין שני הטקסטים (1 נקודה)",
                "עדות/ציטוט מהטקסט הנרטיבי עם פרשנות (1.5 נקודות)",
                "עדות/ציטוט מהטקסט המידעי עם פרשנות (1.5 נקודות)",
            ],
            "partial_credit": "2 נקודות: זיהוי + עדות מטקסט אחד בלבד. 3 נקודות: עדויות משני הטקסטים ללא פרשנות מספקת.",
            "sample_answer": "הטקסטים קשורים ב___. בטקסט הנרטיבי: '...' — כלומר ___. בטקסט המידעי: '...' — כלומר ___.",
            "answer_lines": 8,
        },
        "score_points": 4,
        "text_reference": "שני הטקסטים",
        "anchor_type": "C",
        "is_cross_text": True,
    }


async def generate_questions(
    narrative_text: dict,
    informational_text: dict,
    grade_cluster: str,
) -> dict:
    """
    Generate all questions for the exam.
    Returns {
        "narrative_questions": [...],
        "informational_questions": [...],
        "cross_text_question": {...}
    }
    """
    # Unpack non-continuous JSON to readable text before question generation
    narr_content_for_q = _unpack_text_content(narrative_text["content"])
    info_content_for_q = _unpack_text_content(informational_text["content"])

    # Run narrative and informational question generation in parallel
    narr_task = _generate_for_text(
        text_content=narr_content_for_q,
        text_title=narrative_text["title"],
        text_type="narrative",
        anchor_map=narrative_text.get("anchor_map", {}),
        grade_cluster=grade_cluster,
        num_questions=TARGET_PER_TEXT,
        sequence_start=1,
    )

    info_task = _generate_for_text(
        text_content=info_content_for_q,
        text_title=informational_text["title"],
        text_type="informational",
        anchor_map=informational_text.get("anchor_map", {}),
        grade_cluster=grade_cluster,
        num_questions=TARGET_PER_TEXT,
        sequence_start=TARGET_PER_TEXT + 1,
    )

    # Run all 3 tasks in parallel — cross-text doesn't depend on question results
    cross_task = _generate_cross_text_question(
        narrative_content=narr_content_for_q,
        narrative_title=narrative_text["title"],
        info_content=info_content_for_q,
        info_title=informational_text["title"],
        grade_cluster=grade_cluster,
        sequence_number=TARGET_PER_TEXT * 2 + 1,
    )
    results = await asyncio.gather(narr_task, info_task, cross_task, return_exceptions=True)

    import logging
    _log = logging.getLogger(__name__)

    narr_questions = results[0] if isinstance(results[0], list) else []
    if isinstance(results[0], Exception):
        _log.error("Narrative question generation failed: %s", results[0], exc_info=results[0])

    info_questions = results[1] if isinstance(results[1], list) else []
    if isinstance(results[1], Exception):
        _log.error("Informational question generation failed: %s", results[1], exc_info=results[1])

    cross_q = results[2] if isinstance(results[2], dict) else None
    if isinstance(results[2], Exception):
        _log.error("Cross-text question generation failed: %s", results[2], exc_info=results[2])

    if not narr_questions and not info_questions:
        raise ValueError("שתי משימות יצירת השאלות נכשלו — בדקי לוגים")

    if cross_q:
        cross_q["sequence"] = len(narr_questions) + len(info_questions) + 1

    return {
        "narrative_questions": narr_questions,
        "informational_questions": info_questions,
        "cross_text_question": cross_q,
    }


async def fix_distractors(
    stem: str,
    correct_answer: str,
    grade_cluster: str,
) -> list[str]:
    """
    מייצר מחדש 3 מסיחים פסיכומטריים לשאלת רב-ברירה בעקבות עריכת המורה.
    מחזיר רשימה של 4 אפשרויות: [תשובה נכונה, מסיח1, מסיח2, מסיח3]
    """
    user = f"""שאלת רב-ברירה לכיתות {grade_cluster}:

שאלה: {stem}
תשובה נכונה: {correct_answer}

צור 3 מסיחים פסיכומטריים — כל אחד מסוג שונה:
סוג 1 — "שכן טקסטואלי": תשובה שנראית נכונה לתלמיד שקרא בחיפזון, מבוססת על פרט אמיתי אך מהקשר אחר
סוג 2 — "ערבוב פרטים": שילוב שגוי של שני פרטים נכונים שמופיעים בנפרד בטקסט
סוג 3 — "פרט חלקי": חלק מהתשובה הנכונה בלבד, ללא המידע המשלים

דרישות: קצרים, חד-משמעיים, לא אבסורדיים, לא זהים לתשובה הנכונה.

החזר JSON בלבד:
{{"distractors": ["מסיח סוג 1", "מסיח סוג 2", "מסיח סוג 3"]}}"""

    tool_def = {
        "name": "submit_distractors",
        "description": "הגש את המסיחים שנוצרו",
        "input_schema": {
            "type": "object",
            "properties": {
                "distractors": {"type": "array", "items": {"type": "string"}, "description": "3 מסיחים פסיכומטריים"},
            },
            "required": ["distractors"],
        },
    }
    try:
        data = await _call_with_tool(
            "אתה מומחה פסיכומטרי בכיר בבניית שאלות הבנת נקרא בסטנדרט ראמ\"ה.", user, tool_def, 400, model=FAST_MODEL_NAME
        )
        distractors = data.get("distractors", [])
        return [correct_answer] + distractors[:3]
    except Exception:
        return [correct_answer]
