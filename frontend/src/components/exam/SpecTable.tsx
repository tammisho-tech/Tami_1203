import React from 'react'
import type { SpecEntry } from '../../types'
import { DimensionBadge } from '../ui'

interface SpecTableProps {
  entries: SpecEntry[]
}

export const SpecTable: React.FC<SpecTableProps> = ({ entries }) => {
  const total = entries.length
  const dimCounts = { A: 0, B: 0, C: 0, D: 0 } as Record<string, number>
  entries.forEach(e => { dimCounts[e.dimension] = (dimCounts[e.dimension] || 0) + 1 })

  const formatLabels: Record<string, string> = {
    MC: 'רב-ברירה', OPEN: 'פתוחה', TABLE: 'טבלה', FILL: 'השלמה', COMIC: 'קומיקס',
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-right font-medium">#</th>
              <th className="px-3 py-2 text-right font-medium">טקסט</th>
              <th className="px-3 py-2 text-right font-medium">ממד</th>
              <th className="px-3 py-2 text-right font-medium">פורמט</th>
              <th className="px-3 py-2 text-right font-medium">ניקוד</th>
              <th className="px-3 py-2 text-right font-medium">עיגון בטקסט</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={entry.id || i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                <td className="px-3 py-2">
                  <span className="text-xs">{entry.text_type === 'narrative' ? '📖 נרטיבי' : '📄 מידעי'}</span>
                </td>
                <td className="px-3 py-2"><DimensionBadge dim={entry.dimension} /></td>
                <td className="px-3 py-2 text-xs">{formatLabels[entry.format] || entry.format}</td>
                <td className="px-3 py-2 font-medium">{entry.score}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{entry.text_reference}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Distribution summary */}
      <div className="flex gap-4 text-sm">
        {Object.entries(dimCounts).map(([dim, count]) => (
          <div key={dim} className="flex items-center gap-2">
            <DimensionBadge dim={dim} />
            <span className="text-gray-600">{count} שאלות ({total > 0 ? Math.round(count / total * 100) : 0}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}
