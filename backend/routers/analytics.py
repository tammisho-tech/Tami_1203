"""
Analytics router — class-level and individual student analytics.
"""

import statistics
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import (
    Exam, Question, StudentExamSession, StudentAnswer, GradingJob,
    SessionStatus, GradingJobStatus, get_db
)


router = APIRouter(prefix="/api/analytics", tags=["analytics"])


class ApproveGradeRequest(BaseModel):
    override_score: Optional[float] = None


# ─── Class-level analytics ────────────────────────────────────────────────────

@router.get("/{exam_id}/class")
async def class_analytics(exam_id: str, db: AsyncSession = Depends(get_db)):
    """Class-level statistics: avg, std dev, dimension map, level distribution."""
    # Load all graded sessions
    sessions_result = await db.execute(
        select(StudentExamSession).where(
            StudentExamSession.exam_id == exam_id,
            StudentExamSession.status == SessionStatus.GRADED,
        )
    )
    sessions = sessions_result.scalars().all()

    if not sessions:
        return {"message": "אין נתונים — אף תלמיד לא הגיש עדיין", "total_students": 0}

    # Load all questions to get max scores
    questions_result = await db.execute(select(Question).where(Question.exam_id == exam_id))
    questions = {q.id: q for q in questions_result.scalars().all()}

    # Load all answers for all sessions of this exam
    session_ids = [s.id for s in sessions]
    answers_result = await db.execute(
        select(StudentAnswer).where(StudentAnswer.session_id.in_(session_ids))
    )
    all_answers = answers_result.scalars().all()

    # Compute per-student totals
    student_scores = {}  # session_id → {total_earned, total_max, dim_earned, dim_max}
    for session in sessions:
        student_scores[session.id] = {
            "student_name": session.student_name,
            "total_earned": 0,
            "total_max": 0,
            "dim_earned": {"A": 0, "B": 0, "C": 0, "D": 0},
            "dim_max": {"A": 0, "B": 0, "C": 0, "D": 0},
        }

    for answer in all_answers:
        sid = answer.session_id
        if sid not in student_scores:
            continue
        q = questions.get(answer.question_id)
        if not q:
            continue
        earned = answer.score_awarded or 0
        maximum = answer.score_max or q.score_points or 0
        dim = str(q.dimension)
        student_scores[sid]["total_earned"] += earned
        student_scores[sid]["total_max"] += maximum
        if dim in student_scores[sid]["dim_earned"]:
            student_scores[sid]["dim_earned"][dim] += earned
            student_scores[sid]["dim_max"][dim] += maximum

    # Compute percentages
    percentages = []
    levels = {1: 0, 2: 0, 3: 0, 4: 0}
    dim_pcts_agg = {"A": [], "B": [], "C": [], "D": []}

    for sid, data in student_scores.items():
        total_max = data["total_max"]
        pct = (data["total_earned"] / total_max * 100) if total_max > 0 else 0
        percentages.append(pct)

        # Level
        if pct >= 90:
            levels[4] += 1
        elif pct >= 75:
            levels[3] += 1
        elif pct >= 55:
            levels[2] += 1
        else:
            levels[1] += 1

        # Dimension percentages
        for dim in ["A", "B", "C", "D"]:
            dmax = data["dim_max"][dim]
            if dmax > 0:
                dim_pcts_agg[dim].append(data["dim_earned"][dim] / dmax * 100)

    avg = statistics.mean(percentages) if percentages else 0
    std_dev = statistics.stdev(percentages) if len(percentages) > 1 else 0
    median = statistics.median(percentages) if percentages else 0

    dim_averages = {
        dim: round(statistics.mean(vals), 1) if vals else 0
        for dim, vals in dim_pcts_agg.items()
    }

    return {
        "total_students": len(sessions),
        "average": round(avg, 1),
        "std_deviation": round(std_dev, 1),
        "median": round(median, 1),
        "level_distribution": levels,
        "dimension_averages": dim_averages,
    }


# ─── Item analysis ────────────────────────────────────────────────────────────

@router.get("/{exam_id}/items")
async def item_analysis(exam_id: str, db: AsyncSession = Depends(get_db)):
    """Item analysis: correct rates, red questions, distractor analysis."""
    questions_result = await db.execute(
        select(Question).where(Question.exam_id == exam_id).order_by(Question.sequence_number)
    )
    questions = questions_result.scalars().all()

    sessions_result = await db.execute(
        select(StudentExamSession).where(
            StudentExamSession.exam_id == exam_id,
            StudentExamSession.status == SessionStatus.GRADED,
        )
    )
    sessions = sessions_result.scalars().all()
    total_students = len(sessions)

    if total_students == 0:
        return {"message": "אין נתונים", "items": []}

    session_ids = [s.id for s in sessions]
    answers_result = await db.execute(
        select(StudentAnswer).where(StudentAnswer.session_id.in_(session_ids))
    )
    all_answers = answers_result.scalars().all()

    # Group answers by question
    answers_by_q = {}
    for a in all_answers:
        answers_by_q.setdefault(a.question_id, []).append(a)

    items = []
    for q in questions:
        q_answers = answers_by_q.get(q.id, [])
        max_score = q.score_points or 1

        correct_count = sum(1 for a in q_answers if (a.score_awarded or 0) >= max_score)
        correct_rate = correct_count / total_students if total_students > 0 else 0

        # Distractor analysis for MC
        distractor_counts = {}
        if q.format == "MC" and q.content and q.content.get("options"):
            for opt in q.content["options"]:
                distractor_counts[opt] = sum(
                    1 for a in q_answers
                    if a.raw_answer and a.raw_answer.strip() == opt.strip()
                )

        items.append({
            "question_id": q.id,
            "sequence_number": q.sequence_number,
            "dimension": q.dimension,
            "format": q.format,
            "stem_preview": (q.content.get("stem", "") if q.content else "")[:80],
            "correct_rate": round(correct_rate * 100, 1),
            "is_red": correct_rate < 0.5,
            "total_answered": len(q_answers),
            "distractor_analysis": {
                opt: {"count": cnt, "pct": round(cnt / total_students * 100, 1)}
                for opt, cnt in distractor_counts.items()
            },
        })

    return {
        "total_students": total_students,
        "items": items,
        "red_questions": [item for item in items if item["is_red"]],
    }


# ─── Student profiles ─────────────────────────────────────────────────────────

@router.get("/{exam_id}/students")
async def all_student_profiles(exam_id: str, db: AsyncSession = Depends(get_db)):
    """All student profiles for the exam."""
    sessions_result = await db.execute(
        select(StudentExamSession).where(
            StudentExamSession.exam_id == exam_id,
            StudentExamSession.status == SessionStatus.GRADED,
        ).order_by(StudentExamSession.submitted_at)
    )
    sessions = sessions_result.scalars().all()

    profiles = []
    for session in sessions:
        job_result = await db.execute(
            select(GradingJob).where(GradingJob.session_id == session.id)
        )
        job = job_result.scalar_one_or_none()

        answers_result = await db.execute(
            select(StudentAnswer).where(StudentAnswer.session_id == session.id)
        )
        answers = answers_result.scalars().all()
        total_earned = sum(a.score_awarded or 0 for a in answers)
        total_max = sum(a.score_max or 0 for a in answers)
        pct = round(total_earned / total_max * 100, 1) if total_max > 0 else 0

        profiles.append({
            "session_id": session.id,
            "student_name": session.student_name,
            "student_id": session.student_id,
            "class_name": session.class_name,
            "total_score": total_earned,
            "max_score": total_max,
            "percentage": pct,
            "level": job.student_profile.get("level") if job and job.student_profile else None,
            "label": job.student_profile.get("label") if job and job.student_profile else None,
            "recommendation": job.student_profile.get("recommendation") if job and job.student_profile else None,
            "submitted_at": session.submitted_at.isoformat() if session.submitted_at else None,
        })

    return {"students": profiles, "total": len(profiles)}


@router.get("/{exam_id}/students/{session_id}")
async def student_profile(exam_id: str, session_id: str, db: AsyncSession = Depends(get_db)):
    """Detailed profile for one student."""
    session_result = await db.execute(
        select(StudentExamSession).where(StudentExamSession.id == session_id)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    job_result = await db.execute(
        select(GradingJob).where(GradingJob.session_id == session_id)
    )
    job = job_result.scalar_one_or_none()

    answers_result = await db.execute(
        select(StudentAnswer).where(StudentAnswer.session_id == session_id)
    )
    answers = answers_result.scalars().all()

    questions_result = await db.execute(
        select(Question).where(Question.exam_id == exam_id)
    )
    questions = {q.id: q for q in questions_result.scalars().all()}

    total_earned = 0
    total_max = 0
    dim_data = {"A": [0, 0], "B": [0, 0], "C": [0, 0], "D": [0, 0]}

    detailed_answers = []
    for a in answers:
        q = questions.get(a.question_id)
        if not q:
            continue
        earned = a.score_awarded or 0
        maximum = a.score_max or 0
        total_earned += earned
        total_max += maximum
        dim = str(q.dimension)
        if dim in dim_data:
            dim_data[dim][0] += earned
            dim_data[dim][1] += maximum

        detailed_answers.append({
            "sequence_number": q.sequence_number,
            "dimension": q.dimension,
            "format": q.format,
            "stem": (q.content.get("stem", "") if q.content else "")[:100],
            "student_answer": a.raw_answer,
            "correct_answer": (q.content.get("correct_answer", "") if q.content else ""),
            "score_awarded": earned,
            "score_max": maximum,
            "grading_notes": a.grading_notes,
            "teacher_approved": a.teacher_approved,
        })

    dim_percentages = {
        dim: round(v[0] / v[1] * 100, 1) if v[1] > 0 else 0
        for dim, v in dim_data.items()
    }

    return {
        "session_id": session_id,
        "student_name": session.student_name,
        "student_id": session.student_id,
        "class_name": session.class_name,
        "total_score": total_earned,
        "max_score": total_max,
        "percentage": round(total_earned / total_max * 100, 1) if total_max > 0 else 0,
        "dim_percentages": dim_percentages,
        "profile": job.student_profile if job else None,
        "answers": sorted(detailed_answers, key=lambda x: x["sequence_number"]),
    }


# ─── Grading queue (teacher approval) ─────────────────────────────────────────

@router.get("/{exam_id}/grading-queue")
async def grading_queue(exam_id: str, db: AsyncSession = Depends(get_db)):
    """Return all open answers pending teacher approval."""
    sessions_result = await db.execute(
        select(StudentExamSession).where(StudentExamSession.exam_id == exam_id)
    )
    sessions = sessions_result.scalars().all()
    session_ids = [s.id for s in sessions]

    if not session_ids:
        return {"pending": []}

    answers_result = await db.execute(
        select(StudentAnswer).where(
            StudentAnswer.session_id.in_(session_ids),
            StudentAnswer.teacher_approved == False,
            StudentAnswer.score_awarded != None,
        )
    )
    pending_answers = answers_result.scalars().all()

    questions_result = await db.execute(select(Question).where(Question.exam_id == exam_id))
    questions = {q.id: q for q in questions_result.scalars().all()}

    sessions_map = {s.id: s for s in sessions}

    return {
        "pending": [
            {
                "answer_id": a.id,
                "session_id": a.session_id,
                "student_name": sessions_map.get(a.session_id, {}).student_name if a.session_id in sessions_map else "",
                "question_sequence": questions.get(a.question_id, {}).sequence_number if a.question_id in questions else None,
                "stem": (questions[a.question_id].content.get("stem", "") if a.question_id in questions and questions[a.question_id].content else "")[:100],
                "student_answer": a.raw_answer,
                "score_awarded": a.score_awarded,
                "score_max": a.score_max,
                "grading_notes": a.grading_notes,
            }
            for a in pending_answers
        ]
    }


@router.post("/{exam_id}/approve-grade/{answer_id}")
async def approve_grade(
    exam_id: str,
    answer_id: str,
    req: ApproveGradeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Teacher approves or overrides an AI grade."""
    answer_result = await db.execute(
        select(StudentAnswer).where(StudentAnswer.id == answer_id)
    )
    answer = answer_result.scalar_one_or_none()
    if not answer:
        raise HTTPException(status_code=404, detail="Answer not found")

    if req.override_score is not None:
        answer.teacher_override_score = req.override_score
        answer.score_awarded = req.override_score
    answer.teacher_approved = True

    await db.commit()
    return {"approved": True, "score_awarded": answer.score_awarded}
