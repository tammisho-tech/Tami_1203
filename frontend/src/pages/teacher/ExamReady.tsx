import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { examsApi } from '../../api/exams'
import { Card, Button, Badge, Spinner, WorkflowSteps } from '../../components/ui'
import { Download, Share2, BarChart2, Copy, Check, Archive, Trash2 } from 'lucide-react'

export default function ExamReady() {
  const { examId } = useParams<{ examId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  const downloadPdf = async (bookletKey: string, label: string) => {
    setDownloading(bookletKey)
    try {
      const url = examsApi.exportUrl(examId!, bookletKey)
      const response = await fetch(url)
      if (!response.ok) throw new Error('שגיאה בהורדה')

      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('text/html')) {
        // Chrome אינו זמין בשרת — פותחים בטאב חדש להדפסה ידנית ל-PDF
        window.open(url, '_blank')
        return
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `${label}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch {
      alert('שגיאה בהורדת ה-PDF. אנא נסה שנית.')
    } finally {
      setDownloading(null)
    }
  }

  const { data: exam, isLoading } = useQuery({
    queryKey: ['exam', examId],
    queryFn: () => examsApi.get(examId!),
    enabled: !!examId,
  })

  const publishMutation = useMutation({
    mutationFn: () => examsApi.publish(examId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exam', examId] }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => examsApi.delete(examId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] })
      navigate('/teacher')
    },
  })

  const copyCode = () => {
    if (exam?.access_code) {
      navigator.clipboard.writeText(exam.access_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const booklets = [
    { key: 'texts', label: 'חוברת טקסטים', icon: '📖' },
    { key: 'questions', label: 'חוברת שאלות', icon: '📝' },
    { key: 'rubric', label: 'מחוון בדיקה', icon: '✅' },
    { key: 'spec', label: 'מפרט ודוח פרמטרים', icon: '📊' },
    { key: 'teacher_version', label: 'גרסת מורה (עם תשובות)', icon: '🔑' },
  ]

  const shareWithColleague = () => {
    const text = `מבחן הבנת הנקרא: "${exam?.title}"\nקוד כניסה לתלמידים: ${exam?.access_code}\nכניסה: ${window.location.origin}/student`
    if (navigator.share) {
      navigator.share({ title: exam?.title, text })
    } else {
      navigator.clipboard.writeText(text)
      alert('פרטי המבחן הועתקו ללוח — ניתן להדביק ולשלוח לעמית')
    }
  }

  if (isLoading) return <Spinner text="טוען..." />

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <WorkflowSteps current={5} />
      <div>
        <h1 className="text-2xl font-bold">{exam?.title}</h1>
        <p className="text-gray-500 text-sm mt-1">שלב 5: פרסום וניתוח</p>
      </div>

      {/* Publish */}
      {!exam?.access_code ? (
        <Card className="text-center space-y-4 py-8">
          <Share2 size={48} className="mx-auto text-blue-400" />
          <div>
            <h2 className="font-bold text-lg">פרסם את המבחן</h2>
            <p className="text-gray-500 text-sm mt-1">
              כדי לשתף את המבחן עם התלמידים, לחץ על כפתור הפרסום כדי לקבל קוד כניסה.
            </p>
          </div>
          <Button loading={publishMutation.isPending} onClick={() => publishMutation.mutate()}>
            <Share2 size={16} />
            פרסם מבחן
          </Button>
        </Card>
      ) : (
        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge color="green">מפורסם</Badge>
            <h2 className="font-bold">המבחן פעיל</h2>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <p className="text-sm text-gray-500 mb-2">קוד הכניסה לתלמידים</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-4xl font-mono font-bold tracking-widest text-blue-700">
                {exam.access_code}
              </span>
              <button onClick={copyCode} className="text-gray-400 hover:text-gray-600">
                {copied ? <Check size={20} className="text-green-500" /> : <Copy size={20} />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              התלמידים נכנסים דרך{' '}
              <a href="/student" target="_blank" className="text-blue-600 underline">
                {window.location.origin}/student
              </a>
            </p>
          </div>
        </Card>
      )}

      {/* Export booklets */}
      <Card className="space-y-4">
        <h2 className="font-bold">הורדת חוברות PDF</h2>
        <div className="grid grid-cols-2 gap-3">
          {booklets.map(b => (
            <button
              key={b.key}
              onClick={() => downloadPdf(b.key, b.label)}
              disabled={downloading === b.key}
              className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 text-right"
            >
              <span className="text-2xl">{b.icon}</span>
              <div>
                <div className="font-medium text-sm">{b.label}</div>
                <div className="text-xs text-gray-400">{downloading === b.key ? 'מוריד...' : 'הורד PDF'}</div>
              </div>
              <Download size={16} className="mr-auto text-gray-400" />
            </button>
          ))}
        </div>
      </Card>

      {/* Share with colleague */}
      {exam?.access_code && (
        <Card className="flex items-center justify-between">
          <div>
            <h2 className="font-bold">שיתוף עם עמית</h2>
            <p className="text-sm text-gray-500 mt-0.5">שלחי את קוד המבחן ופרטיו לעמיתה/עמית</p>
          </div>
          <Button variant="secondary" onClick={shareWithColleague}>
            <Share2 size={16} />
            שתפי
          </Button>
        </Card>
      )}

      {/* Analytics link */}
      {exam?.access_code && (
        <Card className="flex items-center justify-between">
          <div>
            <h2 className="font-bold">מעקב ביצועים</h2>
            <p className="text-sm text-gray-500 mt-0.5">צפה בתוצאות ואנליטיקה לאחר הגשת המבחן</p>
          </div>
          <Button
            variant="secondary"
            onClick={() => navigate(`/teacher/exam/${examId}/analytics`)}
          >
            <BarChart2 size={16} />
            אנליטיקה
          </Button>
        </Card>
      )}

      {/* Archive / Delete */}
      <Card className="space-y-4">
        <h2 className="font-bold">סיום</h2>
        <p className="text-sm text-gray-500">המבחן נשמר. מה תרצי לעשות?</p>
        <div className="flex gap-3 flex-wrap">
          <Button
            variant="secondary"
            onClick={() => navigate('/teacher')}
            className="flex items-center gap-2"
          >
            <Archive size={16} />
            הוסף לארכיון המבחנים
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm('האם למחוק את המבחן לצמיתות? פעולה זו אינה ניתנת לביטול.')) {
                deleteMutation.mutate()
              }
            }}
            loading={deleteMutation.isPending}
            disabled={deleteMutation.isPending}
            className="flex items-center gap-2"
          >
            <Trash2 size={16} />
            זרוק לסל
          </Button>
        </div>
      </Card>
    </div>
  )
}
