import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { examsApi } from '../../api/exams'
import { Card, Button, WorkflowSteps } from '../../components/ui'
import { ArrowRight } from 'lucide-react'
import { getTopicsForCluster } from '../../data/topicOptions'

const BIOGRAPHICAL_FIGURES: Record<string, { name: string; desc: string }[]> = {
  // כיתות ג'–ד': דמויות מעוררות השראה — מתאימות לגיל 8–10, מעיתוני ילדים
  '3-4': [
    { name: 'אילן רמון', desc: 'האסטרונאוט הישראלי הראשון — גיבור שטס לחלל (1954–2003)' },
    { name: 'לואי ברייל', desc: 'המציא את שיטת הכתב לעיוורים כשהיה בן 15 בלבד (1809–1852)' },
    { name: 'ג\'יין גודול', desc: 'חוקרת טבע שחיה בין השימפנזים ביערות אפריקה (נולדה 1934)' },
    { name: 'סימון ביילס', desc: 'הגימנסטית האולימפית הגדולה — סמל לאומץ והתמדה (נולדה 2001)' },
    { name: 'לאה גולדברג', desc: 'משוררת ישראלית אהובה שכתבה שירים לילדים (1911–1970)' },
    { name: 'נעמי שמר', desc: 'משוררת ומלחינה שכתבה את "ירושלים של זהב" (1930–2004)' },
    { name: 'הנרייטה סאלד', desc: 'ייסדה את עליית הנוער והצילה אלפי ילדים יהודים (1860–1945)' },
    { name: 'מרי קירי', desc: 'מדענית שזכתה בפרס נובל פעמיים — גילתה יסודות חדשים (1867–1934)' },
    { name: 'אישיות אחרת — כתבי שם', desc: '' },
  ],
  // כיתות ה'–ו': דמויות מנהיגות, מדע, פריצת דרך — ישראליות ועולמיות
  '5-6': [
    { name: 'עדה יונת', desc: 'מדענית ישראלית, זוכת פרס נובל לכימיה — הישראלית הראשונה (נולדה 1939)' },
    { name: 'גולדה מאיר', desc: 'ראשת הממשלה הישראלית הראשונה — ממהגרת ענייה למנהיגות (1898–1978)' },
    { name: 'חנה סנש', desc: 'לוחמת, מחנכת ומשוררת שנפלה בשליחות הצלת יהודי אירופה (1921–1944)' },
    { name: 'מלאלה יוסף זאי', desc: 'נלחמה לזכות הבנות לחינוך — זוכת נובל הצעירה בהיסטוריה (נולדה 1997)' },
    { name: 'נלסון מנדלה', desc: 'נאבק נגד האפרטהייד ויצא לנשיא דרום אפריקה (1918–2013)' },
    { name: 'ג\'יין גודול', desc: 'חוקרת שחיה בין שימפנזים ביערות אפריקה (נולדה 1934)' },
    { name: 'פרידה קאלו', desc: 'ציירת מקסיקנית — סמל של כוח, זהות ויצירה למרות כאב (1907–1954)' },
    { name: 'לודוויג ואן בטהובן', desc: 'מלחין שהמשיך להלחין אחרי שאיבד את שמיעתו (1770–1827)' },
    { name: 'אילן רמון', desc: 'האסטרונאוט הישראלי הראשון שעלה לחלל (1954–2003)' },
    { name: 'אישיות אחרת — כתבי שם', desc: '' },
  ],
  // כיתות ז'–ט': דמויות עם עומק היסטורי, מוסרי ואינטלקטואלי
  '7-9': [
    { name: 'גולדה מאיר', desc: 'ראשת הממשלה הישראלית הראשונה — ממהגרת ענייה למנהיגות (1898–1978)' },
    { name: 'חנה ארנדט', desc: 'פילוסופית שחקרה את השואה, הרוע הבנאלי ומהות הכוח (1906–1975)' },
    { name: 'דוד בן גוריון', desc: 'מייסד מדינת ישראל — חוזן שהפך חלום למציאות (1886–1973)' },
    { name: 'ראול ולנברג', desc: 'דיפלומט שוודי שהציל עשרות אלפי יהודים בשואה (1912–1947)' },
    { name: 'מרטין לותר קינג', desc: 'מנהיג זכויות אדם שנאבק בגזענות בנשק של מילים (1929–1968)' },
    { name: 'גרטה טונברג', desc: 'פעילת אקלים שבגיל 15 הניעה תנועת נוער עולמית (נולדה 2003)' },
    { name: 'מרי קירי', desc: 'חלוצת המדע — הראשונה שזכתה בנובל בשני תחומים (1867–1934)' },
    { name: 'מאיה אנג\'לו', desc: 'משוררת ופעילת זכויות אדם — כוח, כבוד ושרידות (1928–2014)' },
    { name: 'שמעון פרס', desc: 'מדינאי ישראלי שנלחם לשלום וזכה בנובל (1923–2016)' },
    { name: 'סטיבן הוקינג', desc: 'פיזיקאי שחקר את היקום למרות שיתוק מוחלט (1942–2018)' },
    { name: 'אלברט איינשטיין', desc: 'פיזיקאי גאון ששינה את תפיסת הזמן והמרחב (1879–1955)' },
    { name: 'אישיות אחרת — כתבי שם', desc: '' },
  ],
}

// ערכים — שפה מקצועית בתחום האוריינות והחינוך
const VALUES_BY_CLUSTER: Record<string, string[]> = {
  '3-4': [
    'חברות ונאמנות', 'עזרה הדדית', 'שיתוף פעולה', 'הכלה ואחדות',
    'כבוד לזולת', 'קבלת השונה', 'חמלה ואמפתיה',
    'אומץ והתמדה', 'כנות ויושר', 'התמדה ואי-ויתור',
    'ביטחון עצמי', 'חיוביות', 'אופטימיות', 'צניעות',
    'סקרנות אינטלקטואלית', 'יצירתיות', 'אמינות',
    'שמירה על הסביבה', 'נדיבות',
    'הגינות', 'אחריות אישית', 'תקווה',
  ],
  '5-6': [
    'מנהיגות ואחריות', 'שיתוף פעולה', 'ערבות הדדית', 'צדק והגינות',
    'שוויון הזדמנויות', 'הכלה ואחדות', 'כבוד לשונה', 'סובלנות',
    'אמפתיה ורגישות', 'חמלה מעשית',
    'חוסן ועמידות', 'ביטחון עצמי', 'אומץ מוסרי', 'נאמנות לעצמי',
    'התמדה והתגברות על קשיים', 'מחויבות ערכית', 'נדיבות',
    'סקרנות מדעית', 'חדשנות ויזמות', 'יצירתיות',
    'יושר ושקיפות', 'חשיבה ביקורתית',
    'אחריות סביבתית', 'שמירת הטבע', 'אחריות לדורות הבאים',
    'תקווה', 'זהות ומשמעות',
  ],
  '7-9': [
    'צדק חברתי', 'זכויות אדם', 'שוויון ושוויוניות', 'פלורליזם',
    'חירות ואחריות', 'דמוקרטיה וחוק', 'ערבות הדדית', 'שלום ופיוס',
    'כבוד לשונה', 'נגד גזענות ושנאה', 'אמפתיה וחמלה',
    'מנהיגות ערכית', 'אומץ מוסרי', 'יושר ושקיפות',
    'אחריות אישית וחברתית', 'נאמנות לעצמי', 'חוסן נפשי',
    'חשיבה ביקורתית', 'חקר ובדיקת עובדות', 'סקרנות אינטלקטואלית',
    'חדשנות ויצירתיות',
    'אחריות סביבתית', 'קיימות ועתיד הפלנטה',
    'תקווה', 'זהות ומשמעות', 'זיכרון ומורשת',
  ],
}

const GRADES = [
  { value: 'ג', cluster: '3-4', desc: 'כיתה ג׳ — 400–600 מ׳ נרטיבי | 330–460 מ׳ מידעי' },
  { value: 'ד', cluster: '3-4', desc: 'כיתה ד׳ — 400–600 מ׳ נרטיבי | 330–460 מ׳ מידעי' },
  { value: 'ה', cluster: '5-6', desc: 'כיתה ה׳ — 480–680 מ׳ נרטיבי | 400–560 מ׳ מידעי' },
  { value: 'ו', cluster: '5-6', desc: 'כיתה ו׳ — 480–680 מ׳ נרטיבי | 400–560 מ׳ מידעי' },
  { value: 'ז', cluster: '7-9', desc: 'כיתה ז׳ — 560–800 מ׳ נרטיבי | 480–680 מ׳ מידעי' },
  { value: 'ח', cluster: '7-9', desc: 'כיתה ח׳ — 560–800 מ׳ נרטיבי | 480–680 מ׳ מידעי' },
  { value: 'ט', cluster: '7-9', desc: 'כיתה ט׳ — 560–800 מ׳ נרטיבי | 480–680 מ׳ מידעי' },
]

const EXAM_TIMING_OPTIONS = [
  { value: 'תחילת שנה', label: 'תחילת שנה' },
  { value: 'אמצע שנה', label: 'אמצע שנה' },
  { value: 'סוף שנה', label: 'סוף שנה' },
]

export default function NewExam() {
  const navigate = useNavigate()
  const SIDEBAR_OPTIONS = [
    { key: 'definition', label: 'הגדרה מילונית', icon: '📖', desc: 'מונח מרכזי מוגדר בתמציתיות' },
    { key: 'editorial', label: 'עמדה', icon: '✍️', desc: 'דעה/עמדה קצרה הקשורה לנושא' },
    { key: 'news_item', label: 'כתבה חדשותית', icon: '📰', desc: 'ידיעה עיתונאית קצרה ועדכנית' },
    { key: 'survey', label: 'סקר דעות', icon: '📊', desc: 'שאלה עם אחוזי תשובות' },
    { key: 'example', label: 'הדגמה', icon: '💡', desc: 'דוגמה ממשית מפורטת' },
    { key: 'fact_box', label: 'תיבת עובדות', icon: '⭐', desc: 'עובדות משלימות ומרחיבות' },
    { key: 'diary', label: 'קטע מיומן', icon: '📔', desc: 'קטע אישי מיומן או מכתב הקשור לנושא' },
    { key: 'list', label: 'רשימה', icon: '📋', desc: 'רשימה ממוספרת/תמציתית של נקודות מרכזיות' },
    { key: 'knowledge_link', label: 'קשר לתחום דעת', icon: '🔗', desc: 'הרחבה/קישור לנושא אחר בתחום הדעת' },
  ]

  const [form, setForm] = useState({
    teacher_name: '',
    grade: '',
    exam_timing: '',
    topic: '',
    values: [] as string[],
    specific_topic: '',
    biographical_figure: '',
    prefer_narrative: true,
    prefer_informational: true,
    text_continuity: '',
    sidebar_types: ['definition', 'fact_box'] as string[],
  })

  const selectedGrade = GRADES.find(g => g.value === form.grade) || null
  const topicOptions = useMemo(
    () => (selectedGrade ? getTopicsForCluster(selectedGrade.cluster) : []),
    [selectedGrade?.cluster]
  )
  const valuesOptions = selectedGrade ? (VALUES_BY_CLUSTER[selectedGrade.cluster] || []) : []

  const handleGradeChange = (grade: string) => {
    const cluster = GRADES.find(g => g.value === grade)?.cluster || '5-6'
    const newTopics = getTopicsForCluster(cluster)
    const newValues = VALUES_BY_CLUSTER[cluster] || []
    setForm(f => ({
      ...f,
      grade,
      topic: newTopics.includes(f.topic) ? f.topic : '',
      values: f.values.filter(v => newValues.includes(v)),
    }))
  }

  const mutation = useMutation({
    mutationFn: (data: typeof form) => examsApi.create({
      title: `מבחן הבנת הנקרא — כיתה ${data.grade} — ${data.exam_timing}`,
      grade_cluster: selectedGrade?.cluster || '5-6',
      topic: data.topic === 'אחר' ? (data.specific_topic || '').trim() : data.topic,
      values: data.values.join(', '),
      specific_topic: data.topic === 'אישיים'
        ? (data.biographical_figure || data.specific_topic)
        : data.topic === 'אחר'
          ? ''
          : data.specific_topic,
      prefer_narrative: data.prefer_narrative,
      prefer_informational: data.prefer_informational,
      text_continuity: data.text_continuity,
      sidebar_types: data.text_continuity === 'non_continuous' ? data.sidebar_types : undefined,
      teacher_name: data.teacher_name,
      exam_timing: data.exam_timing,
      grade: data.grade,
    }),
    onSuccess: (exam) => {
      navigate(`/teacher/exam/${exam.id}/plan`)
    },
  })

  const toggleValue = (val: string) => {
    setForm(f => ({
      ...f,
      values: f.values.includes(val) ? f.values.filter(v => v !== val) : [...f.values, val],
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.teacher_name.trim() || !form.topic) return
    mutation.mutate(form)
  }

  const isValid = form.teacher_name.trim() && form.grade && form.exam_timing
    && form.topic
    && (form.topic !== 'אחר' || (form.specific_topic || '').trim().length > 0)
    && (form.topic !== 'אישיים' || form.biographical_figure.trim())
    && form.text_continuity

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Back */}
      <button onClick={() => navigate('/')} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm">
        <ArrowRight size={16} /> חזרה לדשבורד
      </button>

      <WorkflowSteps current={1} />
      <div>
        <h1 className="text-2xl font-bold">מבחן חדש</h1>
        <p className="text-gray-500 mt-1">שלב 1: פתיחת מבחן — הגדרת פרטים</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Teacher name */}
        <Card className="space-y-4">
          <h2 className="font-bold text-lg">פרטי המורה</h2>
          <div>
            <label className="label">שם המורה *</label>
            <input
              value={form.teacher_name}
              onChange={e => setForm(f => ({ ...f, teacher_name: e.target.value }))}
              placeholder="לדוגמה: רחל כהן"
              className="input-field"
              required
            />
          </div>
        </Card>

        {/* Grade */}
        <Card className="space-y-4">
          <h2 className="font-bold text-lg">כיתה</h2>
          <div className="grid grid-cols-7 gap-2">
            {GRADES.map(g => (
              <button
                key={g.value}
                type="button"
                onClick={() => handleGradeChange(g.value)}
                className={`py-3 rounded-xl border-2 font-bold text-lg transition-colors ${
                  form.grade === g.value
                    ? 'border-blue-500 bg-blue-600 text-white'
                    : 'border-gray-200 hover:border-blue-300 text-gray-700'
                }`}
              >
                {g.value}׳
              </button>
            ))}
          </div>
          {selectedGrade
            ? <p className="text-sm text-gray-500">{selectedGrade.desc}</p>
            : <p className="text-sm text-orange-500">* יש לבחור כיתה</p>}
        </Card>

        {/* Exam timing */}
        <Card className="space-y-4">
          <h2 className="font-bold text-lg">מועד המבחן</h2>
          <div className="grid grid-cols-3 gap-2">
            {EXAM_TIMING_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, exam_timing: opt.value }))}
                className={`py-3 rounded-xl border-2 font-semibold text-sm transition-colors ${
                  form.exam_timing === opt.value
                    ? 'border-blue-500 bg-blue-600 text-white'
                    : 'border-gray-200 hover:border-blue-300 text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Card>

        {/* Topic & values */}
        <Card className="space-y-4">
          <h2 className="font-bold text-lg">נושא וערכים</h2>

          <div>
            <label className="label">נושא / תחום עניין *</label>
            {!selectedGrade ? (
              <div className="border border-orange-200 bg-orange-50 rounded-xl p-4 text-sm text-orange-600 text-center">
                יש לבחור כיתה תחילה כדי לראות נושאים מותאמים לגיל
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-1">{topicOptions.length} נושאים — גלול למטה לראות את כולם</p>
                <div className="border border-gray-200 rounded-xl p-3 max-h-80 overflow-y-auto space-y-1">
                {topicOptions.map((opt, i) => (
                  <label key={`${selectedGrade?.cluster}-${i}-${opt}`} className="flex items-center gap-2 cursor-pointer py-1 hover:bg-gray-50 rounded px-1">
                    <input
                      type="radio"
                      name="topic"
                      checked={form.topic === opt}
                      onChange={() => setForm(f => ({ ...f, topic: opt, biographical_figure: '' }))}
                    />
                    <span className="text-sm">{opt === 'אישיים' ? '👤 אישיים (טקסט ביוגרפי)' : opt}</span>
                  </label>
                ))}
              </div>
              </>
            )}
            {form.topic && form.topic !== 'אישיים' && (
              <p className="text-xs text-blue-600 mt-1">נבחר: {form.topic}</p>
            )}
          </div>

          {/* Biographical figures sub-panel */}
          {form.topic === 'אישיים' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-bold text-blue-800">בחרי דמות מעוררת השראה *</p>
              <p className="text-xs text-blue-600">הטקסט המידעי יהיה ביוגרפי — יתאר את חיי הדמות, הישגיה ותרומתה.</p>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {(BIOGRAPHICAL_FIGURES[selectedGrade?.cluster || '5-6'] || []).map(fig => (
                  <label key={fig.name} className={`flex items-start gap-2 cursor-pointer py-1.5 px-2 rounded-lg border transition-colors ${
                    form.biographical_figure === fig.name
                      ? 'bg-blue-100 border-blue-400'
                      : 'bg-white border-gray-200 hover:border-blue-300'
                  }`}>
                    <input
                      type="radio"
                      name="biographical_figure"
                      checked={form.biographical_figure === fig.name}
                      onChange={() => setForm(f => ({ ...f, biographical_figure: fig.name }))}
                      className="mt-0.5 flex-shrink-0"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-800">{fig.name}</span>
                      {fig.desc && <p className="text-xs text-gray-500 leading-tight">{fig.desc}</p>}
                    </div>
                  </label>
                ))}
              </div>
              {form.biographical_figure.includes('כתבי שם') && (
                <input
                  value={form.specific_topic}
                  onChange={e => setForm(f => ({ ...f, specific_topic: e.target.value }))}
                  placeholder="שם הדמות שבחרת..."
                  className="input-field"
                />
              )}
              {form.biographical_figure && !form.biographical_figure.includes('כתבי שם') && (
                <p className="text-xs text-blue-700 font-medium">נבחרה: {form.biographical_figure}</p>
              )}
            </div>
          )}

          <div>
            <label className="label">ערכים (ניתן לבחור מספר)</label>
            {!selectedGrade ? (
              <div className="border border-orange-200 bg-orange-50 rounded-xl p-4 text-sm text-orange-600 text-center">
                יש לבחור כיתה תחילה
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1">
                {valuesOptions.map((opt, i) => (
                  <label key={`val-${selectedGrade?.cluster}-${i}-${opt}`} className="flex items-center gap-2 cursor-pointer py-1 hover:bg-gray-50 rounded px-1">
                    <input
                      type="checkbox"
                      checked={form.values.includes(opt)}
                      onChange={() => toggleValue(opt)}
                      className="rounded"
                    />
                    <span className="text-sm">{opt}</span>
                  </label>
                ))}
              </div>
            )}
            {form.values.length > 0 && (
              <p className="text-xs text-blue-600 mt-1">נבחרו: {form.values.join(', ')}</p>
            )}
          </div>

          {form.topic !== 'אישיים' && (
            <div>
              <label className="label">{form.topic === 'אחר' ? 'כתבי את הנושא *' : 'נושא ספציפי (אופציונלי)'}</label>
              <input
                value={form.specific_topic}
                onChange={e => setForm(f => ({ ...f, specific_topic: e.target.value }))}
                placeholder="לדוגמה: דולפינים, אנרגיה סולארית..."
                className="input-field"
              />
            </div>
          )}
        </Card>

        {/* Text type */}
        <Card className="space-y-4">
          <h2 className="font-bold text-lg">סוג הטקסט המידעי *</h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, text_continuity: 'continuous' }))}
              className={`py-3 px-4 rounded-xl border-2 font-semibold text-sm transition-colors text-center ${
                form.text_continuity === 'continuous'
                  ? 'border-blue-500 bg-blue-600 text-white'
                  : 'border-gray-200 hover:border-blue-300 text-gray-700'
              }`}
            >
              📄 טקסט רציף
            </button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, text_continuity: 'non_continuous' }))}
              className={`py-3 px-4 rounded-xl border-2 font-semibold text-sm transition-colors text-center ${
                form.text_continuity === 'non_continuous'
                  ? 'border-blue-500 bg-blue-600 text-white'
                  : 'border-gray-200 hover:border-blue-300 text-gray-700'
              }`}
            >
              📰 טקסט לא-רציף
            </button>
          </div>
          {!form.text_continuity && (
            <p className="text-sm text-orange-500">* יש לבחור סוג טקסט מידעי</p>
          )}

          {form.text_continuity === 'non_continuous' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-bold text-blue-800">בחרי רכיבים נלווים (לפחות 2)</p>
              <p className="text-xs text-blue-600">הבינה תייצר כתבה מרכזית + הרכיבים שבחרת כקופסאות נלוות.</p>
              <div className="grid grid-cols-2 gap-2">
                {SIDEBAR_OPTIONS.map(opt => (
                  <label key={opt.key} className={`flex items-start gap-2 cursor-pointer py-2 px-3 rounded-lg border transition-colors ${
                    form.sidebar_types.includes(opt.key)
                      ? 'bg-blue-100 border-blue-400'
                      : 'bg-white border-gray-200 hover:border-blue-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={form.sidebar_types.includes(opt.key)}
                      onChange={() => setForm(f => ({
                        ...f,
                        sidebar_types: f.sidebar_types.includes(opt.key)
                          ? f.sidebar_types.filter(s => s !== opt.key)
                          : [...f.sidebar_types, opt.key],
                      }))}
                      className="mt-0.5 rounded flex-shrink-0"
                    />
                    <div>
                      <div className="text-sm font-medium">{opt.icon} {opt.label}</div>
                      <div className="text-xs text-gray-500">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Submit */}
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" type="button" onClick={() => navigate('/')}>
            ביטול
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={!isValid}>
            המשך לשלב הרעיון
          </Button>
        </div>

        {mutation.isError && (
          <div className="text-red-600 text-sm text-center">
            שגיאה: {(mutation.error as Error).message}
          </div>
        )}
      </form>
    </div>
  )
}
