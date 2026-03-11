import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { examsApi } from '../api/exams'
import type { Exam } from '../types'
import { StatusBadge, Spinner } from '../components/ui'
import { Plus, BookOpen, Trash2, Edit3, Download, ExternalLink, Copy, Check } from 'lucide-react'

const GRADE_ORDER: Record<string, number> = {
  'ג': 1, 'ד': 2, 'ה': 3, 'ו': 4, 'ז': 5, 'ח': 6, 'ט': 7,
}
const TIMING_ORDER: Record<string, number> = {
  'תחילת שנה': 1, 'אמצע שנה': 2, 'סוף שנה': 3,
}
const CLUSTER_LABEL: Record<string, string> = {
  '3-4': 'כיתות ג׳–ד׳', '5-6': 'כיתות ה׳–ו׳', '7-9': 'כיתות ז׳–ט׳',
}
const CLUSTER_COLOR: Record<string, string> = {
  '3-4': '#0D7377', '5-6': '#1565C0', '7-9': '#4527A0',
}

function sortExams(exams: Exam[]): Exam[] {
  return [...exams].sort((a, b) => {
    const ga = GRADE_ORDER[a.topic_values?.grade || ''] ?? 99
    const gb = GRADE_ORDER[b.topic_values?.grade || ''] ?? 99
    if (ga !== gb) return ga - gb
    const ta = TIMING_ORDER[a.topic_values?.exam_timing || ''] ?? 99
    const tb = TIMING_ORDER[b.topic_values?.exam_timing || ''] ?? 99
    if (ta !== tb) return ta - tb
    return (b.created_at || '').localeCompare(a.created_at || '')
  })
}

function editRoute(status: string, examId: string): string {
  // Go directly to texts or questions — skip plan/theme step
  // afterEdit=1 tells ReviewTexts to skip linguistic-edit and go straight to questions
  const routes: Record<string, string> = {
    DRAFT:           `/teacher/exam/${examId}/texts?afterEdit=1`,
    THEME_PENDING:   `/teacher/exam/${examId}/texts?afterEdit=1`,
    TEXTS_READY:     `/teacher/exam/${examId}/texts?afterEdit=1`,
    QUESTIONS_READY: `/teacher/exam/${examId}/questions`,
    QA_DONE:         `/teacher/exam/${examId}/design`,
    PUBLISHED:       `/teacher/exam/${examId}/design`,
    CLOSED:          `/teacher/exam/${examId}/design`,
  }
  return routes[status] || `/teacher/exam/${examId}/texts?afterEdit=1`
}

function ExamCard({ exam }: { exam: Exam }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (id: string) => examsApi.delete(id),
    onMutate: (id) => setDeletingId(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] })
      setDeletingId(null)
    },
    onError: () => setDeletingId(null),
  })

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (window.confirm(`למחוק את המבחן "${exam.title}"? פעולה זו בלתי הפיכה.`)) {
      deleteMutation.mutate(exam.id)
    }
  }

  const handleCopyLink = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const studentUrl = `${window.location.origin}/student`
    const text = exam.access_code
      ? `קוד כניסה למבחן: ${exam.access_code}\nכתובת: ${studentUrl}`
      : studentUrl
    navigator.clipboard.writeText(text)
    setCopiedId(exam.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const clusterColor = CLUSTER_COLOR[exam.grade_cluster] || '#1565C0'
  const grade = exam.topic_values?.grade
  const timing = exam.topic_values?.exam_timing
  const narrTitle = exam.text_titles?.narrative
  const infoTitle = exam.text_titles?.informational

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
      {/* Top color strip */}
      <div className="h-1" style={{ background: clusterColor }} />

      <div className="p-4 space-y-3">
        {/* Row 1: icon + title + badges */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: `${clusterColor}18` }}>
            <BookOpen size={18} style={{ color: clusterColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-800 leading-snug">{exam.title}</div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {grade && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                  style={{ background: clusterColor }}>
                  כיתה {grade}׳
                </span>
              )}
              {timing && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{timing}</span>
              )}
              <StatusBadge status={exam.status} />
              {exam.access_code && (
                <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg">
                  קוד: {exam.access_code}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleDelete}
            disabled={deletingId === exam.id}
            title="מחק מבחן"
            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <Trash2 size={15} />
          </button>
        </div>

        {/* Row 2: text titles */}
        {(narrTitle || infoTitle) && (
          <div className="space-y-1 pr-1">
            {narrTitle && (
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                <span className="font-medium text-gray-500 flex-shrink-0">נרטיבי:</span>
                <span className="truncate">{narrTitle}</span>
              </div>
            )}
            {infoTitle && (
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                <span className="font-medium text-gray-500 flex-shrink-0">מידעי:</span>
                <span className="truncate">{infoTitle}</span>
              </div>
            )}
          </div>
        )}

        {/* Row 3: action buttons */}
        <div className="flex gap-2 pt-1 border-t border-gray-50">
          <button
            onClick={(e) => { e.preventDefault(); navigate(editRoute(exam.status, exam.id)) }}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
          >
            <Edit3 size={13} />
            עריכה
          </button>
          <button
            onClick={(e) => { e.preventDefault(); navigate(`/teacher/exam/${exam.id}/ready`) }}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors"
          >
            <Download size={13} />
            חומרים
          </button>
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
          >
            {copiedId === exam.id ? <Check size={13} /> : <Copy size={13} />}
            {copiedId === exam.id ? 'הועתק!' : 'קישור לתלמיד'}
          </button>
          <button
            onClick={(e) => { e.preventDefault(); window.open('/student', '_blank') }}
            title="פתח ממשק תלמיד בטאב חדש"
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <ExternalLink size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const navigate = useNavigate()

  const { data: rawExams = [], isLoading } = useQuery({
    queryKey: ['exams'],
    queryFn: examsApi.list,
  })

  const exams = sortExams(rawExams as Exam[])

  // Group by grade cluster for section headers
  const grouped: Record<string, Exam[]> = {}
  for (const exam of exams) {
    const key = exam.grade_cluster
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(exam)
  }
  const clusterOrder = ['3-4', '5-6', '7-9']

  return (
    <div className="min-h-screen bg-slate-50">
      {/* RAMA header — no duplicate button */}
      <header className="w-full text-white" style={{ background: 'linear-gradient(to left, #2D3EA0, #1565C0, #00B5CC)' }}>
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <img
              src="/rama-logo.png"
              alt="ראמ״ה"
              className="h-12 object-contain"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
            <div className="border-r border-white/30 pr-5">
              <div className="text-xl font-bold">מחולל מבחני הבנת הנקרא</div>
              <div className="text-xs text-blue-100 mt-0.5">סטנדרט ראמ״ה | ד״ר תמי סבג שושן</div>
            </div>
          </div>
        </div>
        <div className="h-0.5 opacity-30" style={{ background: 'linear-gradient(to left, #00B5CC, white, #2D3EA0)' }} />
      </header>

      <main className="max-w-5xl mx-auto py-8 px-4 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800">המבחנים שלי</h2>
          <button
            onClick={() => navigate('/teacher/new-exam')}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl text-white"
            style={{ background: 'linear-gradient(135deg, #1565C0, #2D3EA0)' }}
          >
            <Plus size={14} /> מבחן חדש
          </button>
        </div>

        {isLoading ? (
          <Spinner text="טוען מבחנים..." />
        ) : exams.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed text-center py-16 px-8" style={{ borderColor: '#1565C030', background: 'linear-gradient(135deg, #E8F4FD, #EEF2FF)' }}>
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #00B5CC22, #1565C022)' }}>
              <BookOpen size={32} style={{ color: '#1565C0' }} />
            </div>
            <p className="text-gray-500 mb-6 text-lg">עדיין אין מבחנים.</p>
            <button
              onClick={() => navigate('/teacher/new-exam')}
              className="inline-flex items-center gap-2 text-white px-6 py-3 rounded-xl font-semibold"
              style={{ background: 'linear-gradient(135deg, #1565C0, #2D3EA0)' }}
            >
              <Plus size={18} /> צרי את המבחן הראשון
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {clusterOrder.filter(c => grouped[c]?.length).map(cluster => (
              <div key={cluster}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-0.5 flex-1" style={{ background: CLUSTER_COLOR[cluster] + '40' }} />
                  <span className="text-xs font-bold px-3 py-1 rounded-full text-white"
                    style={{ background: CLUSTER_COLOR[cluster] }}>
                    {CLUSTER_LABEL[cluster]}
                  </span>
                  <div className="h-0.5 flex-1" style={{ background: CLUSTER_COLOR[cluster] + '40' }} />
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {grouped[cluster].map((exam: Exam) => (
                    <ExamCard key={exam.id} exam={exam} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-gray-200 pt-5 text-center">
          <Link to="/student" className="text-sm font-medium hover:underline" style={{ color: '#1565C0' }}>
            כניסה לתלמיד (פתרון מבחן)
          </Link>
        </div>
      </main>
    </div>
  )
}
