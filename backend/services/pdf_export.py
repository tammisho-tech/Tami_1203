"""
PDF export service — generates print-ready RTL Hebrew documents.
Uses Chrome headless for server-side PDF generation with perfect Hebrew/RTL support.
"""

import io
import os
import subprocess
import tempfile
from jinja2 import Environment, DictLoader

# Path to Chrome or Edge for headless PDF generation
_CHROME_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]

def _find_chrome() -> str | None:
    for p in _CHROME_PATHS:
        if os.path.exists(p):
            return p
    return None


def chrome_available() -> bool:
    return _find_chrome() is not None

# ─── Grade cluster display labels ─────────────────────────────────────────────

GRADE_LABELS = {
    "3-4": "כיתות ג'–ד'",
    "5-6": "כיתות ה'–ו'",
    "7-9": "כיתות ז'–ט'",
}


def _grade_label(cluster) -> str:
    val = cluster.value if hasattr(cluster, "value") else str(cluster)
    return GRADE_LABELS.get(val, val)


# ─── Shared base CSS ─────────────────────────────────────────────────────────

BASE_STYLE = """
/* ══ Base reset ══ */
* { box-sizing: border-box; margin: 0; padding: 0; }

/* ══ Screen: colorful, modern layout ══ */
body {
    font-family: 'Rubik', 'Arial', sans-serif;
    direction: rtl;
    font-size: 13pt;
    line-height: 2;
    color: #1a1a2e;
    background: #f0f4f8;
    padding: 0;
    max-width: 21cm;
    margin: 0 auto;
}

/* Page wrapper for screen preview */
.page {
    background: #fff;
    padding: 1.5cm;
    min-height: 29.7cm;
    box-shadow: 0 4px 24px rgba(0,0,0,0.10);
    border-radius: 4px;
    margin: 0.5cm auto;
}

/* ══ Header ══ */
.header {
    background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%);
    color: #fff;
    text-align: center;
    padding: 0.7cm 1cm;
    border-radius: 8px;
    margin-bottom: 0.8cm;
}
.header h1 { font-size: 19pt; font-weight: 800; color: #fff; letter-spacing: 0.02em; }
.exam-meta  { font-size: 10pt; color: #cbd5e1; margin-top: 0.2cm; }
.student-info {
    background: #f8faff;
    border: 1px solid #c7d9f5;
    border-radius: 4px;
    padding: 0.15cm 0.4cm;
    font-size: 9.5pt;
    color: #334155;
    margin-bottom: 0.5cm;
    display: flex;
    gap: 0.8cm;
    flex-wrap: nowrap;
    align-items: center;
}
.student-info span { white-space: nowrap; }

/* ══ Section titles (per text) ══ */
h2 {
    font-size: 14pt;
    font-weight: 800;
    color: #1e3a5f;
    margin-top: 0.8cm;
    margin-bottom: 0.35cm;
    padding: 0.2cm 0.5cm;
    background: #e8f0fe;
    border-right: 5px solid #2563eb;
    border-radius: 0 4px 4px 0;
}

/* ══ Text block ══ */
.text-block {
    border: 1.5px solid #d1dce8;
    padding: 0.7cm;
    margin-bottom: 0.8cm;
    border-radius: 6px;
    background: #fafcff;
    line-height: 2;
}
p { margin-bottom: 0.35cm; text-align: justify; }

/* ══ Questions ══ */
.question {
    margin-bottom: 0.85cm;
    page-break-inside: avoid;
    border-right: 4px solid #93c5fd;
    padding-right: 0.5cm;
    padding-top: 0.15cm;
    padding-bottom: 0.15cm;
}
.q-header { display: flex; align-items: baseline; gap: 0.3cm; margin-bottom: 0.2cm; }
.question-number {
    display: inline-flex; align-items: center; justify-content: center;
    width: 0.7cm; height: 0.7cm;
    background: #2563eb; color: #fff;
    border-radius: 50%; font-weight: 800; font-size: 11pt;
    flex-shrink: 0;
}
.question p { margin-bottom: 0.25cm; font-size: 11.5pt; line-height: 1.8; }
.score-note { font-size: 8.5pt; color: #64748b; margin-bottom: 0.2cm; }

/* ══ MC options ══ */
.options { margin-right: 0.4cm; margin-top: 0.2cm; }
.option { margin-bottom: 0.22cm; font-size: 11pt; display: flex; align-items: baseline; gap: 0.3cm; }
.option-letter {
    font-weight: 800; color: #1e3a5f; min-width: 0.55cm; flex-shrink: 0;
}
.option-box {
    width: 0.45cm; height: 0.45cm; border: 1.5px solid #94a3b8;
    border-radius: 3px; display: inline-block; flex-shrink: 0;
}

/* ══ Answer lines ══ */
.student-line {
    border-bottom: 1px solid #94a3b8;
    height: 0.5cm;
    margin-bottom: 0.12cm;
}

/* ══ Tables ══ */
table { width: 100%; border-collapse: collapse; margin-bottom: 0.7cm; font-size: 11pt; }
th {
    background: #1e3a5f; color: #fff;
    padding: 0.25cm 0.4cm; font-weight: 700; text-align: right;
    border: 1px solid #1e3a5f;
}
td { border: 1px solid #c7d9f5; padding: 0.22cm 0.35cm; text-align: right; }
tr:nth-child(even) { background: #f0f6ff; }

/* ══ Rubric (teacher version) ══ */
.rubric { background: #f8faff; padding: 0.3cm; border-right: 3px solid #475569; margin-top: 0.2cm; font-size: 10.5pt; border-radius: 0 4px 4px 0; }
.correct { background: #dcfce7; border-right: 4px solid #16a34a; padding: 0.2cm 0.4cm; margin-top: 0.2cm; border-radius: 0 4px 4px 0; }
.criteria-list { background: #eff6ff; border-right: 4px solid #2563eb; padding: 0.2cm 0.4cm; margin-top: 0.2cm; font-size: 10.5pt; border-radius: 0 4px 4px 0; }

/* ══ Instruction line (per question type) ══ */
.instruction { font-size: 9.5pt; color: #475569; font-style: italic; margin-bottom: 0.15cm; }

@page { margin: 1.8cm; size: A4; }

/* ══ PRINT: עיצוב גרפי צבעוני — כמו במסך ══ */
@media print {
    .no-print { display: none !important; }
    body { background: white; font-size: 12.5pt; font-family: 'Rubik', 'Arial', sans-serif; }
    .page { box-shadow: none; margin: 0; padding: 0; border-radius: 0; }
    .header {
        background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%) !important;
        color: white !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .header h1 { color: white !important; }
    .exam-meta { color: #cbd5e1 !important; }
    .student-info {
        background: #f8faff !important;
        border: 1.5px solid #93c5fd !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    h2 {
        background: #e8f0fe !important;
        color: #1e3a5f !important;
        border-right: 5px solid #2563eb !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .text-block {
        background: #fafcff !important;
        border: 1.5px solid #93c5fd !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .question { border-right: 4px solid #2563eb; }
    .question-number {
        background: linear-gradient(135deg, #2563eb, #1e40af) !important;
        color: white !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    th {
        background: #1e3a5f !important;
        color: white !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    td { border: 1px solid #93c5fd; }
    tr:nth-child(even) { background: #eff6ff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sb { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page-break { page-break-before: always; }
}
"""

PRINT_SCRIPT = "<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},400)});</script>"

PRINT_BUTTON = """
<div class="no-print" style="position:fixed;top:12px;left:12px;z-index:999;display:flex;gap:8px;direction:rtl;">
  <button onclick="window.print()" style="background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff;
    border:none;padding:9px 20px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:bold;
    box-shadow:0 2px 10px rgba(37,99,235,0.35);letter-spacing:0.03em;">
    🖨 הדפס / שמור PDF
  </button>
  <button onclick="window.close()" style="background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;
    padding:9px 16px;border-radius:8px;cursor:pointer;font-size:13px;">
    סגור
  </button>
</div>
"""


def html_to_pdf(html: str) -> bytes:
    """Convert an HTML string to PDF bytes using Chrome headless.
    Returns PDF bytes if successful, or HTML bytes as fallback."""
    chrome = _find_chrome()
    if not chrome:
        return html.encode("utf-8")

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            html_path = os.path.join(tmpdir, "doc.html")
            pdf_path = os.path.join(tmpdir, "doc.pdf")

            with open(html_path, "w", encoding="utf-8") as f:
                f.write(html)

            file_url = "file:///" + html_path.replace("\\", "/")
            subprocess.run(
                [
                    chrome,
                    "--headless=new",
                    "--disable-gpu",
                    "--no-sandbox",
                    "--disable-software-rasterizer",
                    f"--print-to-pdf={pdf_path}",
                    "--print-to-pdf-no-header",
                    file_url,
                ],
                capture_output=True,
                timeout=30,
            )

            if not os.path.exists(pdf_path):
                return html.encode("utf-8")

            with open(pdf_path, "rb") as f:
                data = f.read()
            return data if data[:4] == b'%PDF' else html.encode("utf-8")

    except Exception:
        return html.encode("utf-8")


# ─── Templates ────────────────────────────────────────────────────────────────

TEXTS_TEMPLATE = """<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>חוברת טקסטים — {{ exam.title }}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>{{ style }}
/* ── Non-continuous magazine layout — שני טורים ברורים ── */
.nc-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(5cm, 0.7fr);
  gap: 0.8cm;
  direction: rtl;
  align-items: start;
}
.nc-main {
  border-right: 2px solid #c7d2fe;
  padding-right: 0.5cm;
  min-width: 0;
}
.nc-main-label { font-size: 9pt; font-weight: 800; color: #4338ca; margin-bottom: 0.25cm; }
.nc-sidebars { display: flex; flex-direction: column; gap: 0.5cm; min-width: 5cm; }
.nc-sidebars-label { font-size: 9pt; font-weight: 800; color: #4338ca; margin-bottom: 0.15cm; }

/* sidebar box base */
.sb { border-radius: 6px; padding: 0.45cm 0.5cm; font-size: 10pt; line-height: 1.7; }
.sb-title {
  font-weight: 800; font-size: 10.5pt; margin-bottom: 0.2cm;
  padding-bottom: 0.1cm; border-bottom: 1px solid rgba(0,0,0,0.12);
}
/* per-type colours (matching RAMA reading materials) */
.sb-definition { background: #eff6ff; border: 1.5px solid #3b82f6; }
.sb-definition .sb-title { color: #1d4ed8; }
.sb-fact_box   { background: #fefce8; border: 1.5px solid #eab308;
                 border-style: dashed; }
.sb-fact_box .sb-title { color: #92400e; }
.sb-news_item  { background: #fff7ed; border: 2px solid #f97316; }
.sb-news_item .sb-title { color: #c2410c; font-style: italic; }
.sb-editorial  { background: #f5f3ff; border: 1.5px solid #8b5cf6; }
.sb-editorial .sb-title { color: #5b21b6; }
.sb-survey     { background: #f0fdf4; border: 1.5px solid #22c55e; }
.sb-survey .sb-title { color: #15803d; }
.sb-example    { background: #f0fdfa; border: 1.5px solid #0d9488; }
.sb-example .sb-title { color: #0f766e; }
.sb-diary      { background: #fff1f2; border: 1.5px solid #f43f5e; font-style: italic; }
.sb-diary .sb-title { color: #9f1239; }
.sb-list       { background: #ecfeff; border: 1.5px solid #06b6d4; }
.sb-list .sb-title { color: #155e75; }
.sb-knowledge_link { background: #eef2ff; border: 1.5px solid #6366f1; }
.sb-knowledge_link .sb-title { color: #3730a3; }
  </style>
</head>
<body>
{{ print_button }}
<div class="page">
<div class="header">
  <h1>חוברת טקסטים</h1>
  <div class="exam-meta">{{ exam.title }} | {{ grade_label }}</div>
</div>

{% for text in texts %}
<div class="text-block">
  <h2>{{ text.title }}</h2>
  <br>
  {% if text.content.startswith('{"__nc":') %}
    {% set nc = text.content | parse_nc %}
    <div class="nc-layout">
      <div class="nc-main">
        <div class="nc-main-label">📄 כתבה מרכזית</div>
        {% for paragraph in nc.main.split('\n\n') %}
        <p>{{ paragraph }}</p>
        {% endfor %}
      </div>
      <div class="nc-sidebars">
        <div class="nc-sidebars-label">📦 רכיבים נלווים</div>
        {% for sb in nc.sidebars %}
        <div class="sb sb-{{ sb.type }}">
          <div class="sb-title">{{ sb.title }}</div>
          {% for p in sb.content.split('\n\n') %}<p style="margin-bottom:0.15cm">{{ p }}</p>{% endfor %}
        </div>
        {% endfor %}
      </div>
    </div>
  {% else %}
    {% for paragraph in text.content.split('\n\n') %}
    <p>{{ paragraph }}</p>
    {% endfor %}
  {% endif %}
</div>
{% if not loop.last %}<div class="page-break"></div>{% endif %}
{% endfor %}
</div>
{{ print_script }}
</body>
</html>
"""

QUESTIONS_TEMPLATE = """<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>חוברת שאלות — {{ exam.title }}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>{{ style }}</style>
</head>
<body>
{{ print_button }}
<div class="page">

<div class="header">
  <h1>הבנת הנקרא</h1>
  <div class="exam-meta">{{ exam.title }} &nbsp;|&nbsp; {{ grade_label }}</div>
</div>

<div class="student-info">
  <span>שם: _____________</span>
  <span>כיתה: _____</span>
  <span>תאריך: _____</span>
</div>

{% for text in texts %}
<h2>✦ טקסט {{ loop.index }}: {{ text.title }}</h2>
{% set text_questions = questions | selectattr('text_id', 'equalto', text.id) | list %}
{% for q in text_questions | sort(attribute='sequence_number') %}
<div class="question">
  <div class="q-header">
    <span class="question-number">{{ q.sequence_number }}</span>
    <p style="margin:0;font-weight:600;">{{ q.content.stem }}</p>
  </div>

  {% if q.format == 'MC' and q.content.options %}
  <p class="instruction">סמנו את התשובה הנכונה:</p>
  <div class="options">
    {% set heb_letters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו'] %}
    {% for opt in q.content.options %}
    <div class="option">
      <span class="option-letter">{{ heb_letters[loop.index0] if loop.index0 < heb_letters|length else loop.index }}.</span>
      &nbsp;{{ opt }}
    </div>
    {% endfor %}
  </div>

  {% elif q.format in ('OPEN', 'VOCAB') %}
  <div style="margin-top:0.2cm">
    {% set pts = q.score_points | int %}
    {% set answer_lines = ((q.rubric.get('answer_lines') if q.rubric and q.rubric.get('answer_lines')) or (1 if pts <= 2 else (2 if pts <= 4 else 3))) %}
    {% for i in range(answer_lines) %}
    <div class="student-line"></div>
    {% endfor %}
  </div>

  {% elif q.format == 'TABLE' %}
  <table>
    {% if q.content and q.content.get('table_headers') %}
    <tr>{% for h in (q.content.table_headers or []) %}<th>{{ h }}</th>{% endfor %}</tr>
    {% endif %}
    {% for row in (q.content.get('table_rows') or [] if q.content else []) %}
    <tr>{% for cell in (row or []) %}<td>{{ cell }}</td>{% endfor %}</tr>
    {% endfor %}
  </table>

  {% elif q.format == 'SEQUENCE' %}
  <p class="instruction">כתבו מספר ליד כל אירוע לפי הסדר הנכון:</p>
  <div style="margin-right:0.8cm;margin-top:0.25cm;line-height:2.2">
    {% for item in (q.content.get('items') or [] if q.content else []) %}
    <div>___ &nbsp; {{ item }}</div>
    {% endfor %}
  </div>

  {% elif q.format == 'TRUE_FALSE' %}
  <p class="instruction">סמנו נ (נכון) או ל (לא נכון). כשהיגד שגוי — תקנו אותו:</p>
  <table style="margin-top:0.25cm;width:100%">
    <tr>
      <th style="width:58%">היגד</th>
      <th style="width:1.3cm;text-align:center">נ</th>
      <th style="width:1.3cm;text-align:center">ל</th>
      <th>תיקון</th>
    </tr>
    {% for stmt in (q.content.get('statements') or [] if q.content else []) %}
    {% set stmt_text = stmt.text if stmt is mapping else stmt %}
    <tr>
      <td>{{ stmt_text }}</td>
      <td style="text-align:center">☐</td>
      <td style="text-align:center">☐</td>
      <td>&nbsp;</td>
    </tr>
    {% endfor %}
  </table>
  {% endif %}
  <p class="score-note" style="text-align:left;margin-top:0.15cm;">({{ q.score_points }} נקודות)</p>
</div>
{% endfor %}
{% if not loop.last %}<div class="page-break"></div>{% endif %}
{% endfor %}

{% set cross_questions = questions | selectattr('is_cross_text') | list %}
{% if cross_questions %}
<div class="page-break"></div>
<h2>✦ שאלות על שני הטקסטים</h2>
{% for q in cross_questions %}
<div class="question">
  <div class="q-header">
    <span class="question-number">{{ q.sequence_number }}</span>
    <p style="margin:0;font-weight:600;">{{ q.content.stem if q.content else '' }}</p>
  </div>
  <p class="score-note">({{ q.score_points }} נקודות)</p>
  <div style="margin-top:0.2cm">
    {% set pts = q.score_points | int %}
    {% set cross_lines = ((q.rubric.get('answer_lines') if q.rubric and q.rubric.get('answer_lines')) or (2 if pts <= 3 else 3)) %}
    {% for i in range(cross_lines) %}
    <div class="student-line"></div>
    {% endfor %}
  </div>
</div>
{% endfor %}
{% endif %}

</div>
{{ print_script }}
</body>
</html>
"""

RUBRIC_TEMPLATE = """<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>מחוון — {{ exam.title }}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>{{ style }}</style>
</head>
<body>
{{ print_button }}
<div class="page">
<div class="header">
  <h1>מחוון בדיקה</h1>
  <div class="exam-meta">{{ exam.title }} | סודי — לשימוש מורים בלבד</div>
</div>

{% for text in texts %}
<h2>טקסט {{ loop.index }}: {{ text.title }}</h2>
{% set text_questions = questions | selectattr('text_id', 'equalto', text.id) | list %}
{% for q in text_questions | sort(attribute='sequence_number') %}
<div class="question">
  <h3>שאלה {{ q.sequence_number }} <span class="dim-badge dim-{{ q.dimension }}">(ממד {{ q.dimension }})</span></h3>
  <p><strong>שאלה:</strong> {{ q.content.stem if q.content else '' }}</p>
  {% if q.format == 'MC' %}
  <p><strong>תשובה נכונה:</strong> {{ q.content.correct_answer if q.content else '' }}</p>
  {% if q.content and q.content.get('distractor_rationale') %}
  <p style="font-size:9.5pt;color:#555"><em>הסחות: {% for k,v in (q.content.distractor_rationale or {}).items() %}{{ k }}: {{ v }}; {% endfor %}</em></p>
  {% endif %}
  {% elif q.format == 'TRUE_FALSE' %}
  <div class="rubric">
    {% if q.content and q.content.get('statements') %}
    <p><strong>היגדים ותשובות:</strong></p>
    <table style="width:100%;font-size:9.5pt">
      <tr><th>היגד</th><th style="width:1.5cm;text-align:center">V/X</th><th>תיקון</th></tr>
      {% for stmt in (q.content.statements or []) %}
      {% set stmt_text = stmt.text if stmt is mapping else stmt %}
      {% set stmt_correct = stmt.correct if stmt is mapping else None %}
      <tr>
        <td>{{ stmt_text }}</td>
        <td style="text-align:center;font-weight:bold">{{ 'V' if stmt_correct == true else ('X' if stmt_correct == false else '—') }}</td>
        <td style="color:#555;font-size:9pt">{{ stmt.correction if stmt is mapping and stmt.correction else ('—' if stmt_correct else '') }}</td>
      </tr>
      {% endfor %}
    </table>
    {% endif %}
    {% if q.rubric and q.rubric.get('partial_credit') %}
    <p style="margin-top:0.2cm"><strong>ניקוד חלקי:</strong> {{ q.rubric.partial_credit }}</p>
    {% endif %}
  </div>
  {% else %}
  <div class="rubric">
    <p><strong>קריטריונים לניקוד מלא ({{ q.score_points }} נקודות):</strong></p>
    <ul style="margin-right:1cm;margin-top:0.2cm">{% for c in ((q.rubric.get('criteria') or []) if q.rubric else []) %}<li>{{ c }}</li>{% endfor %}</ul>
    {% if q.rubric and q.rubric.get('partial_credit') %}
    <p style="margin-top:0.2cm"><strong>ניקוד חלקי:</strong> {{ q.rubric.partial_credit }}</p>
    {% endif %}
    {% if q.rubric and q.rubric.get('sample_answer') %}
    <p style="margin-top:0.2cm"><strong>תשובה אפשרית:</strong> {{ q.rubric.sample_answer }}</p>
    {% endif %}
  </div>
  {% endif %}
</div>
{% endfor %}
{% if not loop.last %}<div class="page-break"></div>{% endif %}
{% endfor %}
</div>
{{ print_script }}
</body>
</html>
"""

SPEC_TEMPLATE = """<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>מפרט ודוח פרמטרים — {{ exam.title }}</title>
  <style>{{ style }}</style>
</head>
<body>
{{ print_button }}
<div class="page">
<div class="header">
  <h1>מפרט ודוח פרמטרים</h1>
  <div class="exam-meta">{{ exam.title }} | {{ grade_label }} | סודי — לשימוש מורים בלבד</div>
</div>

<h2>פרופיל המבחן</h2>
<table>
  <tr><th>פרמטר</th><th>ערך</th></tr>
  <tr><td>אשכול כיתות</td><td>{{ grade_label }}</td></tr>
  <tr><td>סה"כ שאלות</td><td>{{ questions | length }}</td></tr>
  <tr><td>סה"כ ניקוד</td><td>{{ questions | sum(attribute='score_points') }}</td></tr>
</table>

<h2>טבלת מפרט</h2>
<table>
  <tr>
    <th>#</th><th>טקסט</th><th>ממד</th><th>פורמט</th><th>ניקוד</th><th>עיגון בטקסט</th>
  </tr>
  {% for entry in spec_entries %}
  <tr>
    <td>{{ loop.index }}</td>
    <td>{{ 'נרטיבי' if entry.text_type == 'narrative' else 'מידעי' }}</td>
    <td><span class="dim-badge dim-{{ entry.dimension }}">{{ entry.dimension }}</span></td>
    <td>{% if entry.format == 'MC' %}שאלת רב-ברירה{% elif entry.format == 'OPEN' %}שאלה פתוחה{% elif entry.format == 'TABLE' %}מילוי טבלה{% elif entry.format == 'FILL' %}השלמה{% elif entry.format == 'SEQUENCE' %}מיון/סדרה{% elif entry.format == 'TRUE_FALSE' %}נכון/לא נכון{% elif entry.format == 'VOCAB' %}אוצר מילים{% else %}{{ entry.format }}{% endif %}</td>
    <td>{{ entry.score }}</td>
    <td style="font-size:9.5pt">{{ entry.text_reference }}</td>
  </tr>
  {% endfor %}
</table>

<h2>התפלגות לפי ממד</h2>
{% set dim_data = {
  'A': {'name': 'הבנה גלויה — איתור', 'skills': 'איתור פרטים, זיהוי עובדות, אתר מידע מפורש'},
  'B': {'name': 'הבנה משתמעת — הסקה', 'skills': 'הסקת מסקנות, יחסי סיבה-תוצאה, הבנת מניעים'},
  'C': {'name': 'פרשנות ויישום', 'skills': 'גיבוש עמדה, אפיון דמויות, השוואה, מיזוג מידע'},
  'D': {'name': 'הערכה ביקורתית', 'skills': 'ניתוח אמצעים ספרותיים, הערכת בחירות הכותב'}
} %}
{% set total_score = questions | sum(attribute='score_points') %}
<table>
  <tr><th>ממד</th><th>שם</th><th>שאלות</th><th>ניקוד</th><th>אחוז</th><th>מיומנויות</th></tr>
  {% for dim in ['A', 'B', 'C', 'D'] %}
  {% set dim_qs = questions | selectattr('dimension', 'equalto', dim) | list %}
  {% set dim_score = dim_qs | sum(attribute='score_points') %}
  <tr>
    <td><span class="dim-badge dim-{{ dim }}">ממד {{ dim }}</span></td>
    <td>{{ dim_data[dim]['name'] }}</td>
    <td>{{ dim_qs | length }}</td>
    <td>{{ dim_score }}</td>
    <td>{{ ((dim_score / total_score * 100) | round(1)) if total_score > 0 else 0 }}%</td>
    <td style="font-size:9.5pt">{{ dim_data[dim]['skills'] }}</td>
  </tr>
  {% endfor %}
</table>

<h2>התפלגות פורמטי שאלות</h2>
{% set fmt_data = {
  'MC': 'שאלת רב-ברירה', 'OPEN': 'שאלה פתוחה', 'TABLE': 'מילוי טבלה',
  'FILL': 'השלמה', 'SEQUENCE': 'מיון/סדרה', 'TRUE_FALSE': 'נכון/לא נכון', 'VOCAB': 'אוצר מילים'
} %}
<table>
  <tr><th>פורמט</th><th>תיאור</th><th>מספר שאלות</th></tr>
  {% for fmt in ['MC', 'OPEN', 'TABLE', 'FILL', 'SEQUENCE', 'TRUE_FALSE', 'VOCAB'] %}
  {% set fmt_qs = questions | selectattr('format', 'equalto', fmt) | list %}
  {% if fmt_qs | length > 0 %}
  <tr><td>{{ fmt }}</td><td>{{ fmt_data[fmt] }}</td><td>{{ fmt_qs | length }}</td></tr>
  {% endif %}
  {% endfor %}
</table>

</div>
{{ print_script }}
</body>
</html>
"""

PARAMS_REPORT_TEMPLATE = """<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>דוח פרמטרים — {{ exam.title }}</title>
  <style>{{ style }}</style>
</head>
<body>
{{ print_button }}
<div class="page">
<div class="header">
  <h1>דוח פרמטרים</h1>
  <div class="exam-meta">{{ exam.title }} | {{ grade_label }} | סודי — לשימוש מורים בלבד</div>
</div>

<h2>פרופיל המבחן</h2>
<table>
  <tr><th>פרמטר</th><th>ערך</th></tr>
  <tr><td>אשכול כיתות</td><td>{{ grade_label }}</td></tr>
  <tr><td>סה"כ שאלות</td><td>{{ questions | length }}</td></tr>
  <tr><td>סה"כ ניקוד</td><td>{{ questions | sum(attribute='score_points') }}</td></tr>
</table>

<h2>התפלגות לפי ממד</h2>
{% set dim_data = {
  'A': {'name': 'הבנה גלויה — איתור', 'skills': 'איתור פרטים, זיהוי עובדות, אתר מידע מפורש'},
  'B': {'name': 'הבנה משתמעת — הסקה', 'skills': 'הסקת מסקנות, יחסי סיבה-תוצאה, הבנת מניעים'},
  'C': {'name': 'פרשנות ויישום', 'skills': 'גיבוש עמדה, אפיון דמויות, השוואה, מיזוג מידע'},
  'D': {'name': 'הערכה ביקורתית', 'skills': 'ניתוח אמצעים ספרותיים, הערכת בחירות הכותב'}
} %}
{% set total_score = questions | sum(attribute='score_points') %}
<table>
  <tr><th>ממד</th><th>שם</th><th>שאלות</th><th>ניקוד</th><th>אחוז</th><th>מיומנויות</th></tr>
  {% for dim in ['A', 'B', 'C', 'D'] %}
  {% set dim_qs = questions | selectattr('dimension', 'equalto', dim) | list %}
  {% set dim_score = dim_qs | sum(attribute='score_points') %}
  <tr>
    <td><span class="dim-badge dim-{{ dim }}">ממד {{ dim }}</span></td>
    <td>{{ dim_data[dim]['name'] }}</td>
    <td>{{ dim_qs | length }}</td>
    <td>{{ dim_score }}</td>
    <td>{{ ((dim_score / total_score * 100) | round(1)) if total_score > 0 else 0 }}%</td>
    <td style="font-size:9.5pt">{{ dim_data[dim]['skills'] }}</td>
  </tr>
  {% endfor %}
</table>

<h2>התפלגות פורמטי שאלות</h2>
{% set fmt_data = {
  'MC': 'שאלת רב-ברירה', 'OPEN': 'שאלה פתוחה', 'TABLE': 'מילוי טבלה',
  'FILL': 'השלמה', 'SEQUENCE': 'מיון/סדרה', 'TRUE_FALSE': 'נכון/לא נכון', 'VOCAB': 'אוצר מילים'
} %}
<table>
  <tr><th>פורמט</th><th>תיאור</th><th>מספר שאלות</th></tr>
  {% for fmt in ['MC', 'OPEN', 'TABLE', 'FILL', 'SEQUENCE', 'TRUE_FALSE', 'VOCAB'] %}
  {% set fmt_qs = questions | selectattr('format', 'equalto', fmt) | list %}
  {% if fmt_qs | length > 0 %}
  <tr><td>{{ fmt }}</td><td>{{ fmt_data[fmt] }}</td><td>{{ fmt_qs | length }}</td></tr>
  {% endif %}
  {% endfor %}
</table>
</div>
{{ print_script }}
</body>
</html>
"""

TEACHER_VERSION_TEMPLATE = """<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>גרסת מורה — {{ exam.title }}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>{{ style }}
.nc-layout { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(5cm, 0.7fr); gap: 0.8cm; direction: rtl; align-items: start; }
.nc-main { border-right: 2px solid #c7d2fe; padding-right: 0.5cm; min-width: 0; }
.nc-main-label { font-size: 9pt; font-weight: 800; color: #4338ca; margin-bottom: 0.25cm; }
.nc-sidebars { display: flex; flex-direction: column; gap: 0.5cm; min-width: 5cm; }
.nc-sidebars-label { font-size: 9pt; font-weight: 800; color: #4338ca; margin-bottom: 0.15cm; }
.sb { border-radius: 6px; padding: 0.45cm 0.5cm; font-size: 10pt; line-height: 1.7; }
.sb-title { font-weight: 800; font-size: 10.5pt; margin-bottom: 0.2cm; padding-bottom: 0.1cm; border-bottom: 1px solid rgba(0,0,0,0.12); }
.sb-definition { background: #eff6ff; border: 1.5px solid #3b82f6; }
.sb-definition .sb-title { color: #1d4ed8; }
.sb-fact_box { background: #fefce8; border: 1.5px dashed #eab308; }
.sb-fact_box .sb-title { color: #92400e; }
.sb-news_item { background: #fff7ed; border: 2px solid #f97316; }
.sb-news_item .sb-title { color: #c2410c; }
.sb-editorial { background: #f5f3ff; border: 1.5px solid #8b5cf6; }
.sb-editorial .sb-title { color: #5b21b6; }
.sb-survey { background: #f0fdf4; border: 1.5px solid #22c55e; }
.sb-survey .sb-title { color: #15803d; }
.sb-diary { background: #fff1f2; border: 1.5px solid #f43f5e; font-style: italic; }
.sb-diary .sb-title { color: #9f1239; }
.sb-list { background: #ecfeff; border: 1.5px solid #06b6d4; }
.sb-list .sb-title { color: #155e75; }
.sb-knowledge_link { background: #eef2ff; border: 1.5px solid #6366f1; }
.sb-knowledge_link .sb-title { color: #3730a3; }
.sb-example { background: #f0fdfa; border: 1.5px solid #0d9488; }
.sb-example .sb-title { color: #0f766e; }
  </style>
</head>
<body>
{{ print_button }}
<div class="page">
<div class="header">
  <h1>גרסת מורה — מבחן מלא עם תשובות</h1>
  <div class="exam-meta">{{ exam.title }} | {{ grade_label }} | סודי — לשימוש מורים בלבד</div>
</div>

{% for text in texts %}
<div class="text-block">
  <h2>טקסט {{ loop.index }}: {{ 'נרטיבי' if text.text_type == 'narrative' else 'מידעי' }} — {{ text.title }}</h2>
  <div class="exam-meta">{{ text.word_count }} מילים</div>
  <br>
  {% if text.content.startswith('{"__nc":') %}
    {% set nc = text.content | parse_nc %}
    <div class="nc-layout">
      <div class="nc-main">
        <div class="nc-main-label">📄 כתבה מרכזית</div>
        {% for paragraph in nc.main.split('\n\n') %}
        <p>{{ paragraph }}</p>
        {% endfor %}
      </div>
      <div class="nc-sidebars">
        <div class="nc-sidebars-label">📦 רכיבים נלווים</div>
        {% for sb in nc.sidebars %}
        <div class="sb sb-{{ sb.type }}">
          <div class="sb-title">{{ sb.title }}</div>
          {% for p in sb.content.split('\n\n') %}<p style="margin-bottom:0.15cm">{{ p }}</p>{% endfor %}
        </div>
        {% endfor %}
      </div>
    </div>
  {% else %}
    {% for paragraph in text.content.split('\n\n') %}
    <p>{{ paragraph }}</p>
    {% endfor %}
  {% endif %}
</div>

<div class="page-break"></div>
<h2>שאלות על הטקסט: {{ text.title }}</h2>
{% set text_questions = questions | selectattr('text_id', 'equalto', text.id) | list %}
{% for q in text_questions | sort(attribute='sequence_number') %}
<div class="question">
  {% set format_labels = {'MC': 'רב-ברירה', 'OPEN': 'פתוחה', 'TABLE': 'טבלה', 'TRUE_FALSE': 'נכון/לא נכון', 'SEQUENCE': 'סדר נכון', 'FILL': 'השלמה', 'VOCAB': 'אוצר מילים'} %}
  <h3>שאלה {{ q.sequence_number }}
    <span class="dim-badge dim-{{ q.dimension }}">(ממד {{ q.dimension }})</span>
    <span style="font-size:9.5pt;color:#555">[{{ q.score_points }} נקודות | {{ format_labels.get(q.format, q.format) }}]</span>
  </h3>
  <p>{{ q.content.stem if q.content else '' }}</p>
  {% if q.format == 'MC' and q.content and q.content.options %}
  <div class="options">
    {% set heb_letters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו'] %}
    {% for opt in (q.content.options or []) %}
    <div class="option {% if opt == q.content.correct_answer %}correct{% endif %}">
      <span class="option-letter">{{ heb_letters[loop.index0] if loop.index0 < heb_letters|length else loop.index }}.</span>
      &nbsp;{{ opt }} {% if opt == q.content.correct_answer %} ✓{% endif %}
    </div>
    {% endfor %}
  </div>
  {% if q.content and q.content.get('distractor_rationale') %}
  <div class="criteria-list">
    <strong>הסחות:</strong>
    {% for k,v in (q.content.distractor_rationale or {}).items() %}{{ k }}: {{ v }}; {% endfor %}
  </div>
  {% endif %}
  {% else %}
  <div class="criteria-list">
    <strong>קריטריונים לניקוד ({{ q.score_points }} נקודות):</strong>
    <ul style="margin-right:1cm;margin-top:0.2cm">{% for c in ((q.rubric.get('criteria') or []) if q.rubric else []) %}<li>{{ c }}</li>{% endfor %}</ul>
    {% if q.rubric and q.rubric.get('partial_credit') %}
    <p><strong>ניקוד חלקי:</strong> {{ q.rubric.partial_credit }}</p>
    {% endif %}
    {% if q.rubric and q.rubric.get('sample_answer') %}
    <div class="correct"><strong>תשובה אפשרית:</strong> {{ q.rubric.sample_answer }}</div>
    {% endif %}
  </div>
  {% endif %}
</div>
{% endfor %}
{% if not loop.last %}<div class="page-break"></div>{% endif %}
{% endfor %}

{% set cross_questions = questions | selectattr('is_cross_text') | list %}
{% if cross_questions %}
<div class="page-break"></div>
<h2>שאלות משולבות — שני הטקסטים</h2>
{% for q in cross_questions %}
<div class="question">
  <h3>שאלה {{ q.sequence_number }}
    <span class="dim-badge dim-{{ q.dimension }}">(ממד {{ q.dimension }})</span>
  </h3>
  <p>{{ q.content.stem if q.content else '' }}</p>
  <div class="criteria-list">
    <strong>קריטריונים:</strong>
    <ul style="margin-right:1cm;margin-top:0.2cm">{% for c in ((q.rubric.get('criteria') or []) if q.rubric else []) %}<li>{{ c }}</li>{% endfor %}</ul>
    {% if q.rubric and q.rubric.get('sample_answer') %}
    <div class="correct" style="margin-top:0.2cm"><strong>תשובה אפשרית:</strong> {{ q.rubric.sample_answer }}</div>
    {% endif %}
  </div>
</div>
{% endfor %}
{% endif %}
</div>
{{ print_script }}
</body>
</html>
"""


# ─── Render helpers ────────────────────────────────────────────────────────────

def _parse_nc(content: str) -> dict:
    """Parse non-continuous JSON content; return dict with 'main' and 'sidebars'."""
    try:
        import json as _json
        data = _json.loads(content)
        return {"main": data.get("main", ""), "sidebars": data.get("sidebars", [])}
    except Exception:
        return {"main": content, "sidebars": []}


def _render(template_str: str, **context) -> str:
    env = Environment(loader=DictLoader({"t": template_str}))
    env.filters["parse_nc"] = _parse_nc
    return env.get_template("t").render(
        style=BASE_STYLE,
        print_script=PRINT_SCRIPT,
        print_button=PRINT_BUTTON,
        **context,
    )


# ─── Public builders (return HTML string) ─────────────────────────────────────

def build_texts_pdf(exam, texts) -> str:
    return _render(TEXTS_TEMPLATE, exam=exam, texts=texts,
                   grade_label=_grade_label(exam.grade_cluster))


def build_questions_pdf(exam, texts, questions) -> str:
    return _render(QUESTIONS_TEMPLATE, exam=exam, texts=texts, questions=questions,
                   grade_label=_grade_label(exam.grade_cluster))


def build_rubric_pdf(exam, texts, questions) -> str:
    return _render(RUBRIC_TEMPLATE, exam=exam, texts=texts, questions=questions,
                   grade_label=_grade_label(exam.grade_cluster))


def build_spec_pdf(exam, spec_entries, questions=None) -> str:
    return _render(SPEC_TEMPLATE, exam=exam, spec_entries=spec_entries,
                   questions=questions or [],
                   grade_label=_grade_label(exam.grade_cluster))


def build_params_report_pdf(exam, questions, spec_entries) -> str:
    return _render(PARAMS_REPORT_TEMPLATE, exam=exam, questions=questions,
                   spec_entries=spec_entries,
                   grade_label=_grade_label(exam.grade_cluster))


def build_teacher_version_pdf(exam, texts, questions) -> str:
    return _render(TEACHER_VERSION_TEMPLATE, exam=exam, texts=texts, questions=questions,
                   grade_label=_grade_label(exam.grade_cluster))
