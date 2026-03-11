import React, { useState } from 'react'
import type { ExamText } from '../../types'
import { Badge, Button } from '../ui'
import { ChevronDown, ChevronUp, Edit3 } from 'lucide-react'

interface Sidebar {
  type: string
  title: string
  content: string
}

interface NonContinuousContent {
  __nc: true
  main: string
  sidebars: Sidebar[]
}

function parseNonContinuous(content: string | object): NonContinuousContent | null {
  if (!content) return null
  let parsed: { __nc?: boolean; main?: string; sidebars?: unknown[] }
  if (typeof content === 'string') {
    if (!content.startsWith('{"__nc":') && !content.startsWith('{')) return null
    try {
      parsed = JSON.parse(content)
    } catch { return null }
  } else if (typeof content === 'object' && content !== null && '__nc' in content) {
    parsed = content as { __nc?: boolean; main?: string; sidebars?: unknown[] }
  } else {
    return null
  }
  if (parsed.__nc) {
    const sidebars = Array.isArray(parsed.sidebars)
      ? parsed.sidebars.map(sb => (typeof sb === 'object' && sb !== null)
        ? { type: (sb as { type?: string }).type ?? '', title: (sb as { title?: string }).title ?? 'רכיב נלווה', content: (sb as { content?: string }).content ?? '' }
        : { type: '', title: 'רכיב נלווה', content: '' })
      : []
    return {
      __nc: true,
      main: parsed.main ?? '',
      sidebars,
    } as NonContinuousContent
  }
  return null
}

const SIDEBAR_STYLES: Record<string, { border: string; bg: string; title: string; icon: string }> = {
  definition:     { border: 'border-blue-400',   bg: 'bg-blue-50',   title: 'text-blue-800',   icon: '📖' },
  editorial:      { border: 'border-purple-400', bg: 'bg-purple-50', title: 'text-purple-800', icon: '✍️' },
  news_item:      { border: 'border-orange-400', bg: 'bg-orange-50', title: 'text-orange-800', icon: '📰' },
  survey:         { border: 'border-green-400',  bg: 'bg-green-50',  title: 'text-green-800',  icon: '📊' },
  example:        { border: 'border-teal-400',   bg: 'bg-teal-50',   title: 'text-teal-800',   icon: '💡' },
  fact_box:       { border: 'border-amber-400',  bg: 'bg-amber-50',  title: 'text-amber-800',  icon: '⭐' },
  diary:          { border: 'border-rose-400',   bg: 'bg-rose-50',   title: 'text-rose-800',   icon: '📔' },
  list:           { border: 'border-cyan-400',   bg: 'bg-cyan-50',   title: 'text-cyan-800',   icon: '📋' },
  knowledge_link: { border: 'border-indigo-400', bg: 'bg-indigo-50', title: 'text-indigo-800', icon: '🔗' },
}
const DEFAULT_SIDEBAR = { border: 'border-gray-400', bg: 'bg-gray-50', title: 'text-gray-700', icon: '📌' }

interface TextDisplayProps {
  text: ExamText
  showAnchors?: boolean
  editable?: boolean
  onEdit?: (textId: string, content: string, title: string) => void
}

const DIM_COLORS: Record<string, string> = {
  A: 'bg-blue-200 text-blue-900',
  B: 'bg-green-200 text-green-900',
  C: 'bg-yellow-200 text-yellow-900',
  D: 'bg-pink-200 text-pink-900',
}

const DIM_LABELS: Record<string, string> = {
  A: 'גלוי (א׳)',
  B: 'משתמע (ב׳)',
  C: 'פרשנות (ג׳)',
  D: 'הערכה (ד׳)',
}

function highlightAnchors(content: string, anchorMap: Record<string, string[]>): React.ReactNode {
  // Build a flat list of {dim, sentence} to highlight
  const highlights: { dim: string; sentence: string }[] = []
  for (const [dim, sentences] of Object.entries(anchorMap)) {
    for (const s of sentences) {
      if (s && s.length > 10) highlights.push({ dim, sentence: s.trim() })
    }
  }

  if (!highlights.length) {
    return <span>{content}</span>
  }

  // Simple highlight: replace anchor sentences with highlighted spans
  let remaining = content
  const parts: React.ReactNode[] = []
  let key = 0

  for (const { dim, sentence } of highlights) {
    const idx = remaining.indexOf(sentence)
    if (idx === -1) continue
    if (idx > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, idx)}</span>)
    }
    parts.push(
      <mark key={key++} className={`${DIM_COLORS[dim]} rounded px-0.5`} title={DIM_LABELS[dim]}>
        {sentence}
      </mark>
    )
    remaining = remaining.slice(idx + sentence.length)
  }
  if (remaining) parts.push(<span key={key++}>{remaining}</span>)

  return <>{parts}</>
}

export const TextDisplay: React.FC<TextDisplayProps> = ({
  text,
  showAnchors = false,
  editable = false,
  onEdit,
}) => {
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(text.content)
  const [editTitle, setEditTitle] = useState(text.title)
  const [showAnchorLegend, setShowAnchorLegend] = useState(false)

  const ncData = parseNonContinuous(text.content)
  const typeLabel = text.text_type === 'narrative' ? '📖 נרטיבי' : ncData ? '📄 מידעי (לא-רציף)' : '📄 מידעי'

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold">{text.title}</span>
          <Badge color="gray">{typeLabel}</Badge>
          <Badge color="blue">{text.word_count} מילים</Badge>
        </div>
        <div className="flex gap-2">
          {showAnchors && (
            <button
              onClick={() => setShowAnchorLegend(!showAnchorLegend)}
              className="text-xs text-blue-600 flex items-center gap-1"
            >
              עוגנים {showAnchorLegend ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
          {editable && !editing && (
            <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-gray-600">
              <Edit3 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Anchor legend */}
      {showAnchors && showAnchorLegend && (
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex gap-3 text-xs flex-wrap">
          {Object.entries(DIM_LABELS).map(([dim, label]) => (
            <span key={dim} className={`px-2 py-0.5 rounded ${DIM_COLORS[dim]}`}>
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="p-5">
        {editing ? (
          <div className="space-y-3">
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-right font-bold"
              placeholder="כותרת הטקסט"
            />
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              rows={15}
              className="w-full border border-gray-300 rounded px-3 py-2 text-right leading-8 text-sm"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setEditing(false)}>ביטול</Button>
              <Button
                onClick={() => {
                  onEdit?.(text.id, editContent, editTitle)
                  setEditing(false)
                }}
              >
                שמור
              </Button>
            </div>
          </div>
        ) : ncData ? (
          /* Non-continuous: magazine layout — main article (right) + sidebars column (left) */
          (() => {
            const paragraphs = (ncData.main || '').split(/\n\n+/).filter(p => p.trim())
            const sidebars = ncData.sidebars || []

            return (
              <div dir="rtl" className="w-full">
                {/* Magazine label */}
                <div className="flex items-center gap-2 mb-4 pb-3 border-b-2 border-dashed border-gray-200">
                  <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">📰 טקסט לא-רציף</span>
                  <span className="text-xs text-gray-400">כתבה מרכזית + רכיבים נלווים — שני טורים</span>
                </div>

                {/* Grid: שני טורים — כתבה מרכזית (ימין) | רכיבים נלווים (שמאל). RTL */}
                <div
                  className="grid grid-cols-1 md:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.7fr)] gap-6 items-start"
                  style={{ direction: 'rtl' }}
                >
                  {/* טור ימני — כתבה מרכזית */}
                  <div className="min-w-0 border-r-2 border-indigo-200 pr-4 md:pr-6">
                    <div className="text-xs font-bold text-indigo-700 mb-3">📄 כתבה מרכזית</div>
                    {paragraphs.map((para, i) => (
                      <p key={i} className="mb-4 leading-8 text-base text-gray-800">
                        {showAnchors
                          ? highlightAnchors(para, text.anchor_map || {})
                          : para}
                      </p>
                    ))}
                  </div>

                  {/* טור שמאלי — רכיבים נלווים */}
                  <div className="flex flex-col gap-4 md:min-w-[280px]">
                    <div className="text-xs font-bold text-indigo-700 mb-1">📦 רכיבים נלווים</div>
                    {sidebars.map((sb, i) => {
                      const style = SIDEBAR_STYLES[sb?.type] || DEFAULT_SIDEBAR
                      const title = sb?.title ?? 'רכיב נלווה'
                      const body = sb?.content ?? ''
                      return (
                        <div
                          key={i}
                          className={`rounded-xl border-2 ${style.border} ${style.bg} p-4 shadow-sm`}
                        >
                          <div className={`font-bold text-sm mb-2 pb-2 border-b-2 flex items-center gap-2 ${style.title} ${style.border}`}>
                            <span className="text-lg">{style.icon}</span>
                            <span>{title}</span>
                          </div>
                          <div className="text-sm leading-7 text-gray-800 whitespace-pre-wrap">{body}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })()
        ) : (
          <div className="leading-8 text-base whitespace-pre-wrap">
            {showAnchors
              ? highlightAnchors(text.content, text.anchor_map || {})
              : text.content}
          </div>
        )}
      </div>
    </div>
  )
}
