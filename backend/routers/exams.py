"""
Exam router — full exam workflow stages 1–4.
"""

import json
import logging
import random
import string
from typing import Optional
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Response

logger = logging.getLogger(__name__)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import (
    Exam, ExamText, Question, SpecTableEntry, ChatMessage,
    ExamStatus, TextType, Dimension, QuestionFormat, ChatRole,
    GradeCluster, get_db
)
from agents import text_agent, task_agent, qa_agent
from services import pdf_export
from services.word_count import count_hebrew_words


router = APIRouter(prefix="/api/exams", tags=["exams"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class CreateExamRequest(BaseModel):
    title: str
    grade_cluster: str  # "3-4" | "5-6" | "7-9"
    topic: str = ""
    values: str = ""
    specific_topic: str = ""
    prefer_narrative: bool = True
    prefer_informational: bool = True
    text_continuity: str = "continuous"  # "continuous" | "non_continuous"
    sidebar_types: Optional[list] = None
    teacher_name: str = ""
    exam_timing: str = ""
    grade: str = ""


class UpdateTextRequest(BaseModel):
    content: str
    title: Optional[str] = None


class UpdateQuestionRequest(BaseModel):
    stem: Optional[str] = None
    options: Optional[list] = None
    correct_answer: Optional[str] = None
    rubric: Optional[dict] = None
    dimension: Optional[str] = None
    format: Optional[str] = None
    score_points: Optional[int] = None


class ChatMessageRequest(BaseModel):
    message: str


class GenerateTextsRequest(BaseModel):
    text_continuity: Optional[str] = None
    non_continuous_type: Optional[str] = None
    sidebar_types: Optional[list] = None
    emotions: Optional[list] = None
    idea: Optional[dict] = None


class RegenerateTextRequest(BaseModel):
    text_type: str  # "narrative" | "informational"
    text_continuity: Optional[str] = None  # override for informational text
    non_continuous_type: Optional[str] = None


class ImproveTextRequest(BaseModel):
    text_id: str
    component: str  # "content" | "structure" | "language" | "genre"
    custom_instruction: str = ""  # הנחיה אישית מהמורה


class SuggestImprovementsRequest(BaseModel):
    text_id: str
    component: str  # "genre" | "content" | "structure" | "language"


class LinguisticEditChatRequest(BaseModel):
    text_id: str
    message: str  # הערת המורה — הבינה תתקן בהתאם


class ApproveThemeRequest(BaseModel):
    approved: bool


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _gen_access_code() -> str:
    """Generate a 6-char alphanumeric code without ambiguous chars."""
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choices(chars, k=6))


def _exam_to_dict(exam: Exam) -> dict:
    return {
        "id": exam.id,
        "title": exam.title,
        "grade_cluster": exam.grade_cluster,
        "topic_values": exam.topic_values,
        "status": exam.status,
        "access_code": exam.access_code,
        "created_at": exam.created_at.isoformat() if exam.created_at else None,
    }


def _text_to_dict(t: ExamText) -> dict:
    tt = t.text_type
    tt_val = tt.value if hasattr(tt, "value") else str(tt)
    return {
        "id": str(t.id),
        "exam_id": str(t.exam_id),
        "text_type": tt_val,
        "title": t.title,
        "content": t.content,
        "word_count": t.word_count,
        "anchor_map": t.anchor_map,
        "version": t.version,
    }


def _question_to_dict(q: Question) -> dict:
    return {
        "id": str(q.id),
        "exam_id": str(q.exam_id),
        "text_id": str(q.text_id),
        "sequence_number": q.sequence_number,
        "dimension": q.dimension,
        "format": q.format,
        "content": q.content,
        "rubric": q.rubric,
        "score_points": q.score_points,
        "is_cross_text": q.is_cross_text,
        "is_approved": q.is_approved,
    }


async def _get_exam_or_404(exam_id: str, db: AsyncSession) -> Exam:
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    return exam


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/")
async def create_exam(req: CreateExamRequest, db: AsyncSession = Depends(get_db)):
    """Stage 1: Create exam configuration."""
    exam = Exam(
        title=req.title,
        grade_cluster=req.grade_cluster,
        topic_values={
            "topic": req.topic,
            "values": req.values,
            "specific_topic": req.specific_topic,
            "text_continuity": req.text_continuity,
            "sidebar_types": req.sidebar_types or [],
            "teacher_name": req.teacher_name,
            "exam_timing": req.exam_timing,
            "grade": req.grade,
        },
        text_type_preferences={
            "narrative": req.prefer_narrative,
            "informational": req.prefer_informational,
        },
        status=ExamStatus.DRAFT,
    )
    db.add(exam)
    await db.commit()
    await db.refresh(exam)
    return _exam_to_dict(exam)


@router.get("/")
async def list_exams(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Exam).order_by(Exam.created_at.desc()))
    exams = result.scalars().all()
    exam_ids = [e.id for e in exams]
    # Fetch text titles in one query for all exams
    text_rows = []
    if exam_ids:
        texts_result = await db.execute(
            select(ExamText.exam_id, ExamText.text_type, ExamText.title)
            .where(ExamText.exam_id.in_(exam_ids))
        )
        text_rows = texts_result.all()
    # Group text titles by exam
    from collections import defaultdict
    text_titles: dict[str, dict[str, str]] = defaultdict(dict)
    for row in text_rows:
        text_titles[row.exam_id][row.text_type] = row.title or ''

    out = []
    for e in exams:
        d = _exam_to_dict(e)
        d['text_titles'] = text_titles.get(e.id, {})
        out.append(d)
    return out


@router.get("/{exam_id}")
async def get_exam(exam_id: str, db: AsyncSession = Depends(get_db)):
    exam = await _get_exam_or_404(exam_id, db)
    texts_result = await db.execute(select(ExamText).where(ExamText.exam_id == exam_id))
    texts = texts_result.scalars().all()
    questions_result = await db.execute(select(Question).where(Question.exam_id == exam_id).order_by(Question.sequence_number))
    questions = questions_result.scalars().all()
    spec_result = await db.execute(select(SpecTableEntry).where(SpecTableEntry.exam_id == exam_id))
    spec_entries = spec_result.scalars().all()

    return {
        **_exam_to_dict(exam),
        "texts": [_text_to_dict(t) for t in texts],
        "questions": [_question_to_dict(q) for q in questions],
        "spec_entries": [
            {
                "id": s.id,
                "question_id": s.question_id,
                "dimension": s.dimension,
                "format": s.format,
                "score": s.score,
                "text_reference": s.text_reference,
                "anchor_sentence": s.anchor_sentence,
                "text_type": s.text_type,
            }
            for s in spec_entries
        ],
    }


@router.delete("/{exam_id}")
async def delete_exam(exam_id: str, db: AsyncSession = Depends(get_db)):
    """מחיקת מבחן ב-cascade (מחיקת כל הנתונים הקשורים)."""
    exam = await _get_exam_or_404(exam_id, db)
    await db.delete(exam)
    await db.commit()
    return {"deleted": exam_id}


@router.post("/{exam_id}/propose-theme")
async def propose_theme(exam_id: str, db: AsyncSession = Depends(get_db)):
    """מייצר תמה משותפת ומחכה לאישור המורה."""
    exam = await _get_exam_or_404(exam_id, db)

    grade_str = exam.grade_cluster.value if hasattr(exam.grade_cluster, "value") else str(exam.grade_cluster)
    try:
        theme_data = await text_agent.generate_theme(
            grade_cluster=str(grade_str),
            topic_values=exam.topic_values or {},
        )
    except Exception as e:
        logger.error(f"propose_theme error for exam {exam_id}: {type(e).__name__}: {e}", exc_info=True)
        err_str = str(e).lower()
        if ("credit balance" in err_str or "too low" in err_str or "insufficient_quota" in err_str or "quota" in err_str):
            detail = "יתרת הקרדיטים בחשבון Anthropic נמוכה מדי. יש להיכנס ל־Plans & Billing באתר Anthropic ולטעון קרדיטים."
        elif "rate_limit" in err_str or "429" in str(e):
            detail = "חריגה ממגבלת קצב ה-API. אנא המתיני מספר שניות ונסי שוב."
        elif "authentication" in err_str or "invalid_api_key" in err_str:
            detail = "מפתח ה-API (ANTHROPIC_API_KEY) אינו תקין. יש לעדכן בקובץ .env."
        else:
            detail = f"שגיאה בהצעת תמה: {str(e)}"
        raise HTTPException(status_code=422, detail=detail)

    if theme_data.get("blocked"):
        raise HTTPException(status_code=400, detail=theme_data.get("blocked_reason", "נושא חסום"))

    exam.proposed_theme = theme_data
    exam.status = ExamStatus.THEME_PENDING
    await db.commit()
    return theme_data


@router.post("/{exam_id}/approve-theme")
async def approve_theme(
    exam_id: str,
    req: ApproveThemeRequest,
    db: AsyncSession = Depends(get_db),
):
    """אישור או דחיית התמה המוצעת."""
    exam = await _get_exam_or_404(exam_id, db)

    if not req.approved:
        # המורה דחתה — חוזרים לסטטוס DRAFT לניסיון חדש
        exam.proposed_theme = None
        exam.status = ExamStatus.DRAFT
        await db.commit()
        return {"status": "rejected"}

    # אישור — המורה מאשרת, מוכן ליצירת טקסטים
    exam.status = ExamStatus.DRAFT  # נשאר DRAFT עד שהטקסטים נוצרים
    await db.commit()
    return {"status": "approved", "theme": exam.proposed_theme}


class GenerateIdeaRequest(BaseModel):
    target: str = "both"  # "narrative" | "informational" | "both"


@router.post("/{exam_id}/generate-idea")
async def generate_idea(
    exam_id: str,
    req: GenerateIdeaRequest = GenerateIdeaRequest(),
    db: AsyncSession = Depends(get_db),
):
    """שלב הרעיון — מייצר תמצית קצרה לכל טקסט לפני יצירת הטקסט המלא."""
    exam = await _get_exam_or_404(exam_id, db)
    grade_str = exam.grade_cluster.value if hasattr(exam.grade_cluster, "value") else str(exam.grade_cluster)
    theme = (exam.proposed_theme or {}).get("theme", "")
    try:
        idea_data = await text_agent.generate_idea(
            grade_cluster=str(grade_str),
            topic_values=exam.topic_values or {},
            theme=theme,
            target=req.target,
        )
    except Exception as e:
        logger.error(f"generate_idea error for exam {exam_id}: {type(e).__name__}: {e}", exc_info=True)
        err_str = str(e).lower()
        if ("credit balance" in err_str or "too low" in err_str or "insufficient_quota" in err_str or "quota" in err_str):
            detail = "יתרת הקרדיטים בחשבון Anthropic נמוכה מדי. יש להיכנס ל־Plans & Billing באתר Anthropic ולטעון קרדיטים."
        elif "rate_limit" in err_str or "429" in str(e):
            detail = "חריגה ממגבלת קצב ה-API. אנא המתיני מספר שניות ונסי שוב."
        else:
            detail = f"שגיאה ביצירת רעיון: {str(e)}"
        raise HTTPException(status_code=422, detail=detail)
    # Merge with existing idea
    existing_idea = (exam.proposed_theme or {}).get("idea", {})
    merged_idea = {**existing_idea, **idea_data}
    exam.proposed_theme = {**(exam.proposed_theme or {}), "idea": merged_idea}
    await db.commit()
    return idea_data


@router.post("/{exam_id}/generate-plan")
async def generate_plan(
    exam_id: str,
    db: AsyncSession = Depends(get_db),
):
    """שלב מאוחד: תמה → רעיון + רגשות במקביל (חוסך 10-15 שניות)."""
    exam = await _get_exam_or_404(exam_id, db)
    grade_str = exam.grade_cluster.value if hasattr(exam.grade_cluster, "value") else str(exam.grade_cluster)
    try:
        plan = await text_agent.generate_plan(
            grade_cluster=str(grade_str),
            topic_values=exam.topic_values or {},
        )
    except Exception as e:
        logger.error(f"generate_plan error for exam {exam_id}: {type(e).__name__}: {e}", exc_info=True)
        err_str = str(e).lower()
        if ("credit balance" in err_str or "too low" in err_str or "insufficient_quota" in err_str or "quota" in err_str):
            detail = "יתרת הקרדיטים בחשבון Anthropic נמוכה מדי. יש להיכנס ל־Plans & Billing באתר Anthropic ולטעון קרדיטים."
        elif "rate_limit" in err_str or "429" in str(e):
            detail = "חריגה ממגבלת קצב ה-API. אנא המתיני מספר שניות ונסי שוב."
        elif "authentication" in err_str or "invalid_api_key" in err_str:
            detail = "מפתח ה-API (ANTHROPIC_API_KEY) אינו תקין. יש לעדכן בקובץ .env."
        else:
            detail = f"שגיאה ביצירת תכנית: {str(e)}"
        raise HTTPException(status_code=422, detail=detail)

    theme_data = plan.get("theme", {})
    if theme_data.get("blocked"):
        raise HTTPException(status_code=400, detail=theme_data.get("blocked_reason", "נושא חסום"))

    # Save theme + idea + emotions into topic_values so they survive navigation
    topic_values = dict(exam.topic_values or {})
    topic_values["theme"] = theme_data.get("theme", "")
    topic_values["theme_rationale"] = theme_data.get("rationale", "")
    topic_values["idea"] = plan.get("idea", {})
    topic_values["emotions"] = plan.get("emotions", [])
    exam.topic_values = topic_values
    exam.proposed_theme = theme_data
    exam.status = ExamStatus.THEME_PENDING
    await db.commit()

    return {
        "theme": theme_data,
        "idea": plan.get("idea", {}),
        "emotions": plan.get("emotions", []),
    }


class IdeaChatRequest(BaseModel):
    text_type: str  # "narrative" | "informational"
    current_idea: dict
    message: str


@router.post("/{exam_id}/idea-chat")
async def idea_chat(
    exam_id: str,
    req: IdeaChatRequest,
    db: AsyncSession = Depends(get_db),
):
    """Refine an idea based on teacher's free-form message."""
    exam = await _get_exam_or_404(exam_id, db)
    grade_str = exam.grade_cluster.value if hasattr(exam.grade_cluster, "value") else str(exam.grade_cluster)
    topic_values = exam.topic_values or {}
    theme = topic_values.get("theme", "")

    refined = await text_agent.refine_idea_with_chat(
        text_type=req.text_type,
        current_idea=req.current_idea,
        teacher_message=req.message,
        grade_cluster=grade_str,
        topic_values=topic_values,
        theme=theme,
    )

    # Save the updated idea back to topic_values
    tv = dict(topic_values)
    idea = dict(tv.get("idea", {}))
    idea[req.text_type] = refined
    tv["idea"] = idea
    exam.topic_values = tv
    await db.commit()

    return {"idea": refined}


@router.post("/{exam_id}/suggest-emotions")
async def suggest_emotions(
    exam_id: str,
    db: AsyncSession = Depends(get_db),
):
    """מייצר 5 הצעות רגש מותאמות לתמה ולרעיון לטקסט הנרטיבי."""
    exam = await _get_exam_or_404(exam_id, db)
    theme = (exam.proposed_theme or {}).get("theme", "")
    topic_values = {**(exam.topic_values or {}), "theme": theme}
    emotions = await text_agent.suggest_emotions(
        grade_cluster=str(exam.grade_cluster.value) if hasattr(exam.grade_cluster, "value") else str(exam.grade_cluster),
        topic_values=topic_values,
    )
    return {"emotions": emotions}


@router.post("/{exam_id}/suggest-improvements")
async def suggest_improvements(
    exam_id: str,
    req: SuggestImprovementsRequest,
    db: AsyncSession = Depends(get_db),
):
    """מייצר 5-6 הצעות שיפור ספציפיות לטקסט לפי רכיב."""
    exam = await _get_exam_or_404(exam_id, db)
    result = await db.execute(
        select(ExamText).where(ExamText.id == req.text_id, ExamText.exam_id == exam_id)
    )
    text = result.scalar_one_or_none()
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")

    suggestions = await text_agent.suggest_improvements(
        text_content=text.content,
        text_title=text.title,
        text_type=text.text_type,
        grade_cluster=exam.grade_cluster,
        component=req.component,
    )
    return {"suggestions": suggestions}


@router.post("/{exam_id}/improve-text")
async def improve_text(
    exam_id: str,
    req: ImproveTextRequest,
    db: AsyncSession = Depends(get_db),
):
    """שיפור טקסט קיים לפי רכיב נבחר (תוכן / מבנה / לשון / סוגה)."""
    exam = await _get_exam_or_404(exam_id, db)

    result = await db.execute(
        select(ExamText).where(ExamText.id == req.text_id, ExamText.exam_id == exam_id)
    )
    text = result.scalar_one_or_none()
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")

    improved = await text_agent.improve_text(
        text_content=text.content,
        text_title=text.title,
        text_type=text.text_type,
        grade_cluster=exam.grade_cluster,
        component=req.component,
        custom_instruction=req.custom_instruction,
    )

    text.content = improved.get("content", text.content)
    text.title = improved.get("title", text.title)
    from services.word_count import count_hebrew_words
    text.word_count = count_hebrew_words(text.content)
    text.version += 1
    await db.commit()
    await db.refresh(text)

    return {
        **_text_to_dict(text),
        "improvement_summary": improved.get("improvement_summary", ""),
    }


@router.post("/{exam_id}/linguistic-edit-chat")
async def linguistic_edit_chat(
    exam_id: str,
    req: LinguisticEditChatRequest,
    db: AsyncSession = Depends(get_db),
):
    """שיח עריכה לשונית: המורה כותבת הערה והבינה מתקנת את הטקסט בהתאם."""
    exam = await _get_exam_or_404(exam_id, db)
    result = await db.execute(
        select(ExamText).where(ExamText.id == req.text_id, ExamText.exam_id == exam_id)
    )
    text = result.scalar_one_or_none()
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")

    try:
        result_data = await text_agent.apply_linguistic_edit_chat(
            text_content=text.content,
            text_title=text.title,
            text_type=text.text_type,
            grade_cluster=str(exam.grade_cluster.value) if hasattr(exam.grade_cluster, "value") else str(exam.grade_cluster),
            teacher_message=req.message,
        )
    except Exception as e:
        logger.error(f"linguistic_edit_chat error: {e}", exc_info=True)
        raise HTTPException(status_code=422, detail=str(e))

    text.content = result_data.get("content", text.content)
    text.word_count = count_hebrew_words(text.content)
    text.version += 1
    await db.commit()
    await db.refresh(text)

    return {
        **_text_to_dict(text),
        "explanation": result_data.get("explanation", ""),
    }


@router.post("/{exam_id}/generate-texts")
async def generate_texts(
    exam_id: str,
    req: GenerateTextsRequest = GenerateTextsRequest(),
    db: AsyncSession = Depends(get_db),
):
    """Stage 2: Trigger Agent 1 to generate narrative + informational texts."""
    exam = await _get_exam_or_404(exam_id, db)

    topic_values = dict(exam.topic_values or {})
    if req.text_continuity:
        topic_values["text_continuity"] = req.text_continuity
    if req.non_continuous_type:
        topic_values["non_continuous_type"] = req.non_continuous_type
    if req.sidebar_types is not None:
        topic_values["sidebar_types"] = req.sidebar_types

    if req.emotions:
        topic_values["emotions"] = req.emotions

    # Generate texts
    try:
        texts_data = await text_agent.generate_texts(
            grade_cluster=exam.grade_cluster,
            topic_values=topic_values,
            preferences=exam.text_type_preferences or {},
        )
    except Exception as e:
        logger.error(f"generate_texts error for exam {exam_id}: {type(e).__name__}: {e}", exc_info=True)
        err_str = str(e)
        if "insufficient_quota" in err_str or "quota" in err_str.lower():
            raise HTTPException(status_code=422, detail="מכסת ה-API אזלה. יש לטעון קרדיטים בחשבון Anthropic.")
        elif "rate_limit" in err_str or "429" in err_str:
            raise HTTPException(status_code=422, detail="חריגה ממגבלת קצב ה-API. אנא המתיני מספר שניות ונסי שוב.")
        else:
            raise HTTPException(status_code=422, detail=f"שגיאה ביצירת טקסטים: {err_str}")

    # Delete existing texts if any
    existing = await db.execute(select(ExamText).where(ExamText.exam_id == exam_id))
    for t in existing.scalars().all():
        await db.delete(t)

    # Save narrative text
    narr_data = texts_data.get("narrative", {})
    narr_text = ExamText(
        exam_id=exam_id,
        text_type=TextType.NARRATIVE,
        title=narr_data.get("title", "טקסט נרטיבי"),
        content=narr_data.get("content", ""),
        word_count=narr_data.get("word_count", count_hebrew_words(narr_data.get("content", ""))),
        anchor_map=narr_data.get("anchor_map", {}),
    )
    db.add(narr_text)

    # Save informational text
    info_data = texts_data.get("informational", {})
    info_text = ExamText(
        exam_id=exam_id,
        text_type=TextType.INFORMATIONAL,
        title=info_data.get("title", "טקסט מידעי"),
        content=info_data.get("content", ""),
        word_count=info_data.get("word_count", count_hebrew_words(info_data.get("content", ""))),
        anchor_map=info_data.get("anchor_map", {}),
    )
    db.add(info_text)

    exam.status = ExamStatus.TEXTS_READY
    await db.commit()
    await db.refresh(narr_text)
    await db.refresh(info_text)

    return {
        "narrative": _text_to_dict(narr_text),
        "informational": _text_to_dict(info_text),
    }


@router.post("/{exam_id}/generate-texts-stream")
async def generate_texts_stream(
    exam_id: str,
    req: GenerateTextsRequest = GenerateTextsRequest(),
    db: AsyncSession = Depends(get_db),
):
    """Parallel streaming SSE endpoint — yields chunk events then saves to DB."""
    exam = await _get_exam_or_404(exam_id, db)

    topic_values = dict(exam.topic_values or {})
    if req.text_continuity:
        topic_values["text_continuity"] = req.text_continuity
    if req.non_continuous_type:
        topic_values["non_continuous_type"] = req.non_continuous_type
    if req.sidebar_types is not None:
        topic_values["sidebar_types"] = req.sidebar_types
    if req.emotions:
        topic_values["emotions"] = req.emotions
    if req.idea:
        topic_values["idea"] = req.idea

    async def event_stream():
        all_done_data: dict = {}

        async for sse_line in text_agent.stream_generate_texts_parallel(
            grade_cluster=exam.grade_cluster,
            topic_values=topic_values,
        ):
            yield sse_line
            # Capture all_done payload for DB save
            if '"all_done"' in sse_line:
                try:
                    all_done_data = json.loads(sse_line[6:].strip())
                except Exception:
                    pass

        # Save results to DB
        try:
            existing = await db.execute(select(ExamText).where(ExamText.exam_id == exam_id))
            for t in existing.scalars().all():
                await db.delete(t)

            narr_data = all_done_data.get("narrative", {})
            narr_text = ExamText(
                exam_id=exam_id,
                text_type=TextType.NARRATIVE,
                title=narr_data.get("title", "טקסט נרטיבי"),
                content=narr_data.get("content", ""),
                word_count=narr_data.get("word_count") or count_hebrew_words(narr_data.get("content", "")),
                anchor_map=narr_data.get("anchor_map", {}),
            )
            db.add(narr_text)

            info_data = all_done_data.get("informational", {})
            info_text = ExamText(
                exam_id=exam_id,
                text_type=TextType.INFORMATIONAL,
                title=info_data.get("title", "טקסט מידעי"),
                content=info_data.get("content", ""),
                word_count=info_data.get("word_count") or count_hebrew_words(info_data.get("content", "")),
                anchor_map=info_data.get("anchor_map", {}),
            )
            db.add(info_text)

            exam.status = ExamStatus.TEXTS_READY
            await db.commit()
            await db.refresh(narr_text)
            await db.refresh(info_text)

            yield f"data: {json.dumps({'event': 'saved', 'narrative': _text_to_dict(narr_text), 'informational': _text_to_dict(info_text)}, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.error(f"stream save error for {exam_id}: {e}", exc_info=True)
            yield f"data: {json.dumps({'event': 'save_error', 'error': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{exam_id}/regenerate-text")
async def regenerate_text(
    exam_id: str,
    req: RegenerateTextRequest,
    db: AsyncSession = Depends(get_db),
):
    """Regenerate one text (narrative or informational)."""
    exam = await _get_exam_or_404(exam_id, db)

    topic_values = dict(exam.topic_values or {})
    if req.text_continuity:
        topic_values["text_continuity"] = req.text_continuity
    if req.non_continuous_type:
        topic_values["non_continuous_type"] = req.non_continuous_type

    texts_data = await text_agent.generate_texts(
        grade_cluster=exam.grade_cluster,
        topic_values=topic_values,
        preferences=exam.text_type_preferences or {},
    )

    text_type = TextType.NARRATIVE if req.text_type == "narrative" else TextType.INFORMATIONAL
    new_data = texts_data.get(req.text_type, {})

    existing_result = await db.execute(
        select(ExamText).where(ExamText.exam_id == exam_id, ExamText.text_type == text_type)
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        existing.title = new_data.get("title", existing.title)
        existing.content = new_data.get("content", "")
        existing.word_count = new_data.get("word_count", count_hebrew_words(new_data.get("content", "")))
        existing.anchor_map = new_data.get("anchor_map", {})
        existing.version += 1
        await db.commit()
        await db.refresh(existing)
        return _text_to_dict(existing)

    raise HTTPException(status_code=404, detail="Text not found")


@router.put("/{exam_id}/texts/{text_id}")
async def update_text(
    exam_id: str,
    text_id: str,
    req: UpdateTextRequest,
    db: AsyncSession = Depends(get_db),
):
    """Manual teacher edit of text content."""
    result = await db.execute(
        select(ExamText).where(ExamText.id == text_id, ExamText.exam_id == exam_id)
    )
    text = result.scalar_one_or_none()
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")

    text.content = req.content
    text.word_count = count_hebrew_words(req.content)
    if req.title:
        text.title = req.title
    await db.commit()
    await db.refresh(text)
    return _text_to_dict(text)


@router.post("/{exam_id}/generate-questions")
async def generate_questions(exam_id: str, db: AsyncSession = Depends(get_db)):
    """Stage 3: Trigger Agent 2 to generate questions + rubric + spec."""
    exam = await _get_exam_or_404(exam_id, db)

    # Get texts
    texts_result = await db.execute(select(ExamText).where(ExamText.exam_id == exam_id))
    texts = {t.text_type: t for t in texts_result.scalars().all()}

    narr_text = texts.get(TextType.NARRATIVE)
    info_text = texts.get(TextType.INFORMATIONAL)
    if not narr_text or not info_text:
        raise HTTPException(status_code=400, detail="Both texts must be generated first")

    # Generate questions
    grade_str = exam.grade_cluster.value if hasattr(exam.grade_cluster, "value") else str(exam.grade_cluster)
    try:
        result = await task_agent.generate_questions(
            narrative_text={
                "content": narr_text.content,
                "title": narr_text.title,
                "anchor_map": narr_text.anchor_map or {},
            },
            informational_text={
                "content": info_text.content,
                "title": info_text.title,
                "anchor_map": info_text.anchor_map or {},
            },
            grade_cluster=grade_str,
        )
    except Exception as e:
        logger.error(f"generate_questions failed for exam {exam_id}: {type(e).__name__}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"שגיאה ביצירת שאלות: {str(e)}")

    # Delete spec entries first (FK constraint: spec_table_entries.question_id NOT NULL)
    existing_s = await db.execute(select(SpecTableEntry).where(SpecTableEntry.exam_id == exam_id))
    for s in existing_s.scalars().all():
        await db.delete(s)
    await db.flush()

    # Then delete questions (cascade deletes any remaining spec entries via ORM)
    existing_q = await db.execute(select(Question).where(Question.exam_id == exam_id))
    for q in existing_q.scalars().all():
        await db.delete(q)
    await db.flush()

    all_questions = []

    VALID_DIMS = {"A", "B", "C", "D"}
    VALID_FMTS = {"MC", "OPEN", "TABLE", "FILL", "COMIC", "SEQUENCE", "TRUE_FALSE", "VOCAB"}

    def _save_questions(q_data_list: list, text_obj: ExamText, text_type_str: str):
        saved = []
        for q_data in q_data_list:
            raw_dim = str(q_data.get("dimension", "A")).upper()
            dim = raw_dim if raw_dim in VALID_DIMS else "B"
            raw_fmt = str(q_data.get("format", "MC")).upper()
            fmt = raw_fmt if raw_fmt in VALID_FMTS else "MC"
            q = Question(
                exam_id=exam_id,
                text_id=text_obj.id,
                sequence_number=q_data.get("sequence", 0),
                dimension=dim,
                format=fmt,
                content={
                    "stem": q_data.get("stem", ""),
                    "options": q_data.get("options"),
                    "correct_answer": q_data.get("correct_answer", ""),
                    "distractor_rationale": q_data.get("distractor_rationale", {}),
                    # Format-specific fields
                    "table_headers": q_data.get("table_headers"),
                    "table_rows": q_data.get("table_rows"),
                    "items": q_data.get("items"),
                    "correct_order": q_data.get("correct_order"),
                    "statements": q_data.get("statements"),
                    "word": q_data.get("word"),
                    "context_sentence": q_data.get("context_sentence"),
                },
                rubric=q_data.get("rubric", {"max_score": 1, "criteria": [], "partial_credit": "", "sample_answer": "", "answer_lines": 0}),
                score_points=q_data.get("score_points", 1),
                is_cross_text=q_data.get("is_cross_text", False),
            )
            db.add(q)
            saved.append((q, q_data, text_type_str))
        return saved

    narr_saved = _save_questions(result.get("narrative_questions", []), narr_text, "narrative")
    info_saved = _save_questions(result.get("informational_questions", []), info_text, "informational")

    cross_q_data = result.get("cross_text_question")
    if cross_q_data:
        # שאלת מיזוג — משויכת לטקסט המידעי כדי שיופיע בסוף הקטע השני (רצף כרונולוגי)
        cross_q = Question(
            exam_id=exam_id,
            text_id=info_text.id,
            sequence_number=cross_q_data.get("sequence", 99),
            dimension=cross_q_data.get("dimension", "C"),
            format=cross_q_data.get("format", "OPEN"),
            content={
                "stem": cross_q_data.get("stem", ""),
                "options": None,
                "correct_answer": "",
                "distractor_rationale": {},
            },
            rubric=cross_q_data.get("rubric", {}),
            score_points=cross_q_data.get("score_points", 3),
            is_cross_text=True,
        )
        db.add(cross_q)

    await db.flush()

    # Build spec entries
    for q, q_data, text_type_str in (narr_saved + info_saved):
        spec = SpecTableEntry(
            exam_id=exam_id,
            question_id=q.id,
            dimension=q.dimension,
            format=q.format,
            score=q.score_points,
            text_reference=q_data.get("text_reference", ""),
            anchor_sentence=q_data.get("anchor_type", ""),
            text_type=text_type_str,
        )
        db.add(spec)

    exam.status = ExamStatus.QUESTIONS_READY
    await db.commit()

    # Return full exam
    return await get_exam(exam_id, db)


@router.put("/{exam_id}/questions/{question_id}")
async def update_question(
    exam_id: str,
    question_id: str,
    req: UpdateQuestionRequest,
    db: AsyncSession = Depends(get_db),
):
    """Teacher manual edit of a question."""
    result = await db.execute(
        select(Question).where(Question.id == question_id, Question.exam_id == exam_id)
    )
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    content = dict(q.content or {})
    if req.stem is not None:
        content["stem"] = req.stem
    if req.options is not None:
        content["options"] = req.options
    if req.correct_answer is not None:
        content["correct_answer"] = req.correct_answer
    q.content = content

    if req.rubric is not None:
        q.rubric = req.rubric
    if req.dimension is not None:
        q.dimension = req.dimension
    if req.format is not None:
        q.format = req.format
    if req.score_points is not None:
        q.score_points = req.score_points

    await db.commit()
    await db.refresh(q)
    return _question_to_dict(q)


class FixDistractorsRequest(BaseModel):
    stem: str
    correct_answer: str


@router.post("/{exam_id}/questions/{question_id}/fix-distractors")
async def fix_distractors(
    exam_id: str,
    question_id: str,
    req: FixDistractorsRequest,
    db: AsyncSession = Depends(get_db),
):
    """תיקון אוטומטי של מסיחים לשאלת רב-ברירה בעקבות עריכת המורה."""
    result = await db.execute(
        select(Question).where(Question.id == question_id, Question.exam_id == exam_id)
    )
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    exam = await _get_exam_or_404(exam_id, db)
    new_options = await task_agent.fix_distractors(
        stem=data.stem,
        correct_answer=data.correct_answer,
        grade_cluster=exam.grade_cluster,
    )
    return {"options": new_options}


@router.delete("/{exam_id}/questions/{question_id}")
async def delete_question(
    exam_id: str,
    question_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Question).where(Question.id == question_id, Question.exam_id == exam_id)
    )
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    await db.delete(q)
    await db.commit()
    return {"deleted": question_id}


@router.post("/{exam_id}/validate")
async def validate_exam(exam_id: str, db: AsyncSession = Depends(get_db)):
    """Stage 4: Run Agent 3 automated validation."""
    exam = await _get_exam_or_404(exam_id, db)

    texts_result = await db.execute(select(ExamText).where(ExamText.exam_id == exam_id))
    texts = [{"text_type": t.text_type, "title": t.title, "content": t.content} for t in texts_result.scalars().all()]

    questions_result = await db.execute(
        select(Question).where(Question.exam_id == exam_id).order_by(Question.sequence_number)
    )
    questions = [
        {
            "sequence_number": q.sequence_number,
            "dimension": q.dimension,
            "format": q.format,
            "content": q.content,
        }
        for q in questions_result.scalars().all()
    ]

    report = await qa_agent.validate_exam(texts, questions)
    return report.to_dict()


@router.post("/{exam_id}/language-edit")
async def language_edit(exam_id: str, db: AsyncSession = Depends(get_db)):
    """Run linguistic proofreading on all exam texts and save corrected versions."""
    exam = await _get_exam_or_404(exam_id, db)

    texts_result = await db.execute(select(ExamText).where(ExamText.exam_id == exam_id))
    texts = texts_result.scalars().all()

    import asyncio
    edit_results = await asyncio.gather(*[
        qa_agent.language_edit_text(t.title, t.content, t.text_type)
        for t in texts
    ])

    report = []
    for text_obj, result in zip(texts, edit_results):
        corrected = result.get("corrected_content", "")
        if corrected and corrected != text_obj.content:
            text_obj.content = corrected
        report.append({
            "text_id": str(text_obj.id),
            "title": text_obj.title,
            "text_type": text_obj.text_type,
            "changes": result.get("changes", []),
            "change_count": result.get("change_count", 0),
            "summary": result.get("summary", ""),
            "corrected_content": text_obj.content,  # send to frontend for approve/reject tracking
        })

    await db.commit()
    return {"edits": report}


@router.post("/{exam_id}/chat")
async def chat(
    exam_id: str,
    req: ChatMessageRequest,
    db: AsyncSession = Depends(get_db),
):
    """Stage 4: Interactive chat with QA agent (streaming)."""
    exam = await _get_exam_or_404(exam_id, db)

    # Load conversation history
    history_result = await db.execute(
        select(ChatMessage).where(ChatMessage.exam_id == exam_id).order_by(ChatMessage.timestamp)
    )
    history = [{"role": h.role, "content": h.content} for h in history_result.scalars().all()]

    # Load exam context for the agent
    questions_result = await db.execute(
        select(Question).where(Question.exam_id == exam_id).order_by(Question.sequence_number)
    )
    questions = [
        {"id": q.id, "sequence_number": q.sequence_number, "dimension": q.dimension,
         "format": q.format, "content": q.content}
        for q in questions_result.scalars().all()
    ]
    exam_context = {"exam_id": exam_id, "questions": questions}

    # Save teacher message
    teacher_msg = ChatMessage(exam_id=exam_id, role=ChatRole.TEACHER, content=req.message)
    db.add(teacher_msg)
    await db.commit()

    # Get agent response
    agent_response = await qa_agent.chat_refinement(req.message, history, exam_context)

    # Apply action if any
    action = agent_response.get("action")
    if action:
        await _apply_chat_action(action, exam_id, db)

    # Save agent message
    agent_msg = ChatMessage(
        exam_id=exam_id,
        role=ChatRole.AGENT,
        content=agent_response.get("explanation", ""),
        action_taken=action,
    )
    db.add(agent_msg)
    await db.commit()

    return {
        "explanation": agent_response.get("explanation", ""),
        "action": action,
    }


class QuestionFixRequest(BaseModel):
    message: str


@router.post("/{exam_id}/questions/{question_id}/fix")
async def fix_question(
    exam_id: str,
    question_id: str,
    req: QuestionFixRequest,
    db: AsyncSession = Depends(get_db),
):
    """Fix a specific question using AI based on teacher's message."""
    exam = await _get_exam_or_404(exam_id, db)

    q_result = await db.execute(
        select(Question).where(Question.id == question_id, Question.exam_id == exam_id)
    )
    q = q_result.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="שאלה לא נמצאה")

    # Get exam text for context
    texts_result = await db.execute(
        select(ExamText).where(ExamText.exam_id == exam_id)
    )
    texts = texts_result.scalars().all()
    combined_text = "\n\n".join(t.content or "" for t in texts if t.content)[:2000]

    grade_cluster = "5-6"
    if exam.grade in ("3", "4"):
        grade_cluster = "3-4"
    elif exam.grade in ("7", "8", "9"):
        grade_cluster = "7-9"

    question_data = {
        "id": q.id,
        "stem": (q.content or {}).get("stem", ""),
        "format": q.format,
        "dimension": q.dimension,
        "score_points": q.score_points,
        "options": (q.content or {}).get("options"),
        "correct_answer": (q.content or {}).get("correct_answer"),
        "rubric": q.rubric,
    }

    result = await qa_agent.fix_question_with_chat(
        question_data=question_data,
        teacher_message=req.message,
        text_content=combined_text,
        grade_cluster=grade_cluster,
    )

    updated = result.get("updated_question")
    if updated:
        content = dict(q.content or {})
        if updated.get("stem"):
            content["stem"] = updated["stem"]
        if updated.get("options") is not None:
            content["options"] = updated["options"]
        if updated.get("correct_answer") is not None:
            content["correct_answer"] = updated["correct_answer"]
        if updated.get("format"):
            q.format = updated["format"]
        q.content = content
        if updated.get("rubric"):
            q.rubric = updated["rubric"]
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(q, "content")
        flag_modified(q, "rubric")
        await db.commit()
        await db.refresh(q)

    return {
        "explanation": result.get("explanation", ""),
        "question": {
            "id": q.id,
            "sequence_number": q.sequence_number,
            "dimension": q.dimension,
            "format": q.format,
            "score_points": q.score_points,
            "is_cross_text": q.is_cross_text,
            "content": q.content,
            "rubric": q.rubric,
        },
    }


async def _apply_chat_action(action: dict, exam_id: str, db: AsyncSession):
    """Apply a QA agent action to the database."""
    action_type = action.get("type")

    if action_type == "edit_question":
        q_id = action.get("question_id")
        updated = action.get("updated_fields", {})
        result = await db.execute(
            select(Question).where(Question.id == q_id, Question.exam_id == exam_id)
        )
        q = result.scalar_one_or_none()
        if q:
            content = dict(q.content or {})
            if "stem" in updated:
                content["stem"] = updated["stem"]
            if "options" in updated:
                content["options"] = updated["options"]
            if "correct_answer" in updated:
                content["correct_answer"] = updated["correct_answer"]
            q.content = content
            if "rubric" in updated:
                q.rubric = updated["rubric"]
            if "dimension" in updated:
                q.dimension = updated["dimension"]
            if "score_points" in updated:
                q.score_points = updated["score_points"]
            await db.flush()

    elif action_type == "delete_question":
        q_id = action.get("question_id")
        result = await db.execute(
            select(Question).where(Question.id == q_id, Question.exam_id == exam_id)
        )
        q = result.scalar_one_or_none()
        if q:
            await db.delete(q)
            await db.flush()


@router.get("/{exam_id}/chat-history")
async def get_chat_history(exam_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatMessage).where(ChatMessage.exam_id == exam_id).order_by(ChatMessage.timestamp)
    )
    messages = result.scalars().all()
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "timestamp": m.timestamp.isoformat() if m.timestamp else None,
            "action_taken": m.action_taken,
        }
        for m in messages
    ]


@router.post("/{exam_id}/publish")
async def publish_exam(exam_id: str, db: AsyncSession = Depends(get_db)):
    """Generate access code and set exam as PUBLISHED."""
    exam = await _get_exam_or_404(exam_id, db)

    # Generate unique access code
    for _ in range(10):
        code = _gen_access_code()
        existing = await db.execute(select(Exam).where(Exam.access_code == code))
        if not existing.scalar_one_or_none():
            break

    exam.access_code = code
    exam.status = ExamStatus.PUBLISHED
    await db.commit()
    return {"access_code": code, "status": "PUBLISHED"}


@router.get("/{exam_id}/export/{booklet}")
async def export_pdf(
    exam_id: str,
    booklet: str,  # texts | questions | rubric | spec
    db: AsyncSession = Depends(get_db),
):
    """Generate and return a PDF booklet."""
    exam = await _get_exam_or_404(exam_id, db)

    texts_result = await db.execute(select(ExamText).where(ExamText.exam_id == exam_id))
    texts = texts_result.scalars().all()

    questions_result = await db.execute(
        select(Question).where(Question.exam_id == exam_id).order_by(Question.sequence_number)
    )
    questions = questions_result.scalars().all()

    spec_result = await db.execute(select(SpecTableEntry).where(SpecTableEntry.exam_id == exam_id))
    spec_entries = spec_result.scalars().all()

    if booklet == "texts":
        html = pdf_export.build_texts_pdf(exam, texts)
    elif booklet == "questions":
        html = pdf_export.build_questions_pdf(exam, texts, questions)
    elif booklet == "rubric":
        html = pdf_export.build_rubric_pdf(exam, texts, questions)
    elif booklet == "spec":
        html = pdf_export.build_spec_pdf(exam, [
            {
                "text_type": s.text_type,
                "dimension": s.dimension,
                "format": s.format,
                "score": s.score,
                "text_reference": s.text_reference,
            }
            for s in spec_entries
        ], questions=questions)
    elif booklet == "params_report":
        html = pdf_export.build_params_report_pdf(exam, questions, spec_entries)
    elif booklet == "teacher_version":
        html = pdf_export.build_teacher_version_pdf(exam, texts, questions)
    else:
        raise HTTPException(status_code=400, detail="Invalid booklet type")

    result = pdf_export.html_to_pdf(html)
    if result[:4] == b'%PDF':
        safe_title = exam.title.replace(" ", "_")[:40]
        encoded = quote(f"{safe_title}_{booklet}.pdf")
        return Response(
            content=result,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=\"exam_{booklet}.pdf\"; filename*=UTF-8''{encoded}"},
        )
    else:
        # Chrome not available or failed — return HTML for browser print-to-PDF
        return Response(
            content=result,
            media_type="text/html; charset=utf-8",
        )
