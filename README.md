# TAMI — מחולל מבחני הבנת הנקרא

מערכת מלאה ליצירת מבחני הבנת נקרא בעברית בסטנדרט ראמ"ה, המשלבת בינה מלאכותית עם ממשק ידידותי למורה.

---

## תוכן עניינים
1. [סקירה כללית](#סקירה-כללית)
2. [טכנולוגיות](#טכנולוגיות)
3. [מבנה הפרויקט](#מבנה-הפרויקט)
4. [הגדרת סביבה](#הגדרת-סביבה)
5. [הפעלת המערכת](#הפעלת-המערכת)
6. [ארכיטקטורה](#ארכיטקטורה)
7. [בסיס הנתונים](#בסיס-הנתונים)
8. [הסוכנים (AI Agents)](#הסוכנים-ai-agents)
9. [API Routes](#api-routes)
10. [Frontend — דפים וקומפוננטות](#frontend--דפים-וקומפוננטות)
11. [כיצד לבצע שינויים](#כיצד-לבצע-שינויים)
12. [בעיות ידועות ופתרונות](#בעיות-ידועות-ופתרונות)

---

## סקירה כללית

TAMI מאפשרת למורים ליצור מבחני הבנת נקרא מלאים בתהליך אוטומטי של 5 שלבים:

1. **הגדרה** — המורה בוחר אשכול כיתות, נושא וערכים
2. **יצירת טקסטים** — AI מייצר זוג טקסטים (נרטיבי + מידעי) בתהליך מודרך 5-שלבי
3. **יצירת שאלות** — AI מייצר 23 שאלות עם מחוון ודף מפרט
4. **בקרת איכות ועריכה** — ולידציה אוטומטית + צ'אט עם AI לעריכות
5. **פרסום** — קוד גישה לתלמידים, ייצוא PDF, דשבורד ניתוח

---

## טכנולוגיות

### Backend
| ספרייה | גרסה | שימוש |
|--------|-------|--------|
| Python | 3.12+ | שפת תכנות |
| FastAPI | 0.115+ | שרת API |
| SQLAlchemy | 2.0+ | ORM — בסיס נתונים |
| aiosqlite | 0.20+ | SQLite אסינכרוני |
| Anthropic SDK | 0.40+ | קריאות ל-Claude (claude-sonnet-4-6) |
| python-docx | 1.1+ | קריאת קבצי DOCX |
| Jinja2 | 3.1+ | תבניות HTML לייצוא |
| pydantic-settings | 2.6+ | קריאת משתני סביבה |

### Frontend
| ספרייה | שימוש |
|--------|--------|
| React 18 | ממשק משתמש |
| Vite | bundler |
| TailwindCSS | עיצוב |
| React Router v6 | ניתוב |
| React Query (TanStack) | cache ו-fetching |
| Zustand | ניהול state |
| Recharts | גרפים לאנליטיקה |
| Axios | קריאות HTTP |

---

## מבנה הפרויקט

```
tami/
│
├── backend/
│   ├── main.py                    # כניסה לאפליקציה FastAPI
│   ├── config.py                  # הגדרות כלליות: נתיבים, מודל, גבולות מילים
│   ├── .env                       # מפתח API + DB URL (לא מועלה ל-git)
│   ├── requirements.txt           # תלויות Python
│   ├── tami.db                    # בסיס נתונים SQLite (נוצר אוטומטית)
│   │
│   ├── models/
│   │   └── database.py            # כל טבלאות DB + enums + init_db()
│   │
│   ├── knowledge/
│   │   ├── loader.py              # טוען כל הקבצים לזיכרון בהפעלה
│   │   └── engine.py              # פונקציות שליפה: get_text_examples() וכו'
│   │
│   ├── agents/
│   │   ├── text_agent.py          # סוכן 1: תמה → רעיון → רגשות → יצירת טקסטים
│   │   ├── task_agent.py          # סוכן 2: יצירת שאלות + מחוון
│   │   ├── qa_agent.py            # סוכן 3: ולידציה + צ'אט עריכה
│   │   └── grading_agent.py       # סוכן 4: ניקוד תשובות תלמידים
│   │
│   ├── routers/
│   │   ├── exams.py               # כל נקודות ה-API של מבחנים
│   │   ├── students.py            # API לתלמידים (כניסה, מענה, הגשה)
│   │   └── analytics.py           # API לדשבורד וניתוח
│   │
│   └── services/
│       ├── pdf_export.py          # ייצוא PDF עם Jinja2 + RTL
│       └── word_count.py          # ספירת מילים בעברית
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts             # proxy /api → localhost:8000
│   ├── tailwind.config.ts
│   └── src/
│       ├── App.tsx                # RTL wrapper + React Router
│       ├── api/                   # axios client + קריאות מוקלדות
│       ├── types/index.ts         # כל הטיפוסים של TypeScript
│       ├── components/
│       │   ├── ui/                # Button, Card, Badge, Modal, Spinner
│       │   ├── exam/              # TextDisplay, QuestionCard, SpecTable
│       │   ├── chat/              # RefinementChat (שלב 4)
│       │   ├── student/           # TextBooklet, AnswerInput, Timer
│       │   └── analytics/         # ClassOverview, ItemAnalysis, Charts
│       └── pages/
│           ├── Home.tsx
│           ├── teacher/           # NewExam, ReviewTexts, ReviewQuestions, QA, Ready
│           ├── student/           # ExamLobby, TakeExam
│           └── analytics/         # ClassDashboard, StudentReport
│
├── מסמכי תשתית/                  # 5 קבצי DOCX — בסיס פדגוגי ראמ"ה (קריאה בלבד)
├── חומרים לדוגמה מבחן ראמה/      # 4 PDFs לדוגמה (קריאה בלבד)
├── טקסטים לדוגמא/                # 120 קבצי TXT — דוגמאות לטקסטים (קריאה בלבד)
├── שאלות לדוגמא/                 # 216 קבצי TXT — דוגמאות לשאלות (קריאה בלבד)
│
├── START_BACKEND.bat              # הפעלת שרת Backend (Windows)
├── START_FRONTEND.bat             # הפעלת Frontend (Windows)
└── README.md                     # קובץ זה
```

---

## הגדרת סביבה

### דרישות מוקדמות
- Python 3.12 ומעלה (Anaconda מומלץ)
- Node.js 18 ומעלה
- מפתח API של Anthropic (מ-console.anthropic.com)

### הגדרת מפתח API
פתח את הקובץ `backend/.env` וערוך:
```
ANTHROPIC_API_KEY=sk-ant-api03-...המפתח שלך כאן...
DATABASE_URL=sqlite+aiosqlite:///./tami.db
SECRET_KEY=tami-secret-key-change-in-production
```

---

## הפעלת המערכת

### שלב 1 — Backend
פתח terminal, נווט לתיקיית הפרויקט והרץ:
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

לאחר ההפעלה תראה:
```
[TAMI] Loading knowledge base...
[Knowledge Engine] Ready. Docs=5, TextBuckets=10, QuestionBuckets=23
[TAMI] Ready.
INFO: Uvicorn running on http://127.0.0.1:8000
```

### שלב 2 — Frontend
פתח terminal נוסף:
```bash
cd frontend
npm install
npm run dev
```

פתח דפדפן בכתובת: **http://localhost:5173**

### בדיקת תקינות
```bash
curl http://localhost:8000/health
# צפוי: {"healthy":true}
```

---

## ארכיטקטורה

### תהליך יצירת מבחן

```
המורה → NewExam
    ↓ POST /api/exams/
  [DB] Exam(DRAFT)
    ↓ POST /api/exams/{id}/propose-theme
  text_agent.generate_theme() → Claude → תמה מוצעת
    ↓ POST /api/exams/{id}/approve-theme
  [DB] שמירת התמה המאושרת
    ↓ POST /api/exams/{id}/generate-idea
  text_agent.generate_idea() → Claude → רעיון לכל טקסט
    ↓ POST /api/exams/{id}/suggest-emotions
  text_agent.suggest_emotions() → Claude → מילות רגש מנחות
    ↓ POST /api/exams/{id}/generate-texts
  text_agent.generate_texts() → Claude → [DB] ExamText × 2 + Exam(TEXTS_READY)
    ↓ POST /api/exams/{id}/generate-questions
  task_agent.py → Claude × 3 (parallel) → [DB] Question × 23 + Exam(QUESTIONS_READY)
    ↓ POST /api/exams/{id}/validate
  qa_agent.py → Claude → ValidationReport
    ↓ POST /api/exams/{id}/chat
  qa_agent.py → Claude → action JSON → [DB] edit/add/delete
    ↓ POST /api/exams/{id}/publish
  [DB] Exam(PUBLISHED) + access_code (6 chars)
```

### מנוע הידע (Knowledge Engine)

בהפעלת השרת, `knowledge/loader.py` טוען את כל הקבצים לזיכרון:
- **FOUNDATION_DOCS** — מילון: `{"text_component": "...", "task_component": "...", ...}`
- **SAMPLE_TEXTS** — מילון: `{(4, "narrative"): ["טקסט1", "טקסט2", ...], ...}`
- **SAMPLE_QUESTIONS** — מילון: `{(4, "A"): ["שאלה1", ...], ...}`

`knowledge/engine.py` מספק 3 פונקציות:
```python
get_text_examples(grade_cluster, text_type, n=3)    # few-shot לטקסטים
get_question_examples(grade_cluster, dimension, n=2) # few-shot לשאלות
get_foundation_context(keys)                          # הקשר פדגוגי מה-DOCX
```

---

## בסיס הנתונים

SQLite יחיד — `backend/tami.db`. נוצר אוטומטית בהפעלה ראשונה.

### טבלאות עיקריות

| טבלה | תיאור |
|------|--------|
| `Exam` | מבחן עם סטטוס (DRAFT → PUBLISHED) |
| `ExamText` | טקסט נרטיבי או מידעי + anchor_map |
| `Question` | שאלה עם ממד, פורמט, מחוון, ניקוד |
| `SpecTableEntry` | שורה בטבלת המפרט |
| `StudentExamSession` | סשן של תלמיד (שם, מזהה, כיתה) |
| `StudentAnswer` | תשובת תלמיד + ציון + אישור מורה |
| `GradingJob` | עבודת ניקוד (PENDING → DONE) |
| `ChatMessage` | היסטוריית צ'אט מורה-AI |

### ממדי ההבנה
- **A** — הבנה גלויה (איתור)
- **B** — הבנה משתמעת (הסקה)
- **C** — פרשנות ויישום
- **D** — הערכה ביקורתית

### פורמטי שאלות
`MC` | `OPEN` | `TABLE` | `FILL` | `COMIC`

---

## הסוכנים (AI Agents)

כל הסוכנים משתמשים ב-**Anthropic SDK** (`AsyncAnthropic`) עם המודל **`claude-sonnet-4-6`**.

### סוכן 1 — `text_agent.py`
מייצר זוג טקסטים בתהליך 5-שלבי:

| פונקציה | תיאור |
|---------|--------|
| `generate_theme()` | מציע תמה משותפת (רעיון מחבר) לזוג הטקסטים |
| `generate_idea()` | מתכנן בקצרה את שני הטקסטים (גיבור, קונפליקט, נושא) |
| `suggest_emotions()` | מציע מילות רגש/מפתח לטקסט הנרטיבי |
| `generate_texts()` | יוצר את הטקסטים המלאים עם עוגנים לכל 4 ממדים |
| `improve_text()` | משפר טקסט קיים לפי רכיב נבחר (תוכן/מבנה/לשון/סוגה) |

**לוגיקה:** עד 2 ניסיונות; אם ספירת מילים חורגת — שולח תיקון.
**גבולות מילים (מוגדר ב-`config.py`):**
```python
GRADE_WORD_COUNTS = {
    "3-4": (400, 600, 330, 460),   # (narr_min, narr_max, info_min, info_max)
    "5-6": (480, 680, 400, 560),
    "7-9": (560, 800, 480, 680),
}
```

### סוכן 2 — `task_agent.py`
יוצר 23 שאלות: 11 לכל טקסט + שאלת מיזוג. הפקת שאלות לשני הטקסטים רצה במקביל (`asyncio.gather`).

**חלוקת ממדים (20/50/30):**
```python
# ל-11 שאלות: A=2, B=3, C=3, D=3
```

### סוכן 3 — `qa_agent.py`
שני מצבים:
1. **ולידציה אוטומטית** — 5 כללים: עיגון, כפילות, חלוקה, הלימה, גיל
2. **צ'אט אינטראקטיבי** — מורה כותבת בשפה חופשית → AI מחזיר action JSON → Backend מבצע שינוי ב-DB

**סוגי actions:**
```json
{"type": "edit_question", "question_id": "uuid", "updated_fields": {...}}
{"type": "add_question", "question_data": {...}}
{"type": "delete_question", "question_id": "uuid"}
{"type": "edit_text", "text_id": "uuid", "updated_content": "..."}
```

### סוכן 4 — `grading_agent.py`
- **שאלות סגורות (MC/FILL)** — השוואת מחרוזת Python, ללא קריאת AI
- **שאלות פתוחות** — קריאת AI בודדת לכל הסשן
- **פרופיל תלמיד** — רמה 1-4 + המלצה פדגוגית

---

## API Routes

### מבחנים — `/api/exams/`
```
POST   /                              יצירת מבחן חדש
GET    /                              רשימת מבחנים
GET    /{id}                          פרטי מבחן
POST   /{id}/propose-theme            שלב 2א: הצעת תמה משותפת
POST   /{id}/approve-theme            שלב 2ב: אישור התמה
POST   /{id}/generate-idea            שלב 2ג: תכנון רעיון לטקסטים
POST   /{id}/suggest-emotions         שלב 2ד: הצעת מילות רגש לנרטיב
POST   /{id}/generate-texts           שלב 2ה: יצירת הטקסטים המלאים
POST   /{id}/improve-text             שיפור טקסט קיים לפי רכיב
POST   /{id}/regenerate-text          יצירה מחדש של טקסט אחד
PUT    /{id}/texts/{text_id}          עריכה ידנית של טקסט
POST   /{id}/generate-questions       שלב 3: יצירת שאלות
PUT    /{id}/questions/{q_id}         עריכת שאלה
DELETE /{id}/questions/{q_id}         מחיקת שאלה
POST   /{id}/validate                 שלב 4: ולידציה
POST   /{id}/chat                     שלב 4: צ'אט עריכה
GET    /{id}/chat-history             היסטוריית צ'אט
POST   /{id}/publish                  פרסום + קוד גישה
GET    /{id}/export/{booklet}         ייצוא PDF
```

### תלמידים — `/api/students/`
```
GET    /exam-by-code/{code}           מציאת מבחן לפי קוד
POST   /sessions/                     פתיחת סשן
PUT    /sessions/{id}/answers/{q_id}  שמירת תשובה (auto-save)
POST   /sessions/{id}/submit          הגשת מבחן → הפעלת ניקוד
GET    /sessions/{id}/results         תוצאות
```

### אנליטיקה — `/api/analytics/{exam_id}/`
```
GET    /class                         ממוצע, סטיית תקן, ממדים, רמות
GET    /items                         ניתוח שאלות (שאלות אדומות, מסיחים)
GET    /students                      כל פרופילי התלמידים
GET    /grading-queue                 תשובות פתוחות לאישור מורה
POST   /approve-grade/{answer_id}     אישור ציון
```

---

## Frontend — דפים וקומפוננטות

### דפי מורה
| דף | Route | תיאור |
|----|-------|--------|
| `Home.tsx` | `/` | רשימת מבחנים עם סטטוס |
| `NewExam.tsx` | `/teacher/new-exam` | טופס יצירה: אשכול, נושא, ערכים |
| `ReviewTexts.tsx` | `/teacher/exam/:id/texts` | תהליך מודרך: תמה → רעיון → רגשות → יצירה + עריכה |
| `ReviewQuestions.tsx` | `/teacher/exam/:id/questions` | רשימת שאלות + טבלת מפרט |
| `QARefinement.tsx` | `/teacher/exam/:id/qa` | דוח ולידציה + צ'אט AI |
| `ExamReady.tsx` | `/teacher/exam/:id/ready` | ייצוא PDF + שיתוף |

### דפי תלמיד
| דף | Route | תיאור |
|----|-------|--------|
| `ExamLobby.tsx` | `/student` | הזנת קוד + שם |
| `TakeExam.tsx` | `/student/exam/:sessionId` | ממשק מענה + שמירה אוטומטית |

### דפי אנליטיקה
| דף | Route | תיאור |
|----|-------|--------|
| `ClassDashboard.tsx` | `/teacher/exam/:id/analytics` | גרפים, טבלת תלמידים, שאלות אדומות |

---

## כיצד לבצע שינויים

### שינוי המודל (Claude → אחר)
ערוך שורה אחת ב-`backend/config.py`:
```python
MODEL_NAME = "claude-sonnet-4-6"  # שנה ל: "claude-opus-4-6", "claude-haiku-4-5-20251001", וכו'
```

> **חשוב:** המודל `claude-sonnet-4-6` **אינו** תומך ב-assistant message prefill.
> כל קריאות API חייבות להסתיים ב-user message.

### שינוי גבולות מילים לטקסטים
ערוך ב-`backend/config.py`:
```python
GRADE_WORD_COUNTS = {
    "3-4": (400, 600, 330, 460),
    ...
}
```

### שינוי מספר השאלות
ערוך ב-`backend/agents/task_agent.py`:
```python
TARGET_PER_TEXT = 11  # שאלות לכל טקסט (+ 1 שאלת מיזוג)
```

### שינוי חלוקת הממדים (20/50/30)
ערוך את הפונקציה `_get_dim_bounds()` ב-`backend/agents/task_agent.py`.

### הוספת סוג שאלה חדש
1. הוסף לאנום `QuestionFormat` ב-`backend/models/database.py`
2. עדכן את הפרומפט ב-`task_agent.py`
3. הוסף rendering ב-`frontend/src/components/exam/QuestionCard.tsx`

### שינוי שפת הפרומפטים
הפרומפטים נמצאים בפונקציות `_build_system_prompt()` ו-`_build_user_prompt()` בכל קובץ agent.

### הוספת ממד חדש לניתוח
1. הוסף לאנום `Dimension` ב-`database.py`
2. עדכן `DIMENSION_FOLDER_MAP` ב-`config.py`
3. עדכן את לוגיקת החלוקה ב-`task_agent.py`

### הוספת endpoint חדש
1. הוסף route ב-router המתאים (`routers/exams.py` / `routers/students.py`)
2. הוסף פונקצית API ב-`frontend/src/api/`
3. הוסף טיפוס מתאים ב-`frontend/src/types/index.ts`

---

## בעיות ידועות ופתרונות

### שגיאת UnicodeEncodeError בלוגים
**בעיה:** Windows לא תומך ב-Hebrew בתוצאות print() בטרמינל.
**פתרון:** `main.py` מגדיר מחדש את stdout ל-UTF-8. `loader.py` משתמש ב-`_safe_print()`.

### Claude מחזיר JSON עם trailing commas או שורות חדשות בתוך strings
**בעיה:** Python לא מקבל `{"key": "value",}` או `{"key": "שורה\nאחרת"}` ללא escape.
**פתרון:** `_extract_json()` ב-`text_agent.py` מנקה trailing commas ומתקן newlines לא-מוסקות לפני parsing:
```python
text = re.sub(r",\s*([}\]])", r"\1", text)  # trailing commas
# + _fix_newlines_in_strings() — סורק תו-תו ומחליף \n גולמי ב-\\n
```

### Claude מחזיר טקסט עברי לפני/אחרי ה-JSON
**בעיה:** המודל לפעמים מוסיף הסברים בעברית סביב ה-JSON.
**פתרון:** `_extract_json()` מנסה 3 אסטרטגיות: strip fences → חיפוש `{...}` → regex dotall.

### שגיאת "assistant message prefill" (400 BadRequestError)
**בעיה:** `claude-sonnet-4-6` אינו תומך בטכניקת prefill (הוספת `{"role": "assistant", "content": "{"}` לפני תגובת המודל).
**פתרון:** כל קריאות `client.messages.create()` חייבות להסתיים ב-`{"role": "user", ...}` בלבד.

### שגיאת `No module named 'aiosqlite'` או `No module named 'uvicorn'`
**בעיה:** חבילות חסרות בסביבת Python.
**פתרון:**
```bash
cd backend
pip install -r requirements.txt
```

### פורט 8000 תפוס לאחר הפעלה מחדש
**פתרון:**
```python
# בדוק איזה process תופס את הפורט
import subprocess
result = subprocess.run(['netstat', '-ano'], capture_output=True, text=True)
# ואז:
subprocess.run(['taskkill', '/PID', '<PID>', '/F', '/T'])
```
ואז הפעל מחדש את `uvicorn`.

### השרת נמשך זמן רב לעלות
**סיבה:** בהפעלה ראשונה, טוען 336 קבצים לזיכרון.
**זמן ממוצע:** 15-30 שניות. המתן עד שתראה `[TAMI] Ready.`

### הפרונטאנד רץ על פורט 5174 במקום 5173
**סיבה:** פורט 5173 תפוס ע"י instance ישן.
**פתרון:** סגור את כל הטרמינלים והפעל מחדש, או גש ל-http://localhost:5174.

---

## מפתחים

מערכת זו פותחה עם Claude Code (Anthropic) בשיתוף פעולה עם המשתמש.

**מודל AI בשימוש:** claude-sonnet-4-6 (Anthropic)
**בסיס פדגוגי:** מסמכי ראמ"ה — רכיב הטקסט, רכיב המשימה, רכיב הקורא
