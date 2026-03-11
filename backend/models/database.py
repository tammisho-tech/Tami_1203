import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, Text, JSON,
    ForeignKey, Enum as SAEnum, create_engine
)
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
import enum

from config import settings, get_database_url


class Base(DeclarativeBase):
    pass


def gen_uuid():
    return str(uuid.uuid4())


# ─── Enums ───────────────────────────────────────────────────────────────────

class GradeCluster(str, enum.Enum):
    GRADES_3_4 = "3-4"
    GRADES_5_6 = "5-6"
    GRADES_7_9 = "7-9"


class ExamStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    THEME_PENDING = "THEME_PENDING"
    TEXTS_READY = "TEXTS_READY"
    QUESTIONS_READY = "QUESTIONS_READY"
    QA_DONE = "QA_DONE"
    PUBLISHED = "PUBLISHED"
    CLOSED = "CLOSED"


class TextType(str, enum.Enum):
    NARRATIVE = "narrative"
    INFORMATIONAL = "informational"


class Dimension(str, enum.Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"


class QuestionFormat(str, enum.Enum):
    MC = "MC"
    OPEN = "OPEN"
    TABLE = "TABLE"
    FILL = "FILL"
    COMIC = "COMIC"
    SEQUENCE = "SEQUENCE"
    TRUE_FALSE = "TRUE_FALSE"
    VOCAB = "VOCAB"


class SessionStatus(str, enum.Enum):
    IN_PROGRESS = "IN_PROGRESS"
    SUBMITTED = "SUBMITTED"
    GRADED = "GRADED"


class GradingJobStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    DONE = "DONE"
    FAILED = "FAILED"


class ChatRole(str, enum.Enum):
    TEACHER = "TEACHER"
    AGENT = "AGENT"


# ─── Models ──────────────────────────────────────────────────────────────────

class Teacher(Base):
    __tablename__ = "teachers"

    id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    exams = relationship("Exam", back_populates="teacher")


class Exam(Base):
    __tablename__ = "exams"

    id = Column(String, primary_key=True, default=gen_uuid)
    teacher_id = Column(String, ForeignKey("teachers.id"), nullable=True)
    title = Column(String, nullable=False)
    grade_cluster = Column(SAEnum(GradeCluster), nullable=False)
    topic_values = Column(JSON, default=dict)   # {topic: str, values: str, specific_topic: str}
    proposed_theme = Column(JSON, nullable=True)  # {theme: str, rationale: str}
    text_type_preferences = Column(JSON, default=dict)
    status = Column(SAEnum(ExamStatus), default=ExamStatus.DRAFT)
    access_code = Column(String, nullable=True, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    teacher = relationship("Teacher", back_populates="exams")
    texts = relationship("ExamText", back_populates="exam", cascade="all, delete-orphan")
    questions = relationship("Question", back_populates="exam", cascade="all, delete-orphan")
    spec_entries = relationship("SpecTableEntry", back_populates="exam", cascade="all, delete-orphan")
    sessions = relationship("StudentExamSession", back_populates="exam", cascade="all, delete-orphan")
    chat_messages = relationship("ChatMessage", back_populates="exam", cascade="all, delete-orphan")


class ExamText(Base):
    __tablename__ = "exam_texts"

    id = Column(String, primary_key=True, default=gen_uuid)
    exam_id = Column(String, ForeignKey("exams.id"), nullable=False)
    text_type = Column(SAEnum(TextType), nullable=False)
    title = Column(String, nullable=False, default="")
    content = Column(Text, nullable=False)
    word_count = Column(Integer, default=0)
    # {A: [sentences], B: [...], C: [...], D: [...]}
    anchor_map = Column(JSON, default=dict)
    version = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

    exam = relationship("Exam", back_populates="texts")
    questions = relationship("Question", back_populates="text")


class Question(Base):
    __tablename__ = "questions"

    id = Column(String, primary_key=True, default=gen_uuid)
    exam_id = Column(String, ForeignKey("exams.id"), nullable=False)
    text_id = Column(String, ForeignKey("exam_texts.id"), nullable=False)
    sequence_number = Column(Integer, nullable=False)
    dimension = Column(SAEnum(Dimension), nullable=False)
    format = Column(SAEnum(QuestionFormat), nullable=False, default=QuestionFormat.MC)
    # {stem, options[], correct_answer, distractor_rationale{}}
    content = Column(JSON, nullable=False, default=dict)
    # {max_score, criteria[], partial_credit: str, sample_answer: str}
    rubric = Column(JSON, nullable=False, default=dict)
    score_points = Column(Integer, default=2)
    is_cross_text = Column(Boolean, default=False)  # requires both texts
    is_approved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    exam = relationship("Exam", back_populates="questions")
    text = relationship("ExamText", back_populates="questions")
    spec_entry = relationship("SpecTableEntry", back_populates="question", uselist=False, cascade="all, delete-orphan")
    student_answers = relationship("StudentAnswer", back_populates="question")


class SpecTableEntry(Base):
    __tablename__ = "spec_table_entries"

    id = Column(String, primary_key=True, default=gen_uuid)
    exam_id = Column(String, ForeignKey("exams.id"), nullable=False)
    question_id = Column(String, ForeignKey("questions.id"), nullable=False)
    dimension = Column(String, nullable=False)
    format = Column(String, nullable=False)
    score = Column(Integer, nullable=False)
    text_reference = Column(String, default="")  # "paragraph X / lines Y-Z"
    anchor_sentence = Column(Text, default="")
    text_type = Column(String, default="")  # narrative / informational

    exam = relationship("Exam", back_populates="spec_entries")
    question = relationship("Question", back_populates="spec_entry")


class StudentExamSession(Base):
    __tablename__ = "student_exam_sessions"

    id = Column(String, primary_key=True, default=gen_uuid)
    exam_id = Column(String, ForeignKey("exams.id"), nullable=False)
    student_name = Column(String, nullable=False)
    student_id = Column(String, nullable=False)
    class_name = Column(String, nullable=False, default="")
    status = Column(SAEnum(SessionStatus), default=SessionStatus.IN_PROGRESS)
    started_at = Column(DateTime, default=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)
    exam = relationship("Exam", back_populates="sessions")
    answers = relationship("StudentAnswer", back_populates="session", cascade="all, delete-orphan")
    grading_jobs = relationship("GradingJob", back_populates="session", cascade="all, delete-orphan")


class StudentAnswer(Base):
    __tablename__ = "student_answers"

    id = Column(String, primary_key=True, default=gen_uuid)
    session_id = Column(String, ForeignKey("student_exam_sessions.id"), nullable=False)
    question_id = Column(String, ForeignKey("questions.id"), nullable=False)
    raw_answer = Column(Text, default="")
    score_awarded = Column(Float, nullable=True)
    score_max = Column(Integer, nullable=True)
    grading_notes = Column(Text, default="")
    teacher_override_score = Column(Float, nullable=True)
    teacher_approved = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    session = relationship("StudentExamSession", back_populates="answers")
    question = relationship("Question", back_populates="student_answers")


class GradingJob(Base):
    __tablename__ = "grading_jobs"

    id = Column(String, primary_key=True, default=gen_uuid)
    session_id = Column(String, ForeignKey("student_exam_sessions.id"), nullable=False)
    status = Column(SAEnum(GradingJobStatus), default=GradingJobStatus.PENDING)
    student_profile = Column(JSON, nullable=True)  # {level, strengths, weaknesses, recommendation}
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)

    session = relationship("StudentExamSession", back_populates="grading_jobs")


class SessionFeedback(Base):
    __tablename__ = "session_feedback"

    id = Column(String, primary_key=True, default=gen_uuid)
    session_id = Column(String, ForeignKey("student_exam_sessions.id"), nullable=False)
    satisfaction_rating = Column(Integer, nullable=True)  # 1-5
    feedback_text = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True, default=gen_uuid)
    exam_id = Column(String, ForeignKey("exams.id"), nullable=False)
    role = Column(SAEnum(ChatRole), nullable=False)
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    action_taken = Column(JSON, nullable=True)  # {type, question_id, old, new}

    exam = relationship("Exam", back_populates="chat_messages")


# ─── DB Setup ─────────────────────────────────────────────────────────────────

engine = create_async_engine(get_database_url(), echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
