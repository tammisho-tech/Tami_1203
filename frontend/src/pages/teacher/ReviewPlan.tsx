import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { examsApi } from '../../api/exams'
import { Button, Spinner, Alert, Card, WorkflowSteps } from '../../components/ui'
import { RefreshCw, ChevronLeft, Check, MessageSquare, Send } from 'lucide-react'

interface PlanData {
  theme: { theme: string; rationale: string }
  idea: {
    narrative?: { title?: string; hero: string; conflict: string; logic: string; value: string; summary: string }
    informational?: { subject: string; logical_structure?: string; aspects?: string; message: string; summary: string }
  }
  emotions: string[]
}

type PlanStep = 'theme' | 'narrative_idea' | 'info_idea'

function IdeaChatPanel({
  textType,
  currentIdea,
  examId,
  onRefined,
}: {
  textType: 'narrative' | 'informational'
  currentIdea: object
  examId: string
  onRefined: (refined: object) => void
}) {
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const chatMutation = useMutation({
    mutationFn: () => examsApi.ideaChat(examId, textType, currentIdea, msg),
    onSuccess: (data) => {
      onRefined(data.idea)
      setMsg('')
      setOpen(false)
    },
  })

  return (
    <div className="border border-blue-200 rounded-xl overflow-hidden">
      <button
        onClick={() => { setOpen(!open); setTimeout(() => textareaRef.current?.focus(), 100) }}
        className="w-full flex items-center gap-2 px-4 py-3 bg-blue-50 hover:bg-blue-100 transition-colors text-right text-sm font-medium text-blue-700"
      >
        <MessageSquare size={15} />
        הוסיפי הערה לדיוק הרעיון עם הבינה
        <span className="mr-auto text-xs text-blue-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="p-4 bg-white space-y-3">
          <p className="text-xs text-gray-500">
            תוכלי לבקש: לשנות גיבור, להוסיף פרט, לשנות זווית, להעמיק קונפליקט — כל הערה חופשית.
          </p>
          <textarea
            ref={textareaRef}
            value={msg}
            onChange={e => setMsg(e.target.value)}
            placeholder={textType === 'narrative'
              ? 'לדוגמה: "תוסיף ילדה שרוצה להיות רופאה" / "תשנה את הגיבור לנער בן 12"...'
              : 'לדוגמה: "תתמקד בהיבט ההיסטורי" / "תוסיף זווית של ילדים בגיל הנמען"...'}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right resize-none focus:ring-2 focus:ring-blue-400 focus:outline-none"
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey && msg.trim()) chatMutation.mutate() }}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => { setOpen(false); setMsg('') }}>
              ביטול
            </Button>
            <Button
              loading={chatMutation.isPending}
              disabled={!msg.trim()}
              onClick={() => chatMutation.mutate()}
            >
              <Send size={14} className="ml-1" />
              שלחי לבינה
            </Button>
          </div>
          {chatMutation.isError && (
            <p className="text-red-500 text-xs">{(chatMutation.error as Error).message}</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function ReviewPlan() {
  const { examId } = useParams<{ examId: string }>()
  const navigate = useNavigate()
  const [plan, setPlan] = useState<PlanData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<PlanStep>('theme')

  const generateMutation = useMutation({
    mutationFn: () => examsApi.generatePlan(examId!),
    onSuccess: (data) => {
      setPlan(data as PlanData)
      setError(null)
      setStep('theme')
    },
    onError: (e: Error) => setError(e.message),
  })

  const regenNarrMutation = useMutation({
    mutationFn: () => examsApi.generateIdea(examId!, 'narrative'),
    onSuccess: (data) => {
      if (data.narrative) {
        setPlan(prev => prev ? { ...prev, idea: { ...prev.idea, narrative: data.narrative } } : prev)
      }
      setError(null)
    },
    onError: (e: Error) => setError(e.message),
  })

  const regenInfoMutation = useMutation({
    mutationFn: () => examsApi.generateIdea(examId!, 'informational'),
    onSuccess: (data) => {
      if (data.informational) {
        setPlan(prev => prev ? { ...prev, idea: { ...prev.idea, informational: data.informational } } : prev)
      }
      setError(null)
    },
    onError: (e: Error) => setError(e.message),
  })

  useEffect(() => {
    generateMutation.mutate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId])

  const handleApprove = () => {
    navigate(`/teacher/exam/${examId}/texts?skipTheme=1`, {
      state: { approvedPlan: plan },
    })
  }

  const isLoading = generateMutation.isPending

  const stepIndex = { theme: 0, narrative_idea: 1, info_idea: 2 }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6" dir="rtl">
      {/* Back */}
      <button
        onClick={() => navigate('/teacher/new-exam')}
        className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm"
      >
        <ChevronLeft size={16} /> חזרה
      </button>

      <div>
        <h1 className="text-2xl font-bold">שלב הרעיון</h1>
        <p className="text-gray-500 mt-1">אשרו שלב אחר שלב לפני יצירת הטקסטים</p>
      </div>

      {/* Workflow steps */}
      <WorkflowSteps current={2} />

      {/* Sub-step breadcrumb */}
      {!isLoading && plan && (
        <div className="flex items-center gap-1 text-xs">
          {(['theme', 'narrative_idea', 'info_idea'] as PlanStep[]).map((s, i) => {
            const labels = { theme: 'תמה', narrative_idea: 'נרטיבי', info_idea: 'מידעי' }
            const done = stepIndex[step] > i
            const active = step === s
            return (
              <span key={s} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-300 mx-0.5">›</span>}
                <span className={`px-2.5 py-1 rounded-full font-medium ${
                  active ? 'bg-blue-600 text-white' :
                  done ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {done ? '✓ ' : ''}{labels[s]}
                </span>
              </span>
            )
          })}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <Card className="text-center py-12 space-y-4">
          <div className="flex justify-center"><Spinner /></div>
          <p className="text-gray-600 font-medium">מייצר תמה ורעיון לשני הטקסטים...</p>
          <p className="text-gray-400 text-sm">זה עשוי לקחת כ-15 שניות</p>
        </Card>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="space-y-3">
          <Alert type="error">{error}</Alert>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
            <p className="text-amber-800 font-medium text-sm">⚠️ לא ניתן לייצר תכנון אוטומטי כרגע.</p>
            <p className="text-amber-700 text-sm">ניתן לדלג לשלב יצירת הטקסטים ישירות — הבינה תייצר טקסטים גם ללא תכנון מוקדם.</p>
            <div className="flex gap-3 flex-wrap">
              <Button variant="secondary" onClick={() => generateMutation.mutate()} loading={isLoading}>
                <RefreshCw size={15} className="ml-1" />
                נסה שנית
              </Button>
              <Button onClick={() => navigate(`/teacher/exam/${examId}/texts`)}>
                דלג לשלב הטקסטים ←
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 1: Theme ── */}
      {plan && !isLoading && step === 'theme' && (
        <div className="space-y-4">
          <Card className="space-y-3 border-r-4 border-blue-500">
            <h2 className="font-bold text-lg text-blue-700">🎯 תמה משותפת לשני הטקסטים</h2>
            <p className="text-gray-800 text-lg font-medium">{plan.theme.theme}</p>
            {plan.theme.rationale && (
              <p className="text-gray-500 text-sm">{plan.theme.rationale}</p>
            )}
          </Card>

          <div className="flex gap-3 justify-between pt-1">
            <Button variant="secondary" onClick={() => generateMutation.mutate()} loading={isLoading}>
              <RefreshCw size={16} className="ml-1" />
              יצור תמה חדשה
            </Button>
            <Button onClick={() => setStep('narrative_idea')}>
              <Check size={16} className="ml-1" />
              אשר תמה — המשך
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Narrative idea ── */}
      {plan && !isLoading && step === 'narrative_idea' && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm">
            <span className="font-semibold text-green-700">✓ תמה מאושרת: </span>
            <span className="text-gray-700">{plan.theme.theme}</span>
          </div>

          {regenNarrMutation.isPending ? (
            <Card className="text-center py-8 space-y-3">
              <div className="flex justify-center"><Spinner /></div>
              <p className="text-gray-500 text-sm">מייצר רעיון חדש לטקסט הנרטיבי...</p>
            </Card>
          ) : plan.idea?.narrative ? (
            <Card className="space-y-3 border-r-4 border-emerald-500">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-lg text-emerald-700">📖 רעיון — טקסט נרטיבי</h2>
                {plan.idea.narrative.title && (
                  <span className="bg-emerald-100 text-emerald-800 text-sm font-bold px-3 py-1 rounded-full border border-emerald-300">
                    "{plan.idea.narrative.title}"
                  </span>
                )}
              </div>
              <div className="space-y-2 text-sm">
                {plan.idea.narrative.hero && (
                  <div className="flex gap-2">
                    <span className="font-semibold text-gray-600 w-20 flex-shrink-0">גיבור:</span>
                    <span className="text-gray-800">{plan.idea.narrative.hero}</span>
                  </div>
                )}
                {plan.idea.narrative.conflict && (
                  <div className="flex gap-2">
                    <span className="font-semibold text-gray-600 w-20 flex-shrink-0">קונפליקט:</span>
                    <span className="text-gray-800">{plan.idea.narrative.conflict}</span>
                  </div>
                )}
                {plan.idea.narrative.value && (
                  <div className="flex gap-2">
                    <span className="font-semibold text-gray-600 w-20 flex-shrink-0">ערך:</span>
                    <span className="text-gray-800">{plan.idea.narrative.value}</span>
                  </div>
                )}
                {plan.idea.narrative.summary && (
                  <div className="mt-3 p-3 bg-emerald-50 rounded-lg border-r-2 border-emerald-400">
                    <span className="font-semibold text-emerald-700 block mb-1 text-xs">תקציר (1–2 משפטים):</span>
                    <span className="text-gray-800">{plan.idea.narrative.summary}</span>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Alert type="error">לא נוצר רעיון לטקסט הנרטיבי</Alert>
          )}

          {plan.idea?.narrative && !regenNarrMutation.isPending && (
            <IdeaChatPanel
              textType="narrative"
              currentIdea={plan.idea.narrative}
              examId={examId!}
              onRefined={(refined) => setPlan(prev => prev ? {
                ...prev,
                idea: { ...prev.idea, narrative: refined as PlanData['idea']['narrative'] }
              } : prev)}
            />
          )}

          {plan.emotions && plan.emotions.length > 0 && (
            <Card className="space-y-2 py-3">
              <p className="font-semibold text-gray-600 text-sm">💛 רגשות מוצעים</p>
              <div className="flex flex-wrap gap-1.5">
                {plan.emotions.map(e => (
                  <span key={e} className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs border border-purple-200">{e}</span>
                ))}
              </div>
            </Card>
          )}

          <div className="flex gap-3 justify-between pt-1">
            <Button variant="secondary" onClick={() => regenNarrMutation.mutate()} loading={regenNarrMutation.isPending}>
              <RefreshCw size={16} className="ml-1" />
              יצור רעיון נרטיבי חדש
            </Button>
            <Button onClick={() => setStep('info_idea')}>
              <Check size={16} className="ml-1" />
              אשר — המשך לרעיון מידעי
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Informational idea ── */}
      {plan && !isLoading && step === 'info_idea' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm">
              <span className="font-semibold text-green-700">✓ תמה: </span>
              <span className="text-gray-700">{plan.theme.theme}</span>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm">
              <span className="font-semibold text-green-700">✓ נרטיבי: </span>
              <span className="text-gray-700">{plan.idea?.narrative?.title ? `"${plan.idea.narrative.title}" — ` : ''}{plan.idea?.narrative?.summary || plan.idea?.narrative?.hero || '—'}</span>
            </div>
          </div>

          {regenInfoMutation.isPending ? (
            <Card className="text-center py-8 space-y-3">
              <div className="flex justify-center"><Spinner /></div>
              <p className="text-gray-500 text-sm">מייצר רעיון חדש לטקסט המידעי...</p>
            </Card>
          ) : plan.idea?.informational ? (
            <Card className="space-y-3 border-r-4 border-amber-500">
              <h2 className="font-bold text-lg text-amber-700">📋 רעיון — טקסט מידעי</h2>
              <div className="space-y-2 text-sm">
                {plan.idea.informational.subject && (
                  <div className="flex gap-2">
                    <span className="font-semibold text-gray-600 w-24 flex-shrink-0">נושא:</span>
                    <span className="text-gray-800">{plan.idea.informational.subject}</span>
                  </div>
                )}
                {(plan.idea.informational.logical_structure || plan.idea.informational.aspects) && (
                  <div className="flex gap-2">
                    <span className="font-semibold text-gray-600 w-24 flex-shrink-0">מבנה לוגי:</span>
                    <span className="text-gray-800">{plan.idea.informational.logical_structure || plan.idea.informational.aspects}</span>
                  </div>
                )}
                {plan.idea.informational.message && (
                  <div className="flex gap-2">
                    <span className="font-semibold text-gray-600 w-24 flex-shrink-0">מסר:</span>
                    <span className="text-gray-800">{plan.idea.informational.message}</span>
                  </div>
                )}
                {plan.idea.informational.summary && (
                  <div className="mt-3 p-3 bg-amber-50 rounded-lg border-r-2 border-amber-400">
                    <span className="font-semibold text-amber-700 block mb-1 text-xs">תקציר (עד 2 שורות):</span>
                    <span className="text-gray-800">{plan.idea.informational.summary}</span>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Alert type="error">לא נוצר רעיון לטקסט המידעי</Alert>
          )}

          {plan.idea?.informational && !regenInfoMutation.isPending && (
            <IdeaChatPanel
              textType="informational"
              currentIdea={plan.idea.informational}
              examId={examId!}
              onRefined={(refined) => setPlan(prev => prev ? {
                ...prev,
                idea: { ...prev.idea, informational: refined as PlanData['idea']['informational'] }
              } : prev)}
            />
          )}

          <div className="flex gap-3 justify-between pt-1">
            <Button variant="secondary" onClick={() => regenInfoMutation.mutate()} loading={regenInfoMutation.isPending}>
              <RefreshCw size={16} className="ml-1" />
              יצור רעיון מידעי חדש
            </Button>
            <Button onClick={handleApprove}>
              <Check size={16} className="ml-1" />
              אשר הכל — המשך לכתיבת הטקסטים
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
