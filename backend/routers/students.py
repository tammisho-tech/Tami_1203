"""
Students router — exam-taking and grading workflow.
"""

import asyncio
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import (
    Exam, ExamText, Question, StudentExamSession, StudentAnswer, GradingJob, SessionFeedback,
    ExamStatus, SessionStatus, GradingJobStatus, TextType, QuestionFormat, get_db
)
from agents import grading_agent


router = APIRouter(prefix="/api/students", tags=["students"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class StartSessionRequest(BaseModel):
    access_code: str
    student_name: str
    student_id: str
    class_name: str = ""


class SaveAnswerRequest(BaseModel):
    raw_answer: str


class ApproveGradeRequest(BaseModel):
    override_score: Optional[float] = None


class FeedbackRequest(BaseModel):
    satisfaction_rating: Optional[int] = None  # 1-5
    feedback_text: Optional[str] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _session_to_dict(s: StudentExamSession) -> dict:
    return {
        "id": s.id,
        "exam_id": s.exam_id,
        "student_name": s.student_name,
        "student_id": s.student_id,
        "class_name": s.class_name,
        "status": s.status,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/exam-by-code/{access_code}")
async def get_exam_by_code(access_code: str, db: AsyncSession = Depends(get_db)):
    """Student enters exam code — returns exam info."""
    result = await db.execute(
        select(Exam).where(Exam.access_code == access_code.upper(), Exam.status == ExamStatus.PUBLISHED)
    )
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="קוד המבחן לא נמצא או שהמבחן אינו פעיל")

    texts_result = await db.execute(select(ExamText).where(ExamText.exam_id == exam.id))
    texts = texts_result.scalars().all()

    questions_result = await db.execute(
        select(Question).where(Question.exam_id == exam.id).order_by(Question.sequence_number)
    )
    questions = questions_result.scalars().all()

    return {
        "exam_id": exam.id,
        "title": exam.title,
        "grade_cluster": exam.grade_cluster,
        "texts": [
            {
                "id": t.id,
                "text_type": t.text_type,
                "title": t.title,
                "content": t.content,
            }
            for t in texts
        ],
        "questions": [
            {
                "id": q.id,
                "sequence_number": q.sequence_number,
                "dimension": q.dimension,
                "format": q.format,
                "text_id": q.text_id,
                "is_cross_text": q.is_cross_text,
                "content": dict(q.content) if q.content else {},
                "score_points": q.score_points,
            }
            for q in questions
        ],
    }


@router.post("/sessions/")
async def start_session(req: StartSessionRequest, db: AsyncSession = Depends(get_db)):
    """Start an exam session for a student."""
    exam_result = await db.execute(
        select(Exam).where(Exam.access_code == req.access_code.upper())
    )
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="קוד המבחן לא נמצא")

    session = StudentExamSession(
        exam_id=exam.id,
        student_name=req.student_name,
        student_id=req.student_id,
        class_name=req.class_name,
        status=SessionStatus.IN_PROGRESS,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return _session_to_dict(session)


@router.get("/sessions/{session_id}/exam")
async def get_session_exam(session_id: str, db: AsyncSession = Depends(get_db)):
    """Return exam texts and questions for an active session."""
    session_result = await db.execute(
        select(StudentExamSession).where(StudentExamSession.id == session_id)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    exam_result = await db.execute(select(Exam).where(Exam.id == session.exam_id))
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    texts_result = await db.execute(select(ExamText).where(ExamText.exam_id == exam.id))
    texts = texts_result.scalars().all()

    questions_result = await db.execute(
        select(Question).where(Question.exam_id == exam.id).order_by(Question.sequence_number)
    )
    questions = questions_result.scalars().all()

    return {
        "exam_id": exam.id,
        "title": exam.title,
        "grade_cluster": exam.grade_cluster,
        "texts": [
            {"id": t.id, "text_type": t.text_type, "title": t.title, "content": t.content}
            for t in texts
        ],
        "questions": [
            {
                "id": q.id,
                "sequence_number": q.sequence_number,
                "dimension": q.dimension,
                "format": q.format,
                "text_id": q.text_id,
                "is_cross_text": q.is_cross_text,
                "content": dict(q.content) if q.content else {},
                "score_points": q.score_points,
            }
            for q in questions
        ],
    }


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(StudentExamSession).where(StudentExamSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    answers_result = await db.execute(
        select(StudentAnswer).where(StudentAnswer.session_id == session_id)
    )
    answers = answers_result.scalars().all()

    return {
        **_session_to_dict(session),
        "answers": [
            {
                "id": a.id,
                "question_id": a.question_id,
                "raw_answer": a.raw_answer,
                "score_awarded": a.score_awarded,
                "score_max": a.score_max,
            }
            for a in answers
        ],
    }


@router.put("/sessions/{session_id}/answers/{question_id}")
async def save_answer(
    session_id: str,
    question_id: str,
    req: SaveAnswerRequest,
    db: AsyncSession = Depends(get_db),
):
    """Auto-save a student answer (upsert)."""
    # Check session exists
    session_result = await db.execute(
        select(StudentExamSession).where(StudentExamSession.id == session_id)
    )
    session = session_result.scalar_one_or_none()
    if not session or session.status != SessionStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Session not active")

    # Upsert answer
    existing_result = await db.execute(
        select(StudentAnswer).where(
            StudentAnswer.session_id == session_id,
            StudentAnswer.question_id == question_id,
        )
    )
    answer = existing_result.scalar_one_or_none()

    if answer:
        answer.raw_answer = req.raw_answer
    else:
        answer = StudentAnswer(
            session_id=session_id,
            question_id=question_id,
            raw_answer=req.raw_answer,
        )
        db.add(answer)

    await db.commit()
    return {"saved": True}


@router.post("/sessions/{session_id}/submit")
async def submit_session(session_id: str, db: AsyncSession = Depends(get_db)):
    """Submit exam — triggers auto-grading."""
    session_result = await db.execute(
        select(StudentExamSession).where(StudentExamSession.id == session_id)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != SessionStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Session already submitted")

    session.status = SessionStatus.SUBMITTED
    session.submitted_at = datetime.utcnow()

    # Create grading job
    job = GradingJob(session_id=session_id, status=GradingJobStatus.PENDING)
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Run grading asynchronously (fire and forget with asyncio task)
    asyncio.create_task(_run_grading(session_id, job.id))

    return {"submitted": True, "grading_job_id": job.id}


async def _run_grading(session_id: str, job_id: str):
    """Background task: grade all answers for a session."""
    from models.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            # Update job status
            job_result = await db.execute(select(GradingJob).where(GradingJob.id == job_id))
            job = job_result.scalar_one_or_none()
            if job:
                job.status = GradingJobStatus.RUNNING
                await db.commit()

            # Load session, exam, questions, answers
            session_result = await db.execute(
                select(StudentExamSession).where(StudentExamSession.id == session_id)
            )
            session = session_result.scalar_one_or_none()
            if not session:
                return

            exam_result = await db.execute(select(Exam).where(Exam.id == session.exam_id))
            exam = exam_result.scalar_one_or_none()

            questions_result = await db.execute(
                select(Question).where(Question.exam_id == session.exam_id)
            )
            questions = {q.id: q for q in questions_result.scalars().all()}

            answers_result = await db.execute(
                select(StudentAnswer).where(StudentAnswer.session_id == session_id)
            )
            answers = answers_result.scalars().all()

            texts_result = await db.execute(
                select(ExamText).where(ExamText.exam_id == session.exam_id)
            )
            texts = texts_result.scalars().all()
            text_excerpt = "\n\n".join([t.content[:600] for t in texts])

            # Grade closed questions
            open_qa = []
            for answer in answers:
                q = questions.get(answer.question_id)
                if not q:
                    continue

                answer.score_max = q.score_points

                if q.format in (QuestionFormat.MC, QuestionFormat.FILL):
                    correct = (q.content or {}).get("correct_answer", "")
                    result = grading_agent.grade_closed_answer(
                        answer.raw_answer, correct, q.score_points
                    )
                    answer.score_awarded = result["score"]
                    answer.grading_notes = result["rationale"]
                    answer.teacher_approved = True  # Auto-approved for closed
                else:
                    open_qa.append({"question": {
                        "sequence_number": q.sequence_number,
                        "dimension": q.dimension,
                        "content": q.content,
                        "rubric": q.rubric,
                    }, "student_answer": answer.raw_answer})

            await db.flush()

            # Grade open questions
            if open_qa and exam:
                grading_results = await grading_agent.grade_open_questions(
                    text_excerpt=text_excerpt,
                    grade_cluster=exam.grade_cluster,
                    questions_and_answers=open_qa,
                )

                for gr in grading_results:
                    seq = gr.get("question_sequence")
                    # Find matching answer by sequence number
                    for answer in answers:
                        q = questions.get(answer.question_id)
                        if q and q.sequence_number == seq:
                            answer.score_awarded = gr.get("score", 0)
                            answer.grading_notes = gr.get("rationale", "")
                            answer.teacher_approved = False
                            break

            await db.flush()

            # Compute student profile
            dim_scores: dict = {"A": [0, 0], "B": [0, 0], "C": [0, 0], "D": [0, 0]}
            total_earned = 0
            total_max = 0

            for answer in answers:
                q = questions.get(answer.question_id)
                if not q:
                    continue
                dim = str(q.dimension)
                earned = answer.score_awarded or 0
                maximum = answer.score_max or 0
                if dim in dim_scores:
                    dim_scores[dim][0] += earned
                    dim_scores[dim][1] += maximum
                total_earned += earned
                total_max += maximum

            scores_by_dimension = {
                k: (v[0], v[1]) for k, v in dim_scores.items()
            }

            profile = await grading_agent.generate_student_profile(
                student_name=session.student_name,
                grade_cluster=exam.grade_cluster if exam else "5-6",
                scores_by_dimension=scores_by_dimension,
                total_score=total_earned,
                max_score=total_max,
            )

            # Update grading job
            session.status = SessionStatus.GRADED
            job.status = GradingJobStatus.DONE
            job.completed_at = datetime.utcnow()
            job.student_profile = profile

            await db.commit()

        except Exception as e:
            async with AsyncSessionLocal() as db2:
                job_result = await db2.execute(select(GradingJob).where(GradingJob.id == job_id))
                job = job_result.scalar_one_or_none()
                if job:
                    job.status = GradingJobStatus.FAILED
                    job.error_message = str(e)
                    await db2.commit()


@router.put("/sessions/{session_id}/feedback")
async def save_feedback(
    session_id: str,
    req: FeedbackRequest,
    db: AsyncSession = Depends(get_db),
):
    """Save student satisfaction and feedback after exam completion."""
    session_result = await db.execute(
        select(StudentExamSession).where(StudentExamSession.id == session_id)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    existing = await db.execute(
        select(SessionFeedback).where(SessionFeedback.session_id == session_id)
    )
    fb = existing.scalar_one_or_none()
    if fb:
        if req.satisfaction_rating is not None:
            fb.satisfaction_rating = req.satisfaction_rating
        if req.feedback_text is not None:
            fb.feedback_text = req.feedback_text
    else:
        fb = SessionFeedback(
            session_id=session_id,
            satisfaction_rating=req.satisfaction_rating,
            feedback_text=req.feedback_text,
        )
        db.add(fb)
    await db.commit()
    return {"saved": True}


@router.get("/sessions/{session_id}/results")
async def get_results(session_id: str, db: AsyncSession = Depends(get_db)):
    """Return graded results for a student session."""
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

    total_earned = sum(a.score_awarded or 0 for a in answers)
    total_max = sum(a.score_max or 0 for a in answers)

    return {
        "session": _session_to_dict(session),
        "grading_status": job.status if job else "PENDING",
        "profile": job.student_profile if job else None,
        "total_score": total_earned,
        "max_score": total_max,
        "percentage": round(total_earned / total_max * 100, 1) if total_max > 0 else 0,
        "answers": [
            {
                "question_id": a.question_id,
                "raw_answer": a.raw_answer,
                "score_awarded": a.score_awarded,
                "score_max": a.score_max,
                "grading_notes": a.grading_notes,
                "teacher_approved": a.teacher_approved,
            }
            for a in answers
        ],
    }
