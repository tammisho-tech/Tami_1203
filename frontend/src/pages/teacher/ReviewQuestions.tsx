import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { examsApi } from '../../api/exams'
import { QuestionCard } from '../../components/exam/QuestionCard'
import { SpecTable } from '../../components/exam/SpecTable'
import { TextDisplay } from '../../components/exam/TextDisplay'
import { Button, Spinner, Alert, PageHeader, WorkflowSteps } from '../../components/ui'
export default function ReviewQuestions() {
  const { examId } = useParams<{ examId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState(0)
  const [activeTab, setActiveTab] = useState<'narrative' | 'informational' | 'spec'>('narrative')
  const [error, setError] = useState<string | null>(null)
  const [autoTriggered, setAutoTriggered] = useState(false)

  const { data: exam, isLoading } = useQuery({
    queryKey: ['exam', examId],
    queryFn: () => examsApi.get(examId!),
    enabled: !!examId,
  })

  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const startProgressTimer = () => {
    setGenProgress(0)
    progressTimer.current = setInterval(() => {
      setGenProgress(p => {
        // Slow down as we approach 90%, never reach 100 until done
        if (p < 30) return p + 3
        if (p < 60) return p + 1.5
        if (p < 85) return p + 0.5
        return p
      })
    }, 800)
  }

  const stopProgressTimer = () => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current)
      progressTimer.current = null
    }
    setGenProgress(100)
  }

  const generateMutation = useMutation({
    mutationFn: () => examsApi.generateQuestions(examId!),
    onMutate: () => { setGenerating(true); setError(null); startProgressTimer() },
    onSuccess: () => {
      stopProgressTimer()
      queryClient.invalidateQueries({ queryKey: ['exam', examId] })
      setTimeout(() => setGenerating(false), 400)
    },
    onError: (e: Error) => { stopProgressTimer(); setError(e.message); setGenerating(false) },
  })

  const editMutation = useMutation({
    mutationFn: ({ qId, updates }: { qId: string; updates: Record<string, unknown> }) =>
      examsApi.updateQuestion(examId!, qId, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exam', examId] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (qId: string) => examsApi.deleteQuestion(examId!, qId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exam', examId] }),
  })

  // Auto-trigger generation when landing with no questions
  useEffect(() => {
    if (!isLoading && exam && !autoTriggered) {
      const hasQ = (exam.questions?.length || 0) > 0
      if (!hasQ) {
        setAutoTriggered(true)
        generateMutation.mutate()
      }
    }
  }, [isLoading, exam])

  if (isLoading) return <Spinner text="טוען..." />

  const narr = exam?.texts?.find(t => t.text_type === 'narrative')
  const info = exam?.texts?.find(t => t.text_type === 'informational')
  const narrQuestions = exam?.questions?.filter(q => !q.is_cross_text && q.text_id === narr?.id) || []
  const infoQuestions = exam?.questions?.filter(q => !q.is_cross_text && q.text_id === info?.id) || []
  const crossQuestions = exam?.questions?.filter(q => q.is_cross_text) || []
  const hasQuestions = (exam?.questions?.length || 0) > 0

  const currentText = activeTab === 'narrative' ? narr : info
  // שאלות מיזוג — בסוף הקטע המידעי בלבד (רצף כרונולוגי)
  const currentQuestions = activeTab === 'narrative'
    ? narrQuestions
    : [...infoQuestions, ...crossQuestions].sort((a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0))

  const tabs: { key: 'narrative' | 'informational' | 'spec'; label: string }[] = [
    { key: 'narrative', label: `נרטיבי (${narrQuestions.length})` },
    { key: 'informational', label: `מידעי (${infoQuestions.length + crossQuestions.length})` },
    { key: 'spec', label: 'פרמטרים' },
  ]

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 space-y-4">
      <WorkflowSteps current={4} />
      <PageHeader
        title={exam?.title || ''}
        subtitle="שלב 4: גיבוש שאלות"
        teacher={exam?.topic_values?.teacher_name}
        actions={
          hasQuestions ? (
            <Button
              variant="secondary"
              size="sm"
              loading={generating}
              onClick={() => generateMutation.mutate()}
              style={{ color: 'white', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)' }}
            >
              ייצר מחדש
            </Button>
          ) : null
        }
      />

      {error && <Alert type="error">{error}</Alert>}

      {generating && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-10 px-8 space-y-6">
          <div className="text-center space-y-1">
            <p className="text-lg font-bold text-gray-800">מחולל {' '}
              {genProgress < 40 ? 'שאלות לטקסט הנרטיבי...' :
               genProgress < 75 ? 'שאלות לטקסט המידעי...' :
               genProgress < 90 ? 'שאלת מיזוג בין הטקסטים...' :
               'שומר שאלות...'}
            </p>
            <p className="text-sm text-gray-400">הבינה מייצרת 23 שאלות עם מחוון מלא — זה לוקח כ-60 שניות</p>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              className="h-3 rounded-full bg-gradient-to-l from-blue-500 to-blue-400 transition-all duration-700"
              style={{ width: `${genProgress}%` }}
            />
          </div>
          {/* Steps */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            {[
              { label: 'שאלות נרטיבי', threshold: 40, icon: '📖' },
              { label: 'שאלות מידעי', threshold: 75, icon: '📋' },
              { label: 'שאלת מיזוג', threshold: 90, icon: '🔗' },
            ].map(step => (
              <div key={step.label} className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${
                genProgress >= step.threshold
                  ? 'border-green-200 bg-green-50 text-green-700'
                  : genProgress >= step.threshold - 35
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-gray-100 bg-gray-50 text-gray-400'
              }`}>
                <span>{step.icon}</span>
                <span className="font-medium">{step.label}</span>
                {genProgress >= step.threshold && <span className="mr-auto">✓</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {hasQuestions && !generating && (
        <div className="grid grid-cols-5 gap-4">
          {/* Left: Text panel */}
          {currentText && activeTab !== 'spec' && (
            <div className="col-span-2 sticky top-4 h-[calc(100vh-8rem)] overflow-y-auto">
              <TextDisplay text={currentText} showAnchors />
            </div>
          )}

          {/* Right: Questions */}
          <div className={activeTab === 'spec' ? 'col-span-5' : 'col-span-3'}>
            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-4">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    activeTab === tab.key
                      ? 'bg-white shadow text-blue-700'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'spec' ? (
              <SpecTable entries={exam?.spec_entries || []} />
            ) : (
              <div className="space-y-3">
                {currentQuestions.map(q => (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    examId={examId}
                    editable
                    onEdit={(id, updates) => editMutation.mutate({ qId: id, updates })}
                    onDelete={id => deleteMutation.mutate(id)}
                    onRefresh={() => queryClient.invalidateQueries({ queryKey: ['exam', examId] })}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!hasQuestions && !generating && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-12 text-gray-400">
          <p>מחולל שאלות אוטומטית...</p>
        </div>
      )}

      {/* Bottom navigation */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <Button
          variant="secondary"
          onClick={() => navigate(`/teacher/exam/${examId}/texts?afterEdit=1`)}
        >
          ← חזרה לעריכת טקסטים
        </Button>
        {hasQuestions && (
          activeTab === 'narrative' ? (
            <Button
              onClick={() => setActiveTab('informational')}
              className="font-bold text-base px-6 py-3"
            >
              סיימתי — מעבר לטקסט המידעי ←
            </Button>
          ) : activeTab === 'informational' ? (
            <Button
              onClick={() => navigate(`/teacher/exam/${examId}/design`)}
              className="font-bold text-base px-6 py-3 bg-green-600 hover:bg-green-700"
            >
              אישרתי את שני הטקסטים — מעבר לעיצוב גרפי ←
            </Button>
          ) : (
            <Button onClick={() => navigate(`/teacher/exam/${examId}/design`)}>
              מעבר לעיצוב גרפי ←
            </Button>
          )
        )}
      </div>
    </div>
  )
}
