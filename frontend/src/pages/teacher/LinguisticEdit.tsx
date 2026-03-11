import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { examsApi } from '../../api/exams'
import { Spinner, Card, Badge, WorkflowSteps } from '../../components/ui'
import { ChevronLeft, ChevronRight, CheckCircle, Languages, BookOpen, Check, X, FileEdit } from 'lucide-react'
import type { LanguageEditResult, LanguageEditChange } from '../../types'

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  'כתיב':  { bg: 'bg-red-50',    border: 'border-red-300',    text: 'text-red-800',    badge: 'bg-red-100 text-red-700' },
  'פיסוק': { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-800', badge: 'bg-orange-100 text-orange-700' },
  'הסכמה': { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-800', badge: 'bg-yellow-100 text-yellow-700' },
  'ניסוח': { bg: 'bg-blue-50',   border: 'border-blue-300',   text: 'text-blue-800',   badge: 'bg-blue-100 text-blue-700' },
}
const DEFAULT_COLOR = { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', badge: 'bg-gray-100 text-gray-700' }

interface ChatMessage {
  role: 'teacher' | 'ai'
  content: string
  explanation?: string
}

interface TextEditState {
  textId: string
  title: string
  textType: string
  currentContent: string   // tracks live content (after approved/rejected changes)
  changes: LanguageEditChange[]
  approvals: boolean[]     // true = approved, false = rejected
  chatMessages: ChatMessage[]
  summary: string
  changeCount: number
}

// ─── Helper: extract main content for display (handles __nc) ──────────────────
function getDisplayContent(content: string): string {
  if (!content?.startsWith('{"__nc":')) return content
  try {
    const nc = JSON.parse(content)
    return nc.main || content
  } catch {
    return content
  }
}

// ─── Helper: extract surrounding sentence context for a phrase ────────────────
function getSentenceContext(fullText: string, phrase: string): { before: string; after: string } {
  const idx = fullText.indexOf(phrase)
  if (idx === -1) return { before: '', after: '' }
  // Find sentence start (go back to '. ' or start)
  let start = idx
  while (start > 0 && fullText[start - 1] !== '.' && fullText[start - 1] !== '\n') start--
  // Find sentence end (go forward to '. ' or end)
  let end = idx + phrase.length
  while (end < fullText.length && fullText[end] !== '.' && fullText[end] !== '\n') end++
  if (end < fullText.length) end++ // include the period
  const before = fullText.slice(start, idx)
  const after = fullText.slice(idx + phrase.length, end)
  return { before, after }
}

// ─── InlineTextWithChanges: full text with changes overlaid (track-changes style) ─
function InlineTextWithChanges({
  content,
  changes,
  approvals,
  revertingKey,
  textId,
  onToggle,
}: {
  content: string
  changes: LanguageEditChange[]
  approvals: boolean[]
  revertingKey: string | null
  textId: string
  onToggle: (ci: number) => void
}) {
  const displayContent = getDisplayContent(content)
  // Reconstruct original text (before any approved edits)
  let originalFull = displayContent
  changes.forEach((c, i) => {
    if (approvals[i]) originalFull = originalFull.replace(c.corrected, c.original)
  })
  // Build segments: text + change blocks, sorted by position
  const changeInfos = changes
    .map((c, i) => ({ change: c, approved: approvals[i], changeIndex: i, pos: originalFull.indexOf(c.original) }))
    .filter(x => x.pos >= 0)
    .sort((a, b) => a.pos - b.pos)
  const segments: Array<{ type: 'text'; content: string } | { type: 'change'; change: LanguageEditChange; approved: boolean; changeIndex: number }> = []
  let lastEnd = 0
  for (const { change, approved, changeIndex, pos } of changeInfos) {
    if (pos < lastEnd) continue
    segments.push({ type: 'text', content: originalFull.slice(lastEnd, pos) })
    segments.push({ type: 'change', change, approved, changeIndex })
    lastEnd = pos + change.original.length
  }
  segments.push({ type: 'text', content: originalFull.slice(lastEnd) })
  const isNc = content?.startsWith('{"__nc":')
  let ncSidebars: Array<{ title: string; content: string }> = []
  if (isNc) {
    try {
      const nc = JSON.parse(content)
      ncSidebars = nc.sidebars || []
    } catch { /* ignore */ }
  }
  return (
    <div className="rounded-xl border-2 border-blue-100 bg-blue-50/30 p-5" dir="rtl">
      <p className="text-xs font-bold text-blue-700 mb-3 flex items-center gap-2">
        <span>טקסט מלא — השינויים משולבים בתוך הטקסט</span>
        <span className="text-gray-500 font-normal">(מקור: קו חוצה | תיקון: צבע)</span>
      </p>
      <div className="leading-8 text-base text-gray-800 whitespace-pre-wrap font-medium" dir="rtl">
        {segments.map((seg, i) => {
          if (seg.type === 'text') {
            return <span key={i}>{seg.content}</span>
          }
          const { change, approved, changeIndex } = seg
          const key = `${textId}:${changeIndex}`
          const isReverting = revertingKey === key
          return (
            <span key={i} className="inline align-baseline">
              <span className="bg-red-100 text-red-800 line-through rounded px-0.5 mx-0.5" title="מקור">
                {change.original}
              </span>
              <span className="text-gray-400 text-sm mx-0.5">→</span>
              <span className={`${approved ? 'bg-green-200 text-green-900' : 'bg-amber-100 text-amber-800'} rounded px-0.5 mx-0.5`} title="תיקון">
                {change.corrected}
              </span>
              <span className="inline-flex gap-0.5 mr-1 align-middle">
                <button
                  onClick={() => !approved && onToggle(changeIndex)}
                  disabled={isReverting || approved}
                  title="אשרי תיקון"
                  className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${
                    approved ? 'bg-gray-100 text-gray-400 cursor-default' : 'bg-green-500 text-white hover:bg-green-600'
                  } ${isReverting ? 'opacity-60' : ''}`}
                >
                  {isReverting && !approved ? <Spinner /> : <Check size={12} />}
                </button>
                <button
                  onClick={() => approved && onToggle(changeIndex)}
                  disabled={isReverting || !approved}
                  title="דחי תיקון"
                  className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs ${
                    !approved ? 'bg-gray-100 text-gray-400 cursor-default' : 'bg-red-500 text-white hover:bg-red-100'
                  } ${isReverting ? 'opacity-60' : ''}`}
                >
                  <X size={12} />
                </button>
              </span>
            </span>
          )
        })}
      </div>
      {isNc && ncSidebars.length > 0 && (
        <div className="mt-4 pt-4 border-t border-blue-200">
          <p className="text-xs font-bold text-blue-600 mb-2">רכיבים נלווים (ללא שינויים מוצעים)</p>
          {ncSidebars.map((sb, i) => (
            <div key={i} className="mb-3 p-3 bg-white rounded-lg border border-blue-100">
              <p className="text-xs font-bold text-blue-800 mb-1">{sb.title}</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{sb.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── TextWithChanges: render changes as list with context (legacy view) ────────
function TextWithChanges({
  content,
  changes,
  approvals,
  revertingKey,
  textId,
  onToggle,
}: {
  content: string
  changes: LanguageEditChange[]
  approvals: boolean[]
  revertingKey: string | null
  textId: string
  onToggle: (ci: number) => void
}) {
  return (
    <div className="space-y-3" dir="rtl">
      {changes.map((c, ci) => {
        const approved = approvals[ci]
        const colors = TYPE_COLORS[c.type] || DEFAULT_COLOR
        const key = `${textId}:${ci}`
        const isReverting = revertingKey === key

        // Find the phrase in text (approved → corrected is now in text; rejected → original is in text)
        const phraseInText = approved ? c.corrected : c.original
        const { before, after } = getSentenceContext(content, phraseInText)

        return (
          <div
            key={ci}
            className={`rounded-xl border-2 transition-all ${approved ? `${colors.border} ${colors.bg}` : 'border-gray-200 bg-gray-50'}`}
          >
            {/* Change header row */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-black/5 flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-gray-500">תיקון {ci + 1}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>{c.type}</span>
                <span className={`text-xs ${colors.text}`}>{c.explanation}</span>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={() => onToggle(ci)}
                  disabled={isReverting}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    approved ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-200 text-gray-500 hover:bg-green-100'
                  }`}
                >
                  {isReverting ? <Spinner /> : <Check size={12} />}
                  {approved ? 'מאושר' : 'אשרי'}
                </button>
                <button
                  onClick={() => onToggle(ci)}
                  disabled={isReverting || !approved}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    !approved ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-red-100'
                  }`}
                >
                  <X size={12} />
                  דחי
                </button>
              </div>
            </div>

            {/* Sentence context with highlighted change */}
            <div className="px-4 py-3 text-sm leading-8 font-medium text-gray-800" dir="rtl">
              <span className="text-gray-500">{before}</span>
              {approved ? (
                // Show corrected in green
                <span className="bg-green-200 text-green-900 rounded px-1 mx-0.5 font-bold">{c.corrected}</span>
              ) : (
                // Show original struck out, corrected alongside
                <>
                  <span className="bg-red-100 text-red-700 rounded px-1 mx-0.5 line-through">{c.original}</span>
                  <span className="text-xs text-gray-400 mx-1">→</span>
                  <span className="bg-green-100 text-green-700 rounded px-1 mx-0.5">{c.corrected}</span>
                </>
              )}
              <span className="text-gray-500">{after}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function LinguisticEdit() {
  const { examId } = useParams<{ examId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [texts, setTexts] = useState<TextEditState[]>([])
  const [currentTextIdx, setCurrentTextIdx] = useState(0)  // 0=נרטיבי, 1=מידעי — עריכה לכל טקסט בנפרד
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null)
  const [revertingKey, setRevertingKey] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'inline' | 'list'>('inline')

  useEffect(() => {
    if (!examId) return
    examsApi.languageEdit(examId)
      .then(data => {
        const states: TextEditState[] = (data.edits || []).map((e: LanguageEditResult & { original_content?: string }) => ({
          textId: e.text_id,
          title: e.title,
          textType: e.text_type,
          currentContent: (e as { corrected_content?: string }).corrected_content || '',
          changes: e.changes,
          approvals: e.changes.map(() => true),  // all approved by default
          chatMessages: [],
          summary: e.summary,
          changeCount: e.change_count,
        }))
        setTexts(states)
        setLoading(false)
      })
      .catch(e => {
        setError(e?.response?.data?.detail || e.message || 'שגיאה בעריכה לשונית')
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleApproval = async (textIdx: number, changeIdx: number) => {
    const state = texts[textIdx]
    const change = state.changes[changeIdx]
    const wasApproved = state.approvals[changeIdx]
    const key = `${state.textId}:${changeIdx}`
    setRevertingKey(key)

    // Calculate new content: if rejecting (was approved → now rejected), replace corrected→original
    // If re-approving (was rejected → now approved), replace original→corrected
    let newContent = state.currentContent
    if (wasApproved) {
      // Reject: undo this change
      newContent = newContent.replace(change.corrected, change.original)
    } else {
      // Re-approve: re-apply this change
      newContent = newContent.replace(change.original, change.corrected)
    }

    // Save to backend
    try {
      await examsApi.updateText(examId!, state.textId, { content: newContent })
      setTexts(prev => prev.map((t, ti) =>
        ti === textIdx ? {
          ...t,
          currentContent: newContent,
          approvals: t.approvals.map((a, ci) => ci === changeIdx ? !wasApproved : a),
        } : t
      ))
    } finally {
      setRevertingKey(null)
    }
  }

  const [chatInput, setChatInput] = useState('')

  const sendLinguisticChat = async (textIdx: number) => {
    const state = texts[textIdx]
    const msg = chatInput.trim()
    if (!msg) return
    setChatInput('')
    setSavingNoteId(state.textId)
    const teacherMsg: ChatMessage = { role: 'teacher', content: msg }
    setTexts(prev => prev.map((t, ti) =>
      ti === textIdx ? { ...t, chatMessages: [...t.chatMessages, teacherMsg] } : t
    ))
    try {
      const result = await examsApi.linguisticEditChat(examId!, state.textId, msg)
      const aiMsg: ChatMessage = {
        role: 'ai',
        content: result.explanation || 'התיקון בוצע.',
        explanation: result.explanation,
      }
      setTexts(prev => prev.map((t, ti) =>
        ti === textIdx
          ? { ...t, currentContent: result.content, chatMessages: [...t.chatMessages, aiMsg] }
          : t
      ))
    } catch (e) {
      setTexts(prev => prev.map((t, ti) =>
        ti === textIdx
          ? { ...t, chatMessages: t.chatMessages.slice(0, -1) }
          : t
      ))
      setChatInput(msg)
    } finally {
      setSavingNoteId(null)
    }
  }

  const totalChanges = texts.reduce((s, t) => s + t.changeCount, 0)
  const totalApproved = texts.reduce((s, t) => s + t.approvals.filter(Boolean).length, 0)
  const totalRejected = texts.reduce((s, t) => s + t.approvals.filter(a => !a).length, 0)
  const typeLabel = (t: string) => t === 'narrative' ? '📖 נרטיבי' : '📄 מידעי'

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6" dir="rtl">
      {/* Header */}
      <WorkflowSteps current={3} />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Languages size={22} className="text-blue-600" />
            עריכה לשונית
          </h1>
          <p className="text-gray-500 text-sm mt-1">שלב 3: בדיקת כתיב, פיסוק, הסכמה וניסוח בשני הטקסטים</p>
        </div>
        {!loading && texts.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => navigate(`/teacher/exam/${examId}/texts?afterEdit=1`)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-semibold transition-colors"
            >
              <ChevronRight size={16} />
              חזרה לטקסט
            </button>
            {currentTextIdx > 0 && (
              <button
                onClick={() => setCurrentTextIdx(0)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-semibold transition-colors"
              >
                ← טקסט נרטיבי
              </button>
            )}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <Card className="py-14 text-center space-y-4">
          <Languages size={44} className="text-blue-400 mx-auto animate-pulse" />
          <h2 className="text-lg font-bold text-gray-800">עורכת לשונית...</h2>
          <p className="text-gray-500 text-sm">בודקת כתיב, פיסוק, הסכמה וניסוח בשני הטקסטים</p>
          <div className="flex justify-center"><Spinner /></div>
          <p className="text-xs text-gray-400">זה לוקח כ-30 שניות</p>
        </Card>
      )}

      {/* Error */}
      {error && !loading && (
        <Card className="bg-red-50 border-red-200 py-8 text-center space-y-3">
          <p className="text-red-700 font-medium">{error}</p>
          <button
            onClick={() => navigate(`/teacher/exam/${examId}/questions`)}
            className="text-sm text-blue-600 underline hover:text-blue-800"
          >
            המשך לייצור שאלות ממילא
          </button>
        </Card>
      )}

      {/* Results */}
      {!loading && texts.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-5 py-3 flex-wrap">
            <CheckCircle className="text-green-500 flex-shrink-0" size={20} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-green-800">עריכה לשונית הושלמה — {texts.length} טקסטים נבדקו</p>
              <p className="text-sm text-green-700">
                {totalChanges > 0
                  ? `${totalChanges} תיקונים מוצעים · ${totalApproved} מאושרים · ${totalRejected} נדחו`
                  : 'הטקסטים תקינים — לא נמצאו שגיאות לשוניות'}
              </p>
            </div>
            {totalApproved > 0 && <Badge color="green">{totalApproved} מאושרים</Badge>}
            {totalRejected > 0 && <Badge color="red">{totalRejected} נדחו</Badge>}
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="font-semibold">טקסט {currentTextIdx + 1} מתוך {texts.length}:</span>
            <span className="text-blue-600 font-bold">{typeLabel(texts[currentTextIdx]?.textType || '')} — {texts[currentTextIdx]?.title}</span>
          </div>

          {/* Current text panel only */}
          <div className="space-y-4">
            {texts.map((state, textIdx) => {
              if (textIdx !== currentTextIdx) return null
              const approvedCount = state.approvals.filter(Boolean).length
              const rejectedCount = state.approvals.filter(a => !a).length
              const isLastText = currentTextIdx === texts.length - 1
              return (
                <Card key={state.textId} className="overflow-hidden p-0">
                  {/* Header */}
                  <div className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 text-right">
                    <div className="flex items-center gap-3 flex-wrap">
                      <BookOpen size={18} className="text-gray-500 flex-shrink-0" />
                      <span className="font-semibold text-gray-800">{state.title}</span>
                      <span className="text-xs text-gray-500">{typeLabel(state.textType)}</span>
                      {state.changeCount > 0
                        ? <Badge color="yellow">{state.changeCount} תיקונים</Badge>
                        : <Badge color="green">ללא שגיאות</Badge>}
                      {approvedCount > 0 && <span className="text-xs text-green-600 font-medium">✓ {approvedCount} מאושר</span>}
                      {rejectedCount > 0 && <span className="text-xs text-red-500 font-medium">✗ {rejectedCount} נדחה</span>}
                    </div>
                  </div>

                  <div className="px-5 py-4 space-y-5">

                      {/* Summary */}
                      {state.summary && (
                        <p className="text-sm text-gray-600 italic border-b pb-3">{state.summary}</p>
                      )}

                      {state.changes.length === 0 ? (
                        <p className="text-sm text-green-600 py-2">✓ הטקסט תקין — לא נמצאו שגיאות לשוניות.</p>
                      ) : (
                        <div className="space-y-4">
                          {/* Toggle: טקסט מלא / רשימת תיקונים */}
                          <div className="flex gap-2">
                            <button
                              onClick={() => setViewMode('inline')}
                              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                                viewMode === 'inline'
                                  ? 'bg-blue-600 text-white shadow'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              טקסט מלא עם השינויים
                            </button>
                            <button
                              onClick={() => setViewMode('list')}
                              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                                viewMode === 'list'
                                  ? 'bg-blue-600 text-white shadow'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              רשימת תיקונים
                            </button>
                          </div>

                          {viewMode === 'inline' ? (
                            <InlineTextWithChanges
                              content={state.currentContent}
                              changes={state.changes}
                              approvals={state.approvals}
                              revertingKey={revertingKey}
                              textId={state.textId}
                              onToggle={(ci) => toggleApproval(textIdx, ci)}
                            />
                          ) : (
                            <>
                              <p className="text-xs font-bold text-gray-500 mb-3">
                                {state.changeCount} תיקונים — כל תיקון עם הקשר המשפט:
                              </p>
                              <TextWithChanges
                                content={state.currentContent}
                                changes={state.changes}
                                approvals={state.approvals}
                                revertingKey={revertingKey}
                                textId={state.textId}
                                onToggle={(ci) => toggleApproval(textIdx, ci)}
                              />
                            </>
                          )}
                        </div>
                      )}

                      {/* שיח עריכה לשונית — המורה כותבת והבינה מתקנת */}
                      <div className="border-t border-gray-200 pt-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <FileEdit size={15} className="text-purple-500" />
                          <p className="text-xs font-bold text-gray-600">שיח עריכה לשונית — כתבי הערה והבינה תתקן</p>
                        </div>
                        <p className="text-xs text-gray-400">
                          זיהית שגיאה נוספת? כתבי כאן מה לתקן — הבינה תבצע את התיקון בטקסט.
                        </p>
                        {state.chatMessages.length > 0 && (
                          <div className="space-y-2 max-h-32 overflow-y-auto">
                            {state.chatMessages.map((m, i) => (
                              <div
                                key={i}
                                className={`flex ${m.role === 'teacher' ? 'justify-start' : 'justify-end'}`}
                              >
                                <div
                                  className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                                    m.role === 'teacher'
                                      ? 'bg-purple-100 text-purple-800'
                                      : 'bg-green-50 text-green-800 border border-green-200'
                                  }`}
                                >
                                  {m.role === 'teacher' ? (
                                    <p>{m.content}</p>
                                  ) : (
                                    <p className="font-medium">✓ {m.content}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <textarea
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                sendLinguisticChat(textIdx)
                              }
                            }}
                            rows={2}
                            placeholder="לדוגמה: בפסקה 2 — 'ילד' צריך להיות 'הילד' | יש חזרה על המילה 'גדול' שלוש פעמים"
                            className="flex-1 border border-purple-200 rounded-xl px-3 py-2 text-sm text-right resize-none focus:ring-2 focus:ring-purple-300 focus:outline-none"
                            dir="rtl"
                            disabled={savingNoteId === state.textId}
                          />
                          <button
                            onClick={() => sendLinguisticChat(textIdx)}
                            disabled={!chatInput.trim() || savingNoteId === state.textId}
                            className="self-end flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 transition-colors"
                          >
                            {savingNoteId === state.textId ? <Spinner /> : <FileEdit size={14} />}
                            שלחי
                          </button>
                        </div>
                      </div>

                      {/* מעבר לטקסט הבא / המשך לשאלות */}
                      <div className="border-t border-gray-200 pt-5 mt-5">
                        {isLastText ? (
                          <button
                            onClick={() => navigate(`/teacher/exam/${examId}/questions`)}
                            className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-blue-600 text-white hover:bg-blue-700 font-bold text-base shadow-lg transition-colors"
                          >
                            אישרתי את שני הטקסטים — המשך לשאלות
                            <ChevronLeft size={20} />
                          </button>
                        ) : (
                          <button
                            onClick={() => setCurrentTextIdx(currentTextIdx + 1)}
                            className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-green-600 text-white hover:bg-green-700 font-bold text-base shadow-lg transition-colors"
                          >
                            סיימתי — מעבר לטקסט הבא
                            <ChevronLeft size={20} />
                          </button>
                        )}
                      </div>
                    </div>
                </Card>
              )
            })}
          </div>

          {/* Bottom navigation */}
          <div className="flex justify-center pt-4 border-t border-gray-200">
            <button
              onClick={() => navigate(`/teacher/exam/${examId}/texts?afterEdit=1`)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-semibold transition-colors"
            >
              <ChevronRight size={16} />
              חזרה לטקסטים
            </button>
          </div>
        </>
      )}
    </div>
  )
}
