import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { examsApi } from '../../api/exams'
import type { ExamText, Question } from '../../types'
import { WorkflowSteps, PageHeader, Button, Spinner } from '../../components/ui'
import { BookOpen, FileText } from 'lucide-react'

// ─── NC text types ────────────────────────────────────────────────────────────
interface Sidebar {
  type: string
  title: string
  content: string
  source?: string
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

// ─── Sidebar visual config ────────────────────────────────────────────────────
const SIDEBAR_CFG: Record<string, {
  border: string; bg: string; titleBg: string; titleColor: string; icon: string; label: string
}> = {
  definition:     { border: '#2563EB', bg: '#EFF6FF', titleBg: '#DBEAFE', titleColor: '#1D4ED8', icon: '📖', label: 'הגדרה' },
  editorial:      { border: '#7C3AED', bg: '#F5F3FF', titleBg: '#EDE9FE', titleColor: '#5B21B6', icon: '✍️', label: 'עמדה' },
  news_item:      { border: '#EA580C', bg: '#FFF7ED', titleBg: '#FED7AA', titleColor: '#9A3412', icon: '📰', label: 'ידיעה' },
  survey:         { border: '#16A34A', bg: '#F0FDF4', titleBg: '#BBF7D0', titleColor: '#15803D', icon: '📊', label: 'סקר' },
  example:        { border: '#0D9488', bg: '#F0FDFA', titleBg: '#CCFBF1', titleColor: '#0F766E', icon: '💡', label: 'דוגמה' },
  fact_box:       { border: '#D97706', bg: '#FFFBEB', titleBg: '#FDE68A', titleColor: '#92400E', icon: '⭐', label: 'עובדות' },
  diary:          { border: '#E11D48', bg: '#FFF1F2', titleBg: '#FFE4E6', titleColor: '#9F1239', icon: '📔', label: 'יומן' },
  list:           { border: '#0284C7', bg: '#F0F9FF', titleBg: '#BAE6FD', titleColor: '#075985', icon: '📋', label: 'רשימה' },
  knowledge_link: { border: '#4F46E5', bg: '#EEF2FF', titleBg: '#C7D2FE', titleColor: '#3730A3', icon: '🔗', label: 'קשר לתחום דעת' },
}
const DEFAULT_SB_CFG = { border: '#9CA3AF', bg: '#F9FAFB', titleBg: '#F3F4F6', titleColor: '#374151', icon: '📌', label: 'רכיב' }

// ─── Sidebar box component ────────────────────────────────────────────────────
function SidebarBox({ sb }: { sb: Sidebar }) {
  const cfg = SIDEBAR_CFG[sb?.type || ''] || DEFAULT_SB_CFG
  return (
    <div style={{
      border: `2px solid ${cfg.border}`,
      borderRadius: '14px',
      overflow: 'hidden',
      marginBottom: '16px',
      boxShadow: `0 2px 10px ${cfg.border}22`,
    }}>
      {/* Header */}
      <div style={{
        background: cfg.titleBg,
        padding: '9px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '7px',
        borderBottom: `1.5px solid ${cfg.border}55`,
      }}>
        <span style={{ fontSize: '18px' }}>{cfg.icon}</span>
        <div>
          <div style={{ fontWeight: 700, color: cfg.titleColor, fontSize: '13px', lineHeight: 1.3 }}>
            {sb?.title ?? 'רכיב נלווה'}
          </div>
          <div style={{ fontSize: '10px', color: cfg.titleColor + '99', fontWeight: 600 }}>
            {cfg.label}
          </div>
        </div>
      </div>
      {/* Body */}
      <div style={{ background: cfg.bg, padding: '12px 14px' }}>
        <div style={{
          color: '#374151',
          fontSize: '13.5px',
          lineHeight: '1.9',
          whiteSpace: 'pre-wrap',
          direction: 'rtl',
        }}>
          {sb?.content ?? ''}
        </div>
        {sb?.source && (
          <div style={{
            marginTop: '8px',
            paddingTop: '6px',
            borderTop: `1px dashed ${cfg.border}55`,
            fontSize: '11px',
            color: cfg.titleColor,
            fontStyle: 'italic',
          }}>
            📎 מקור: {sb.source}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Magazine article (NC) renderer ──────────────────────────────────────────
function MagazineArticle({ content, accentColor }: { content: string; accentColor: string }) {
  const nc = parseNC(content)
  if (!nc) {
    const paras = content.split(/\n\n+/).filter(p => p.trim())
    return (
      <div dir="rtl" style={{ fontFamily: '"Noto Serif Hebrew", "David", serif' }}>
        {paras.map((p, i) => (
          <p key={i} style={{ marginBottom: '1.4em', lineHeight: '2.1', fontSize: '16px', color: '#1a1a2e' }}>{p}</p>
        ))}
      </div>
    )
  }

  const paragraphs = (nc.main || '').split(/\n\n+/).filter(p => p.trim())
  const sidebars = nc.sidebars || []

  return (
    <div dir="rtl">
      {/* Magazine badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '18px',
        padding: '8px 14px',
        background: `linear-gradient(135deg, ${accentColor}15, ${accentColor}08)`,
        borderRadius: '10px',
        border: `1px solid ${accentColor}30`,
      }}>
        <span style={{ fontSize: '20px' }}>📰</span>
        <div>
          <div style={{ fontWeight: 700, color: accentColor, fontSize: '13px' }}>טקסט לא-רציף</div>
          <div style={{ fontSize: '11px', color: '#9ca3af' }}>שני טורים — כתבה מרכזית | רכיבים נלווים</div>
        </div>
      </div>

      {/* Two-column grid: כתבה מרכזית (ימין) | רכיבים נלווים (שמאל) */}
      <div
        className="grid grid-cols-1 md:grid-cols-[minmax(0,1.8fr)_minmax(260px,0.7fr)] gap-6 items-start"
        style={{ direction: 'rtl' }}
      >
        {/* טור ימני — כתבה מרכזית */}
        <div style={{ fontFamily: '"Noto Serif Hebrew", "David", serif', minWidth: 0, borderRight: `2px solid ${accentColor}40`, paddingRight: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: accentColor, marginBottom: '10px' }}>📄 כתבה מרכזית</div>
          {paragraphs.map((para, i) => (
            <p key={i} style={{
              marginBottom: '1.35em',
              lineHeight: '2.15',
              fontSize: '16px',
              color: '#1a1a2e',
              textAlign: 'justify',
            }}>{para}</p>
          ))}
        </div>

        {/* טור שמאלי — רכיבים נלווים */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '260px' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: accentColor, marginBottom: '4px' }}>📦 רכיבים נלווים</div>
          {sidebars.map((sb, i) => <SidebarBox key={i} sb={sb} />)}
        </div>
      </div>
    </div>
  )
}

// ─── Question card preview ────────────────────────────────────────────────────
function QuestionCard({
  question, index, accentColor,
}: {
  question: Question
  index: number
  accentColor: string
}) {
  const content = question.content
  const format = question.format
  const pts = question.score_points

  const FORMAT_LABELS: Record<string, string> = {
    MC: 'רב-ברירה',
    OPEN: 'פתוחה',
    TABLE: 'טבלה',
    TRUE_FALSE: 'נכון/לא נכון',
    SEQUENCE: 'סדר נכון',
    FILL: 'השלמה',
    multiple_choice: 'רב-ברירה',
    open: 'פתוחה',
  }

  return (
    <div style={{
      border: `1.5px solid ${accentColor}30`,
      borderRadius: '14px',
      padding: '16px 20px',
      marginBottom: '12px',
      background: 'white',
      boxShadow: `0 2px 8px ${accentColor}12`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <div style={{
          width: '32px', height: '32px',
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
          color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: '14px',
          flexShrink: 0,
          boxShadow: `0 2px 8px ${accentColor}55`,
        }}>
          {index + 1}
        </div>
        <span style={{
          fontSize: '11px', background: `${accentColor}15`, color: accentColor,
          padding: '3px 10px', borderRadius: '20px', fontWeight: 600,
        }}>
          {FORMAT_LABELS[format] || format}
        </span>
      </div>
      <p style={{ fontSize: '15px', lineHeight: '1.85', color: '#1a1a2e', fontFamily: 'Rubik, Arial, sans-serif' }}>
        {content?.stem}
      </p>
      {(format === 'MC' || (format as string) === 'multiple_choice') && Array.isArray(content?.options) && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {(content.options as string[]).map((opt, j) => (
            <div key={j} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px', color: '#374151',
            }}>
              <span style={{
                width: '22px', height: '22px',
                borderRadius: '50%',
                border: `1.5px solid ${accentColor}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', color: accentColor, fontWeight: 700,
                flexShrink: 0,
              }}>
                {String.fromCharCode(1488 + j)}
              </span>
              {/* strip any leading number/letter+punctuation that AI may have added */}
              {String(opt).replace(/^[\d\u05d0-\u05ea][.).\s]\s*/, '')}
            </div>
          ))}
        </div>
      )}
      {(format === 'OPEN' || (format as string) === 'open') && (
        <div style={{
          marginTop: '10px',
          border: `1px dashed ${accentColor}40`,
          borderRadius: '8px',
          padding: '10px 14px',
          minHeight: '56px',
          background: `${accentColor}06`,
          fontSize: '12px', color: '#9ca3af',
        }}>
          שטח לכתיבת תשובה...
        </div>
      )}
      {format === 'TABLE' && content?.table_headers && content?.table_rows && (
        <div style={{ marginTop: '10px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            <thead>
              <tr>
                {(content.table_headers as string[]).map((h, i) => (
                  <th key={i} style={{ border: '1px solid #e5e7eb', padding: '8px 12px', background: `${accentColor}20`, color: accentColor, fontWeight: 700, textAlign: 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(content.table_rows as string[][]).map((row, ri) => (
                <tr key={ri}>
                  {(row || []).map((cell, ci) => (
                    <td key={ci} style={{ border: '1px solid #e5e7eb', padding: '8px 12px', textAlign: 'right', color: '#374151' }}>
                      {cell === '' || cell === undefined ? '...' : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pts && (
        <div style={{ marginTop: '8px', textAlign: 'left', fontSize: '11px', color: '#9ca3af' }}>
          ({pts} נק׳)
        </div>
      )}
    </div>
  )
}

// ─── Text section preview — sticky two-panel layout ──────────────────────────
function TextSection({
  text,
  questions,
  accentColor,
  label,
  icon,
}: {
  text: ExamText | undefined
  questions: Question[]
  accentColor: string
  label: string
  icon: React.ReactNode
}) {
  if (!text) return null
  return (
    <div style={{
      background: 'white',
      borderRadius: '20px',
      overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
      marginBottom: '16px',
    }}>
      {/* Section header */}
      <div style={{
        padding: '14px 24px',
        background: `linear-gradient(135deg, ${accentColor}, ${accentColor}bb)`,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div style={{
          width: '42px', height: '42px',
          borderRadius: '12px',
          background: 'rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white',
        }}>
          {icon}
        </div>
        <div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '12px', fontWeight: 600 }}>{label}</div>
          <div style={{
            color: 'white',
            fontWeight: 800,
            fontSize: '20px',
            fontFamily: 'Rubik, Arial, sans-serif',
          }}>
            {text.title}
          </div>
        </div>
        {text.word_count && (
          <div style={{
            marginRight: 'auto',
            background: 'rgba(255,255,255,0.15)',
            color: 'white',
            fontSize: '12px',
            padding: '4px 12px',
            borderRadius: '20px',
          }}>
            {text.word_count} מילים
          </div>
        )}
      </div>

      {/* Two-panel layout: text RIGHT (sticky) + questions LEFT (scroll) */}
      <div style={{ display: 'flex', direction: 'rtl', alignItems: 'flex-start', minHeight: '300px' }}>

        {/* RIGHT: text (sticky, scrollable) */}
        <div style={{
          flex: '1 1 55%',
          position: 'sticky',
          top: '80px',
          maxHeight: '70vh',
          overflowY: 'auto',
          padding: '24px 28px',
          borderInlineStart: '1px solid #f0f0f0',
        }}>
          <MagazineArticle content={text.content || ''} accentColor={accentColor} />
        </div>

        {/* LEFT: questions (scrollable) */}
        <div style={{
          flex: '1 1 45%',
          padding: '24px 28px',
          background: '#fafbfc',
          overflowY: 'auto',
        }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 700,
            color: accentColor,
            marginBottom: '16px',
            paddingBottom: '10px',
            borderBottom: `2px solid ${accentColor}30`,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            ❓ שאלות ({questions.length})
          </div>
          {questions.map((q, i) => (
            <QuestionCard key={q.id} question={q} index={i} accentColor={accentColor} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ExamDesign() {
  const { examId } = useParams<{ examId: string }>()
  const navigate = useNavigate()
  // תצוגה מקדימה אחת — כמו שהתלמיד יראה (בלי הבחנה מיותרת)

  const { data: exam, isLoading } = useQuery({
    queryKey: ['exam', examId],
    queryFn: () => examsApi.get(examId!),
    enabled: !!examId,
  })

  if (isLoading) return <Spinner text="טוען תצוגה מעוצבת..." />

  const texts = exam?.texts || []
  const questions = exam?.questions || []

  // Sort texts: narrative first, then informational (stable order for display)
  const textTypeOrder = (t: ExamText) => (String(t.text_type || '').toLowerCase() === 'narrative' ? 0 : 1)
  const orderedTexts = [...texts].sort((a, b) => textTypeOrder(a) - textTypeOrder(b))

  const narrText = orderedTexts.find(t => String(t.text_type || '').toLowerCase() === 'narrative')
  const infoText = orderedTexts.find(t => String(t.text_type || '').toLowerCase() === 'informational')

  const narrQs = questions.filter(q => !q.is_cross_text && String(q.text_id) === String(narrText?.id))
  let infoQs = questions.filter(q => !q.is_cross_text && String(q.text_id) === String(infoText?.id))
  const crossQs = questions.filter(q => q.is_cross_text)

  // Fallback: if infoQs empty but we have orphaned questions (e.g. after text regeneration),
  // assign them to the second text for display
  if (infoQs.length === 0 && infoText && orderedTexts.length >= 2) {
    const narrIds = new Set(narrQs.map(q => q.id))
    const crossIds = new Set(crossQs.map(q => q.id))
    const orphaned = questions.filter(q => !q.is_cross_text && !narrIds.has(q.id) && !crossIds.has(q.id))
    if (orphaned.length > 0) infoQs = orphaned
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4" dir="rtl">
      <WorkflowSteps current={5} />
      <PageHeader
        title={exam?.title || ''}
        subtitle="שלב 5: עיצוב גרפי — תצוגה מקדימה (כמו שהתלמיד יראה)"
        teacher={exam?.topic_values?.teacher_name}
      />

      {/* תצוגה מקדימה אחת — כמו שהתלמיד יראה */}
      <StudentPreview
        narrText={narrText}
        infoText={infoText}
        narrQs={narrQs}
        infoQs={infoQs}
        crossQs={crossQs}
        examTitle={exam?.title}
      />

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <Button variant="secondary" onClick={() => navigate(`/teacher/exam/${examId}/questions`)}>
          ← חזרה לשאלות
        </Button>
        <Button onClick={() => navigate(`/teacher/exam/${examId}/ready`)}>
          המשך לפרסום ←
        </Button>
      </div>
    </div>
  )
}

// ─── Student preview (colorful) ──────────────────────────────────────────────
function StudentPreview({
  narrText, infoText, narrQs, infoQs, crossQs, examTitle,
}: {
  narrText: ExamText | undefined
  infoText: ExamText | undefined
  narrQs: Question[]
  infoQs: Question[]
  crossQs: Question[]
  examTitle?: string
}) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #f0f9ff 0%, #fdf4ff 50%, #fff7ed 100%)',
      borderRadius: '20px',
      padding: '24px',
      border: '2px solid #e0e7ff',
    }}>
      {/* Student header bar */}
      <div style={{
        background: 'linear-gradient(135deg, #1565C0 0%, #7B1FA2 50%, #D81B60 100%)',
        borderRadius: '16px',
        padding: '18px 24px',
        marginBottom: '24px',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        boxShadow: '0 6px 24px rgba(100,50,200,0.35)',
      }}>
        <span style={{ fontSize: '32px' }}>🎓</span>
        <div>
          <div style={{ fontSize: '11px', opacity: 0.8, fontWeight: 600 }}>מבחן הבנת הנקרא</div>
          <div style={{ fontSize: '19px', fontWeight: 800 }}>{examTitle}</div>
        </div>
        <div style={{
          marginRight: 'auto',
          background: 'rgba(255,255,255,0.2)',
          borderRadius: '12px',
          padding: '8px 14px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 700 }}>תצוגה מקדימה</div>
        </div>
      </div>

      {narrText && (
        <StudentSectionCard
          text={narrText}
          questions={narrQs}
          label="טקסט נרטיבי"
          gradient="linear-gradient(135deg, #1565C0, #1E88E5)"
          bg="#eff6ff"
          questionBg="#dbeafe"
          accentColor="#1565C0"
        />
      )}
      {infoText && (
        <StudentSectionCard
          text={infoText}
          questions={[...infoQs, ...crossQs].sort((a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0))}
          label="טקסט מידעי"
          gradient="linear-gradient(135deg, #0e7490, #0891b2)"
          bg="#f0fdfa"
          questionBg="#ccfbf1"
          accentColor="#0e7490"
        />
      )}
    </div>
  )
}

function StudentSectionCard({
  text, questions, label, gradient, bg, questionBg, accentColor,
}: {
  text: ExamText
  questions: Question[]
  label: string
  gradient: string
  bg: string
  questionBg: string
  accentColor: string
}) {
  return (
    <div style={{
      background: 'white',
      borderRadius: '16px',
      overflow: 'hidden',
      marginBottom: '20px',
      border: `2px solid ${accentColor}30`,
      boxShadow: `0 4px 16px ${accentColor}15`,
    }}>
      <div style={{
        background: gradient,
        padding: '14px 20px',
        color: 'white',
        fontWeight: 800,
        fontSize: '17px',
        fontFamily: 'Rubik, Arial, sans-serif',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <span style={{
          background: 'rgba(255,255,255,0.2)',
          padding: '4px 10px',
          borderRadius: '10px',
          fontSize: '12px',
          fontWeight: 600,
        }}>{label}</span>
        {text.title}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', direction: 'rtl' }}>
        <div style={{ padding: '20px', background: bg, borderLeft: `1px solid ${accentColor}20`, borderInlineStart: `1px solid ${accentColor}20` }}>
          <MagazineArticle content={text.content || ''} accentColor={accentColor} />
        </div>
        <div style={{ padding: '20px', background: questionBg + '66' }}>
          <div style={{ fontWeight: 700, fontSize: '13px', color: accentColor, marginBottom: '12px' }}>שאלות</div>
          {questions.map((q, i) => (
            <StudentQuestionCard key={q.id} question={q} index={i} accentColor={accentColor} bg={questionBg} />
          ))}
        </div>
      </div>
    </div>
  )
}

function StudentQuestionCard({
  question, index, accentColor, bg,
}: {
  question: Question
  index: number
  accentColor: string
  bg?: string
}) {
  const content = question.content
  const format = question.format
  const pts = question.score_points
  return (
    <div style={{
      background: bg || `${accentColor}10`,
      borderRadius: '12px',
      padding: '14px 16px',
      marginBottom: '12px',
      border: `1.5px solid ${accentColor}30`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div style={{
          width: '28px', height: '28px',
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
          color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: '13px',
          flexShrink: 0,
        }}>
          {index + 1}
        </div>
        {pts && (
          <span style={{ fontSize: '11px', background: `${accentColor}20`, color: accentColor, padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
            {pts} נק׳
          </span>
        )}
      </div>
      <p style={{ fontSize: '15px', lineHeight: '1.85', color: '#1a1a2e', fontFamily: 'Rubik, Arial, sans-serif' }}>
        {content?.stem}
      </p>
      {(format === 'MC' || (format as string) === 'multiple_choice') && Array.isArray(content?.options) && (
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {(content.options as string[]).map((opt, j) => (
            <div key={j} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 12px',
              background: 'white',
              border: `1px solid ${accentColor}30`,
              borderRadius: '8px',
              fontSize: '14px', color: '#374151',
            }}>
              <span style={{
                width: '20px', height: '20px',
                borderRadius: '50%',
                border: `1.5px solid ${accentColor}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', color: accentColor, fontWeight: 700,
                flexShrink: 0,
              }}>
                {String.fromCharCode(1488 + j)}
              </span>
              {String(opt).replace(/^[\d\u05d0-\u05ea][.).\s]\s*/, '')}
            </div>
          ))}
        </div>
      )}
      {(format === 'OPEN' || (format as string) === 'open') && (
        <div style={{
          marginTop: '8px',
          background: 'white',
          border: `1px dashed ${accentColor}50`,
          borderRadius: '8px',
          padding: '10px',
          minHeight: '52px',
          fontSize: '12px', color: '#9ca3af',
        }}>
          כתוב/י כאן את תשובתך...
        </div>
      )}
      {format === 'TABLE' && content?.table_headers && content?.table_rows && (
        <div style={{ marginTop: '10px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            <thead>
              <tr>
                {(content.table_headers as string[]).map((h, i) => (
                  <th key={i} style={{ border: '1px solid #e5e7eb', padding: '8px 12px', background: `${accentColor}20`, color: accentColor, fontWeight: 700, textAlign: 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(content.table_rows as string[][]).map((row, ri) => (
                <tr key={ri}>
                  {(row || []).map((cell, ci) => (
                    <td key={ci} style={{ border: '1px solid #e5e7eb', padding: '8px 12px', textAlign: 'right', color: '#374151' }}>
                      {cell === '' || cell === undefined ? '...' : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
