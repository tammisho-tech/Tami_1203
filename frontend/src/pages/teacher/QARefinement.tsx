import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { examsApi } from '../../api/exams'
import { RefinementChat } from '../../components/chat/RefinementChat'
import { QuestionCard } from '../../components/exam/QuestionCard'
import { Button, Spinner, Alert, WorkflowSteps } from '../../components/ui'
import { ChevronLeft } from 'lucide-react'
import type { ChatMessage } from '../../types'

export default function QARefinement() {
  const { examId } = useParams<{ examId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [chatLoading, setChatLoading] = useState(false)
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([])
  const { data: exam, isLoading } = useQuery({
    queryKey: ['exam', examId],
    queryFn: () => examsApi.get(examId!),
    enabled: !!examId,
  })

  const { data: chatHistory = [] } = useQuery({
    queryKey: ['chat', examId],
    queryFn: () => examsApi.getChatHistory(examId!),
    enabled: !!examId,
  })

  const handleChat = async (message: string) => {
    setChatLoading(true)
    const teacherMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'TEACHER',
      content: message,
      timestamp: new Date().toISOString(),
      action_taken: null,
    }
    setLocalMessages(prev => [...prev, teacherMsg])

    try {
      const response = await examsApi.chat(examId!, message)
      const agentMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'AGENT',
        content: response.explanation || '',
        timestamp: new Date().toISOString(),
        action_taken: response.action,
      }
      setLocalMessages(prev => [...prev, agentMsg])
      queryClient.invalidateQueries({ queryKey: ['exam', examId] })
    } catch (e) {
      console.error(e)
    } finally {
      setChatLoading(false)
    }
  }

  const allMessages = [...chatHistory, ...localMessages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  if (isLoading) return <Spinner text="טוען..." />

  const typeLabel = (t: string) => t === 'narrative' ? 'נרטיבי' : 'מידעי'
  const changeTypeColor: Record<string, string> = {
    'כתיב': 'bg-red-50 text-red-700 border-red-200',
    'פיסוק': 'bg-orange-50 text-orange-700 border-orange-200',
    'הסכמה': 'bg-yellow-50 text-yellow-700 border-yellow-200',
    'ניסוח': 'bg-blue-50 text-blue-700 border-blue-200',
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 space-y-4">
      <WorkflowSteps current={4} />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{exam?.title}</h1>
          <p className="text-gray-500 text-sm mt-1">שלב 4: גיבוש שאלות — שיפור ואישור</p>
        </div>
        <Button onClick={() => navigate(`/teacher/exam/${examId}/ready`)}>
          אשר ופרסם
          <ChevronLeft size={16} />
        </Button>
      </div>

      <div className="grid grid-cols-5 gap-4" style={{ height: 'calc(100vh - 10rem)' }}>
        {/* Left: Questions */}
        <div className="col-span-3 space-y-4 overflow-y-auto">

          {/* Question list */}
          <div className="space-y-2">
            {exam?.questions
              ?.sort((a, b) => a.sequence_number - b.sequence_number)
              .map(q => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  examId={examId}
                  editable
                  onEdit={(id, updates) => examsApi.updateQuestion(examId!, id, updates).then(() => queryClient.invalidateQueries({ queryKey: ['exam', examId] }))}
                  onDelete={(id) => examsApi.deleteQuestion(examId!, id).then(() => queryClient.invalidateQueries({ queryKey: ['exam', examId] }))}
                  onRefresh={() => queryClient.invalidateQueries({ queryKey: ['exam', examId] })}
                />
              ))}
          </div>
        </div>

        {/* Right: Chat */}
        <div className="col-span-2 border border-gray-200 rounded-xl overflow-hidden flex flex-col bg-white">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-sm">סוכן שיפור — שוחח עם ה-AI</h3>
            <p className="text-xs text-gray-500">בקשי שינויים בשפה טבעית</p>
          </div>
          <div className="flex-1 min-h-0">
            <RefinementChat
              messages={allMessages}
              onSend={handleChat}
              loading={chatLoading}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
