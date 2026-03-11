import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { studentsApi } from '../../api/students'
import { AnswerInput } from '../../components/student/AnswerInput'
import { Button, Spinner, Modal, Alert } from '../../components/ui'
import { CheckCircle, ChevronLeft, BookOpen, FileText } from 'lucide-react'

// ─── Debounce helper ───────────────────────────────────────────────────────
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ─── Instruction word highlighter ─────────────────────────────────────────
const INSTRUCTION_WORDS = [
  'נמקו', 'נמק', 'נמקי', 'הסבירו', 'הסבר', 'הסבירי',
  'ציינו', 'ציין', 'ציינি', 'הביאו', 'הבא', 'הביאי',
  'כתבו', 'כתוב', 'כתבי', 'מצאו', 'מצא', 'מצאי',
  'זהו', 'זה', 'זהי', 'השוו', 'השווה', 'השווי',
  'התאימו', 'התאם', 'התאימי', 'השלימו', 'השלם', 'השלימי',
  'סמנו', 'סמן', 'סמני', 'ענו', 'ענה', 'עני',
  'פרטו', 'פרט', 'פרטי', 'הוכיחו', 'הוכח', 'הוכיחי',
  'בדקו', 'בדוק', 'בדקי', 'בחרו', 'בחר', 'בחרי',
  'קראו', 'קרא', 'קראי', 'הסיקו', 'הסק', 'הסיקי',
  'הדגימו', 'הדגם', 'הדגימי', 'השלם', 'הצביעו', 'הצבע',
  'השלימו', 'פרשו', 'פרש', 'פרשי', 'תארו', 'תאר', 'תארי',
  'הסבר', 'הגדירו', 'הגדר', 'הגדירי', 'פרטי', 'בחרו', 'בחר',
  'לפחות', 'דוגמה', 'דוגמאות', 'לפחות',
]
const INST_PATTERN = new RegExp(
  `(${INSTRUCTION_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  'g'
)
function highlightInstructions(text: string): string {
  if (!text) return ''
  return text.replace(INST_PATTERN, '<strong style="color:#1565C0;font-weight:800">$1</strong>')
}

// ─── Non-continuous text types ─────────────────────────────────────────────
interface Sidebar {
  type: string
  title: string
  content: string
}
interface NCContent {
  __nc: boolean
  main: string
  sidebars: Sidebar[]
}
function parseNC(content: string | object): NCContent | null {
  if (!content) return null
  let p: { __nc?: boolean; main?: string; sidebars?: unknown[] }
  if (typeof content === 'string') {
    if (!content.startsWith('{"__nc":') && !content.startsWith('{')) return null
    try { p = JSON.parse(content) } catch { return null }
  } else if (typeof content === 'object' && content !== null && '__nc' in content) {
    p = content as { __nc?: boolean; main?: string; sidebars?: unknown[] }
  } else return null
  if (p.__nc) {
    const sidebars = Array.isArray(p.sidebars)
      ? p.sidebars.map(sb => (typeof sb === 'object' && sb !== null)
        ? { type: (sb as { type?: string }).type ?? '', title: (sb as { title?: string }).title ?? 'רכיב נלווה', content: (sb as { content?: string }).content ?? '' }
        : { type: '', title: 'רכיב נלווה', content: '' })
      : []
    return { __nc: true, main: p.main ?? '', sidebars } as NCContent
  }
  return null
}

// Sidebar visual config
const SIDEBAR_CFG: Record<string, { border: string; bg: string; titleColor: string; icon: string }> = {
  definition:     { border: '#3B82F6', bg: '#EFF6FF', titleColor: '#1E40AF', icon: '📖' },
  editorial:      { border: '#8B5CF6', bg: '#F5F3FF', titleColor: '#5B21B6', icon: '✍️' },
  news_item:      { border: '#F97316', bg: '#FFF7ED', titleColor: '#9A3412', icon: '📰' },
  survey:         { border: '#22C55E', bg: '#F0FDF4', titleColor: '#15803D', icon: '📊' },
  example:        { border: '#14B8A6', bg: '#F0FDFA', titleColor: '#0F766E', icon: '💡' },
  fact_box:       { border: '#F59E0B', bg: '#FFFBEB', titleColor: '#92400E', icon: '⭐' },
  diary:          { border: '#F43F5E', bg: '#FFF1F2', titleColor: '#9F1239', icon: '📔' },
  list:           { border: '#06B6D4', bg: '#ECFEFF', titleColor: '#155E75', icon: '📋' },
  knowledge_link: { border: '#6366F1', bg: '#EEF2FF', titleColor: '#3730A3', icon: '🔗' },
}
const DEFAULT_SIDEBAR_CFG = { border: '#9CA3AF', bg: '#F9FAFB', titleColor: '#374151', icon: '📌' }

// ─── Student-facing text renderer ─────────────────────────────────────────
function StudentText({ content }: { content: string }) {
  const nc = parseNC(content)

  if (!nc) {
    // Plain text — split on double newlines to get paragraphs
    const paras = content.split(/\n\n+/).filter(p => p.trim())
    return (
      <div style={{ direction: 'rtl' }}>
        {paras.map((p, i) => (
          <p key={i} style={{
            marginBottom: '1.2em',
            lineHeight: '2.1',
            fontSize: '17px',
            color: '#1a1a2e',
            fontFamily: 'Rubik, Arial, sans-serif',
          }}>
            {p}
          </p>
        ))}
      </div>
    )
  }

  // Non-continuous: proper magazine grid layout
  const paragraphs = (nc.main || '').split(/\n\n+/).filter(p => p.trim())
  const sidebars = nc.sidebars || []

  const SidebarBox = ({ sb, i }: { sb: { type?: string; title?: string; content?: string }; i: number }) => {
    const cfg = SIDEBAR_CFG[sb?.type || ''] || DEFAULT_SIDEBAR_CFG
    return (
      <div
        key={i}
        style={{
          background: cfg.bg,
          border: `2px solid ${cfg.border}`,
          borderRadius: '14px',
          padding: '16px 18px',
          boxShadow: `0 2px 8px ${cfg.border}30`,
        }}
      >
        <div style={{
          fontWeight: 'bold',
          color: cfg.titleColor,
          fontSize: '14px',
          marginBottom: '10px',
          paddingBottom: '8px',
          borderBottom: `2px solid ${cfg.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ fontSize: '18px' }}>{cfg.icon}</span>
          <span>{sb?.title ?? 'רכיב נלווה'}</span>
        </div>
        <div style={{ color: '#374151', whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: '1.9' }}>{sb?.content ?? ''}</div>
      </div>
    )
  }

  return (
    <div style={{ direction: 'rtl', width: '100%' }}>
      {/* Magazine label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px dashed #e5e7eb' }}>
        <span style={{ fontSize: '11px', fontWeight: 'bold', background: '#e0e7ff', color: '#3730a3', padding: '3px 10px', borderRadius: '20px' }}>📰 טקסט לא-רציף</span>
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>שני טורים — כתבה מרכזית | רכיבים נלווים</span>
      </div>
      {/* Grid: שני טורים — כתבה מרכזית (ימין) | רכיבים נלווים (שמאל) */}
      <div
        className="grid grid-cols-1 md:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.7fr)] gap-6 items-start"
        style={{ direction: 'rtl' }}
      >
        {/* טור ימני — כתבה מרכזית */}
        <div style={{ minWidth: 0, borderRight: '2px solid #c7d2fe', paddingRight: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#4338ca', marginBottom: '12px' }}>📄 כתבה מרכזית</div>
          {paragraphs.map((para, i) => (
            <p key={i} style={{
              marginBottom: '1.2em',
              lineHeight: '2.1',
              fontSize: '17px',
              color: '#1a1a2e',
              fontFamily: 'Rubik, Arial, sans-serif',
            }}>{para}</p>
          ))}
        </div>
        {/* טור שמאלי — רכיבים נלווים */}
        <div className="flex flex-col gap-4 md:min-w-[280px]">
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#4338ca', marginBottom: '4px' }}>📦 רכיבים נלווים</div>
          {sidebars.map((sb, i) => <SidebarBox key={i} sb={sb} i={i} />)}
        </div>
      </div>
    </div>
  )

}

// ─── Main exam component ───────────────────────────────────────────────────
export default function TakeExam() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  // section: 0 = narrative, 1 = informational, 2 = cross-text
  const [section, setSection] = useState(0)
  const topRef = useRef<HTMLDivElement>(null)

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => studentsApi.getSession(sessionId!),
    enabled: !!sessionId,
  })

  const { data: examData, isLoading: examLoading } = useQuery({
    queryKey: ['sessionExam', sessionId],
    queryFn: () => studentsApi.getSessionExam(sessionId!),
    enabled: !!sessionId && session?.status === 'IN_PROGRESS',
  })

  // Pre-populate answers from session data
  useEffect(() => {
    if (session?.answers) {
      const existing: Record<string, string> = {}
      for (const a of session.answers) {
        if (a.raw_answer) existing[a.question_id] = a.raw_answer
      }
      setAnswers(prev => ({ ...existing, ...prev }))
    }
  }, [session?.id])

  // Scroll to top when changing section
  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [section])

  // Auto-save debounced answers
  const debouncedAnswers = useDebounce(answers, 1500)
  useEffect(() => {
    if (!sessionId || session?.status !== 'IN_PROGRESS') return
    Object.entries(debouncedAnswers).forEach(([qId, ans]) => {
      const key = `${qId}:${ans}`
      if (!savedIds.has(key) && ans) {
        studentsApi.saveAnswer(sessionId, qId, ans)
          .then(() => setSavedIds(prev => new Set([...prev, key])))
          .catch(() => {})
      }
    })
  }, [debouncedAnswers, sessionId, session?.status])

  const handleSubmit = async () => {
    if (!sessionId) return
    setSubmitting(true)
    setError(null)
    try {
      await studentsApi.submit(sessionId)
      navigate(`/student/results/${sessionId}`)
    } catch {
      setError('שגיאה בהגשה. נסה/י שוב.')
    } finally {
      setSubmitting(false)
    }
  }

  if (sessionLoading) return <Spinner text="טוען מבחן..." />
  if (!session) return <div className="text-center py-20 text-red-500">שגיאה: המבחן לא נמצא</div>

  // Already submitted / graded
  if (session.status === 'SUBMITTED' || session.status === 'GRADED') {
    return (
      <div className="max-w-xl mx-auto py-20 px-4 text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <CheckCircle size={40} className="text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800">המבחן הוגש בהצלחה</h1>
        <p className="text-gray-500">
          תשובותיך נשמרו.{' '}
          {session.status === 'GRADED' ? 'הניקוד כבר מוכן!' : 'הציון יחושב בקרוב.'}
        </p>
        {session.status === 'GRADED' && (
          <Button onClick={() => navigate(`/student/results/${sessionId}`)}>
            צפה בתוצאות
          </Button>
        )}
      </div>
    )
  }

  if (examLoading) return <Spinner text="טוען שאלות..." />

  const questions = examData?.questions || []
  const texts = examData?.texts || []

  const narrText = texts.find((t: Record<string, unknown>) => t.text_type === 'narrative')
  const infoText = texts.find((t: Record<string, unknown>) => t.text_type === 'informational')

  const narrQuestions = questions.filter((q: Record<string, unknown>) =>
    !q.is_cross_text && q.text_id === narrText?.id
  )
  const infoQuestions = questions.filter((q: Record<string, unknown>) =>
    !q.is_cross_text && q.text_id === infoText?.id
  )
  const crossQuestions = questions.filter((q: Record<string, unknown>) => q.is_cross_text)
  // שאלות מיזוג — בסוף הקטע המידעי (רצף כרונולוגי)
  const infoSectionQuestions = [...infoQuestions, ...crossQuestions]
    .sort((a, b) => ((a.sequence_number as number) ?? 0) - ((b.sequence_number as number) ?? 0))

  const answered = questions.filter((q: Record<string, unknown>) =>
    answers[q.id as string]?.trim()
  ).length

  const sectionDefs = [
    { label: 'טקסט נרטיבי',  icon: <BookOpen size={13} />, questions: narrQuestions },
    { label: 'טקסט מידעי',   icon: <FileText size={13} />,  questions: infoSectionQuestions },
  ]

  // Colorful accent per section
  const SECTION_COLORS = ['#1565C0', '#0e7490', '#7C3AED']
  const currentAccent = SECTION_COLORS[section] || '#1565C0'

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(160deg, #e8f4fd 0%, #f3e8ff 35%, #fef3c7 70%, #ecfdf5 100%)',
        fontFamily: 'Rubik, Arial, sans-serif',
      }}
    >
      {/* ── Top navigation bar ── */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        background: `linear-gradient(135deg, ${currentAccent} 0%, ${currentAccent}dd 100%)`,
        boxShadow: `0 4px 20px ${currentAccent}55`,
        transition: 'background 0.4s ease',
      }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <div style={{ fontWeight: 800, color: 'white', fontSize: '15px', textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
              {examData?.title || 'מבחן הבנת הנקרא'}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', marginTop: '2px' }}>
              👋 שלום, {session.student_name}!
            </div>
          </div>

          {/* Section tabs */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {sectionDefs.map((s, i) => {
              const isActive = i === section
              const isDone = i < section
              const isLocked = i > section
              return (
                <button
                  key={i}
                  onClick={() => !isLocked && setSection(i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '7px 16px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    fontWeight: 700,
                    border: 'none',
                    cursor: isLocked ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    background: isActive ? 'white' : isDone ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)',
                    color: isActive ? currentAccent : isDone ? 'white' : 'rgba(255,255,255,0.6)',
                    boxShadow: isActive ? `0 3px 12px rgba(0,0,0,0.2)` : 'none',
                  }}
                >
                  {isDone ? '✅ ' : ''}{s.icon} {s.label}
                </button>
              )
            })}
          </div>

          <div style={{
            fontSize: '13px',
            background: 'rgba(255,255,255,0.2)',
            color: 'white',
            padding: '5px 14px',
            borderRadius: '20px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}>
            {answered}/{questions.length} ✍️
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: '4px', background: 'rgba(255,255,255,0.2)' }}>
          <div style={{
            height: '100%',
            width: `${questions.length > 0 ? (answered / questions.length) * 100 : 0}%`,
            background: 'rgba(255,255,255,0.9)',
            borderRadius: '2px',
            transition: 'width 0.5s ease',
          }} />
        </div>
      </div>

      <div ref={topRef} />

      {/* ── Section 0: Narrative ── */}
      {section === 0 && (
        <SectionView
          text={narrText}
          textLabel="טקסט נרטיבי"
          accentColor="#1565C0"
          questions={narrQuestions}
          answers={answers}
          setAnswers={setAnswers}
          onNext={() => setSection(1)}
          nextLabel="סיימתי — המשך לטקסט המידעי ←"
          showNext={infoSectionQuestions.length > 0}
        />
      )}

      {/* ── Section 1: Informational + שאלות מיזוג (בסוף) ── */}
      {section === 1 && (
        crossQuestions.length > 0 ? (
          <CrossTextSection
            narrText={narrText}
            infoText={infoText}
            questions={infoSectionQuestions}
            answers={answers}
            setAnswers={setAnswers}
            onPrev={() => setSection(0)}
            onSubmit={() => setShowSubmitModal(true)}
            submitting={submitting}
            answered={answered}
            total={questions.length}
          />
        ) : (
          <SectionView
            text={infoText}
            textLabel="טקסט מידעי"
            accentColor="#0e7490"
            questions={infoQuestions}
            answers={answers}
            setAnswers={setAnswers}
            onNext={() => setShowSubmitModal(true)}
            nextLabel="סיימתי — הגשה"
            showNext
            onPrev={() => setSection(0)}
          />
        )
      )}

      {/* ── Fixed bottom bar (sections 0 & 1) ── */}
      {section < 2 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
          background: 'white',
          borderTop: `3px solid ${currentAccent}`,
          padding: '10px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px',
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${currentAccent}, ${currentAccent}aa)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 800, fontSize: '14px',
            }}>
              {answered}
            </div>
            <span style={{ fontSize: '14px', color: '#374151', fontWeight: 500 }}>
              מתוך {questions.length} שאלות נענו
            </span>
          </div>
          <button
            onClick={() => setShowSubmitModal(true)}
            style={{
              padding: '10px 24px',
              borderRadius: '12px',
              background: `linear-gradient(135deg, ${currentAccent}, ${currentAccent}cc)`,
              color: 'white',
              fontWeight: 700,
              fontSize: '14px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: `0 3px 12px ${currentAccent}55`,
            }}
          >
            🏁 הגש מבחן
          </button>
        </div>
      )}

      {/* ── Submit confirmation modal ── */}
      <Modal open={showSubmitModal} onClose={() => setShowSubmitModal(false)} title="הגשת המבחן">
        <div className="space-y-4">
          <p>האם להגיש את המבחן? לאחר ההגשה לא ניתן לשנות תשובות.</p>
          {answered < questions.length && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              שים/י לב: ענית על {answered} מתוך {questions.length} שאלות. ישנן שאלות שלא נענו.
            </div>
          )}
          {error && <Alert type="error">{error}</Alert>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowSubmitModal(false)}>ביטול</Button>
            <Button loading={submitting} onClick={handleSubmit}>הגש מבחן</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── SectionView ──────────────────────────────────────────────────────────
interface SectionViewProps {
  text: Record<string, unknown> | undefined
  textLabel: string
  accentColor: string
  questions: Record<string, unknown>[]
  answers: Record<string, string>
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>
  onNext: () => void
  nextLabel: string
  showNext: boolean
  onPrev?: () => void
}

function SectionView({
  text, textLabel, accentColor, questions, answers, setAnswers, onNext, nextLabel, showNext, onPrev,
}: SectionViewProps) {
  const answeredHere = questions.filter(q => answers[q.id as string]?.trim()).length

  return (
    <div style={{
      maxWidth: '1280px', margin: '0 auto',
      padding: '20px 20px 100px',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '20px',
      alignItems: 'start',
    }}>
      {/* Left: sticky text panel */}
      <div style={{
        position: 'sticky',
        top: '62px',
        maxHeight: 'calc(100vh - 80px)',
        overflowY: 'auto',
        background: 'white',
        borderRadius: '16px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 4px 16px rgba(0,0,0,0.07)',
      }}>
        {/* Text header */}
        <div style={{
          padding: '16px 20px',
          background: `linear-gradient(135deg, ${accentColor}, ${accentColor}bb)`,
          borderRadius: '16px 16px 0 0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h2 style={{
              fontWeight: 800, fontSize: '18px', color: 'white',
              fontFamily: 'Rubik, Arial, sans-serif',
              textShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}>
              {text?.title as string}
            </h2>
            <span style={{
              fontSize: '11px',
              background: 'rgba(255,255,255,0.25)',
              color: 'white',
              padding: '2px 10px',
              borderRadius: '20px',
              fontWeight: 700,
            }}>
              {textLabel}
            </span>
          </div>
          {text?.word_count ? (
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.75)', marginTop: '4px' }}>
              {text.word_count as number} מילים
            </p>
          ) : null}
        </div>
        {/* Text body */}
        <div style={{ padding: '20px 24px' }}>
          <StudentText content={text?.content as string || ''} />
        </div>
      </div>

      {/* Right: questions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Questions header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontWeight: 700, fontSize: '16px', color: '#1a1a2e' }}>
            שאלות
            <span style={{ marginRight: '8px', fontSize: '13px', fontWeight: 400, color: '#9ca3af' }}>
              ({answeredHere}/{questions.length} נענו)
            </span>
          </h3>
          {onPrev && (
            <button
              onClick={onPrev}
              style={{
                fontSize: '13px', color: accentColor,
                background: `${accentColor}12`,
                border: `1px solid ${accentColor}30`,
                borderRadius: '20px',
                padding: '4px 12px',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: '4px',
              }}
            >
              ← חזרה לטקסט הקודם
            </button>
          )}
        </div>

        {questions.length === 0 ? (
          <div style={{
            background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px',
            padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '14px',
          }}>
            אין שאלות לטקסט זה.
          </div>
        ) : (
          questions
            .sort((a, b) => (a.sequence_number as number) - (b.sequence_number as number))
            .map((q) => (
              <QuestionBlock
                key={q.id as string}
                question={q}
                answers={answers}
                setAnswers={setAnswers}
                accentColor={accentColor}
              />
            ))
        )}

        {showNext && (
          <button
            onClick={onNext}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: '14px',
              background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
              color: 'white',
              fontWeight: 700,
              fontSize: '15px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: `0 4px 16px ${accentColor}55`,
              transition: 'all 0.2s',
            }}
          >
            {nextLabel}
            <ChevronLeft size={18} />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Cross-text section ────────────────────────────────────────────────────
interface CrossTextSectionProps {
  narrText: Record<string, unknown> | undefined
  infoText: Record<string, unknown> | undefined
  questions: Record<string, unknown>[]
  answers: Record<string, string>
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>
  onPrev: () => void
  onSubmit: () => void
  submitting: boolean
  answered: number
  total: number
}

function CrossTextSection({
  narrText, infoText, questions, answers, setAnswers, onPrev, onSubmit, submitting, answered, total,
}: CrossTextSectionProps) {
  const [activeText, setActiveText] = useState<'narrative' | 'informational'>('informational')
  const activeContent = activeText === 'narrative'
    ? narrText?.content as string
    : infoText?.content as string
  const activeTitle = activeText === 'narrative'
    ? narrText?.title as string
    : infoText?.title as string

  return (
    <div style={{
      maxWidth: '1280px', margin: '0 auto',
      padding: '20px 20px 40px',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '20px',
      alignItems: 'start',
    }}>
      {/* Left: text panel with tabs */}
      <div style={{
        position: 'sticky',
        top: '62px',
        maxHeight: 'calc(100vh - 80px)',
        overflowY: 'auto',
        background: 'white',
        borderRadius: '16px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 4px 16px rgba(0,0,0,0.07)',
      }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
          {([
            { key: 'narrative' as const,     label: 'טקסט נרטיבי',  color: '#1565C0' },
            { key: 'informational' as const,  label: 'טקסט מידעי',   color: '#0e7490' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveText(tab.key)}
              style={{
                flex: 1,
                padding: '12px',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: activeText === tab.key ? `${tab.color}10` : 'white',
                color: activeText === tab.key ? tab.color : '#6b7280',
                borderBottom: activeText === tab.key ? `2px solid ${tab.color}` : '2px solid transparent',
                transition: 'all 0.2s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Title */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fafafa',
        }}>
          <h2 style={{
            fontWeight: 700, fontSize: '17px', color: '#1a1a2e',
            fontFamily: 'Rubik, Arial, sans-serif',
          }}>
            {activeTitle}
          </h2>
        </div>

        {/* Text body */}
        <div style={{ padding: '20px 24px' }}>
          <StudentText content={activeContent || ''} />
        </div>
      </div>

      {/* Right: questions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontWeight: 700, fontSize: '16px', color: '#1a1a2e' }}>טקסט מידעי — שאלות</h3>
          <button
            onClick={onPrev}
            style={{
              fontSize: '13px', color: '#6b7280',
              background: 'none', border: 'none', cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            ← חזרה לטקסט הנרטיבי
          </button>
        </div>

        <div style={{
          background: '#f5f3ff',
          border: '1px solid #c4b5fd',
          borderRadius: '10px',
          padding: '10px 16px',
          fontSize: '13px',
          color: '#5b21b6',
          fontWeight: 500,
        }}>
          שאלות המיזוג דורשות שימוש בשני הטקסטים. ניתן לעבור בין הטקסטים בלשוניות משמאל.
        </div>

        {questions
          .sort((a, b) => (a.sequence_number as number) - (b.sequence_number as number))
          .map((q) => (
            <QuestionBlock
              key={q.id as string}
              question={q}
              answers={answers}
              setAnswers={setAnswers}
              accentColor="#7C3AED"
              crossText
            />
          ))}

        <div style={{ paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: '13px', textAlign: 'center', color: '#6b7280' }}>
            ענית על <strong style={{ color: '#1565C0' }}>{answered}</strong> מתוך {total} שאלות בסך הכל
          </p>
          <button
            onClick={onSubmit}
            disabled={submitting}
            style={{
              width: '100%',
              padding: '18px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #16a34a, #15803d)',
              color: 'white',
              fontWeight: 700,
              fontSize: '16px',
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              opacity: submitting ? 0.7 : 1,
              boxShadow: '0 4px 20px rgba(30,90,30,0.35)',
            }}
          >
            {submitting ? <Spinner size={20} /> : <CheckCircle size={20} />}
            הגש מבחן ({answered}/{total} נענו)
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Single question card ─────────────────────────────────────────────────
interface QuestionBlockProps {
  question: Record<string, unknown>
  answers: Record<string, string>
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>
  accentColor: string
  crossText?: boolean
}

function QuestionBlock({ question, answers, setAnswers, accentColor, crossText }: QuestionBlockProps) {
  const content = question.content as Record<string, unknown>
  const isAnswered = !!answers[question.id as string]?.trim()
  const qNum = question.sequence_number as number
  const pts = question.score_points as number

  return (
    <div style={{
      background: isAnswered ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : crossText ? 'linear-gradient(135deg,#faf5ff,#ede9fe)' : 'white',
      borderRadius: '16px',
      border: `2px solid ${isAnswered ? '#86efac' : crossText ? '#c4b5fd' : '#e5e7eb'}`,
      padding: '18px 20px',
      transition: 'all 0.25s',
      boxShadow: isAnswered ? '0 4px 16px rgba(34,197,94,0.18)' : '0 2px 8px rgba(0,0,0,0.04)',
    } as React.CSSProperties}>
      {/* Question header — number + answered status only */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <div style={{
          width: '32px', height: '32px',
          borderRadius: '50%',
          background: isAnswered ? '#22c55e' : accentColor,
          color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: '13px',
          flexShrink: 0,
          boxShadow: `0 2px 8px ${isAnswered ? '#22c55e' : accentColor}55`,
        }}>
          {qNum}
        </div>
        {isAnswered && (
          <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>✓ נענתה</span>
        )}
      </div>

      {/* Stem — with bolded instruction words */}
      <p style={{
        fontSize: '16px',
        lineHeight: '1.9',
        color: '#1a1a2e',
        marginBottom: '8px',
        fontFamily: 'Rubik, Arial, sans-serif',
      }}
        dangerouslySetInnerHTML={{ __html: highlightInstructions(content?.stem as string || '') }}
      />

      <AnswerInput
        questionId={question.id as string}
        format={question.format as import('../../types').QuestionFormat}
        options={content?.options as string[] | null}
        items={content?.items as string[] | null}
        statements={content?.statements as string[] | null}
        table_headers={content?.table_headers as string[] | null}
        table_rows={content?.table_rows as string[][] | null}
        value={answers[question.id as string] || ''}
        onChange={val => setAnswers(prev => ({ ...prev, [question.id as string]: val }))}
      />

      {/* Points — shown at the bottom in small text */}
      {pts && (
        <div style={{ marginTop: '10px', textAlign: 'left', fontSize: '11px', color: '#9ca3af' }}>
          ({pts} נק׳)
        </div>
      )}
    </div>
  )
}
