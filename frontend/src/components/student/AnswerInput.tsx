import React from 'react'
import type { QuestionFormat } from '../../types'

interface AnswerInputProps {
  questionId: string
  format: QuestionFormat
  options?: string[] | null
  items?: string[] | null          // SEQUENCE items
  statements?: string[] | null     // TRUE_FALSE statements
  table_headers?: string[] | null   // TABLE headers
  table_rows?: string[][] | null   // TABLE rows (empty string = cell to fill)
  value: string
  onChange: (value: string) => void
  rubric?: { answer_lines?: number }
  disabled?: boolean
}

export const AnswerInput: React.FC<AnswerInputProps> = ({
  questionId,
  format,
  options,
  items,
  statements,
  table_headers,
  table_rows,
  value,
  onChange,
  rubric,
  disabled = false,
}) => {
  // ── MC ──────────────────────────────────────────────────────────────────────
  if (format === 'MC' && options) {
    return (
      <div className="space-y-2 mt-3">
        {options.map((opt, i) => {
          const displayOpt = String(opt).replace(/^[\d\u05d0-\u05ea][.).\s]\s*/, '')
          const hebrewLetter = String.fromCharCode(0x05D0 + i)
          return (
            <label
              key={i}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                value === opt
                  ? 'bg-blue-50 border-blue-400'
                  : 'bg-white border-gray-200 hover:bg-gray-50'
              } ${disabled ? 'cursor-default opacity-70' : ''}`}
            >
              <input
                type="radio"
                name={questionId}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                disabled={disabled}
                className="sr-only"
              />
              <span className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                value === opt ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 text-gray-500'
              }`}>
                {hebrewLetter}
              </span>
              <span className="text-sm">{displayOpt}</span>
            </label>
          )
        })}
      </div>
    )
  }

  // ── SEQUENCE ─────────────────────────────────────────────────────────────────
  if (format === 'SEQUENCE' && items && items.length > 0) {
    // value stored as JSON: {"0": "2", "1": "1", ...}  (item index → position)
    let order: Record<string, string> = {}
    try { order = value ? JSON.parse(value) : {} } catch { order = {} }

    const handleSeqChange = (itemIdx: number, pos: string) => {
      const next = { ...order, [itemIdx]: pos }
      onChange(JSON.stringify(next))
    }

    const positions = Array.from({ length: items.length }, (_, i) => String(i + 1))

    return (
      <div className="space-y-2 mt-3">
        <p className="text-xs text-gray-500 font-medium">בחרו מספר סדר לכל אירוע (1 = ראשון):</p>
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <select
              value={order[i] || ''}
              onChange={e => handleSeqChange(i, e.target.value)}
              disabled={disabled}
              className="w-14 border border-gray-300 rounded px-1 py-1 text-center text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-70"
            >
              <option value="">—</option>
              {positions.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <span className="text-sm flex-1">{item}</span>
          </div>
        ))}
        <p className="text-xs text-gray-400">
          מסומן: {Object.values(order).filter(v => v).length}/{items.length}
        </p>
      </div>
    )
  }

  // ── TRUE_FALSE ───────────────────────────────────────────────────────────────
  if (format === 'TRUE_FALSE' && statements && statements.length > 0) {
    // value stored as JSON: {"0": {"verdict": "V", "correction": ""}, ...}
    let tf: Record<string, { verdict: string; correction: string }> = {}
    try { tf = value ? JSON.parse(value) : {} } catch { tf = {} }

    const handleTF = (i: number, field: 'verdict' | 'correction', val: string) => {
      const prev = tf[i] || { verdict: '', correction: '' }
      const next = { ...tf, [i]: { ...prev, [field]: val } }
      onChange(JSON.stringify(next))
    }

    return (
      <div className="space-y-3 mt-3">
        {statements.map((stmt, i) => {
          const entry = tf[i] || { verdict: '', correction: '' }
          const stmtText = typeof stmt === 'string' ? stmt : (stmt as { text: string }).text
          return (
            <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex gap-2 flex-shrink-0 mt-0.5">
                  <button
                    type="button"
                    onClick={() => handleTF(i, 'verdict', entry.verdict === 'V' ? '' : 'V')}
                    disabled={disabled}
                    className={`w-9 h-9 rounded border-2 font-bold text-sm transition-colors ${
                      entry.verdict === 'V'
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'border-gray-300 text-gray-400 hover:border-green-400'
                    }`}
                  >V</button>
                  <button
                    type="button"
                    onClick={() => handleTF(i, 'verdict', entry.verdict === 'X' ? '' : 'X')}
                    disabled={disabled}
                    className={`w-9 h-9 rounded border-2 font-bold text-sm transition-colors ${
                      entry.verdict === 'X'
                        ? 'bg-red-500 border-red-500 text-white'
                        : 'border-gray-300 text-gray-400 hover:border-red-400'
                    }`}
                  >X</button>
                </div>
                <span className="text-sm leading-6 flex-1">{stmtText}</span>
              </div>
              {entry.verdict === 'X' && (
                <div className="mr-12">
                  <input
                    type="text"
                    value={entry.correction}
                    onChange={e => handleTF(i, 'correction', e.target.value)}
                    disabled={disabled}
                    placeholder="תיקון: ..."
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ── TABLE ─────────────────────────────────────────────────────────────────────
  if (format === 'TABLE' && table_headers && table_rows) {
    let tableVal: Record<string, string> = {}
    try { tableVal = value ? JSON.parse(value) : {} } catch { tableVal = {} }

    const handleTableCell = (ri: number, ci: number, val: string) => {
      const key = `${ri}_${ci}`
      const next = { ...tableVal, [key]: val }
      onChange(JSON.stringify(next))
    }

    return (
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300 rounded-lg overflow-hidden text-sm">
          <thead>
            <tr>
              {table_headers.map((h, i) => (
                <th key={i} className="bg-blue-100 border border-gray-300 px-2 py-2 text-right font-bold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table_rows.map((row, ri) => (
              <tr key={ri}>
                {(row || []).map((cell, ci) => (
                  <td key={ci} className="border border-gray-300 p-1">
                    {cell === '' || cell === undefined ? (
                      <input
                        type="text"
                        value={tableVal[`${ri}_${ci}`] || ''}
                        onChange={e => handleTableCell(ri, ci, e.target.value)}
                        disabled={disabled}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-right text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
                        placeholder="..."
                      />
                    ) : (
                      <span className="text-gray-700">{cell}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // ── FILL ──────────────────────────────────────────────────────────────────────
  if (format === 'FILL') {
    return (
      <div className="mt-3">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          placeholder="השלם כאן..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
        />
      </div>
    )
  }

  // ── OPEN, TABLE, VOCAB, COMIC — textarea ──────────────────────────────────────
  const lines = rubric?.answer_lines || 4
  return (
    <div className="mt-3">
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        rows={lines}
        placeholder="כתוב/י את תשובתך כאן..."
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right leading-8 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
      />
      <div className="text-left text-xs text-gray-400 mt-1">{value.length} תווים</div>
    </div>
  )
}
