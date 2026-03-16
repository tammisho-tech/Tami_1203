import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { studentsApi } from '../../api/students'
import { Spinner, Card } from '../../components/ui'
import { CheckCircle, Clock, Star } from 'lucide-react'

export default function ExamComplete() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [rating, setRating] = useState<number | null>(null)
  const [feedbackText, setFeedbackText] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['results', sessionId],
    queryFn: () => studentsApi.getResults(sessionId!),
    enabled: !!sessionId,
    refetchInterval: (query) => {
      // Poll until grading is complete
      const status = query.state.data?.grading_status
      return status === 'PENDING' || status === 'RUNNING' ? 5000 : false
    },
  })

  if (isLoading) return <Spinner text="טוען תוצאות..." />

  const feedbackMutation = useMutation({
    mutationFn: () =>
      studentsApi.saveFeedback(sessionId!, {
        satisfaction_rating: rating ?? undefined,
        feedback_text: feedbackText.trim() || undefined,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['results', sessionId] }),
  })

  const handleExit = () => {
    if (rating !== null || feedbackText.trim()) {
      feedbackMutation.mutate(undefined, {
        onSettled: () => navigate('/'),
      })
    } else {
      navigate('/')
    }
  }

  const handleAnotherExam = () => {
    if (rating !== null || feedbackText.trim()) {
      feedbackMutation.mutate(undefined, {
        onSettled: () => navigate('/student'),
      })
    } else {
      navigate('/student')
    }
  }

  if (error || !data) {
    return (
      <div className="max-w-xl mx-auto py-20 px-4 text-center">
        <p className="text-red-500">שגיאה בטעינת התוצאות.</p>
        <button onClick={() => navigate('/student')} className="mt-4 text-blue-600 underline text-sm">
          חזרה לדף הכניסה
        </button>
      </div>
    )
  }

  const isGraded = data.grading_status === 'DONE'
  const pct = data.percentage ?? 0

  const scoreColor =
    pct >= 85 ? 'text-green-600' :
    pct >= 70 ? 'text-blue-600' :
    pct >= 55 ? 'text-amber-600' :
    'text-red-600'

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 space-y-6" dir="rtl">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <CheckCircle size={44} className="text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800">המבחן הוגש בהצלחה!</h1>
        <p className="text-gray-500">שלום, {data.session?.student_name}</p>
      </div>

      {/* Score card */}
      {isGraded ? (
        <Card className="text-center space-y-2 py-6">
          <p className="text-gray-500 text-sm">ציון סופי</p>
          <div className={`text-6xl font-bold ${scoreColor}`}>
            {data.total_score}
            <span className="text-3xl text-gray-400">/{data.max_score}</span>
          </div>
          <div className={`text-2xl font-semibold ${scoreColor}`}>{pct}%</div>
          {data.profile && (
            <div className="mt-4 bg-blue-50 rounded-xl p-4 text-sm text-right text-gray-700 leading-relaxed">
              <p className="font-bold text-blue-700 mb-1">משוב מסכם:</p>
              <p>{data.profile}</p>
            </div>
          )}
        </Card>
      ) : (
        <Card className="text-center space-y-3 py-8">
          <div className="flex justify-center">
            <Clock size={40} className="text-amber-500" />
          </div>
          <p className="font-semibold text-gray-700">הניקוד מחושב...</p>
          <p className="text-gray-400 text-sm">המבחן נמסר לבדיקה. הציון יוצג כאן תוך מספר דקות.</p>
          <div className="w-48 h-1.5 bg-gray-200 rounded-full mx-auto overflow-hidden">
            <div className="h-full bg-amber-400 rounded-full animate-pulse w-2/3" />
          </div>
        </Card>
      )}

      {/* Feedback section */}
      <Card className="space-y-4 py-6">
        <p className="text-gray-700 text-center">מקווה שהמערכת הצליחה לעזור לך</p>
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-600 text-center">עד כמה היית מרוצה? (סולם 1–5)</p>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  rating === n
                    ? 'bg-amber-400 text-amber-900 ring-2 ring-amber-500'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                <Star size={18} fill={rating === n ? 'currentColor' : 'none'} strokeWidth={2} />
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-600 text-center">במה כדאי שהמערכת עוד תשתפר? הערות לשיפור:</p>
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="כתוב כאן את ההערות שלך..."
            className="w-full min-h-[80px] p-3 border border-gray-200 rounded-lg text-sm resize-y focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
            dir="rtl"
          />
        </div>
        <div className="flex justify-center gap-4 pt-2">
          <button
            onClick={handleAnotherExam}
            disabled={feedbackMutation.isPending}
            className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-60"
          >
            מבחן נוסף
          </button>
          <button
            onClick={handleExit}
            disabled={feedbackMutation.isPending}
            className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-60"
          >
            יציאה
          </button>
        </div>
      </Card>

      {/* Per-question breakdown (only when graded) */}
      {isGraded && data.answers && data.answers.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-bold text-gray-700">פירוט שאלות</h2>
          {data.answers
            .filter((a: Record<string, unknown>) => a.score_max !== null && a.score_max !== undefined)
            .map((a: Record<string, unknown>, i: number) => {
              const earned = a.score_awarded as number ?? 0
              const max = a.score_max as number ?? 0
              const full = max > 0 && earned >= max
              return (
                <div
                  key={a.question_id as string}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${
                    full ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className={`font-bold w-6 flex-shrink-0 ${full ? 'text-green-600' : 'text-gray-500'}`}>
                    {i + 1}.
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <div className="text-xs text-gray-400 truncate max-w-xs">{a.raw_answer as string}</div>
                    {(a.grading_notes as string) && (
                      <div className="text-xs text-gray-500 italic">{a.grading_notes as string}</div>
                    )}
                  </div>
                  <div className={`font-bold flex-shrink-0 ${full ? 'text-green-700' : 'text-gray-600'}`}>
                    {earned}/{max}
                  </div>
                </div>
              )
            })}
        </div>
      )}

    </div>
  )
}
