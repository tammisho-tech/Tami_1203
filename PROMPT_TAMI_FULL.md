# פרומפט מערכת TAMI — מחולל מבחני הבנת הנקרא

**מסמך זה משמש כמדריך מלא ליצירת מערכת דומה.** הוא מחקה את כל ההתנהלות, השלבים, הסוכנים, הפתרונות והפרטים הטכניים של המערכת המקורית.

---

## 1. מטרת המערכת

בנה מערכת מלאה ליצירת מבחני הבנת נקרא בעברית בסטנדרט **ראמ"ה** (רכיבי אוריינות מותאמים להערכה), המשלבת בינה מלאכותית עם ממשק ידידותי למורה.

**תהליך יצירת מבחן — 5 שלבים:**
1. **פתיחה** — המורה בוחר אשכול כיתות, נושא, ערכים, סוג טקסט
2. **תכנון** — AI מייצר תמה משותפת, רעיון לטקסטים, מילות רגש
3. **טקסטים** — AI מייצר זוג טקסטים (נרטיבי + מידעי) עם עוגנים ל-4 ממדים
4. **שאלות** — AI מייצר 23 שאלות (11 לכל טקסט + 1 שאלת מיזוג) עם מחוון
5. **עיצוב ופרסום** — ולידציה, צ'אט עריכה, פרסום, ייצוא PDF, דשבורד

---

## 2. טכנולוגיות

### Backend
| ספרייה | גרסה | שימוש |
|--------|-------|--------|
| Python | 3.12+ | שפת תכנות |
| FastAPI | 0.115+ | שרת API |
| SQLAlchemy | 2.0+ | ORM — בסיס נתונים |
| aiosqlite | 0.20+ | SQLite אסינכרוני |
| Anthropic SDK | 0.40+ | קריאות ל-Claude |
| python-docx | 1.1+ | קריאת קבצי DOCX |
| Jinja2 | 3.1+ | תבניות HTML לייצוא PDF |
| pydantic-settings | 2.6+ | קריאת משתני סביבה |

### Frontend
| ספרייה | שימוש |
|--------|--------|
| React 18 | ממשק משתמש |
| Vite | bundler |
| TailwindCSS | עיצוב |
| React Router v6 | ניתוב |
| TanStack Query | cache ו-fetching |
| Zustand | ניהול state |
| Recharts | גרפים לאנליטיקה |
| Axios | קריאות HTTP |
| lucide-react | אייקונים |

### AI
- **מודל ראשי:** `claude-sonnet-4-6` — משימות איכות (טקסטים, שאלות)
- **מודל מהיר:** `claude-haiku-4-5-20251001` — משימות קצרות (תמה, רעיון, רגשות)
- **חשוב:** אין שימוש ב-assistant message prefill — כל קריאה מסתיימת ב-user message

---

## 3. מבנה הפרויקט

```
tami/
├── backend/
│   ├── main.py                    # כניסה FastAPI, CORS, טעינת knowledge
│   ├── config.py                  # נתיבים, GRADE_WORD_COUNTS, מודלים
│   ├── .env                       # ANTHROPIC_API_KEY, DATABASE_URL, SECRET_KEY
│   ├── requirements.txt
│   ├── models/database.py         # SQLAlchemy models, enums
│   ├── knowledge/
│   │   ├── loader.py              # טוען DOCX, TXT samples בהפעלה
│   │   └── engine.py              # get_text_examples(), get_question_examples(), get_foundation_context()
│   ├── agents/
│   │   ├── text_agent.py          # תמה, רעיון, רגשות, טקסטים, שיפור
│   │   ├── task_agent.py          # שאלות + מחוון
│   │   ├── qa_agent.py            # ולידציה + צ'אט עריכה
│   │   └── grading_agent.py       # ניקוד תלמידים
│   ├── routers/
│   │   ├── exams.py               # API מבחנים
│   │   ├── students.py            # API תלמידים
│   │   └── analytics.py           # API אנליטיקה
│   └── services/
│       ├── pdf_export.py          # ייצוא PDF עם Jinja2 + RTL
│       └── word_count.py          # ספירת מילים בעברית
├── frontend/
│   ├── index.html, package.json
│   ├── vite.config.ts             # proxy /api → localhost:8000
│   ├── tailwind.config.ts
│   └── src/
│       ├── App.tsx                # RTL, routes
│       ├── api/                   # axios, exams.ts, students.ts
│       ├── types/index.ts
│       ├── components/
│       │   ├── ui/                # Button, Card, Badge, Modal, Spinner, WorkflowSteps
│       │   ├── exam/              # TextDisplay, QuestionCard, SpecTable
│       │   ├── chat/              # RefinementChat
│       │   └── student/           # AnswerInput, Timer
│       └── pages/
│           ├── Landing.tsx, Home.tsx
│           ├── teacher/           # NewExam, ReviewPlan, ReviewTexts, LinguisticEdit, ReviewQuestions, QARefinement, ExamDesign, ExamReady
│           ├── student/            # ExamLobby, TakeExam, ExamComplete
│           └── analytics/         # ClassDashboard
├── מסמכי תשתית/                  # DOCX — רכיב הטקסט, רכיב המשימה, רכיב הקורא, אוריינות קריאה
├── חומרים לדוגמה מבחן ראמה/      # PDFs לדוגמה
├── טקסטים לדוגמא/                # ~120 TXT — מבנה: כיתה X/נרטיבי|מידעי/*.txt
├── שאלות לדוגמא/                 # ~216 TXT — מבנה: כיתה X/ממד א'|ב'|ג'|ד'/*.txt
├── הפעל_TAMI.bat                  # הפעלת backend + frontend
└── README.md
```

---

## 4. מסמכי תשתית (Knowledge Base)

### 4.1 נתיבים (config.py)
```python
DATA_ROOT = Path(__file__).parent.parent
TEXTS_DIR = DATA_ROOT / "טקסטים לדוגמא"
QUESTIONS_DIR = DATA_ROOT / "שאלות לדוגמא"
FOUNDATION_DOCS_DIR = DATA_ROOT / "מסמכי תשתית"
SAMPLE_EXAM_DIR = DATA_ROOT / "חומרים לדוגמה מבחן ראמה"
```

### 4.2 מיפוי מסמכי DOCX
```python
DOC_KEY_MAP = {
    "אוריינות_קריאה": "reading_literacy",
    "רכיב _המשימה": "task_component",
    "רכיב_המשימה": "task_component",
    "רכיב הקורא חדש": "reader_component",
    "רכיב_הטקסט_ נספח": "text_appendix",
    "רכיב_הטקסט_נספח": "text_appendix",
    "רכיב_הטקסט": "text_component",
}
```

### 4.3 מבנה טקסטים לדוגמא
- `טקסטים לדוגמא/כיתה ד_ עברית/נרטיבי/*.txt`
- `טקסטים לדוגמא/כיתה ד_ עברית/מידעי/*.txt`
- `TEXT_TYPE_FOLDER_MAP`: נרטיבי→narrative, מידעי→informational, שימושי→functional

### 4.4 מבנה שאלות לדוגמא
- `שאלות לדוגמא/כיתה ד_ עברית/הבנת המשמעות הגלויה/*.txt`
- `DIMENSION_FOLDER_MAP`: איתור מידע→A, הבנה משתמעת→B, פרשנות→C, הערכה ביקורתית→D

### 4.5 פונקציות Engine
```python
get_text_examples(grade_cluster, text_type, n=3)      # few-shot לטקסטים
get_question_examples(grade_cluster, dimension, n=2) # few-shot לשאלות
get_foundation_context(keys)                          # הקשר פדגוגי מה-DOCX
```

---

## 5. הגדרות (config.py)

### 5.1 מספר מילים — גבולות מדויקים לפי כיתה ואשכול

**טבלה מלאה — (נרטיבי מינימום, נרטיבי מקסימום, מידעי מינימום, מידעי מקסימום):**

| אשכול | כיתה | נרטיבי (מילים) | מידעי (מילים) |
|-------|------|----------------|---------------|
| 3-4 | ג', ד' | 400–600 | 330–460 |
| 5-6 | ה', ו' | 480–680 | 400–560 |
| 7-9 | ז', ח', ט' | 560–800 | 480–680 |

**התאמה לפי תזמון מבחן (exam_timing):**
- **תחילת שנה:** -50 מילים לנרטיבי, -40 למידעי (רמה מתחילה)
- **אמצע שנה:** ללא שינוי
- **סוף שנה:** +50 מילים לנרטיבי, +40 למידעי (רמה גבוהה)

```python
GRADE_WORD_COUNTS = {
    "3-4": (400, 600, 330, 460),   # (narr_min, narr_max, info_min, info_max)
    "5-6": (480, 680, 400, 560),
    "7-9": (560, 800, 480, 680),
}
timing_word_delta = {"תחילת שנה": -50, "אמצע שנה": 0, "סוף שנה": +50}
```

### 5.2 נושאים — רשימה מלאה לפי אשכול

**אשכול 3-4 (כיתות ג'–ד'):**
חלל והיקום, בעלי חיים, ים וטבע ימי, יער וטבע, תופעות טבע, המצאות וטכנולוגיה, מזון ומקורותיו, ספורט והתמדה, ילדים בעולם, ספרים וקריאה, היסטוריה וערים עתיקות, **אישיים**, **אחר**

**אשכול 5-6 (כיתות ה'–ו'):**
חלל וחקר החלל, בינה מלאכותית וטכנולוגיה, תופעות טבע ואקלים, ים ויצורים ימיים, חיות בסכנת הכחדה, המצאות ששינו את העולם, מנהיגות והתמדה, מוזיקה ותרבות, תקשורת ומדיה, שפה ומילים, עיר העתיד, ספורט ומדע, **אישיים**, **אחר**

**אשכול 7-9 (כיתות ז'–ט'):**
בינה מלאכותית ועתיד, גנטיקה ומדע, סייבר ופרטיות, תופעות טבע ואקלים, אנרגיה וסביבה, זהות דיגיטלית, בריאות הנפש, יחסים בין-אישיים, מנהיגות, עיתונאות ועובדות, זכויות אדם, כלכלה וחברה, אתיקה ומוסר, יזמות ויצירה, אמנות ומחאה, **אישיים**, **אחר**

**הערות:**
- **אישיים** — דורש בחירת דמות ביוגרפית (ראה 5.4)
- **אחר** — דורש הזנת נושא חופשי בשדה specific_topic

### 5.3 ערכים — רשימה מלאה לפי אשכול

**אשכול 3-4:**
חברות ונאמנות, עזרה הדדית, שיתוף פעולה, הכלה ואחדות, כבוד לזולת, קבלת השונה, חמלה ואמפתיה, אומץ והתמדה, כנות ויושר, התמדה ואי-ויתור, ביטחון עצמי, חיוביות, אופטימיות, צניעות, סקרנות אינטלקטואלית, יצירתיות, אמינות, שמירה על הסביבה, נדיבות, הגינות, אחריות אישית, תקווה

**אשכול 5-6:**
מנהיגות ואחריות, שיתוף פעולה, ערבות הדדית, צדק והגינות, שוויון הזדמנויות, הכלה ואחדות, כבוד לשונה, סובלנות, אמפתיה ורגישות, חמלה מעשית, חוסן ועמידות, ביטחון עצמי, אומץ מוסרי, נאמנות לעצמי, התמדה והתגברות על קשיים, מחויבות ערכית, נדיבות, סקרנות מדעית, חדשנות ויזמות, יצירתיות, יושר ושקיפות, חשיבה ביקורתית, אחריות סביבתית, שמירת הטבע, אחריות לדורות הבאים, תקווה, זהות ומשמעות

**אשכול 7-9:**
צדק חברתי, זכויות אדם, שוויון ושוויוניות, פלורליזם, חירות ואחריות, דמוקרטיה וחוק, ערבות הדדית, שלום ופיוס, כבוד לשונה, נגד גזענות ושנאה, אמפתיה וחמלה, מנהיגות ערכית, אומץ מוסרי, יושר ושקיפות, אחריות אישית וחברתית, נאמנות לעצמי, חוסן נפשי, חשיבה ביקורתית, חקר ובדיקת עובדות, סקרנות אינטלקטואלית, חדשנות ויצירתיות, אחריות סביבתית, קיימות ועתיד הפלנטה, תקווה, זהות ומשמעות, זיכרון ומורשת

### 5.4 דמויות ביוגרפיות (נושא "אישיים")

**אשכול 3-4:** אילן רמון, לואי ברייל, ג'יין גודול, סימון ביילס, לאה גולדברג, נעמי שמר, הנרייטה סאלד, מרי קירי, אישיות אחרת — כתבי שם

**אשכול 5-6:** עדה יונת, גולדה מאיר, חנה סנש, מלאלה יוסף זאי, נלסון מנדלה, ג'יין גודול, פרידה קאלו, לודוויג ואן בטהובן, אילן רמון, אישיות אחרת — כתבי שם

**אשכול 7-9:** גולדה מאיר, חנה ארנדט, דוד בן גוריון, ראול ולנברג, מרטין לותר קינג, גרטה טונברג, מרי קירי, מאיה אנג'לו, שמעון פרס, סטיבן הוקינג, אלברט איינשטיין, אישיות אחרת — כתבי שם

**לוגיקה:** הטקסט המידעי = ביוגרפיה של הדמות (עובדות אמיתיות). הטקסט הנרטיבי = סיפור עם ערך/רגש הקשור לדמות — **לא** על הדמות עצמה.

### 5.5 סוג טקסט — רציף / לא-רציף

**טקסט רציף:** מאמר, פרוזה, נרטיב — מבנה רגיל.

**טקסט לא-רציף — סוגים:**
- `comparison_table` — טבלת השוואה
- `timeline` — ציר זמן
- `flowchart` — תרשים זרימה
- `data_chart` — תרשים נתונים
- `concept_map` — מפת מושגים

**רכיבים נלווים (sidebars) לטקסט מידעי לא-רציף:**
הגדרה מילונית, עמדה, כתבה חדשותית, סקר דעות, הדגמה, תיבת עובדות, קטע מיומן, רשימה, קשר לתחום דעת

### 5.7 מיפוי אשכול לדוגמאות
```python
GRADE_CLUSTER_TO_SAMPLE = {"3-4": 4, "5-6": 5, "7-9": 9}
```

### 5.8 משתני סביבה (.env)
```
ANTHROPIC_API_KEY=sk-ant-api03-...
DATABASE_URL=sqlite+aiosqlite:///./tami.db
SECRET_KEY=tami-secret-key-change-in-production
```

---

## 6. הסוכנים (AI Agents)

### 6.1 סוכן טקסטים (text_agent.py)

**פונקציות:**
| פונקציה | תיאור | מודל |
|---------|--------|------|
| `generate_theme()` | תמה משותפת (רעיון מחבר) | Haiku |
| `generate_idea()` | רעיון לטקסטים (גיבור, קונפליקט, נושא) | Haiku |
| `suggest_emotions()` | 5 מילות רגש לנרטיבי | Haiku |
| `generate_texts()` | זוג טקסטים מלאים עם עוגנים | Sonnet |
| `improve_text()` | שיפור לפי רכיב (תוכן/מבנה/לשון/סוגה) | Sonnet |
| `suggest_improvements()` | 5 הצעות שיפור | Haiku |
| `refine_idea_with_chat()` | עידון רעיון לפי הערת מורה | Haiku |
| `apply_linguistic_edit_chat()` | עריכה לשונית לפי הערה | Haiku |
| `generate_plan()` | תמה + רעיון + רגשות במקביל | Haiku |

**חשוב:**
- נושאים חסומים: תרומת איברים, אלימות, מוות, מין, סמים, מלחמה, גזענות וכו'
- נרטיבי: דמויות אנושיות בלבד, לא בעלי חיים מדברים
- מידעי: עובדות אמיתיות בלבד
- עוגנים: A, B, C, D בכל טקסט
- טקסט לא-רציף: `{"__nc": true, "main": "...", "sidebars": [...]}`

### 6.2 סוכן שאלות (task_agent.py)

**פונקציות:**
| פונקציה | תיאור |
|---------|--------|
| `generate_questions()` | 23 שאלות + שאלת מיזוג |
| `fix_distractors()` | 3 מסיחים פסיכומטריים לשאלת MC |

**חלוקת ממדים (20/50/30):**
- A: ~20% — איתור מידע
- B+C: ~50% — הסקה + פרשנות
- D: ~30% — הערכה ביקורתית

**פורמטים:** MC, OPEN, TABLE, SEQUENCE, TRUE_FALSE, VOCAB

**גיוון חובה:** 4+ MC, 2+ OPEN, 1 TABLE, 1 TRUE_FALSE, 1 VOCAB

**מסיחים:** שכן טקסטואלי, ערבוב תכונות, פרט חלקי (ממד א'); מסקנה חלקית, סיבה שכנה, הגזמה לוגית (ממד ב')

### 6.3 סוכן QA (qa_agent.py)

**פונקציות:**
| פונקציה | תיאור |
|---------|--------|
| `validate_exam()` | 5 כללים: עיגון, כפילות, התפלגות, הלימה, גיל |
| `chat()` | צ'אט → action JSON → edit/add/delete |

**סוגי actions:**
```json
{"type": "edit_question", "question_id": "uuid", "updated_fields": {...}}
{"type": "add_question", "question_data": {...}}
{"type": "delete_question", "question_id": "uuid"}
{"type": "edit_text", "text_id": "uuid", "updated_content": "..."}
```

### 6.4 סוכן ניקוד (grading_agent.py)
- MC/FILL: השוואת מחרוזת Python
- OPEN: קריאת AI עם מחוון
- פרופיל תלמיד: רמה 1-4 + המלצה פדגוגית

---

## 7. API Routes

### 7.1 מבחנים — `/api/exams/`
```
POST   /                              יצירת מבחן
GET    /                              רשימת מבחנים
GET    /{id}                          פרטי מבחן
POST   /{id}/propose-theme            הצעת תמה
POST   /{id}/approve-theme            אישור תמה
POST   /{id}/generate-idea            רעיון לטקסטים
POST   /{id}/suggest-emotions         מילות רגש
POST   /{id}/generate-texts            יצירת טקסטים
POST   /{id}/improve-text             שיפור טקסט
POST   /{id}/regenerate-text          יצירה מחדש
PUT    /{id}/texts/{text_id}          עריכה ידנית
POST   /{id}/generate-questions       יצירת שאלות
PUT    /{id}/questions/{q_id}         עריכת שאלה
DELETE /{id}/questions/{q_id}          מחיקת שאלה
POST   /{id}/validate                 ולידציה
POST   /{id}/chat                     צ'אט עריכה
GET    /{id}/chat-history             היסטוריית צ'אט
POST   /{id}/publish                  פרסום
GET    /{id}/export/{booklet}         ייצוא PDF
```

### 7.2 תלמידים — `/api/students/`
```
GET    /exam-by-code/{code}           מציאת מבחן
POST   /sessions/                    פתיחת סשן
PUT    /sessions/{id}/answers/{q_id}  שמירת תשובה
POST   /sessions/{id}/submit          הגשה
GET    /sessions/{id}/results         תוצאות
```

### 7.3 אנליטיקה — `/api/analytics/{exam_id}/`
```
GET    /class                         ממוצע, סטיית תקן, ממדים
GET    /items                         ניתוח שאלות
GET    /students                      פרופילי תלמידים
GET    /grading-queue                 תשובות לאישור
POST   /approve-grade/{answer_id}     אישור ציון
```

---

## 8. בסיס נתונים

### טבלאות עיקריות
- `Exam` — status: DRAFT → TEXTS_READY → QUESTIONS_READY → PUBLISHED
- `ExamText` — content, anchor_map, text_type
- `Question` — dimension, format, stem, options, rubric, score_points
- `SpecTableEntry` — טבלת מפרט
- `StudentExamSession` — שם, מזהה, כיתה
- `StudentAnswer` — תשובה, ציון, אישור מורה
- `ChatMessage` — היסטוריית צ'אט

### ממדים
- A — איתור מידע (גלוי)
- B — הבנה משתמעת (הסקה)
- C — פרשנות ויישום
- D — הערכה ביקורתית

### פורמטי שאלות
MC | OPEN | TABLE | FILL | SEQUENCE | TRUE_FALSE | VOCAB

---

## 9. Frontend — דפים וקישורים

### 9.1 Routes
| Route | דף | תיאור |
|-------|-----|--------|
| `/` | Landing | "מבחן חדש", "ספריית מבחנים" |
| `/dashboard` | Home | רשימת מבחנים עם סטטוס |
| `/teacher/new-exam` | NewExam | טופס: אשכול, נושא, ערכים |
| `/teacher/exam/:id/plan` | ReviewPlan | תמה, רעיון, רגשות |
| `/teacher/exam/:id/texts` | ReviewTexts | הצעות, יצירה, שיפור |
| `/teacher/exam/:id/language-edit` | LinguisticEdit | עריכה לשונית |
| `/teacher/exam/:id/questions` | ReviewQuestions | שאלות, טבלת מפרט |
| `/teacher/exam/:id/qa` | QARefinement | ולידציה + צ'אט |
| `/teacher/exam/:id/design` | ExamDesign | תצוגה מקדימה |
| `/teacher/exam/:id/ready` | ExamReady | פרסום, PDF, קישור |
| `/teacher/exam/:id/analytics` | ClassDashboard | גרפים, ניתוח |
| `/student` | ExamLobby | קוד + שם |
| `/student/exam/:sessionId` | TakeExam | מענה |
| `/student/results/:sessionId` | ExamComplete | תוצאות |

### 9.2 כפתורים עיקריים (לפי דף)
- **NewExam:** "המשך לשלב הרעיון"
- **ReviewPlan:** "הצע תמה ורעיון", "המשך"
- **ReviewTexts:** "הצע תמה ורעיון", "צרי טקסטים", "שפר", "אשר", "המשך לעריכה לשונית"
- **LinguisticEdit:** "המשך"
- **ReviewQuestions:** "צור שאלות", "ערוך", "מחק", "מעבר לעיצוב גרפי"
- **QARefinement:** "בדוק איכות", "אשר ופרסם"
- **ExamDesign:** "המשך לפרסום"
- **ExamReady:** "פרסם מבחן", "הורד PDF", "קישור לתלמיד"

---

## 10. תהליך יצירת מבחן (Flow)

```
המורה → NewExam (POST /api/exams/)
  → Exam(DRAFT)
  → ReviewPlan: propose-theme → approve-theme → generate-idea → suggest-emotions
  → ReviewTexts: generate-texts (או improve-text)
  → LinguisticEdit: עריכה לשונית
  → ReviewQuestions: generate-questions
  → QARefinement: validate → chat (אופציונלי)
  → ExamDesign: תצוגה
  → ExamReady: publish → access_code (6 תווים)
  → ייצוא PDF, דשבורד
```

---

## 11. בעיות ידועות ופתרונות

### שגיאת UnicodeEncodeError בלוגים (Windows)
- `main.py` מגדיר stdout ל-UTF-8
- `loader.py` משתמש ב-`_safe_print()`

### Claude מחזיר JSON לא תקין
- `_extract_json()`: מנקה trailing commas, מתקן newlines בתוך strings
- `_fix_newlines_in_strings()` — ממיר `\n` גולמי ל-`\\n`

### שגיאת "assistant message prefill" (400)
- `claude-sonnet-4-6` אינו תומך ב-prefill
- כל קריאה מסתיימת ב-user message בלבד

### פורט 8000 תפוס
- `netstat -ano` → `taskkill /PID <PID> /F /T`

### השרת נמשך זמן רב
- טוען 336 קבצים — 15–30 שניות
- המתן עד `[TAMI] Ready.`

---

## 12. הפניות למסמכי תשתית

- **מסמכי תשתית/** — DOCX עם רכיב הטקסט, רכיב המשימה, רכיב הקורא, אוריינות קריאה
- **טקסטים לדוגמא/** — מבנה כיתה/סוג/קובץ.txt
- **שאלות לדוגמא/** — מבנה כיתה/ממד/קובץ.txt
- **חומרים לדוגמה מבחן ראמה/** — PDFs לדוגמה

---

## 13. דוגמאות למשאלות

### יצירת טופס מבחן חדש
- **אשכול כיתות:** 3-4 | 5-6 | 7-9 (ראה טבלת מילים בסעיף 5.1)
- **נושא:** רשימה מלאה בסעיף 5.2 — לפי אשכול
- **ערכים:** רשימה מלאה בסעיף 5.3 — לפי אשכול (ניתן לבחור כמה)
- **סוג טקסט:** רציף / לא-רציף (ראה 5.5 — טבלת השוואה, ציר זמן, תרשים זרימה וכו')
- **תזמון:** תחילת שנה / אמצע שנה / סוף שנה (משפיע על אורך הטקסט — סעיף 5.1)
- **שם מורה:** שדה חובה

### נושא "אישיים"
- דורש בחירת **דמות ביוגרפית** — רשימה מלאה בסעיף 5.4
- הטקסט המידעי = ביוגרפיה של הדמות (עובדות אמיתיות בלבד)
- הטקסט הנרטיבי = סיפור עם ערך/רגש הקשור לדמות — **לא** על הדמות עצמה

---

## 14. סיכום

מערכת TAMI היא מערכת מלאה ליצירת מבחני הבנת נקרא בעברית בסטנדרט ראמ"ה. היא כוללת:

1. **4 סוכנים** — טקסטים, שאלות, QA, ניקוד
2. **מנוע ידע** — DOCX מסמכי תשתית + 120 טקסטים + 216 שאלות לדוגמא
3. **5 שלבי workflow** — פתיחה, תכנון, טקסטים, שאלות, פרסום
4. **Backend** — FastAPI, SQLAlchemy, Anthropic, Jinja2
5. **Frontend** — React, Vite, Tailwind, RTL
6. **ממשק מורה** — 10 דפים עם כפתורים מודרכים
7. **ממשק תלמיד** — כניסה, מענה, תוצאות
8. **אנליטיקה** — דשבורד כיתה, גרפים, ניתוח שאלות

פרומפט זה מספק את כל המידע הנדרש לבניית מערכת דומה מאפס.
