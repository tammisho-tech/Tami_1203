import React, { useState } from 'react'
import type { Question } from '../../types'
import { DimensionBadge, Badge, Spinner } from '../ui'
import { Trash2, Edit3, Check, X, Wand2, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react'
import { examsApi } from '../../api/exams'

interface QuestionCardProps {
  question: Question
  examId?: string
  editable?: boolean
  onEdit?: (id: string, updates: Record<string, unknown>) => void
  onDelete?: (id: string) => void
  onRefresh?: () => void
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question: initialQuestion,
  examId,
  editable = false,
  onEdit,
  onDelete,
  onRefresh,
}) => {
  const [question, setQuestion] = useState<Question>(initialQuestion)
  const [editing, setEditing] = useState(false)
  const [stem, setStem] = useState(question.content?.stem || '')
  const [options, setOptions] = useState<string[]>(question.content?.options || [])
  const [correctAnswer, setCorrectAnswer] = useState(question.content?.correct_answer || '')
  const [fixingDistractors, setFixingDistractors] = useState(false)

  // Per-question AI comment state
  const [showComment, setShowComment] = useState(false)
  const [comment, setComment] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResponse, setAiResponse] = useState<string | null>(null)

  const handleAiComment = async () => {
    if (!examId || !comment.trim()) return
    setAiLoading(true)
    setAiResponse(null)
    try {
      const result = await examsApi.fixQuestion(examId, question.id, comment.trim())
      setAiResponse(result.explanation || 'בוצע שינוי.')
      if (result.question) {
        // Update the displayed question immediately with the fixed version
        setQuestion(result.question)
        setStem(result.question.content?.stem || '')
        setOptions(result.question.content?.options || [])
        setCorrectAnswer(result.question.content?.correct_answer || '')
      }
      onRefresh?.()
    } catch {
      setAiResponse('שגיאה. אנא נסי שנית.')
    } finally {
      setAiLoading(false)
    }
  }

  const formatLabels: Record<string, string> = {
    MC: 'רב-ברירה',
    OPEN: 'פתוחה',
    TABLE: 'טבלה',
    FILL: 'השלמה',
    COMIC: 'קומיקס',
    SEQUENCE: 'רצף',
    TRUE_FALSE: 'נכון/לא נכון',
    VOCAB: 'אוצר מילים',
  }

  const handleSave = () => {
    const updates: Record<string, unknown> = { stem }
    if (question.format === 'MC') {
      updates.options = options
      updates.correct_answer = correctAnswer
    }
    onEdit?.(question.id, updates)
    setEditing(false)
  }

  const handleFixDistractors = async () => {
    if (!examId) return
    setFixingDistractors(true)
    try {
      const result = await examsApi.fixDistractors(examId, question.id, stem, correctAnswer)
      if (result.options) setOptions(result.options)
    } finally {
      setFixingDistractors(false)
    }
  }

  const updateOption = (idx: number, val: string) => {
    setOptions(prev => prev.map((o, i) => i === idx ? val : o))
    if (options[idx] === correctAnswer) setCorrectAnswer(val)
  }

  return (
    <div className={`bg-white border rounded-xl p-4 space-y-3 ${question.is_cross_text ? 'border-purple-300 bg-purple-50' : 'border-gray-200'}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-500">שאלה {question.sequence_number}</span>
          <DimensionBadge dim={question.dimension} />
          <Badge color="gray">{formatLabels[question.format] || question.format}</Badge>
          <Badge color="blue">{question.score_points} נק׳</Badge>
          {question.is_cross_text && <Badge color="purple">שאלת מיזוג</Badge>}
        </div>
        {editable && (
          <div className="flex gap-1">
            {editing ? (
              <>
                <button onClick={handleSave} className="text-green-600 hover:text-green-700 p-1"><Check size={16} /></button>
                <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-gray-600 p-1"><Edit3 size={16} /></button>
                <button onClick={() => onDelete?.(question.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16} /></button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Question stem */}
      {editing ? (
        <textarea
          value={stem}
          onChange={e => setStem(e.target.value)}
          rows={3}
          className="w-full border border-gray-300 rounded px-3 py-2 text-right text-sm"
        />
      ) : (
        <p className="text-gray-800 leading-7">{question.content?.stem}</p>
      )}

      {/* MC Options */}
      {question.format === 'MC' && (
        <div className="space-y-1 pr-4">
          {editing ? (
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${question.id}`}
                    checked={opt === correctAnswer}
                    onChange={() => setCorrectAnswer(opt)}
                    className="flex-shrink-0"
                    title="סמני כתשובה נכונה"
                  />
                  <input
                    value={opt}
                    onChange={e => updateOption(i, e.target.value)}
                    className={`flex-1 border rounded px-2 py-1 text-sm text-right ${opt === correctAnswer ? 'border-green-400 bg-green-50' : 'border-gray-300'}`}
                  />
                </div>
              ))}
              <button
                onClick={handleFixDistractors}
                disabled={fixingDistractors}
                className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 mt-1 disabled:opacity-50"
              >
                <Wand2 size={12} />
                {fixingDistractors ? 'מתקן מסיחים...' : 'תקן מסיחים אוטומטית'}
              </button>
            </div>
          ) : (
            question.content?.options?.map((opt, i) => (
              <div
                key={i}
                className={`text-sm px-3 py-1.5 rounded-lg ${
                  opt === question.content?.correct_answer
                    ? 'bg-green-50 border border-green-300 text-green-800 font-medium'
                    : 'bg-gray-50 text-gray-700'
                }`}
              >
                {opt}
                {opt === question.content?.correct_answer && (
                  <span className="text-green-600 text-xs mr-2">(✓ נכון)</span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* TABLE display */}
      {question.format === 'TABLE' && !editing && question.content?.table_headers && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {question.content.table_headers.map((h: string, i: number) => (
                  <th key={i} className="border border-gray-300 bg-gray-100 px-3 py-1.5 text-right font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(question.content.table_rows || []).map((row: string[], ri: number) => (
                <tr key={ri}>
                  {row.map((cell: string, ci: number) => (
                    <td key={ci} className="border border-gray-300 px-3 py-1.5 text-right min-w-[80px]">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SEQUENCE display */}
      {question.format === 'SEQUENCE' && !editing && question.content?.items && (
        <div className="space-y-1 pr-2">
          <p className="text-xs text-gray-500 font-medium">סדרו לפי הסדר הנכון:</p>
          {question.content.items.map((item: string, i: number) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm">
              <span className="w-6 h-6 rounded-full border-2 border-gray-300 flex-shrink-0 text-xs flex items-center justify-center text-gray-400">_</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}

      {/* TRUE_FALSE display */}
      {question.format === 'TRUE_FALSE' && !editing && question.content?.statements && (
        <div className="space-y-2 pr-2">
          <p className="text-xs text-gray-500 font-medium">היגדים (V נכון / X לא נכון + תיקון):</p>
          {(question.content.statements as Array<string | { text: string; correct: boolean }>).map((stmt, i) => {
            const text = typeof stmt === 'string' ? stmt : stmt.text
            const correct = typeof stmt === 'string' ? undefined : stmt.correct
            return (
              <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded border-2 border-gray-400 flex items-center justify-center text-xs font-bold text-gray-400 flex-shrink-0">
                      {correct === true ? 'V' : correct === false ? 'X' : ''}
                    </span>
                    <span className="flex-1">{text}</span>
                  </div>
                  {correct !== undefined && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {correct ? 'נכון ✓' : 'לא נכון — יש לתקן'}
                    </span>
                  )}
                </div>
                {correct === false && (
                  <div className="mr-7 border-b border-dashed border-gray-300 text-xs text-gray-400 pt-1">
                    תיקון: _______________
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* VOCAB display */}
      {question.format === 'VOCAB' && !editing && question.content?.word && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm">
          <span className="text-amber-700 font-semibold">מילה/ביטוי: </span>
          <span className="font-bold text-amber-900">{question.content.word}</span>
          {question.content.context_sentence && (
            <p className="text-xs text-amber-700 mt-1">הקשר: {question.content.context_sentence}</p>
          )}
        </div>
      )}

      {/* Rubric for all non-MC formats */}
      {question.format !== 'MC' && question.rubric && (
        <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1 border-r-4 border-gray-400">
          <div className="font-medium text-gray-600">מחוון ({question.rubric.max_score ?? question.score_points} נקודות):</div>
          {question.rubric.criteria && question.rubric.criteria.length > 0 && (
            <ul className="list-disc list-inside space-y-0.5 text-gray-700">
              {question.rubric.criteria.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          )}
          {question.rubric.partial_credit && (
            <div className="text-gray-500 text-xs mt-1">ניקוד חלקי: {question.rubric.partial_credit}</div>
          )}
          {question.rubric.sample_answer && (
            <div className="bg-green-50 border border-green-200 rounded p-2 text-xs mt-1">
              <span className="font-medium text-green-700">תשובה אפשרית: </span>
              <span className="text-green-800">{question.rubric.sample_answer}</span>
            </div>
          )}
        </div>
      )}

      {/* Per-question AI comment panel */}
      {examId && (
        <div className="border-t border-gray-100 pt-2">
          <button
            onClick={() => { setShowComment(v => !v); setAiResponse(null) }}
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
          >
            <MessageSquare size={13} />
            הערה לתיקון AI
            {showComment ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {showComment && (
            <div className="mt-2 space-y-2">
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleAiComment() }}
                placeholder={`לדוגמה: "המסיחים לא מאתגרים" / "שנה לשאלה פתוחה" / "השאלה קלה מדי לממד ג'" / "הוסף דרישת ציטוט"`}
                rows={2}
                className="w-full text-sm border border-indigo-200 rounded-lg px-3 py-2 text-right resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-gray-400"
                dir="rtl"
              />
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => { setShowComment(false); setComment(''); setAiResponse(null) }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  ביטול
                </button>
                <button
                  onClick={handleAiComment}
                  disabled={!comment.trim() || aiLoading}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {aiLoading ? <Spinner size={11} /> : <Wand2 size={12} />}
                  {aiLoading ? 'מתקנת...' : 'שלחי לתיקון AI'}
                </button>
              </div>
              <p className="text-xs text-gray-400 text-left">Ctrl+Enter לשליחה מהירה</p>

              {aiLoading && (
                <div className="flex items-center gap-2 text-xs text-indigo-500 bg-indigo-50 rounded-lg px-3 py-2">
                  <Spinner size={12} />
                  <span>הבינה מנתחת את השאלה ומתקנת על פי הנחיות ראמ"ה...</span>
                </div>
              )}

              {aiResponse && !aiLoading && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1">
                    <Wand2 size={11} /> השאלה עודכנה:
                  </p>
                  <p className="text-sm text-indigo-900 leading-relaxed">{aiResponse}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
