import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '../../api/analytics'
import { examsApi } from '../../api/exams'
import { Card, Spinner, Badge, DimensionBadge } from '../../components/ui'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell
} from 'recharts'

const LEVEL_COLORS = ['', '#ef4444', '#f59e0b', '#3b82f6', '#10b981']
const LEVEL_LABELS = ['', 'מתקשה', 'בסיסי', 'טוב', 'מצטיין']

export default function ClassDashboard() {
  const { examId } = useParams<{ examId: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'overview' | 'items' | 'students'>('overview')

  const { data: exam } = useQuery({ queryKey: ['exam', examId], queryFn: () => examsApi.get(examId!) })
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['analytics-class', examId],
    queryFn: () => analyticsApi.classStats(examId!),
    enabled: !!examId,
  })
  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ['analytics-items', examId],
    queryFn: () => analyticsApi.itemAnalysis(examId!),
    enabled: !!examId && activeTab === 'items',
  })
  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ['analytics-students', examId],
    queryFn: () => analyticsApi.allStudents(examId!),
    enabled: !!examId && activeTab === 'students',
  })

  if (statsLoading) return <Spinner text="טוען אנליטיקה..." />

  const dimRadarData = stats?.dimension_averages ? Object.entries(stats.dimension_averages).map(([dim, avg]) => ({
    dim: `ממד ${dim}`,
    value: avg,
  })) : []

  const levelBarData = stats?.level_distribution ? Object.entries(stats.level_distribution).map(([level, count]) => ({
    name: LEVEL_LABELS[parseInt(level)],
    count,
    level: parseInt(level),
  })) : []

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{exam?.title}</h1>
        <p className="text-gray-500 text-sm mt-1">דשבורד אנליטיקה כיתתית</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[
          { key: 'overview', label: 'סקירה כיתתית' },
          { key: 'items', label: 'ניתוח שאלות' },
          { key: 'students', label: 'פרופיל תלמידים' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === 'overview' && stats && (
        <div className="space-y-4">
          {/* Summary cards */}
          {stats.total_students === 0 ? (
            <Card className="text-center py-10 text-gray-400">אין תלמידים שהגישו עדיין</Card>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'תלמידים', value: stats.total_students },
                  { label: 'ממוצע', value: `${stats.average}%` },
                  { label: 'חציון', value: `${stats.median}%` },
                  { label: 'סטיית תקן', value: `${stats.std_deviation}%` },
                ].map(card => (
                  <Card key={card.label} className="text-center py-4">
                    <div className="text-3xl font-bold text-blue-600">{card.value}</div>
                    <div className="text-gray-500 text-sm mt-1">{card.label}</div>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Dimension radar */}
                <Card>
                  <h3 className="font-semibold mb-3">ביצועים לפי ממד</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <RadarChart data={dimRadarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="dim" tick={{ fontSize: 12 }} />
                      <Radar name="ממוצע" dataKey="value" fill="#3b82f6" fillOpacity={0.4} stroke="#3b82f6" />
                    </RadarChart>
                  </ResponsiveContainer>
                </Card>

                {/* Level distribution bar */}
                <Card>
                  <h3 className="font-semibold mb-3">התפלגות רמות ביצוע</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={levelBarData}>
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" radius={4}>
                        {levelBarData.map(entry => (
                          <Cell key={entry.level} fill={LEVEL_COLORS[entry.level]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {/* Item analysis */}
      {activeTab === 'items' && (
        itemsLoading ? <Spinner /> : (
          <div className="space-y-4">
            {items?.red_questions.length ? (
              <Card className="border-red-200 bg-red-50">
                <h3 className="font-semibold text-red-800 mb-2">⚠️ שאלות בעייתיות (פחות מ-50% הצלחה)</h3>
                <div className="space-y-2">
                  {items.red_questions.map(q => (
                    <div key={q.question_id} className="bg-white p-3 rounded-lg border border-red-200">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">שאלה {q.sequence_number}</span>
                        <DimensionBadge dim={q.dimension} />
                        <Badge color="red">{q.correct_rate}% הצלחה</Badge>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{q.stem_preview}</p>
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <Card><p className="text-green-700">כל השאלות עברו את סף ה-50% הצלחה ✓</p></Card>
            )}

            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-right">#</th>
                    <th className="px-3 py-2 text-right">ממד</th>
                    <th className="px-3 py-2 text-right">שאלה</th>
                    <th className="px-3 py-2 text-right">% הצלחה</th>
                  </tr>
                </thead>
                <tbody>
                  {items?.items.map(item => (
                    <tr key={item.question_id} className={item.is_red ? 'bg-red-50' : ''}>
                      <td className="px-3 py-2">{item.sequence_number}</td>
                      <td className="px-3 py-2"><DimensionBadge dim={item.dimension} /></td>
                      <td className="px-3 py-2 text-gray-700">{item.stem_preview}</td>
                      <td className="px-3 py-2">
                        <Badge color={item.is_red ? 'red' : item.correct_rate >= 75 ? 'green' : 'yellow'}>
                          {item.correct_rate}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Students */}
      {activeTab === 'students' && (
        studentsLoading ? <Spinner /> : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-right">שם</th>
                  <th className="px-3 py-2 text-right">כיתה</th>
                  <th className="px-3 py-2 text-right">ציון</th>
                  <th className="px-3 py-2 text-right">רמה</th>
                  <th className="px-3 py-2 text-right">המלצה</th>
                  <th className="px-3 py-2 text-right">פרופיל</th>
                </tr>
              </thead>
              <tbody>
                {studentsData?.students.map(s => (
                  <tr key={s.session_id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{s.student_name}</td>
                    <td className="px-3 py-2 text-gray-500">{s.class_name}</td>
                    <td className="px-3 py-2">
                      <span className="font-bold">{s.percentage}%</span>
                      <span className="text-gray-400 text-xs mr-1">({s.total_score}/{s.max_score})</span>
                    </td>
                    <td className="px-3 py-2">
                      {s.level && (
                        <Badge color={s.level === 4 ? 'green' : s.level === 3 ? 'blue' : s.level === 2 ? 'yellow' : 'red'}>
                          {LEVEL_LABELS[s.level]}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 max-w-xs">{s.recommendation}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => navigate(`/teacher/exam/${examId}/analytics/student/${s.session_id}`)}
                        className="text-blue-600 text-xs hover:underline"
                      >
                        פרופיל מלא
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
