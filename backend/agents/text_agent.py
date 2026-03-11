"""
Agent 1 — Text Agent
Generates a thematically linked pair of Hebrew texts (narrative + informational)
with embedded comprehension anchors for all 4 dimensions.
"""
# no-prefill

import asyncio
import json
import re
from typing import AsyncIterator

from anthropic import AsyncAnthropic

from config import settings, MODEL_NAME, FAST_MODEL_NAME, MAX_TOKENS, GRADE_WORD_COUNTS
from knowledge.engine import get_text_examples, get_foundation_context
from services.word_count import count_hebrew_words


client = AsyncAnthropic(api_key=settings.anthropic_api_key)


async def _call_with_tool(
    system: str, user: str, tool_def: dict, max_tokens: int, model: str = MODEL_NAME
) -> dict:
    """Call Claude with tool use — guarantees structured output, no JSON parsing needed."""
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


# נושאים חסומים — לא ייוצרו טקסטים/תמות על נושאים אלו
BLOCKED_TOPICS = [
    "תרומת איברים", "השתלת איברים",
    "אלימות", "פגיעה גופנית", "התעללות",
    "מוות", "אובדן", "התאבדות",
    "מין", "מיניות",
    "סמים", "אלכוהול",
    "מלחמה", "טרור", "פיגוע",
    "גזענות", "אפליה",
    "ניצול", "תקיפה",
]


def _check_blocked_content(text: str) -> str | None:
    """מחזיר את הנושא החסום אם נמצא, אחרת None."""
    text_lower = text.lower()
    for blocked in BLOCKED_TOPICS:
        if blocked in text_lower or blocked in text:
            return blocked
    return None


# ── Age-appropriate thematic boundaries ──────────────────────────────────────
# These restrictions apply to NARRATIVE texts.  They prevent heavy/traumatic
# topics that are educationally unsuitable for younger grade bands.
NARRATIVE_THEME_RESTRICTIONS: dict[str, str] = {
    "3-4": (
        "🚫 נושאים אסורים לנרטיבי בכיתות ג'–ד' (גיל 8–10) — אינם מתאימים רגשית-חינוכית:\n"
        "  ❌ עוני, מחסור כלכלי, רעב, חסרי בית\n"
        "  ❌ חולי קשה, מחלות כרוניות, שיקום פיזי\n"
        "  ❌ פציעה גופנית חמורה, תאונות קשות\n"
        "  ❌ בריונות, ניצול, אלימות\n"
        "  ❌ מוות, אבל, אבדן הורה\n"
        "  ❌ גירושין, פירוק משפחה\n"
        "  ❌ ניכור חברתי קיצוני, דיכאון\n"
        "✅ נושאים מתאימים לגיל ג'–ד': חברות, תחרות ספורט/כישרון, הרפתקה בטבע, "
        "חיות מחמד, המצאה/יצירה, ביקור מעניין, עזרה לחבר, חגיגה משפחתית, "
        "קונפליקט יומיומי שנפתר בבגרות ובחמלה, גילוי כישרון מפתיע."
    ),
    "5-6": (
        "🚫 נושאים שיש להימנע מהם בנרטיבי לכיתות ה'–ו' (גיל 10–12):\n"
        "  ❌ חולי ממושך וקשה, שיקום פיזי מורכב (מחלה עדינה — מותרת)\n"
        "  ❌ עוני קיצוני, חסרי בית\n"
        "  ❌ אלימות, התעללות, ניצול\n"
        "  ❌ מוות של הורה (מוות של סבא/סבתא — מותר בהקשר טבעי)\n"
        "✅ נושאים מתאימים: מנהיגות, ספורט ותחרות, יזמות, הגנה על חבר, "
        "גילוי משמעות, עצמאות, עזרה לקהילה, עמידה בלחץ חברתי, ניהול קונפליקט מוסרי."
    ),
    "7-9": (
        "⚠️ לנרטיבי בכיתות ז'–ט' ניתן לגעת בנושאים מורכבים — אך בעדינות ובבגרות:\n"
        "  ✅ מותר: קושי משפחתי, בריאות נפשית, עצמאות, זהות, לחץ חברתי, קונפליקטים מוסריים\n"
        "  ❌ אסור: אלימות, התעללות, נושאים מיניים, ניצול"
    ),
}

# ── Diverse Israeli character names per grade cluster ─────────────────────────
ISRAELI_NAMES_BY_CLUSTER: dict[str, str] = {
    "3-4": (
        "שמות דמויות — חובה לגוון בין בנות ובנים ובין שמות שונים (אסור שמות גנריים בלבד):\n"
        "בנות: נועה, מיה, שירה, תמר, לילך, רוני, ענת, ליאור, אלמוג, דנה, יעל, גל, ניצן\n"
        "בנים: עידן, אורי, ליאם, ניר, יובל, איתמר, אסף, בן, כפיר, נועם, גיא, שחר, עמית"
    ),
    "5-6": (
        "שמות דמויות — חובה לגוון בין בנות ובנים ובין שמות שונים (אסור שמות גנריים בלבד):\n"
        "בנות: עינב, שקד, ליאת, מירב, אייל, שני, הדס, ורד, רותם, תום, ניצן, אלה, ליאור, אריאל\n"
        "בנים: עמית, אורי, יואב, ירדן, בר, שלומי, אבשלום, עמיחי, ראם, שחר, גל, כפיר, אור"
    ),
    "7-9": (
        "שמות דמויות — חובה לגוון בין בנות ובנים ובין שמות שונים (אסור שמות גנריים בלבד):\n"
        "בנות: מאיה, נגה, שיר, תמרה, הילה, ענבל, מרב, רוני, ליהי, אביגיל, כרמל, שירי, אלינור\n"
        "בנים: אורי, ירדן, יואב, ינאי, אבישי, עמרי, גיא, ליאור, בניה, נחום, אביתר, ראם, שלומי"
    ),
}


async def generate_theme(
    grade_cluster: str,
    topic_values: dict,
) -> dict:
    """
    מייצר תמה משותפת (רעיון מחבר) על בסיס הנושא והערכים שהמורה בחרה.
    מחזיר: {"theme": "...", "rationale": "...", "blocked": True/False, "blocked_reason": "..."}
    """
    topic = topic_values.get("topic", "")
    values = topic_values.get("values", "")
    specific = topic_values.get("specific_topic", "")

    # בדיקת חסימה
    combined = f"{topic} {values} {specific}"
    blocked = _check_blocked_content(combined)
    if blocked:
        return {
            "theme": "",
            "rationale": "",
            "blocked": True,
            "blocked_reason": f"הנושא '{blocked}' אינו מתאים לסביבה חינוכית.",
        }

    narr_restrictions = NARRATIVE_THEME_RESTRICTIONS.get(grade_cluster, "")

    system = f"""אתה יועץ פדגוגי בתחום האוריינות. תפקידך להציע תמה משותפת — משפט ערכי אחד המחבר בין שני טקסטים.

כללים:
• התמה נגזרת מהערכים — לא מהנושא.
• התמה = משפט אחד בלבד, בשפה מקצועית ותקנית.
• אסור לתאר מה יהיה בנרטיבי או במידעי — זה יופיע בשלב הרעיון.
• דוגמה: ערך = "שיתוף פעולה" → תמה: "כוחו של שיתוף פעולה בהשגת מטרה משותפת"

{narr_restrictions}

חובה: החזר JSON בלבד — ללא טקסט לפני או אחרי."""

    user = f"""נושא: {topic}
ערכים: {values}
{f'נושא ספציפי: {specific}' if specific else ''}
אשכול כיתות: {grade_cluster}

הצע תמה משותפת — משפט ערכי אחד בלבד, בשפה מקצועית ותקנית.
התמה: רעיון מרכזי קצר, מבוסס על הערך, מנוסח כמשפט תקני.

החזר JSON:
{{
  "theme": "משפט התמה הערכית בלבד — לדוגמה: 'כוחו של שיתוף פעולה בהשגת מטרה משותפת'",
  "rationale": "משפט אחד: הסבר קצר לבחירת התמה (לא תיאור התוכן)"
}}"""

    tool_def = {
        "name": "submit_theme",
        "description": "הגש את התמה המוצעת",
        "input_schema": {
            "type": "object",
            "properties": {
                "theme": {"type": "string", "description": "משפט התמה הערכית בלבד — שפה תקנית ומקצועית"},
                "rationale": {"type": "string", "description": "משפט הסבר קצר לבחירת התמה"},
            },
            "required": ["theme", "rationale"],
        },
    }
    data = await _call_with_tool(system, user, tool_def, 500, model=FAST_MODEL_NAME)
    data["blocked"] = False
    data["blocked_reason"] = ""
    return data


async def generate_idea(
    grade_cluster: str,
    topic_values: dict,
    theme: str,
    target: str = "both",  # "narrative" | "informational" | "both"
) -> dict:
    """
    מייצר רעיון תמציתי לטקסטים לפני יצירת הטקסט המלא.
    target: "narrative" / "informational" / "both"
    """
    topic = topic_values.get("topic", "")
    values = topic_values.get("values", "")
    specific = topic_values.get("specific_topic", "")
    continuity = topic_values.get("text_continuity", "continuous")
    biographical_figure = specific if topic == "אישיים" else ""

    continuity_labels = {
        "continuous": "טקסט רציף (מאמר/פרוזה)",
        "non_continuous": "טקסט לא-רציף (טבלאות/אינפוגרפיקה)",
    }
    info_continuity = continuity_labels.get(continuity, "טקסט רציף")

    biographical_note = ""
    if biographical_figure:
        biographical_note = (
            f"\n⚠️ הנחיה: הטקסט המידעי יהיה ביוגרפיה של {biographical_figure}."
            f" הטקסט הנרטיבי לא יהיה על {biographical_figure} כלל —"
            f" יהיה על תמה/ערך/רגש הקשור לדמות (למשל: התמדה, נחישות, התגברות) עם גיבור/ת דמיון."
        )

    narr_restrictions = NARRATIVE_THEME_RESTRICTIONS.get(grade_cluster, "")
    names_note = ISRAELI_NAMES_BY_CLUSTER.get(grade_cluster, ISRAELI_NAMES_BY_CLUSTER["5-6"])

    system = f"""אתה יועץ פדגוגי המסייע למורים לתכנן טקסטים לבחינות הבנת הנקרא.

⚠️ חובה מוחלטת — שפה תקנית ומקצועית:
• עברית תקנית בלבד — ללא שגיאות דקדוק (חלומו ולא חלמתו, זכר/נקבה, יחיד/רבים).
• האתר לאנשי חינוך — שפה עילגת פוגעת באמון במערכת.
• אסור להשתמש באותיות ערביות — מילים ערביות בתעתיק עברי בלבד.

כלל יסוד — חובה לשמור עליו בכל תכנון:
• הטקסט הנרטיבי עוסק תמיד בבני אדם (ילדים/מבוגרים) המגלמים את הערך — ולא בנושא.
• הטקסט המידעי עוסק בנושא שנבחר, עם זיקה לאותו ערך.
• דוגמה: נושא = "עולם החי", ערך = "שיתוף פעולה" →
  נרטיבי: ילדים/חברים/אחים שמשתפים פעולה (לא על חיות!)
  מידעי: כיצד בעלי חיים בטבע משתפים פעולה

{narr_restrictions}

שמות דמויות בנרטיבי:
{names_note}

חובה: החזר JSON בלבד."""

    ctx = f"""תמה: {theme}
נושא (למידעי בלבד): {topic} | ערכים (לנרטיבי): {values}{f' | נושא ספציפי: {specific}' if specific else ''}
אשכול כיתות: {grade_cluster}{biographical_note}"""

    if target == "narrative":
        user = f"""{ctx}

תכנן טקסט נרטיבי: דמויות אנושיות המגלמות את הערך "{values}" — ולא את הנושא "{topic}".

החזר JSON:
{{
  "narrative": {{
    "title": "כותרת עובדת לסיפור — 2-4 מילים בעברית",
    "hero": "תיאור קצר של הגיבור/ה (בן/בת אדם, ריאלי — לא בעל חיים)",
    "conflict": "הקונפליקט הקשור לערך — משפט אחד",
    "logic": "סיפור-אירוע / סיפור-דמות",
    "value": "הערך המוטמע",
    "summary": "משפט-שניים תמציתיים בלבד: גיבור + קונפליקט + רגע שיא (לא יותר מ-2 משפטים!)"
  }}
}}"""

    elif target == "informational":
        user = f"""{ctx}

תכנן טקסט מידעי ({info_continuity}) על הנושא "{topic}" עם זיקה לערך "{values}".

החזר JSON:
{{
  "informational": {{
    "subject": "נושא המאמר — מה בדיוק נסקר (מבוסס על הנושא שנבחר)",
    "logical_structure": "מבנה לוגי: כרונולוגי / בעיה-פתרון / כללה-פרוט / סיבה-תוצאה + ההיבטים המרכזיים",
    "summary": "עד 2 שורות: תקציר מה יכיל המאמר",
    "message": "המסר המרכזי — רק אם שונה מהתמה המשותפת, אחרת השאר ריק"
  }}
}}"""

    else:  # both
        user = f"""{ctx}

תכנן שני טקסטים — חפיפה מינימלית: רק הערך המשותף מחבר. כל טקסט עומד בפני עצמו.
1. נרטיבי — על בני אדם המגלמים את הערך "{values}" (ולא על "{topic}").
2. מידעי ({info_continuity}) — על "{topic}" עם זיקה לערך "{values}". תוכן שונה לחלוטין מהנרטיבי — עובדות, מחקר, נתונים.

החזר JSON:
{{
  "narrative": {{
    "title": "כותרת עובדת לסיפור — 2-4 מילים בעברית",
    "hero": "תיאור קצר של הגיבור/ה (בן/בת אדם — לא בעל חיים, לא פנטזיה)",
    "conflict": "הקונפליקט הקשור לערך — משפט אחד",
    "logic": "סיפור-אירוע / סיפור-דמות",
    "value": "הערך המוטמע",
    "summary": "משפט-שניים תמציתיים בלבד: גיבור + קונפליקט + רגע שיא (לא יותר מ-2 משפטים!)"
  }},
  "informational": {{
    "subject": "נושא המאמר — מה בדיוק נסקר (הנושא שנבחר: {topic})",
    "logical_structure": "מבנה לוגי: כרונולוגי / בעיה-פתרון / כללה-פרוט / סיבה-תוצאה + ההיבטים",
    "summary": "עד 2 שורות: תקציר תוכן המאמר",
    "message": "המסר המרכזי — רק אם שונה מהתמה, אחרת השאר ריק"
  }}
}}"""

    narrative_props = {
        "title": {"type": "string"},
        "hero": {"type": "string"},
        "conflict": {"type": "string"},
        "logic": {"type": "string"},
        "value": {"type": "string"},
        "summary": {"type": "string"},
    }
    info_props = {
        "subject": {"type": "string"},
        "logical_structure": {"type": "string"},
        "summary": {"type": "string"},
        "message": {"type": "string"},
    }

    if target == "narrative":
        schema_props = {"narrative": {"type": "object", "properties": narrative_props, "required": list(narrative_props)}}
        schema_req = ["narrative"]
    elif target == "informational":
        schema_props = {"informational": {"type": "object", "properties": info_props, "required": list(info_props)}}
        schema_req = ["informational"]
    else:
        schema_props = {
            "narrative": {"type": "object", "properties": narrative_props, "required": list(narrative_props)},
            "informational": {"type": "object", "properties": info_props, "required": list(info_props)},
        }
        schema_req = ["narrative", "informational"]

    tool_def = {
        "name": "submit_idea",
        "description": "הגש את תכנון הטקסטים",
        "input_schema": {"type": "object", "properties": schema_props, "required": schema_req},
    }
    # "both" generates two full idea objects — needs more room than a single target
    max_toks = 1600 if target == "both" else 900
    return await _call_with_tool(system, user, tool_def, max_toks, model=FAST_MODEL_NAME)


async def improve_text(
    text_content: str,
    text_title: str,
    text_type: str,
    grade_cluster: str,
    component: str,  # "content" | "structure" | "language" | "genre"
    custom_instruction: str = "",
) -> dict:
    """
    משפר טקסט קיים לפי רכיב נבחר מתוך רכיב_הטקסט.
    מחזיר: {"title": "...", "content": "...", "improvement_summary": "..."}
    """
    from knowledge.engine import get_foundation_context
    foundation_context = get_foundation_context(["text_component", "text_appendix"])

    # Component-specific instructions, tailored by text type
    component_base: dict[str, dict[str, str]] = {
        "content": {
            "narrative": (
                "שפר את רכיב התוכן של הטקסט הנרטיבי.\n"
                "• העמק את הרגש והמניע של הדמות המרכזית — מה היא רוצה? ממה היא חוששת?\n"
                "• הוסף/חזק ערך חברתי אחד ברור הנובע מבחירות הדמות, לא מהצהרה ישירה\n"
                "• הוסף מאפיין ייחודי לדמות שיהפוך אותה לבלתי-נשכחת\n"
                "• צור פער בין מה שהדמות יודעת למה שהקורא יודע (תיאוריית תודעה)\n"
                "• הוסף פרטים חושיים: מראה, צליל, ריח, מגע — במקומות מפתח"
            ),
            "informational": (
                "שפר את רכיב התוכן של הטקסט המידעי.\n"
                "• הוסף עובדות ספציפיות, נתונים מספריים או דוגמאות מוחשיות\n"
                "• חדד משפט מסכם/רעיון מרכזי ברור בפסקת הסיום\n"
                "• הוסף מימד אנושי: כיצד הנושא משפיע על אנשים אמיתיים?\n"
                "• ודא שכל מושג חדש מוסבר בתוך הטקסט — ללא הנחת ידע מוקדם\n"
                "• הוסף/חזק שכבת 'מדוע זה חשוב' — לא רק מה, גם למה"
            ),
        },
        "structure": {
            "narrative": (
                "שפר את רכיב המבנה של הטקסט הנרטיבי.\n"
                "• עקומת הדרמה: ודא שיש הצגה ← סיבוך ← הסלמה ← שיא ← פתרון\n"
                "• הוסף לפחות מכשול אחד לפני הפתרון — אין פתרון קל מדי\n"
                "• האט את הקצב בנקודת השיא — שורות ארוכות יותר, פרטים יותר\n"
                "• הסיום: ברור ומשמעותי — שינוי פנימי בדמות או תוצאה ברורה\n"
                "• ניהול קצב: דחוס פרטים שוליים, הרחב רגעים רגשיים"
            ),
            "informational": (
                "שפר את רכיב המבנה של הטקסט המידעי.\n"
                "• ודא מבנה לוגי ברור: כרונולוגי / בעיה-פתרון / כללה-פרוט / השוואה\n"
                "• כל פסקה: משפט מנחה ← פיתוח ← דוגמה/ראיה\n"
                "• חזק לכידות: כל פסקה תרומה ישירה לנושא המרכזי\n"
                "• הוסף מילות קישור: לכן, בעקבות זאת, לעומת זאת, למשל, כתוצאה מכך\n"
                "• פסקת פתיחה: הצגת הנושא ומה ילמד הקורא; פסקת סיום: מסקנה/היבט רחב"
            ),
        },
        "language": {
            "narrative": (
                "שפר את רכיב הלשון של הטקסט הנרטיבי.\n"
                "• גוון אוצר מילים רגשי — לא רק 'כעס/שמחה' אלא 'קנאה/חרטה/ציפייה/מבוכה'\n"
                "• הוסף לפחות אמצע ספרותי אחד: השוואה, מטפורה, אנימציה, חזרה מכוונת\n"
                "• מגוון משפטים: משפטים קצרים לעצירה/הדגשה, ארוכים לתיאור/זרימה\n"
                "• הנחיה: הראה-אל-תספר — פעולות פיזיות שמסמנות רגש, לא הצהרה ישירה\n"
                "• בדלוג: הפחת כפילויות, הסר מיותרויות"
            ),
            "informational": (
                "שפר את רכיב הלשון של הטקסט המידעי.\n"
                "• אוצר מילים נדבך 2 (עיוני-כללי): מגוון, מהותי, מבוסס, תהליך, השפעה\n"
                "• קישורים לוגיים: לכן, כי, בגלל, כתוצאה מכך, בעקבות זאת\n"
                "• קישורים זמניים: ראשית, לאחר מכן, בשלב הבא, לבסוף\n"
                "• העדף בניין פעיל על סביל כשאפשר\n"
                "• קצר משפטים ארוכים מדי (מעל 30 מילים) לשניים"
            ),
        },
        "genre": {
            "narrative": (
                "שפר את רכיב הסוגה של הטקסט הנרטיבי.\n"
                "• הגדר: האם הסיפור event-driven (מה קרה) או character-driven (שינוי פנימי)? חדד בהתאם\n"
                "• הראה-אל-תספר: הפחת הצהרות ישירות על רגשות, הוסף תיאורים עקיפים\n"
                "• אמינות לגיל: הדמות פועלת בעולם ריאלי, הגיוני לגיל התלמידים\n"
                "• הוגנות: שמות מגוונים, שבירת סטריאוטיפים מגדריים/אתניים\n"
                "• ודא שהערך המוטמע בא מבחירות הדמות — לא ממוסר השכל"
            ),
            "informational": (
                "שפר את רכיב הסוגה של הטקסט המידעי.\n"
                "• זהה את תת-הסוגה: אנציקלופדי/ביוגרפי/כתבה/הנחיות/טיעוני\n"
                "• חדד את המטרה החברתית: מידוע, שכנוע, הפעלה — ומה כותב הטקסט רוצה שהקורא יעשה?\n"
                "• חזק את המאפיינים של תת-הסוגה הנבחרת (למשל, כתבה: עדכני, תקצירי; ביוגרפי: מסלול חיים, הישגים)\n"
                "• ודא שהמבנה תואם את תת-הסוגה"
            ),
        },
    }

    type_key = "narrative" if text_type == "narrative" else "informational"
    instruction = component_base.get(component, component_base["content"])[type_key]

    if custom_instruction:
        instruction += f"\n\nהנחיות ספציפיות מהמורה — יש לממש אותן במדויק:\n{custom_instruction}"

    text_type_heb = "נרטיבי" if text_type == "narrative" else "מידעי"
    bounds = GRADE_WORD_COUNTS.get(grade_cluster, (350, 480, 300, 420))
    min_w = bounds[0] if text_type == "narrative" else bounds[2]
    max_w = bounds[1] if text_type == "narrative" else bounds[3]

    # For non-continuous texts: improve only the main article, preserve sidebars
    nc_data: dict | None = None
    effective_content = text_content
    if text_content.startswith('{"__nc":'):
        try:
            nc_data = json.loads(text_content)
            effective_content = nc_data.get("main", text_content)
        except Exception:
            nc_data = None

    system = f"""אתה מומחה פדגוגי לעברית המתמחה בטקסטים לבחינות הבנת הנקרא בסטנדרט ראמ"ה.
תפקידך לשפר את הטקסט לפי ההנחיות הבאות — בצע שינויים ממשיים ומורגשים, לא קוסמטיים.

הנחיות השיפור:
{instruction}

דרישות טכניות:
• שמור על אורך הטקסט: בין {min_w} ל-{max_w} מילים
• שמור על הנושא התמטי של הטקסט המקורי
• עברית תקנית ומקצועית — תיקון שגיאות דקדוק (חלומו/חלומה, זכר/נקבה, יחיד/רבים). האתר לאנשי חינוך — שפה עילגת פוגעת באמון

רקע פדגוגי:
{foundation_context[:2000]}

החזר JSON תקני בלבד."""

    user = f"""שפר את הטקסט ה{text_type_heb} הבא.

כותרת: {text_title}
טקסט:
{effective_content}

החזר JSON:
{{
  "title": "כותרת (שנה אם השיפור דורש זאת, אחרת השאר)",
  "content": "הטקסט המשופר המלא — עם כל השינויים הממומשים",
  "improvement_summary": "3-4 משפטים מפורטים: מה שופר, היכן, ומדוע זה משפר את הטקסט"
}}"""

    tool_def = {
        "name": "submit_improved_text",
        "description": "הגש את הטקסט המשופר",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "כותרת הטקסט"},
                "content": {"type": "string", "description": "הטקסט המשופר המלא"},
                "improvement_summary": {"type": "string", "description": "תיאור מה שופר"},
            },
            "required": ["title", "content", "improvement_summary"],
        },
    }
    result = await _call_with_tool(system, user, tool_def, MAX_TOKENS)

    # Re-pack NC format if original was non-continuous
    if nc_data is not None:
        improved_main = result.get("content", effective_content)
        result["content"] = json.dumps(
            {"__nc": True, "main": improved_main, "sidebars": nc_data.get("sidebars", [])},
            ensure_ascii=False,
        )

    return result


async def suggest_improvements(
    text_content: str,
    text_title: str,
    text_type: str,
    grade_cluster: str,
    component: str,
) -> list[str]:
    """
    מייצר הצעות שיפור רכיביות לטקסט לפי ארבעת הרכיבים: סוגה, תוכן, מבנה, לשון.
    כל רכיב מניב הצעה אחת ספציפית (סה"כ 4-5 הצעות).
    """
    foundation = get_foundation_context(["text_component"])
    type_key = "narrative" if text_type == "narrative" else "informational"
    type_heb = "נרטיבי" if type_key == "narrative" else "מידעי"

    # For non-continuous texts, extract only the main text for analysis
    display_content = text_content
    if text_content.startswith('{"__nc":'):
        try:
            nc = json.loads(text_content)
            sidebars_summary = "; ".join(
                f"[{s.get('type','')}: {s.get('title','')}]" for s in nc.get("sidebars", [])
            )
            display_content = nc.get("main", text_content)
            if sidebars_summary:
                display_content += f"\n\n[רכיבים נלווים: {sidebars_summary}]"
        except Exception:
            pass

    # Define sub-criteria per component and text type
    components_guide = {
        "genre": {
            "narrative": (
                "סוגה ספרותית: האם הטקסט ממוסד כסיפור-דמות (character-driven) או סיפור-אירוע? "
                "בדקי: עקרון 'הראה-אל-תספר', מוסכמות הסוגה (פתיחה in-medias-res, קצב, שיא), אמינות ריאליסטית."
            ),
            "informational": (
                "סוגה מידעית: בדקי: תת-סוגה (כתבה/ביוגרפיה/הנחיות/טיעון/אנציקלופדי), "
                "האם הסוגה ממומשת עקבית לאורך כל הטקסט, מאפייני הפתיחה והסיום בסוגה זו."
            ),
        },
        "content": {
            "narrative": (
                "תוכן נרטיבי: בדקי: עמקות רגש הדמות ומניעיה, ערך חברתי מוטמע (לא מוצהר), "
                "תיאוריית תודעה (ToM — מה דמויות חושבות/מרגישות), ספציפיות פרטים וחיוניות עלילה."
            ),
            "informational": (
                "תוכן מידעי: בדקי: דיוק עובדות ונתונים ספציפיים (מספרים/שמות/תאריכים), "
                "רעיון מרכזי ברור, מימד אנושי, עצמאות הטקסט, עומק ידע ומסר ייחודי."
            ),
        },
        "structure": {
            "narrative": (
                "מבנה נרטיבי — בדקי ארבעת אלה בנפרד:\n"
                "  א. חלוקה לפסקאות: האם כל פסקה = יחידה דרמטית/זמנית עצמאית?\n"
                "  ב. מבנה לוגי: הצגה → סיבוך → הסלמה → שיא → פתרון+שינוי — כולם קיימים?\n"
                "  ג. קוהרנטיות: האם כל פסקה מובילה לבאה? האם יש מקפצות עלילתיות חסרות?\n"
                "  ד. ניהול קצב: האם יש שינוי קצב לפני השיא?"
            ),
            "informational": (
                "מבנה מידעי — בדקי ארבעת אלה בנפרד:\n"
                "  א. חלוקה לפסקאות: כל פסקה = רעיון מרכזי אחד בלבד? כותרות מתאימות?\n"
                "  ב. מבנה לוגי: האם יש עקרון מארגן ברור (כרונולוגי/בעיה-פתרון/כללה-פרוט/השוואה)?\n"
                "  ג. קוהרנטיות: האם המעברים בין פסקאות חלקים? האם ניתן לדלג פסקה בלי לאבד הבנה?\n"
                "  ד. פסקת פתיחה וסיום: האם מסקרנות? האם הסיום עם מסר ברור?"
            ),
        },
        "language": {
            "narrative": (
                "לשון נרטיבית — בדקי שלושה תחומים:\n"
                "  א. אוצר מילים: האם מילות הרגש מגוונות ואינן חוזרות? "
                "האם יש תיאורים חושיים (ראייה/שמיעה/מגע)? האם יש מילים לא-שגרתיות?\n"
                "  ב. מילות קישור: האם יש מגוון מילות מעבר זמניות ואירועיות "
                "(אז, פתאום, לפתע, כשהגיע, ברגע שהבחין, בלי להתכוון)?\n"
                "  ג. מורכבות לשונית: האם יש מגוון באורך המשפטים? "
                "האם יש אמצעים ספרותיים (מטפורה, דימוי, אנפורה)?"
            ),
            "informational": (
                "לשון מידעית — בדקי שלושה תחומים:\n"
                "  א. אוצר מילים: האם המונחים התחומיים מוסברים? "
                "האם השפה מותאמת לגיל (לא ילדותית, לא אקדמית מדי)? "
                "האם יש שפה עיתונאית-מדעית?\n"
                "  ב. מילות קישור לוגיות: האם יש מגוון מילי קישור (לכן, בשל כך, לעומת זאת, "
                "בנוסף לכך, כתוצאה מכך, יחד עם זאת)?\n"
                "  ג. מורכבות לשונית: האם יש מגוון תחביר? "
                "האם המשפטים לא ארוכים מדי ולא קצרים מדי?"
            ),
        },
    }

    # Build component-specific criteria
    if component and component in components_guide:
        focus_text = components_guide[component][type_key]
        comp_names = {
            "genre": "סוגה", "content": "תוכן", "structure": "מבנה", "language": "לשון"
        }
        comp_heb = comp_names.get(component, component)
        prompt_instruction = (
            f"אנא ספקי בדיוק 5 הצעות שיפור עמוקות ומשמעותיות לרכיב {comp_heb.upper()} של הטקסט.\n\n"
            f"קריטריונים ספציפיים לרכיב זה:\n{focus_text}\n\n"
            "כל הצעה: 1-2 שורות בלבד — מיקום → בעיה → תיקון קצר.\n"
            "פורמט חובה — כל הצעה מופרדת ב---:\n"
            "---\n"
            "1. [פסקה X / 'ציטוט קצר'] בעיה קצרה — תיקון: ניסוח חלופי\n"
            "---\n"
            "2. ... (5 הצעות בסך הכל, קצרות ועניינות)"
        )
    else:
        # Overview: one suggestion per component
        prompt_instruction = (
            "הציעי בדיוק 5 הצעות שיפור מרכזיות לטקסט — לפחות אחת לכל רכיב.\n"
            "פורמט: כל הצעה בשורה נפרדת, מתחילה ב-[שם-הרכיב]:\n"
            "[סוגה]: ...\n[תוכן]: ...\n[מבנה]: ...\n[לשון]: ...\n[לשון/מבנה/תוכן]: ..."
        )

    system = (
        f"את יועצת פדגוגית לטקסטי הבנת הנקרא (ראמ\"ה), אשכול {grade_cluster}.\n"
        "כל הצעה: ספציפית לטקסט (פסקה/מילה ממשית) + בעיה קצרה + תיקון קצר. ללא כלליות."
    )

    user = (
        f"טקסט {type_heb} — '{text_title}' (אשכול {grade_cluster}):\n"
        f"\"\"\"\n{display_content[:3200]}\n\"\"\"\n\n"
        f"{prompt_instruction}\n\n"
        "חשוב: ספקי בדיוק 5 הצעות — לא פחות, לא יותר. ללא הקדמה וללא סיכום."
    )

    resp = await client.messages.create(
        model=FAST_MODEL_NAME,     # Haiku — fast, concise suggestions
        system=system,
        messages=[{"role": "user", "content": user}],
        max_tokens=1200,
    )

    raw = resp.content[0].text.strip()

    # Parse suggestions separated by "---" or numbered lines
    suggestions = []
    # Try splitting by "---" delimiter first
    if "---" in raw:
        blocks = [b.strip() for b in raw.split("---") if b.strip()]
        for block in blocks:
            cleaned = re.sub(r"^\d+[.):\-\s]+", "", block).strip()
            if cleaned and len(cleaned) > 20:
                suggestions.append(cleaned)
    else:
        # Fallback: numbered list — join continuation lines to the numbered item
        current = []
        for line in raw.split("\n"):
            line = line.strip()
            if not line:
                if current:
                    suggestions.append(" ".join(current))
                    current = []
                continue
            if re.match(r"^\d+[.):\-]", line):
                if current:
                    suggestions.append(" ".join(current))
                cleaned = re.sub(r"^\d+[.):\-\s]+", "", line).strip()
                current = [cleaned] if cleaned else []
            else:
                if current:
                    current.append(line)
                elif line:
                    current.append(line)
        if current:
            suggestions.append(" ".join(current))

    # Filter short/empty and return exactly 5
    suggestions = [s for s in suggestions if len(s) > 25]
    return suggestions[:5]


def _build_system_prompt(grade_cluster: str, foundation_context: str) -> str:
    bounds = GRADE_WORD_COUNTS.get(grade_cluster, (350, 480, 300, 420))
    narr_min, narr_max, info_min, info_max = bounds

    narr_target = (narr_min + narr_max) // 2
    info_target = (info_min + info_max) // 2
    return f"""אתה מומחה פדגוגי ישראלי המתמחה ביצירת טקסטים לבחינות הבנת הנקרא בסטנדרט ראמ"ה.
תפקידך הוא ליצור זוג טקסטים עבריים (נרטיבי ומידעי) ברמת כיתות {grade_cluster}.

══════════════════════════════════
⚠️  דרישות אמינות — חובה מוחלטת ⚠️
══════════════════════════════════
טקסט נרטיבי — ריאליזם:
• דמויות אנושיות בלבד — ללא בעלי חיים מדברים, ללא קוסמים, ללא עולמות דמיוניים
• אירועים שיכולים להתרחש במציאות; הגיון פנימי אמין לגיל הכיתה
• ממד "הראה-אל-תספר": פעולות ותגובות פיזיות שמגלות רגשות, לא הצהרות ישירות

טקסט מידעי — עובדתיות:
• עובדות מדויקות ואמיתיות בלבד! אין להמציא נתונים, תאריכים, שמות או אירועים
• כל עובדה חייבת להיות מבוססת — אם אינך בטוח, אל תרשום
• לטקסט ביוגרפי: פרטי חיים ממשיים של הדמות בלבד
• תלמידים לומדים מטקסטים אלו — הם חייבים להיות מהימנים לחלוטין

עוגנים לכל 4 ממדים:
• כל טקסט חייב לכלול עוגנים ממשיים לממדים A, B, C ו-D
• ממד ג' ו-ד' חייבים להיות מוטמעים בטקסט — לא שאלות גלויות
• אם ממד כלשהו חסר — הטקסט לא מתאים למבחן

══════════════════════════════════
⚠️  דרישת אורך — חובה מוחלטת ⚠️
══════════════════════════════════
טקסט נרטיבי: יעד {narr_target} מילים (טווח קבוע: {narr_min}–{narr_max} מילים)
טקסט מידעי:  יעד {info_target} מילים (טווח קבוע: {info_min}–{info_max} מילים)

כדי לעמוד בדרישת האורך:
• כתוב לפחות 4–5 פסקאות בכל טקסט
• בנרטיבי: כלול דיאלוג, תיאורי סביבה, רגשות ופרטים חושיים
• במידעי: כלול נתונים מספריים, דוגמאות, הסברים מפורטים
• אל תקצר את הטקסט — אורך מלא הוא חלק מהדרישה הפדגוגית

שני הטקסטים חייבים לשתף רק ערך משותף (תמה) — לא תוכן!
⚠️ אסור חפיפה גדולה: כל טקסט עומד בפני עצמו. הנרטיבי = סיפור עם דמויות ואירועים ייחודיים. המידעי = עובדות, מחקר, נתונים — ללא חזרה על הסיפור. המחבר היחיד = הערך המשותף.
שפה: עברית תקנית, אוצר מילים עשיר ומותאם לגיל

רקע פדגוגי — מסמכי ראמ"ה:
{foundation_context}

חובה: החזר JSON תקני בלבד, ללא טקסט נוסף לפני או אחרי ה-JSON.
"""


def _build_user_prompt(
    grade_cluster: str,
    topic_values: dict,
    narrative_examples: list[str],
    info_examples: list[str],
) -> str:
    topic = topic_values.get("topic", "")
    values = topic_values.get("values", "")
    specific = topic_values.get("specific_topic", "")
    continuity = topic_values.get("text_continuity", "continuous")
    non_continuous_type = topic_values.get("non_continuous_type", "")

    non_continuous_type_labels = {
        "comparison_table": "טבלת השוואה — השוואה בין שני עצמים/תופעות לפי קטגוריות; הטקסט כולל טבלה עם עמודות וקטגוריות",
        "timeline": "ציר זמן — אירועים כרונולוגיים עם תאריכים/תקופות ותיאור קצר לכל אירוע",
        "flowchart": "תרשים זרימה — תהליך עם שלבים ממוספרים, חיצים לוגיים ומסקנה",
        "data_chart": "תרשים נתונים — נתונים כמותיים עם אחוזים/מספרים ופרשנות תוצאות",
        "concept_map": "מפת מושגים — מושגים מרכזיים וקשרים ביניהם עם הסברים קצרים",
    }

    continuity_labels = {
        "continuous": "טקסט רציף (פרוזה, נרטיב, מאמר)",
        "non_continuous": f"טקסט לא-רציף: {non_continuous_type_labels.get(non_continuous_type, 'טבלאות, רשימות, אינפוגרפיקה')}",
        "mixed": "טקסט מעורב (שילוב טקסט רציף ואלמנטים לא-רציפים)",
    }
    continuity_label = continuity_labels.get(continuity, "טקסט רציף")

    examples_section = ""
    if narrative_examples:
        examples_section += "\n\nדוגמאות לטקסטים נרטיביים מתאימים (לסגנון ורמה בלבד — אל תעתיק!):\n"
        for i, ex in enumerate(narrative_examples[:2], 1):
            examples_section += f"\n--- דוגמה {i} ---\n{ex[:800]}\n"

    if info_examples:
        examples_section += "\n\nדוגמאות לטקסטים מידעיים מתאימים (לסגנון ורמה בלבד — אל תעתיק!):\n"
        for i, ex in enumerate(info_examples[:2], 1):
            examples_section += f"\n--- דוגמה {i} ---\n{ex[:800]}\n"

    exam_timing = topic_values.get("exam_timing", "")

    bounds = GRADE_WORD_COUNTS.get(grade_cluster, (400, 600, 330, 460))
    narr_base = (bounds[0] + bounds[1]) // 2
    info_base = (bounds[2] + bounds[3]) // 2

    # Adjust length and complexity per exam timing
    timing_word_delta = {"תחילת שנה": -50, "אמצע שנה": 0, "סוף שנה": +50}.get(exam_timing, 0)
    narr_target = narr_base + timing_word_delta
    info_target = info_base + int(timing_word_delta * 0.8)

    timing_complexity_note = ""
    if exam_timing == "תחילת שנה":
        timing_complexity_note = (
            "\n⚠️ מבחן תחילת שנה — רמה מתחילה:\n"
            "• משפטים קצרים יחסית, אוצר מילים מוכר, מבנה פשוט וברור\n"
            "• הנרטיבי: עלילה ישירה עם קונפליקט ופתרון ברורים\n"
            "• המידעי: פסקאות קצרות, מונחים מוסברים בטקסט\n"
            "• שאלות יהיו יותר גלויות ופחות מורכבות"
        )
    elif exam_timing == "אמצע שנה":
        timing_complexity_note = (
            "\n⚠️ מבחן אמצע שנה — רמה בינונית:\n"
            "• אוצר מילים בינוני, עומק רעיוני מידתי\n"
            "• הנרטיבי: עלילה עם שכבה ערכית ברורה\n"
            "• המידעי: מבנה מאורגן עם מידע ממוקד"
        )
    elif exam_timing == "סוף שנה":
        timing_complexity_note = (
            "\n⚠️ מבחן סוף שנה — רמה גבוהה:\n"
            "• אוצר מילים עשיר, משפטים מורכבים יותר, הפניות בין-פסקאיות\n"
            "• הנרטיבי: עלילה עם שכבות משמעות, מוטיבים ואמצעים ספרותיים\n"
            "• המידעי: טיעונים מורכבים, נתונים שדורשים עיבוד, מסקנות שאינן מפורשות\n"
            "• עוגנים לממד ג׳ ו-ד׳ בולטים במיוחד"
        )

    biographical_figure = topic_values.get("biographical_figure", "") or (
        specific if topic == "אישיים" else ""
    )
    emotions = topic_values.get("emotions", [])
    emotions_str = ", ".join(emotions) if emotions else ""

    biographical_note = ""
    if biographical_figure and topic == "אישיים":
        biographical_note = f"""
⚠️ הנחיה ביוגרפית — חובה:
• הטקסט המידעי יהיה ביוגרפיה של {biographical_figure} — עובדות אמיתיות בלבד
• הטקסט הנרטיבי לא יהיה על {biographical_figure} כלל
• הנרטיבי יהיה על תמה/ערך/רגש הקשור לדמות (למשל: התמדה, נחישות, התגברות על קושי)
• הגיבור/ה של הנרטיבי הוא דמות בדיונית אחרת לחלוטין"""

    emotions_note = ""
    if emotions_str:
        emotions_note = f"""
⚠️ רגשות לביטוי בטקסט הנרטיבי (חובה — הטמע לפחות 3 מהרגשות הבאים): {emotions_str}

כלל "הראה-אל-תספר" — אסור לכתוב "הוא הרגיש פחד" — יש להציג כל רגש דרך לפחות 2 מ-5 ההיבטים הבאים:
1. פיזיולוגי: תגובת גוף (דופק מהיר, הזעה, רעד, יובש בפה, נשימה קצרה, "פרפרים" בבטן, הסמקה)
2. הבעת פנים: תנועות שרירים (כיווץ גבות, רחיבת עיניים, לחיצת שפתיים, חיוך אחד-צד)
3. קולי: שינויים בקול (קול גבוה/נמוך פתאום, דיבור מהיר/איטי/מגמגם, אנחה, שתיקה פתאומית)
4. התנהגותי: פעולות ושפת גוף (התכווצות/זקיפה, ריצה לעבר/ריחוק, הסתרת פנים, אחיזת ידיים)
5. פרשנות קוגניטיבית: מחשבה פנימית קצרה (לא "הרגישה" — אלא "הבינה ש..." / "לא ידעה מה לעשות" / "שאלה את עצמה...")"""

    return f"""צור זוג טקסטים עבריים לבחינת הבנת הנקרא עבור אשכול כיתות {grade_cluster}.

אורך נדרש (חובה): נרטיבי ≈ {narr_target} מילים | מידעי ≈ {info_target} מילים
{f'תזמון מבחן: {exam_timing}' if exam_timing else ''}
{timing_complexity_note}

נושא / ערכים: {topic} {values}
{f'נושא ספציפי: {specific}' if specific else ''}
סוג הטקסט המידעי: {continuity_label}
{biographical_note}
{emotions_note}
{examples_section}

הנחיות לטקסט הנרטיבי:
1. סיפור ריאלי עם דמויות אנושיות — ללא בעלי חיים מדברים, ללא פנטזיה
2. עלילה, קונפליקט ופתרון; הגיון פנימי אמין
3. ערך חברתי ברור המשתקף מבחירות הדמות — לא ממוסר השכל
4. שתול "עוגנים" לכל 4 ממדי ההבנה

הנחיות לטקסט המידעי ({continuity_label}):
1. אותו ערך/תמה כמו הנרטיבי — אך תוכן שונה לחלוטין! אסור לחזור על הדמויות, האירועים או הסיטואציה מהסיפור. המידעי = עובדות, מחקר, נתונים — זווית עיתונאית/מדעית.
2. עובדות אמיתיות בלבד — אין להמציא נתונים
{f"3. CRITICAL: יש ליצור {non_continuous_type_labels.get(non_continuous_type, '')} — בפורמט מלא עם כל הרכיבים המתאימים לסוג זה" if continuity == "non_continuous" and non_continuous_type else "3. מאמר מידע מובנה עם כותרת ופסקאות"}

חובה — עוגנים לכל ממד בכל טקסט:
- ממד א' (גלוי): מידע מפורש, ניתן לאיתור ישיר בטקסט
- ממד ב' (משתמע): פער לוגי, סיבה-תוצאה שאינם מפורשים, מניע שאינו כתוב
- ממד ג' (פרשנות): סיטואציה המזמינה עמדה, השוואה, מניע סמוי
- ממד ד' (הערכה): אמצעי ספרותי, בחירת כותב, מבנה צורני

החזר JSON בדיוק בפורמט הזה:
{{
  "narrative": {{
    "title": "כותרת הסיפור",
    "content": "תוכן הסיפור המלא כאן...",
    "word_count": 0,
    "anchor_map": {{
      "A": ["משפט מהטקסט המעגן ממד א'", "משפט נוסף אם יש"],
      "B": ["משפט המעגן ממד ב'"],
      "C": ["משפט המעגן ממד ג'"],
      "D": ["משפט המעגן ממד ד' — אמצעי ספרותי או בחירת כותב"]
    }}
  }},
  "informational": {{
    "title": "כותרת הטקסט המידעי",
    "content": "תוכן הטקסט המידעי המלא כאן...",
    "word_count": 0,
    "anchor_map": {{
      "A": ["משפט מהטקסט המעגן ממד א'"],
      "B": ["משפט המעגן ממד ב'"],
      "C": ["משפט המעגן ממד ג'"],
      "D": ["משפט המעגן ממד ד'"]
    }}
  }}
}}"""


async def suggest_emotions(
    grade_cluster: str,
    topic_values: dict,
) -> list[str]:
    """
    מייצר 5 הצעות רגש מותאמות לתמה ולרעיון — לשילוב בטקסט הנרטיבי.
    מחזיר רשימת 5 רגשות בעברית.
    """
    topic = topic_values.get("topic", "")
    values = topic_values.get("values", "")
    specific = topic_values.get("specific_topic", "")
    theme = topic_values.get("theme", topic)

    age_note = {
        "3-4": "כיתות ג'–ד' (גיל 8–10): רגשות ראשוניים ופשוטים — אין לכלול אשמה, בושה, ייאוש, בוז, ניכור.",
        "5-6": "כיתות ה'–ו' (גיל 10–12): רגשות מגוונים ומורכבים יותר — אין לכלול ייאוש, ניכור, אמביוולנטיות.",
        "7-9": "כיתות ז'–ט' (גיל 12–15): ניתן לכלול רגשות מורכבים ורגשות-על.",
    }.get(grade_cluster, "")

    system = (
        "אתה יועץ פדגוגי המתמחה בחינוך רגשי ובספרות לגיל הצעיר.\n"
        "תפקידך להציע 5 רגשות המתאימים לתמה ולרעיון הסיפורי, שיבואו לידי ביטוי בטקסט נרטיבי.\n"
        "החזר JSON תקני בלבד."
    )

    user = f"""בהינתן התמה והנושא הבאים, הצע 5 רגשות מתאימים לשילוב בטקסט הנרטיבי.

תמה: {theme}
נושא: {topic} | ערכים: {values}{f' | נושא ספציפי: {specific}' if specific else ''}
אשכול כיתות: {grade_cluster}

הנחיות:
- הרגשות יתאימו לתמה ויצרו מגוון רגשי עשיר (לא כולם חיוביים/שליליים בלבד)
- {age_note}
- שמות עצם בלבד בעברית (לדוגמה: התרגשות, תקווה, פחד, גאווה, עצב)
- 5 רגשות בדיוק

החזר JSON:
{{
  "emotions": ["רגש1", "רגש2", "רגש3", "רגש4", "רגש5"],
  "rationale": "משפט קצר המסביר את הבחירה"
}}"""

    tool_def = {
        "name": "submit_emotions",
        "description": "הגש את רשימת הרגשות המוצעים",
        "input_schema": {
            "type": "object",
            "properties": {
                "emotions": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "5 רגשות בעברית",
                },
                "rationale": {"type": "string", "description": "הסבר קצר"},
            },
            "required": ["emotions", "rationale"],
        },
    }
    data = await _call_with_tool(system, user, tool_def, 300, model=FAST_MODEL_NAME)
    return data.get("emotions", [])[:5]


async def refine_idea_with_chat(
    text_type: str,  # "narrative" | "informational"
    current_idea: dict,
    teacher_message: str,
    grade_cluster: str,
    topic_values: dict,
    theme: str,
) -> dict:
    """
    Refines an idea based on a teacher's free-form message.
    Returns a refined idea dict in the same format as generate_idea.
    """
    import json as _json
    topic = topic_values.get("topic", "")
    values = topic_values.get("values", "")
    grade_age = {"3-4": "ילדים בגיל 8–10", "5-6": "ילדים בגיל 10–12", "7-9": "נוער בגיל 12–15"}.get(grade_cluster, "ילדים")
    foundation = await get_foundation_context(["text_component"])

    type_heb = "נרטיבי" if text_type == "narrative" else "מידעי"
    current_json = _json.dumps(current_idea, ensure_ascii=False, indent=2)

    if text_type == "narrative":
        schema_desc = '{"hero":"...","conflict":"...","logic":"...","value":"...","summary":"..."}'
    else:
        schema_desc = '{"subject":"...","aspects":"...","message":"...","summary":"..."}'

    system = f"""אתה יועץ פדגוגי המסייע למורות לדייק רעיונות לטקסטים לבחינות הבנת הנקרא.
תפקידך: לקבל את ההערה של המורה ולשפר את הרעיון הקיים בהתאם — תוך שמירה על כל מה שלא ביקשה לשנות.

שפה: עברית תקנית ומקצועית בלבד — רעיונות מנוסחים בבהירות, ללא שגיאות דקדוק.

רקע פדגוגי:
{foundation[:800]}

כלל יסוד:
• הנרטיבי = סיפור בני אדם המגלמים ערך — לא מאמר ידע
• המידעי = כתבה עיתונאית/מדעית על הנושא — לא סיפור
• חפיפה מינימלית: רק הערך המשותף מחבר. שני הטקסטים שונים לחלוטין בתוכן — אין חזרה על דמויות, אירועים או סיטואציות

אשכול כיתות: {grade_cluster} ({grade_age})
תמה: {theme} | נושא: {topic} | ערכים: {values}

החזר JSON בלבד בפורמט: {schema_desc}"""

    user = f"""רעיון נוכחי לטקסט ה{type_heb}:
{current_json}

הערת המורה:
{teacher_message}

שפר את הרעיון בהתאם להערה. שמור על המבנה המקורי אך שנה רק מה שהתבקש."""

    tool_def = {
        "name": "submit_refined_idea",
        "description": f"הגש את הרעיון המשופר לטקסט ה{type_heb}",
        "input_schema": {
            "type": "object",
            "properties": (
                {
                    "hero": {"type": "string"},
                    "conflict": {"type": "string"},
                    "logic": {"type": "string"},
                    "value": {"type": "string"},
                    "summary": {"type": "string"},
                } if text_type == "narrative" else {
                    "subject": {"type": "string"},
                    "aspects": {"type": "string"},
                    "message": {"type": "string"},
                    "summary": {"type": "string"},
                }
            ),
            "required": (["hero", "conflict", "logic", "value", "summary"]
                         if text_type == "narrative"
                         else ["subject", "aspects", "message", "summary"]),
        },
    }

    return await _call_with_tool(system, user, tool_def, 600)


async def apply_linguistic_edit_chat(
    text_content: str,
    text_title: str,
    text_type: str,
    grade_cluster: str,
    teacher_message: str,
) -> dict:
    """
    שיח עריכה לשונית: המורה כותבת הערה והבינה מתקנת את הטקסט בהתאם.
    מחזיר: {"content": "...", "explanation": "..."}
    """
    nc_data: dict | None = None
    effective_content = text_content
    if text_content.startswith('{"__nc":'):
        try:
            nc_data = json.loads(text_content)
            effective_content = nc_data.get("main", text_content)
        except Exception:
            nc_data = None

    type_heb = "נרטיבי" if text_type == "narrative" else "מידעי"
    system = """אתה עורך/ת לשונית מקצועי/ת. תפקידך:
• לקבל הערת מורה על טקסט ולבצע את התיקון המבוקש בדיוק
• לבצע רק את מה שהמורה ביקש — לא לשנות דברים נוספים
• עברית תקנית ומקצועית — האתר לאנשי חינוך
• אם ההערה לא ברורה — בצע את התיקון המסתבר ביותר

החזר JSON בלבד."""

    user = f"""טקסט {type_heb} — כותרת: {text_title}

הטקסט:
{effective_content}

הערת המורה (תקן/י בהתאם):
{teacher_message}

החזר JSON:
{{
  "content": "הטקסט המשופר המלא — עם התיקון שבוצע",
  "explanation": "משפט אחד: מה תוקן"
}}"""

    tool_def = {
        "name": "submit_linguistic_edit",
        "description": "הגש את הטקסט המתוקן",
        "input_schema": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "הטקסט המשופר המלא"},
                "explanation": {"type": "string", "description": "מה תוקן"},
            },
            "required": ["content", "explanation"],
        },
    }
    result = await _call_with_tool(system, user, tool_def, MAX_TOKENS, model=FAST_MODEL_NAME)

    if nc_data is not None:
        result["content"] = json.dumps(
            {"__nc": True, "main": result.get("content", effective_content), "sidebars": nc_data.get("sidebars", [])},
            ensure_ascii=False,
        )

    return result


async def generate_plan(
    grade_cluster: str,
    topic_values: dict,
) -> dict:
    """
    מריץ בשלב אחד: תמה → רעיון + רגשות במקביל.
    מחזיר: {"theme": {...}, "idea": {...}, "emotions": [...]}
    """
    # Step 1: generate theme first (sequential — idea+emotions depend on it)
    theme_result = await generate_theme(grade_cluster, topic_values)

    theme_str = theme_result.get("theme", "")

    # Step 2: generate idea AND emotions in parallel
    idea_result, emotions_list = await asyncio.gather(
        generate_idea(
            grade_cluster,
            {**topic_values, "theme": theme_str},
            theme=theme_str,
            target="both",
        ),
        suggest_emotions(
            grade_cluster,
            {**topic_values, "theme": theme_str},
        ),
    )

    # Fallback: if one of the ideas is missing, generate it separately
    missing = []
    if not idea_result.get("narrative"):
        missing.append("narrative")
    if not idea_result.get("informational"):
        missing.append("informational")

    for target_type in missing:
        import logging
        logging.getLogger(__name__).warning(
            f"generate_plan: '{target_type}' idea missing from combined call — retrying individually"
        )
        single = await generate_idea(
            grade_cluster,
            {**topic_values, "theme": theme_str},
            theme=theme_str,
            target=target_type,
        )
        idea_result[target_type] = single.get(target_type)

    return {
        "theme": theme_result,
        "idea": idea_result,
        "emotions": emotions_list,
    }


def _validate_anchors(data: dict) -> list[str]:
    """Return list of issues where a text is missing anchors for any dimension."""
    issues = []
    for text_key, text_label in [("narrative", "נרטיבי"), ("informational", "מידעי")]:
        anchor_map = data.get(text_key, {}).get("anchor_map", {})
        for dim in ["A", "B", "C", "D"]:
            anchors = anchor_map.get(dim, [])
            if not anchors or not any(a.strip() for a in anchors):
                issues.append(f"טקסט {text_label}: חסרים עוגנים לממד {dim}")
    return issues


def _truncate_to_word_limit(content: str, max_words: int) -> str:
    """Cut text at max_words boundary, ending at a sentence or paragraph break."""
    if not content:
        return content
    words = content.split()
    if len(words) <= max_words:
        return content
    # Take only max_words words
    truncated = " ".join(words[:max_words])
    # Try to cut at last paragraph break
    last_para = truncated.rfind("\n\n")
    if last_para > len(truncated) * 0.6:
        return truncated[:last_para].rstrip()
    # Try to cut at last sentence end (.!?)
    for end_char in (".", "!", "?", ":", "—"):
        last_end = truncated.rfind(end_char)
        if last_end > len(truncated) * 0.7:
            return truncated[:last_end + 1].rstrip()
    # Fallback: cut at last newline
    last_nl = truncated.rfind("\n")
    if last_nl > len(truncated) * 0.6:
        return truncated[:last_nl].rstrip()
    return truncated.rstrip()


def _validate_word_counts(data: dict, grade_cluster: str) -> list[str]:
    """Truncate oversized texts and return any remaining issues."""
    bounds = GRADE_WORD_COUNTS.get(grade_cluster, (350, 480, 300, 420))
    narr_min, narr_max, info_min, info_max = bounds
    issues = []

    narr = data.get("narrative", {})
    info = data.get("informational", {})

    # Truncate if over the max limit
    narr_content = narr.get("content", "")
    info_content = info.get("content", "")
    narr_wc = count_hebrew_words(narr_content)
    info_wc = count_hebrew_words(info_content)

    if narr_wc > narr_max:
        import logging
        logging.getLogger(__name__).warning(
            f"Narrative text too long ({narr_wc} words > {narr_max}), truncating."
        )
        narr["content"] = _truncate_to_word_limit(narr_content, narr_max)
        narr_wc = count_hebrew_words(narr["content"])

    if info_wc > info_max:
        import logging
        logging.getLogger(__name__).warning(
            f"Informational text too long ({info_wc} words > {info_max}), truncating."
        )
        info["content"] = _truncate_to_word_limit(info_content, info_max)
        info_wc = count_hebrew_words(info["content"])

    # Update word counts in the data
    narr["word_count"] = narr_wc
    info["word_count"] = info_wc

    if not (narr_min <= narr_wc <= narr_max):
        issues.append(
            f"הטקסט הנרטיבי מכיל {narr_wc} מילים, הנדרש {narr_min}–{narr_max}"
        )
    if not (info_min <= info_wc <= info_max):
        issues.append(
            f"הטקסט המידעי מכיל {info_wc} מילים, הנדרש {info_min}–{info_max}"
        )
    return issues


def _clean_json_text(text: str) -> str:
    """Clean common LLM JSON issues: trailing commas, Python literals."""
    text = re.sub(r",\s*([}\]])", r"\1", text)
    text = re.sub(r"\bTrue\b", "true", text)
    text = re.sub(r"\bFalse\b", "false", text)
    text = re.sub(r"\bNone\b", "null", text)
    return text


def _fix_newlines_in_strings(text: str) -> str:
    """Fix unescaped newlines/tabs inside JSON string values."""
    result = []
    in_string = False
    escape_next = False
    for char in text:
        if escape_next:
            result.append(char)
            escape_next = False
            continue
        if char == "\\" and in_string:
            result.append(char)
            escape_next = True
            continue
        if char == '"':
            in_string = not in_string
            result.append(char)
            continue
        if in_string:
            if char == "\n":
                result.append("\\n")
                continue
            if char == "\r":
                result.append("\\r")
                continue
            if char == "\t":
                result.append("\\t")
                continue
        result.append(char)
    return "".join(result)


def _extract_json(raw: str) -> dict:
    """Extract JSON object from LLM response. Tries multiple strategies."""
    # Strategy 1: strip markdown fences and parse directly
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`").strip()
    for fn in (_clean_json_text, lambda t: _fix_newlines_in_strings(_clean_json_text(t))):
        try:
            return json.loads(fn(cleaned))
        except (json.JSONDecodeError, ValueError):
            pass

    # Strategy 2: find first { to last }
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = cleaned[start:end + 1]
        for fn in (_clean_json_text, lambda t: _fix_newlines_in_strings(_clean_json_text(t))):
            try:
                return json.loads(fn(candidate))
            except (json.JSONDecodeError, ValueError):
                pass

    # Strategy 3: regex search for JSON object
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        candidate = match.group()
        for fn in (_clean_json_text, lambda t: _fix_newlines_in_strings(_clean_json_text(t))):
            try:
                return json.loads(fn(candidate))
            except (json.JSONDecodeError, ValueError):
                pass

    raise ValueError(f"No valid JSON found in LLM response (length={len(raw)})")


def _build_single_text_prompts(
    text_type: str,
    grade_cluster: str,
    topic_values: dict,
    shared_theme: str,
    short_warning: str = "",
) -> tuple[str, str]:
    """Build (system, user) prompts for a single text generation call."""
    bounds = GRADE_WORD_COUNTS.get(grade_cluster, (400, 600, 330, 460))

    names_note = ISRAELI_NAMES_BY_CLUSTER.get(grade_cluster, ISRAELI_NAMES_BY_CLUSTER["5-6"])
    theme_restrictions = NARRATIVE_THEME_RESTRICTIONS.get(grade_cluster, "")

    if text_type == "narrative":
        min_w, max_w = bounds[0], bounds[1]
        target_w = max_w - 30
        min_paras = 5 if min_w <= 450 else 6
        type_heb = "נרטיבי (סיפורי)"

        grade_age = {"3-4": "ילדים בגיל 8–10", "5-6": "ילדים בגיל 10–12", "7-9": "נוער בגיל 12–15"}.get(grade_cluster, "ילדים")
        type_instructions = f"""
═══════════════════════════════════════
כתיבה ספרותית איכותית — כמו ספר ילדים מוכשר
═══════════════════════════════════════
{theme_restrictions}

אתה סופר/ת ספרי ילדים מוכשר. כתוב סיפור מרתק ל{grade_age} עם:
שמות דמויות — חובה לגוון:
{names_note}

📖 מבנה סיפורי בסיסי (חובה — {min_paras} חלקים לפחות):
  פתיחה: הצג את הדמות הראשית, המקום והרגע — כבר בשורה הראשונה צור עניין
  בניית מתח: מכשול / בעיה / ספק / קונפליקט פנימי — הקורא רוצה לדעת מה יקרה
  הסלמה: הסיטואציה מסתבכת — ניסיון שלא מצליח, הפתעה, גילוי חדש
  שיא: הרגע הקריטי — ההחלטה החשובה ביותר של הדמות
  פתרון וסיום: תוצאה ברורה ושינוי פנימי — הדמות השתנתה

✍️ כלים ספרותיים — חובה לשלב:
  דיאלוג חי: לפחות 3–4 שיחות עם ניסוח ישיר ("אמרה רונה", "שאל בחרדה")
    — הדיאלוג חייב לחשוף אופי, רגש או קונפליקט, לא רק להעביר מידע
  מחשבות פנימיות: מה הדמות חושבת / מרגישה בלבה ("היא ידעה שעליה לבחור...")
  הרהורים ותהיות: רגעי ספק, תשאול עצמי ("האם עשתה את הדבר הנכון?")
  תיאורים חושיים: מה רואים, שומעים, מריחים, מרגישים — בנקודות מפתח
  קצב משתנה: משפטים קצרים בשיא / ארוכים בתיאור

🚫 אסור לכתוב:
  — "הוא הרגיש עצב" — במקום: "הגרון שלו נצבט, ומבטו נדד לרצפה"
  — "היא הבינה שזה חשוב" — במקום: "בלב היא ידעה: לא תוכל לחזור אחורה"
  — מוסר השכל מפורש בסוף — הערך ייראה מבחירות הדמות בלבד"""

    else:
        min_w, max_w = bounds[2], bounds[3]
        target_w = max_w - 30
        min_paras = 4 if min_w <= 400 else 5
        type_heb = "מידעי"
        continuity = topic_values.get("text_continuity", "continuous")
        sidebar_types_req = topic_values.get("sidebar_types", [])

        grade_age = {"3-4": "ילדים בגיל 8–10", "5-6": "ילדים בגיל 10–12", "7-9": "נוער בגיל 12–15"}.get(grade_cluster, "ילדים")

        if continuity == "non_continuous":
            # Non-continuous: main article + sidebar boxes
            sidebar_labels = {
                "definition": "הגדרה מילונית — מונח מרכזי מוגדר בתמציתיות",
                "editorial": "עמדה — דעה/עמדה קצרה הקשורה לנושא",
                "news_item": "כתבה חדשותית — ידיעה עיתונאית קצרה ועדכנית",
                "survey": "סקר — 2-3 שאלות עם אחוזי תשובות; חובה: ציין בסוגריים מראה מקום ממשי (למשל: מקור: מחקר אוניברסיטת תל אביב, 2023) שהמורה תוכל לאמת",
                "example": "הדגמה — דוגמה מפורטת ממשית",
                "fact_box": "תיבת עובדות — 4-5 עובדות משלימות ממוספרות; לכל עובדה מספרית/סטטיסטית ציין מקור בסוגריים (מקור: שם הארגון/מחקר/שנה) לאמת אמינות",
                "diary": "קטע מיומן — קטע אישי קצר (גוף ראשון, 60-80 מילים) של דמות/אדם שחווה ישירות את הנושא הנדון בכתבה המרכזית (לא תלוש, כתוב כהמשך חוויתי של הכתבה)",
                "list": "רשימה — 5-7 פריטים ממוספרים שנגזרים ישירות מהכתבה (לדוגמה: אם הכתבה עוסקת ב-X — הרשימה תציג דוגמאות/שימושים/נתונים על X, לא רשימה כללית תלושה)",
                "knowledge_link": "קשר לתחום דעת — הרחבה המקשרת ספציפית את נושא הכתבה לתחום דעת אחר (מדע, היסטוריה, מתמטיקה וכד'), עם דוגמה קונקרטית מהנושא",
            }
            chosen_sidebars = sidebar_types_req if sidebar_types_req else ["definition", "fact_box"]
            sidebar_instructions = "\n".join([
                f"  • {sidebar_labels.get(st, st)}"
                for st in chosen_sidebars
            ])

            type_instructions = f"""
═══════════════════════════════════════
טקסט מידעי עם רכיבים נלווים — פריסת כתב-עת לילדים
═══════════════════════════════════════
אתה עורך/ת כתב-עת מדעי-תרבותי ל{grade_age}. יצור דף מגזין מלא עם:

📰 כתבה מרכזית ({min_paras} פסקאות לפחות, ~{int(target_w * 0.65)} מילים):
  פסקה 1 — פתיחה: עובדה מפתיעה / שאלה / דוגמה קונקרטית
  פסקאות 2–{min_paras - 1} — גוף: כל פסקה = רעיון אחד + פיתוח + נתון
  פסקה אחרונה — מסקנה/רפלקציה
  כלים: מילות קישור, נתונים ספציפיים, הסבר מושגים, שאלה רטורית

📦 רכיבים נלווים (2-3 קופסאות בצד):
{sidebar_instructions}

⚠️ חובה — כללי הזיקה ואמינות:
1. כל רכיב נלווה חייב להתייחס ישירות לנושא הכתבה המרכזית — לא לנושא כללי.
2. רכיב "רשימה": הפריטים חייבים להיות דוגמאות/שימושים/נתונים ספציפיים מהנושא של הכתבה.
3. רכיב "יומן": קטע אישי של מישהו שחווה ישירות את הנושא הנדון (לא חוויה תלושה).
4. כל קופסה: כותרת ברורה + תוכן תמציתי (50-100 מילים) — מוסיף מה שהכתבה לא אמרה.
5. אמינות נתונים: כל נתון מספרי, סטטיסטיקה, אחוז או ממצא מחקרי — חובה לציין מקור בסוגריים בסוף: (מקור: שם הארגון/מחקר/שנה). אם אינך בטוח/ה — כתוב "לפי הערכות" ולא מספר שגוי."""
        else:
            type_instructions = f"""
═══════════════════════════════════════
כתיבה עיתונאית איכותית — כמו כתבה בכתב-עת לילדים
═══════════════════════════════════════
אתה עורך/ת כתב-עת מדעי-תרבותי ל{grade_age}. כתוב מאמר מידעי רציף מרתק, ברור וקוהרנטי עם:

📰 מבנה לוגי ברור ({min_paras} פסקאות לפחות):
  פסקה 1 — פתיחה מסקרנת: עובדה מפתיעה / שאלה / דוגמה קונקרטית שמושכת לקרוא
  פסקאות 2–{min_paras - 1} — גוף: כל פסקה = רעיון אחד מרכזי + פיתוח + דוגמה/נתון
    חלוקה לוגית: כרונולוגי / בעיה-פתרון / כללה-פרוט / סיבה-תוצאה
  פסקה אחרונה — סיכום/מסקנה: מה לקחנו מכל זה? מה משמעות הנושא לחיינו?

✍️ כלים עיתונאיים — חובה לשלב:
  ריצה לוגית: כל פסקה מובילה לגיעה הבאה — הקורא לא יכול לדלג
    (מילות קישור: לכן, כתוצאה מכך, לעומת זאת, בנוסף, עם זאת, בשל כך)
  נתונים קונקרטיים: מספרים, שמות, תאריכים, עובדות מוחשיות — לא כלליות
  מימד אנושי: כיצד הנושא נוגע לחיי ילדים / אנשים ממשיים?
  הסבר מושגים: כל מושג חדש — הסבר בתוך הטקסט, ללא הנחת ידע מוקדם
  שאלות רטוריות: 1–2 שאלות שמזמינות מחשבה ("האם תהיתם פעם...?")

🚫 אסור לכתוב:
  — פסקות ארוכות מ-6 משפטים ללא רעיון מרכזי ברור
  — קפיצה בין נושאים ללא מילת קישור
  — כותרת פסקה ריקה מתוכן ספציפי
  — עובדות סתמיות ללא הסבר ("יש הרבה סוגים") — תמיד פרט ספציפי!"""

    topic = topic_values.get("topic", "")
    values = topic_values.get("values", "")
    specific = topic_values.get("specific_topic", "")
    emotions = topic_values.get("emotions", [])
    emotions_str = ", ".join(emotions[:4]) if emotions and text_type == "narrative" else ""

    biographical_figure = topic_values.get("biographical_figure", "") or (
        specific if topic == "אישיים" else ""
    )
    bio_note = ""
    if biographical_figure and topic == "אישיים":
        if text_type == "informational":
            bio_note = f"\n⚠️ חובה: טקסט ביוגרפי על {biographical_figure} — עובדות אמיתיות בלבד"
        else:
            bio_note = f"\n⚠️ הנרטיבי לא יהיה על {biographical_figure} — דמות בדיונית הקשורה לתמה"

    emotions_note = ""
    if emotions_str:
        emotions_note = (
            f"\n⚠️ הטמע את הרגשות הבאים דרך כלים ספרותיים (הראה-אל-תספר בלבד): {emotions_str}"
            f"\n   כל רגש: תגובה גופנית + מחשבה פנימית + פעולה — לא הצהרה ישירה!"
        )

    # Idea approved by teacher — must be followed
    idea = topic_values.get("idea", {})
    idea_note = ""
    if text_type == "narrative" and idea.get("narrative"):
        n = idea["narrative"]
        idea_note = (
            f"\n⚠️ חובה: עקוב אחר הרעיון המאושר על ידי המורה:\n"
            f"- גיבור/ה: {n.get('hero', '')}\n"
            f"- קונפליקט: {n.get('conflict', '')}\n"
            f"- ערך: {n.get('value', '')}\n"
            f"- תקציר: {n.get('summary', '')}"
        )
    elif text_type == "informational" and idea.get("informational"):
        i = idea["informational"]
        idea_note = (
            f"\n⚠️ חובה: עקוב אחר הרעיון המאושר על ידי המורה:\n"
            f"- נושא: {i.get('subject', '')}\n"
            f"- היבטים: {i.get('aspects', '')}\n"
            f"- מסר: {i.get('message', '')}\n"
            f"- תקציר: {i.get('summary', '')}"
        )

    examples = get_text_examples(grade_cluster, text_type, n=2)
    examples_section = ""
    if examples:
        examples_section = f"\nדוגמה לסגנון ורמה (אל תעתיק — השתמש כהשראה בלבד):\n{examples[0][:700]}\n"

    # The two texts share only ONE anchor: the TOPIC.
    # Narrative explores the human/emotional side of the topic area — value emerges from story, never stated explicitly.
    # Informational is purely factual about the topic — no value preaching, different angle from the narrative.
    if text_type == "narrative":
        role_note = (
            f"הסיפור מתרחש בעולם הקשור ל\"{topic}\" — אך זווית הראייה שונה לחלוטין מהטקסט המידעי. "
            f"הסיפור ממחיש את הנושא דרך חוויה אנושית אישית. "
            f"הערך \"{values}\" נוכח דרך מעשי הדמויות ובחירותיהן — אך לעולם אינו מוצהר במפורש."
        )
        focus_line = f"נושא המסגרת: {topic} | ערך (סמוי, לא מוצהר): {values}"
    else:
        role_note = (
            f"המאמר עוסק בנושא \"{topic}\" בזווית עיתונאית-מדעית שונה לחלוטין מהסיפור הנרטיבי. "
            f"⚠️ אסור חפיפה: אל תזכיר את הדמויות, האירועים או הסיטואציה מהסיפור. המידעי = תוכן עצמאי (עובדות, מחקר, נתונים). המחבר היחיד = הערך המשותף. "
            f"הערך אינו מוזכר ישירות — הוא עשוי לעלות כרפלקציה טבעית בסיום בלבד."
        )
        focus_line = f"נושא: {topic}{' | ' + specific if specific else ''}"

    retry_alert = f"\n\n🚨 שים לב: {short_warning}" if short_warning else ""

    system = f"""אתה כותב/ת ספרים ומאמרים לילדים ברמה ספרותית-עיתונאית גבוהה, בסטנדרט ראמ"ה.
תפקידך: לכתוב טקסט {type_heb} אחד בעברית תקנית ועשירה לאשכול כיתות {grade_cluster}.

⚠️ חובה מוחלטת — שפה תקנית ומקצועית:
• עברית תקנית בלבד — ללא שגיאות דקדוק (למשל: חלומו ולא חלמתו, הילד רצה ולא הילדים רצו, התאמה נכונה של זכר/נקבה ויחיד/רבים).
• האתר מיועד לאנשי חינוך — שפה עילגת או שגויה פוגעת באמון במערכת.
• כתוב בשפה מקצועית, עשירה וברורה — ברמה חינוכית גבוהה.
• אסור להשתמש באותיות ערביות — מילים ערביות בתעתיק עברי בלבד.

{role_note}

══════════════════════════════════
דרישת אורך — חובה מוחלטת לפי תקן ראמ"ה
══════════════════════════════════
הטקסט חייב להכיל לפחות {min_w} מילים — יעד: {target_w} מילים.
טקסטים קצרים מ-{min_w} מילים פסולים לבחינת ראמ"ה.
• כתוב לפחות {min_paras} פסקאות מלאות ומפותחות
• כל פסקה = 4–8 משפטים — לא קצר!
• הוסף פרטים, תיאורים, דוגמאות — אל תסכם, פתח והרחב!{retry_alert}

חייב לכלול עוגנים ממשיים לממדים A (גלוי), B (משתמע), C (פרשנות), D (הערכה)."""

    user = f"""תמה: {shared_theme}
{focus_line}
{role_note}{bio_note}{emotions_note}{idea_note}
{type_instructions}
{examples_section}
עוגנים נדרשים:
- ממד א' (גלוי): מידע מפורש ישירות בטקסט
- ממד ב' (משתמע): פער לוגי / סיבה-תוצאה שאינם מפורשים
- ממד ג' (פרשנות): סיטואציה המזמינה עמדה / השוואה / מניע סמוי
- ממד ד' (הערכה): אמצעי ספרותי / בחירת כותב / מבנה צורני

החזר JSON תקני בלבד (ללא טקסט לפני/אחרי)."""

    return system, user


async def _generate_single_text(
    text_type: str,
    grade_cluster: str,
    topic_values: dict,
    shared_theme: str,
) -> dict:
    """Generate one text via tool use (structured, reliable). Retries if too short."""
    import logging
    logger = logging.getLogger(__name__)

    bounds = GRADE_WORD_COUNTS.get(grade_cluster, (400, 600, 330, 460))
    min_w = bounds[0] if text_type == "narrative" else bounds[2]
    # Accept text that reaches at least 85% of the minimum before triggering retry
    accept_threshold = int(min_w * 0.85)

    continuity = topic_values.get("text_continuity", "continuous")
    is_non_continuous = text_type == "informational" and continuity == "non_continuous"

    type_heb = "נרטיבי (סיפורי)" if text_type == "narrative" else "מידעי"
    anchor_schema = {
        "type": "object",
        "properties": {
            "A": {"type": "array", "items": {"type": "string"}},
            "B": {"type": "array", "items": {"type": "string"}},
            "C": {"type": "array", "items": {"type": "string"}},
            "D": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["A", "B", "C", "D"],
    }

    if is_non_continuous:
        sidebar_schema = {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "description": "sidebar type: definition|editorial|news_item|survey|example|fact_box|diary|list|knowledge_link"},
                    "title": {"type": "string", "description": "כותרת הקופסה"},
                    "content": {"type": "string", "description": "תוכן הקופסה (50-100 מילים)"},
                },
                "required": ["type", "title", "content"],
            },
            "description": "2-3 קופסאות נלוות",
        }
        tool_def = {
            "name": f"submit_{text_type}_text",
            "description": "הגש את הכתבה המרכזית + הרכיבים הנלווים",
            "input_schema": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "main_content": {"type": "string", "description": "טקסט הכתבה המרכזית"},
                    "sidebars": sidebar_schema,
                    "word_count": {"type": "integer"},
                    "anchor_map": anchor_schema,
                },
                "required": ["title", "main_content", "sidebars", "word_count", "anchor_map"],
            },
        }
    else:
        tool_def = {
            "name": f"submit_{text_type}_text",
            "description": f"הגש את הטקסט ה{type_heb}",
            "input_schema": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "content": {"type": "string"},
                    "word_count": {"type": "integer"},
                    "anchor_map": anchor_schema,
                },
                "required": ["title", "content", "word_count", "anchor_map"],
            },
        }

    short_warning = ""
    for attempt in range(3):
        system, user = _build_single_text_prompts(
            text_type, grade_cluster, topic_values, shared_theme,
            short_warning=short_warning,
        )
        result = await _call_with_tool(system, user, tool_def, 4096)

        # For non-continuous texts, pack main_content + sidebars into a JSON content string
        if is_non_continuous:
            main_content = result.get("main_content", result.get("content", ""))
            sidebars = result.get("sidebars", [])
            packed = json.dumps(
                {"__nc": True, "main": main_content, "sidebars": sidebars},
                ensure_ascii=False,
            )
            result["content"] = packed
            # word count counts both main + sidebars
            wc = count_hebrew_words(main_content) + sum(count_hebrew_words(s.get("content", "")) for s in sidebars)
        else:
            wc = count_hebrew_words(result.get("content", ""))
        result["word_count"] = wc

        if wc >= accept_threshold:
            if attempt > 0:
                logger.info(f"_generate_single_text({text_type}): retry {attempt} succeeded — {wc} words")
            return result

        # Too short — prepare retry
        logger.warning(
            f"_generate_single_text({text_type}): attempt {attempt + 1} too short "
            f"({wc} words < {accept_threshold} threshold, min={min_w}). Retrying."
        )
        short_warning = (
            f"הניסיון הקודם ייצר רק {wc} מילים — פחות מהמינימום הנדרש ({min_w} מילים). "
            f"חובה לכתוב טקסט ארוך ומלא עם לפחות {min_w} מילים. "
            f"הרחב כל פסקה, הוסף פרטים ודוגמאות, אל תקצר!"
        )

    # Return best result after exhausting retries
    logger.error(f"_generate_single_text({text_type}): all retries exhausted, returning last result ({wc} words)")
    return result


async def stream_generate_texts_parallel(
    grade_cluster: str,
    topic_values: dict,
) -> "AsyncIterator[str]":
    """
    Generate both texts in parallel using reliable tool-use calls.
    Yields SSE lines: 'data: {...}\\n\\n'
    Events: start (text_type), text_done (text_type, data), all_done (narrative, informational)
    """
    shared_theme = topic_values.get("theme", topic_values.get("topic", ""))
    queue: asyncio.Queue = asyncio.Queue()
    results: dict = {}

    async def _generate_one(text_type: str) -> None:
        await queue.put({"event": "start", "text_type": text_type})
        try:
            data = await _generate_single_text(text_type, grade_cluster, topic_values, shared_theme)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"_generate_one({text_type}) failed: {e}", exc_info=True)
            data = {"title": "", "content": "", "word_count": 0, "anchor_map": {}, "error": str(e)}
        results[text_type] = data
        await queue.put({"event": "text_done", "text_type": text_type, "data": data})

    tasks = [
        asyncio.create_task(_generate_one("narrative")),
        asyncio.create_task(_generate_one("informational")),
    ]

    done_count = 0
    while done_count < 2:
        item = await queue.get()
        yield f"data: {json.dumps(item, ensure_ascii=False)}\n\n"
        if item["event"] == "text_done":
            done_count += 1

    await asyncio.gather(*tasks, return_exceptions=True)

    combined = {"narrative": results.get("narrative", {}), "informational": results.get("informational", {})}
    _validate_word_counts(combined, grade_cluster)
    yield f"data: {json.dumps({'event': 'all_done', **combined}, ensure_ascii=False)}\n\n"


async def generate_texts(
    grade_cluster: str,
    topic_values: dict,
    preferences: dict,
) -> dict:
    """
    Generate a pair of Hebrew texts (narrative + informational) in parallel.
    Returns dict with 'narrative' and 'informational' keys.
    """
    shared_theme = topic_values.get("theme", topic_values.get("topic", ""))

    # Generate both texts concurrently — roughly halves the wait time
    narrative_task = _generate_single_text("narrative", grade_cluster, topic_values, shared_theme)
    info_task = _generate_single_text("informational", grade_cluster, topic_values, shared_theme)
    narrative_data, info_data = await asyncio.gather(narrative_task, info_task)

    data = {"narrative": narrative_data, "informational": info_data}

    # Fix word counts in-place
    _validate_word_counts(data, grade_cluster)

    return data


async def stream_texts(
    grade_cluster: str,
    topic_values: dict,
    preferences: dict,
) -> AsyncIterator[str]:
    """
    Stream text generation token by token for SSE.
    Yields raw text chunks.
    """
    foundation_context = get_foundation_context(["text_component", "text_appendix", "reading_literacy"])
    narrative_examples = get_text_examples(grade_cluster, "narrative", n=2)
    info_examples = get_text_examples(grade_cluster, "informational", n=2)

    system_prompt = _build_system_prompt(grade_cluster, foundation_context)
    user_prompt = _build_user_prompt(grade_cluster, topic_values, narrative_examples, info_examples)

    async with client.messages.stream(
        model=MODEL_NAME,
        max_tokens=MAX_TOKENS,
        system=system_prompt,
        messages=[
            {"role": "user", "content": user_prompt},
        ],
    ) as stream:
        async for text in stream.text_stream:
            yield text
