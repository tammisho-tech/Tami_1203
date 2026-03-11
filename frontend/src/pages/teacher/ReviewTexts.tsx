import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { examsApi } from '../../api/exams'
import { TextDisplay } from '../../components/exam/TextDisplay'
import { Button, Spinner, Alert, Card, WorkflowSteps } from '../../components/ui'
import { RefreshCw, ChevronLeft, Sparkles, Check, X } from 'lucide-react'


// רגשות לפי שכבת גיל — מבוסס על גלגל הרגשות של פלוצ׳יק
const EMOTIONS_BY_CLUSTER: Record<string, string[]> = {
  '3-4': [
    'שמחה', 'אושר', 'גאווה', 'התרגשות', 'ציפייה', 'תקווה', 'סקרנות',
    'הפתעה', 'תדהמה', 'הקלה', 'חיבה', 'ביטחון', 'שייכות',
    'חשש', 'פחד', 'עצב', 'צער', 'אכזבה', 'בדידות',
    'תסכול', 'כעס', 'קנאה (קלה)', 'מבוכה', 'דאגה', 'לחץ',
  ],
  '5-6': [
    'שמחה', 'אושר', 'גאווה', 'התרגשות', 'הכרת תודה', 'ציפייה', 'תקווה',
    'חדווה', 'הקלה', 'חיבה', 'אמון', 'ביטחון', 'שייכות',
    'הפתעה', 'תדהמה', 'מבוכה', 'בלבול',
    'חשש', 'דאגה', 'פחד', 'כבדות',
    'עצב', 'אכזבה', 'בדידות', 'געגוע',
    'תסכול', 'כעס', 'עלבון', 'קנאה', 'דחייה',
    'נחישות', 'אמפתיה', 'חמלה',
  ],
  '7-9': [
    'שמחה', 'אושר', 'גאווה', 'אהבה', 'הכרת תודה', 'סיפוק', 'הקלה',
    'שאיפה', 'מוטיבציה', 'ביטחון', 'שייכות', 'חיבה',
    'הפתעה', 'תדהמה', 'מבוכה', 'בלבול',
    'חשש', 'חרדה', 'פחד', 'כבדות',
    'עצב', 'ייאוש', 'בדידות', 'ריקנות', 'ניכור', 'געגוע',
    'תסכול', 'כעס', 'זעם', 'עלבון', 'קנאה', 'טינה',
    'חרטה', 'בושה', 'דחייה', 'בוז',
    'אמפתיה', 'חמלה', 'ערגה', 'אמביוולנטיות', 'נחישות',
  ],
}

interface ImproveComponent {
  key: string
  label: string
  icon: string
  badgeColor: string
  intro: string
}

const IMPROVE_COMPONENTS: ImproveComponent[] = [
  { key: 'genre',     label: 'סוגה',  icon: '🎭', badgeColor: 'purple', intro: 'הסוגה קובעת את מטרת הטקסט ואת ה"חוזה" עם הקורא.' },
  { key: 'content',   label: 'תוכן',  icon: '💡', badgeColor: 'amber',  intro: 'שכבת התוכן: על מה הטקסט, עומק המידע, ספציפיות.' },
  { key: 'structure', label: 'מבנה',  icon: '🏗️', badgeColor: 'blue',   intro: 'המבנה: כיצד הרעיונות מאורגנים ומוצגים.' },
  { key: 'language',  label: 'לשון',  icon: '✍️', badgeColor: 'green',  intro: 'הלשון: אוצר מילים, אמצעים ספרותיים, מגוון משפטים.' },
]

// Animated progress bar shown while fetching suggestions (~10-15 sec)
function SuggestionsLoader() {
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(s => s + 1)
      setProgress(p => {
        if (p < 40) return p + 4
        if (p < 70) return p + 2
        if (p < 88) return p + 0.8
        return p
      })
    }, 500)
    return () => clearInterval(t)
  }, [])
  const remaining = Math.max(0, 14 - elapsed)
  return (
    <div className="py-5 space-y-3">
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span className="flex items-center gap-2"><Spinner size={14} /> מייצרת הצעות מותאמות...</span>
        {remaining > 0 && <span className="text-xs text-gray-400">עוד ~{remaining} שניות</span>}
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-purple-400 rounded-full transition-all duration-500"
          style={{ width: `${Math.min(progress, 92)}%` }}
        />
      </div>
    </div>
  )
}

export default function ReviewTexts() {
  const { examId } = useParams<{ examId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const queryClient = useQueryClient()
  // Cache for suggestions: key = textId+component
  const suggestionsCache = useRef<Record<string, string[]>>({})
  const [generating, setGenerating] = useState(false)
  const [streamingNarr, setStreamingNarr] = useState('')
  const [streamingInfo, setStreamingInfo] = useState('')
  const [streamPhase, setStreamPhase] = useState<'idle' | 'streaming' | 'saving' | 'done'>('idle')
  const [regenType, setRegenType] = useState<string | null>(null)
  const [improvingText, setImprovingText] = useState<string | null>(null)
  const [improveSummary, setImproveSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [proposingTheme, setProposingTheme] = useState(false)
  const [proposedTheme, setProposedTheme] = useState<{ theme: string; rationale: string; blocked?: boolean; blocked_reason?: string } | null>(null)
  const [themeApproved, setThemeApproved] = useState(false)
  const [generatingNarrIdea, setGeneratingNarrIdea] = useState(false)
  const [generatingInfoIdea, setGeneratingInfoIdea] = useState(false)
  const [idea, setIdea] = useState<{
    narrative: { hero: string; conflict: string; logic: string; value: string; summary: string }
    informational: { subject: string; aspects: string; message: string; summary: string }
  } | null>(null)
  const [narrativeIdeaApproved, setNarrativeIdeaApproved] = useState(false)
  const [informationalIdeaApproved, setInformationalIdeaApproved] = useState(false)
  const [improveModal, setImproveModal] = useState<{ textId: string; component: ImproveComponent; textType: 'narrative' | 'informational' } | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set())
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [suggestionsError, setSuggestionsError] = useState(false)
  const [layerInstruction, setLayerInstruction] = useState('')
  const [customInstruction, setCustomInstruction] = useState('')
  const [selectedEmotions, setSelectedEmotions] = useState<Set<string>>(new Set())
  const [customEmotion, setCustomEmotion] = useState('')
  const [emotionsApproved, setEmotionsApproved] = useState(false)
  const [suggestedEmotions, setSuggestedEmotions] = useState<string[]>([])
  const [loadingEmotions, setLoadingEmotions] = useState(false)
  const [showMoreEmotions, setShowMoreEmotions] = useState(false)
  // If coming from ReviewPlan (?skipTheme=1), skip the theme step entirely
  const [skippedTheme, setSkippedTheme] = useState(() => searchParams.get('skipTheme') === '1')
  // If coming back from LinguisticEdit (?afterEdit=1), hide the linguistic edit button
  const afterLinguisticEdit = searchParams.get('afterEdit') === '1'
  // Text approval — teacher must approve each text before proceeding to questions
  const [narrativeApproved, setNarrativeApproved] = useState(false)
  const [informationalApproved, setInformationalApproved] = useState(false)

  // When arriving from ReviewPlan with an approved plan, initialize idea + emotions
  useEffect(() => {
    const state = location.state as { approvedPlan?: { theme: { theme: string; rationale: string }; idea: { narrative?: { hero: string; conflict: string; logic: string; value: string; summary: string }; informational?: { subject: string; aspects: string; message: string; summary: string } }; emotions: string[] } } | null
    if (!state?.approvedPlan) return
    const { idea: approvedIdea, emotions: approvedEmotions } = state.approvedPlan
    if (approvedIdea?.narrative && approvedIdea?.informational) {
      setIdea({ narrative: approvedIdea.narrative, informational: approvedIdea.informational })
      setNarrativeIdeaApproved(true)
      setInformationalIdeaApproved(true)
    }
    if (approvedEmotions && approvedEmotions.length > 0) {
      setSuggestedEmotions(approvedEmotions)
      setSelectedEmotions(new Set(approvedEmotions))
      setEmotionsApproved(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-dismiss improvement summary after 10 seconds
  useEffect(() => {
    if (!improveSummary) return
    const t = setTimeout(() => setImproveSummary(null), 10000)
    return () => clearTimeout(t)
  }, [improveSummary])

  const { data: exam, isLoading } = useQuery({
    queryKey: ['exam', examId],
    queryFn: () => examsApi.get(examId!),
    enabled: !!examId,
  })

  // Pre-fetch all suggestions in background when texts are loaded
  const prefetchDone = useRef(false)
  useEffect(() => {
    if (prefetchDone.current) return
    const texts = exam?.texts
    if (!texts || texts.length < 2) return
    const narrText = texts.find((t: { text_type: string }) => t.text_type === 'narrative')
    const infoText = texts.find((t: { text_type: string }) => t.text_type === 'informational')
    if (!narrText || !infoText) return
    prefetchDone.current = true
    const components = ['genre', 'content', 'structure', 'language']
    for (const text of [narrText, infoText]) {
      for (const comp of components) {
        const key = `${text.id}:${comp}`
        if (suggestionsCache.current[key]) continue
        examsApi.suggestImprovements(examId!, text.id, comp)
          .then(data => { suggestionsCache.current[key] = data.suggestions })
          .catch(() => {/* silent — will fetch on demand */})
      }
    }
  }, [exam?.texts, examId])

  const planMutation = useMutation({
    mutationFn: () => examsApi.generatePlan(examId!),
    onMutate: () => {
      setProposingTheme(true)
      setError(null)
      setSuggestions([])
      setIdea(null)
      setNarrativeIdeaApproved(false)
      setInformationalIdeaApproved(false)
      setSelectedEmotions(new Set())
      setEmotionsApproved(false)
      setSuggestedEmotions([])
      setLoadingEmotions(false)
    },
    onSuccess: (data) => {
      setProposedTheme(data.theme)
      setProposingTheme(false)
      if (!data.theme.blocked) {
        if (data.idea.narrative && data.idea.informational) {
          setIdea({ narrative: data.idea.narrative, informational: data.idea.informational })
        }
        setSuggestedEmotions(data.emotions)
        setSelectedEmotions(new Set(data.emotions))
        setThemeApproved(true)
        setNarrativeIdeaApproved(true)
        setInformationalIdeaApproved(true)
        setEmotionsApproved(true)
      }
    },
    onError: (e: Error) => { setError(e.message); setProposingTheme(false) },
  })

  const themeMutation = useMutation({
    mutationFn: () => examsApi.proposeTheme(examId!),
    onMutate: () => { setProposingTheme(true); setError(null); setSuggestions([]); setIdea(null); setNarrativeIdeaApproved(false); setInformationalIdeaApproved(false); setSelectedEmotions(new Set()); setEmotionsApproved(false); setSuggestedEmotions([]); setLoadingEmotions(false) },
    onSuccess: (data) => {
      setProposedTheme(data)
      setProposingTheme(false)
    },
    onError: (e: Error) => { setError(e.message); setProposingTheme(false) },
  })

  const approveThemeMutation = useMutation({
    mutationFn: (approved: boolean) => examsApi.approveTheme(examId!, approved),
    onSuccess: (_data: unknown, approved: boolean) => {
      if (approved) {
        setThemeApproved(true)
      } else {
        // Reject: reset everything so teacher can start fresh
        setProposedTheme(null)
        setThemeApproved(false)
        setIdea(null)
        setNarrativeIdeaApproved(false)
        setInformationalIdeaApproved(false)
        setSelectedEmotions(new Set())
        setEmotionsApproved(false)
      }
    },
  })

  const narrativeIdeaMutation = useMutation({
    mutationFn: () => examsApi.generateIdea(examId!, 'narrative'),
    onMutate: () => { setGeneratingNarrIdea(true); setError(null) },
    onSuccess: (data) => {
      if (data.narrative) setIdea(prev => prev ? { ...prev, narrative: data.narrative! } : prev)
      setNarrativeIdeaApproved(false)
      setGeneratingNarrIdea(false)
    },
    onError: (e: Error) => { setError(e.message); setGeneratingNarrIdea(false) },
  })

  const infoIdeaMutation = useMutation({
    mutationFn: () => examsApi.generateIdea(examId!, 'informational'),
    onMutate: () => { setGeneratingInfoIdea(true); setError(null) },
    onSuccess: (data) => {
      if (data.informational) setIdea(prev => prev ? { ...prev, informational: data.informational! } : prev)
      setInformationalIdeaApproved(false)
      setGeneratingInfoIdea(false)
    },
    onError: (e: Error) => { setError(e.message); setGeneratingInfoIdea(false) },
  })

  const suggestEmotionsMutation = useMutation({
    mutationFn: () => examsApi.suggestEmotions(examId!),
    onMutate: () => { setLoadingEmotions(true); setSuggestedEmotions([]) },
    onSuccess: (data) => {
      setSuggestedEmotions(data.emotions)
      // Pre-select all 5 suggested emotions
      setSelectedEmotions(new Set(data.emotions))
      setLoadingEmotions(false)
    },
    onError: () => setLoadingEmotions(false),
  })

  const handleGenerateTexts = async () => {
    setGenerating(true)
    setStreamPhase('streaming')
    setStreamingNarr('')
    setStreamingInfo('')
    setError(null)

    try {
      const body = JSON.stringify({
        emotions: selectedEmotions.size > 0 ? Array.from(selectedEmotions) : undefined,
        idea: idea || undefined,
        text_continuity: exam?.topic_values?.text_continuity || undefined,
        non_continuous_type: exam?.topic_values?.non_continuous_type || undefined,
        sidebar_types: exam?.topic_values?.sidebar_types?.length ? exam.topic_values.sidebar_types : undefined,
      })
      const res = await fetch(`/api/exams/${examId}/generate-texts-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (!res.ok || !res.body) throw new Error(`שגיאת שרת ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE lines
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.event === 'start') {
              // Text generation started for this type — already showing spinner
            } else if (evt.event === 'text_done') {
              // Individual text ready — show preview content
              if (evt.text_type === 'narrative') {
                setStreamingNarr(evt.data?.content || '')
              } else {
                setStreamingInfo(evt.data?.content || '')
              }
            } else if (evt.event === 'all_done') {
              setStreamPhase('saving')
            } else if (evt.event === 'saved') {
              setStreamPhase('done')
              queryClient.invalidateQueries({ queryKey: ['exam', examId] })
              setGenerating(false)
              setStreamingNarr('')
              setStreamingInfo('')
              setStreamPhase('idle')
            } else if (evt.event === 'save_error') {
              throw new Error(evt.error || 'שגיאה בשמירה')
            }
          } catch (parseErr) {
            // Skip malformed lines
          }
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
      setGenerating(false)
      setStreamPhase('idle')
    }
  }

  const regenMutation = useMutation({
    mutationFn: ({ type, continuity }: { type: string; continuity?: string }) =>
      examsApi.regenerateText(examId!, type, continuity),
    onMutate: ({ type }) => { setRegenType(type); setError(null) },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam', examId] })
      setRegenType(null)
    },
    onError: (e: Error) => { setError(e.message); setRegenType(null) },
  })

  const editMutation = useMutation({
    mutationFn: ({ textId, content, title }: { textId: string; content: string; title: string }) =>
      examsApi.updateText(examId!, textId, { content, title }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exam', examId] }),
  })

  const [lastImprovedTextId, setLastImprovedTextId] = useState<string | null>(null)
  const [improvingInstruction, setImprovingInstruction] = useState<string | null>(null)

  const improveMutation = useMutation({
    mutationFn: ({ textId, component, instruction }: { textId: string; component: string; instruction: string }) =>
      examsApi.improveText(examId!, textId, component, instruction),
    onMutate: ({ textId, instruction }) => {
      setImprovingText(textId)
      setImproveSummary(null)
      setError(null)
      setImproveModal(null)
      setImprovingInstruction(instruction || null)
    },
    onSuccess: (data: { improvement_summary?: string }, { textId }) => {
      queryClient.invalidateQueries({ queryKey: ['exam', examId] })
      setImprovingText(null)
      setImprovingInstruction(null)
      setImproveSummary(data.improvement_summary || 'הטקסט עודכן בהצלחה')
      setLastImprovedTextId(textId)
      setTimeout(() => setLastImprovedTextId(null), 4000)
    },
    onError: (e: Error) => { setError(e.message); setImprovingText(null); setImprovingInstruction(null) },
  })

  const suggestionsMutation = useMutation({
    mutationFn: ({ textId, component }: { textId: string; component: string }) =>
      examsApi.suggestImprovements(examId!, textId, component),
    onMutate: () => { setLoadingSuggestions(true); setSuggestions([]); setSuggestionsError(false) },
    onSuccess: (data, vars) => {
      setSuggestions(data.suggestions || [])
      suggestionsCache.current[`${vars.textId}:${vars.component}`] = data.suggestions || []
      setLoadingSuggestions(false)
      setSuggestionsError(false)
    },
    onError: () => { setLoadingSuggestions(false); setSuggestionsError(true) },
  })

  const openImproveModal = (textId: string, comp: ImproveComponent, textType: 'narrative' | 'informational') => {
    const cacheKey = `${textId}:${comp.key}`
    const cached = suggestionsCache.current[cacheKey]
    setSelectedSuggestions(new Set())
    setLayerInstruction('')
    setCustomInstruction('')
    setSuggestionsError(false)
    setImproveModal({ textId, component: comp, textType })
    if (cached && cached.length > 0) {
      setSuggestions(cached)
      setLoadingSuggestions(false)
    } else {
      setSuggestions([])
      setLoadingSuggestions(true)
      suggestionsMutation.mutate({ textId, component: comp.key })
    }
  }

  const toggleSuggestion = (i: number) => {
    setSelectedSuggestions(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  const composeInstruction = (): string => {
    const parts: string[] = []
    const chosen = Array.from(selectedSuggestions).sort().map(i => suggestions[i]).filter(Boolean)
    if (chosen.length > 0) parts.push('הצעות היועצת הנבחרות:\n' + chosen.map((s, i) => `${i + 1}. ${s}`).join('\n'))
    if (layerInstruction.trim()) parts.push('הנחיה ספציפית לשכבה זו: ' + layerInstruction.trim())
    if (customInstruction.trim()) parts.push('הנחיה כללית: ' + customInstruction.trim())
    return parts.join('\n\n')
  }

  if (isLoading) return <Spinner text="טוען..." />

  const narr = exam?.texts?.find((t: { text_type: string }) => t.text_type === 'narrative')
  const info = exam?.texts?.find((t: { text_type: string }) => t.text_type === 'informational')
  const hasTexts = narr && info
  const showThemeStep = !hasTexts && !generating && !skippedTheme

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div>
        <WorkflowSteps current={3} />
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">{exam?.title}</h1>
        </div>
        {exam?.topic_values?.teacher_name && (
          <p className="text-gray-500 text-lg font-semibold mt-0.5">מורה: {exam.topic_values.teacher_name}</p>
        )}
        <p className="text-gray-500 text-sm mt-1">שלב 3: פיתוח הטקסטים</p>
      </div>

      {error && (
        <Alert type="error">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span>{error}</span>
            {!hasTexts && (
              <button
                onClick={() => { setSkippedTheme(true); setError(null) }}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-red-300 text-red-700 hover:bg-red-50 whitespace-nowrap"
              >
                דלג ויצרי טקסטים ישירות
              </button>
            )}
          </div>
        </Alert>
      )}
      {improvingText && (
        <Alert type="info">
          <div className="flex items-center gap-2">
            <Spinner size={14} />
            <span>
              <strong>משפר טקסט...</strong>
              {improvingInstruction && (
                <span className="text-blue-600 text-sm"> ─ הנחיה: "{improvingInstruction.slice(0, 80)}{improvingInstruction.length > 80 ? '...' : ''}"</span>
              )}
            </span>
          </div>
        </Alert>
      )}
      {improveSummary && !improvingText && (
        <Alert type="success">
          <div className="flex items-center justify-between gap-3">
            <span><strong>הטקסט שופר בהצלחה:</strong> {improveSummary}</span>
            <button onClick={() => setImproveSummary(null)} className="text-green-700 hover:text-green-900 font-bold text-lg leading-none flex-shrink-0">&times;</button>
          </div>
        </Alert>
      )}

      {/* שלב תמה */}
      {showThemeStep && (
        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-purple-500" />
            <h2 className="font-bold text-lg">שלב א׳: תמה, רעיון ורגשות</h2>
          </div>

          {/* Step 0: no theme yet */}
          {!proposedTheme && !proposingTheme && (
            <div className="space-y-3">
              <p className="text-gray-600 text-sm">הבינה תציע תמה משותפת ורעיון לכל טקסט — הכול יופיע יחד לאישורך.</p>
              <div className="flex items-center gap-4">
                <Button onClick={() => planMutation.mutate()}>
                  <Sparkles size={16} /> הצע תמה ורעיון
                </Button>
                <button
                  onClick={() => setSkippedTheme(true)}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  דלג ויצרי טקסטים ישירות
                </button>
              </div>
            </div>
          )}

          {/* Loading theme */}
          {proposingTheme && (
            <div className="flex items-center gap-2 py-4 text-gray-500 text-sm">
              <Spinner size={18} /> מציע תמה ורעיון...
            </div>
          )}

          {/* Theme + ideas shown together */}
          {proposedTheme && !proposedTheme.blocked && (
            <div className="space-y-4">
              {/* Theme row */}
              <div className={`rounded-xl p-4 border-2 space-y-1 ${themeApproved ? 'bg-green-50 border-green-300' : 'bg-purple-50 border-purple-200'}`}>
                <div className="flex items-center justify-between">
                  <p className="font-bold text-purple-800 text-sm flex items-center gap-1">
                    <Sparkles size={13} /> תמה משותפת
                  </p>
                  {themeApproved
                    ? <span className="flex items-center gap-1 text-xs text-green-700 font-medium"><Check size={13} /> אושרה</span>
                    : null}
                </div>
                <p className="font-semibold text-gray-800">"{proposedTheme.theme}"</p>
                <p className="text-xs text-gray-500">{proposedTheme.rationale}</p>
                {!themeApproved && (
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => { approveThemeMutation.mutate(true) }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 flex items-center gap-1"
                    >
                      <Check size={12} /> אשרי תמה
                    </button>
                    <button
                      onClick={() => { approveThemeMutation.mutate(false); themeMutation.mutate() }}
                      disabled={approveThemeMutation.isPending || proposingTheme}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 flex items-center gap-1 disabled:opacity-50"
                    >
                      <X size={12} /> תמה אחרת
                    </button>
                  </div>
                )}
              </div>

              {/* Ideas row */}
              {idea && (
                <div className="border-t pt-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">רעיון לטקסטים</p>
                  {idea && (
                    <div className="grid grid-cols-2 gap-3">
                      {/* Narrative idea */}
                      <div className={`rounded-xl p-3 space-y-2 border-2 transition-colors ${narrativeIdeaApproved ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-200'}`}>
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-amber-800 text-xs">טקסט נרטיבי</p>
                          {narrativeIdeaApproved && <span className="flex items-center gap-1 text-xs text-green-700 font-medium"><Check size={12} /> אושר</span>}
                        </div>
                        <p className="text-xs text-gray-700">{idea.narrative.summary}</p>
                        <div className="text-xs text-gray-500 space-y-0.5">
                          <p><span className="font-medium">גיבור/ה:</span> {idea.narrative.hero}</p>
                          <p><span className="font-medium">קונפליקט:</span> {idea.narrative.conflict}</p>
                          <p><span className="font-medium">ערך:</span> {idea.narrative.value}</p>
                        </div>
                        {!narrativeIdeaApproved && (
                          <div className="flex gap-1.5 pt-1">
                            <button onClick={() => { setNarrativeIdeaApproved(true); if (informationalIdeaApproved && suggestedEmotions.length === 0) suggestEmotionsMutation.mutate() }}
                              className="flex-1 text-xs font-semibold py-1 rounded-lg bg-amber-600 text-white hover:bg-amber-700 flex items-center justify-center gap-1">
                              <Check size={11} /> אשרי
                            </button>
                            <button onClick={() => narrativeIdeaMutation.mutate()} disabled={generatingNarrIdea}
                              className="flex-1 text-xs font-semibold py-1 rounded-lg border border-amber-400 text-amber-700 bg-white hover:bg-amber-50 flex items-center justify-center gap-1 disabled:opacity-50">
                              {generatingNarrIdea ? <Spinner size={11} /> : <X size={11} />} אחר
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Informational idea */}
                      <div className={`rounded-xl p-3 space-y-2 border-2 transition-colors ${informationalIdeaApproved ? 'bg-green-50 border-green-300' : 'bg-sky-50 border-sky-200'}`}>
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-sky-800 text-xs">טקסט מידעי</p>
                          {informationalIdeaApproved && <span className="flex items-center gap-1 text-xs text-green-700 font-medium"><Check size={12} /> אושר</span>}
                        </div>
                        <p className="text-xs text-gray-700">{idea.informational.summary}</p>
                        <div className="text-xs text-gray-500 space-y-0.5">
                          <p><span className="font-medium">נושא:</span> {idea.informational.subject}</p>
                          <p><span className="font-medium">מסר:</span> {idea.informational.message}</p>
                        </div>
                        {!informationalIdeaApproved && (
                          <div className="space-y-2 pt-1">
                            <div className="flex gap-1.5">
                              <button onClick={() => { setInformationalIdeaApproved(true); if (narrativeIdeaApproved && suggestedEmotions.length === 0) suggestEmotionsMutation.mutate() }}
                                className="flex-1 text-xs font-semibold py-1 rounded-lg bg-sky-600 text-white hover:bg-sky-700 flex items-center justify-center gap-1">
                                <Check size={11} /> אשרי
                              </button>
                              <button onClick={() => infoIdeaMutation.mutate()} disabled={generatingInfoIdea}
                                className="flex-1 text-xs font-semibold py-1 rounded-lg border border-sky-400 text-sky-700 bg-white hover:bg-sky-50 flex items-center justify-center gap-1 disabled:opacity-50">
                                {generatingInfoIdea ? <Spinner size={11} /> : <X size={11} />} אחר
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Emotions step — shown after both ideas approved */}
              {narrativeIdeaApproved && informationalIdeaApproved && !emotionsApproved && (
                <div className="border-t pt-4 space-y-3">
                  <div>
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                      <Sparkles size={12} /> רגשות שיבואו לידי ביטוי בנרטיבי
                    </p>
                    <p className="text-xs text-gray-500 mb-3">הבינה תציג 5 רגשות מותאמים לתמה — אשרי, שני, או הוסיפי.</p>

                    {/* Loading */}
                    {loadingEmotions && (
                      <div className="flex items-center gap-2 text-gray-400 text-xs py-3">
                        <Spinner size={14} /> מציע רגשות מתאימים לתמה...
                      </div>
                    )}

                    {/* AI-suggested chips */}
                    {!loadingEmotions && suggestedEmotions.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-500">הצעות הבינה — לחצי להסרה:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {suggestedEmotions.map(em => (
                            <button
                              key={em}
                              onClick={() => setSelectedEmotions(prev => {
                                const next = new Set(prev)
                                if (next.has(em)) next.delete(em); else if (next.size < 5) next.add(em)
                                return next
                              })}
                              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                                selectedEmotions.has(em)
                                  ? 'bg-rose-500 text-white border-rose-500'
                                  : 'bg-white text-gray-400 border-gray-300 line-through'
                              }`}
                            >
                              {em}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Expandable: more emotions from age-appropriate list */}
                    {!loadingEmotions && (
                      <div className="mt-2">
                        <button
                          onClick={() => setShowMoreEmotions(v => !v)}
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        >
                          {showMoreEmotions ? '▲ הסתר רגשות נוספים' : '▼ הוסיפי רגשות נוספים'}
                        </button>
                        {showMoreEmotions && (
                          <div className="flex flex-wrap gap-1.5 mt-2 max-h-28 overflow-y-auto pr-1">
                            {(EMOTIONS_BY_CLUSTER[exam?.grade_cluster as string] || EMOTIONS_BY_CLUSTER['5-6'])
                              .filter(em => !suggestedEmotions.includes(em))
                              .map(em => (
                                <button
                                  key={em}
                                  onClick={() => setSelectedEmotions(prev => {
                                    const next = new Set(prev)
                                    if (next.has(em)) next.delete(em); else if (next.size < 5) next.add(em)
                                    return next
                                  })}
                                  className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                                    selectedEmotions.has(em)
                                      ? 'bg-rose-500 text-white border-rose-500'
                                      : 'bg-white text-gray-600 border-gray-300 hover:border-rose-400'
                                  }`}
                                >
                                  {em}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Custom emotion input */}
                    {!loadingEmotions && (
                      <div className="flex gap-2 mt-2">
                        <input
                          value={customEmotion}
                          onChange={e => setCustomEmotion(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && customEmotion.trim()) {
                              setSelectedEmotions(prev => { const n = new Set(prev); if (n.size < 5) n.add(customEmotion.trim()); return n })
                              setCustomEmotion('')
                            }
                          }}
                          placeholder="הוסיפי רגש אחר... (Enter)"
                          className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-rose-200 text-right"
                        />
                      </div>
                    )}

                    {selectedEmotions.size > 0 && (
                      <p className="text-xs text-rose-600 mt-1.5 font-medium">נבחרו: {Array.from(selectedEmotions).join(' · ')}</p>
                    )}
                  </div>

                  <button
                    disabled={loadingEmotions}
                    onClick={() => setEmotionsApproved(true)}
                    className="text-sm font-semibold px-4 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-700 flex items-center gap-2 disabled:opacity-50"
                  >
                    <Check size={15} /> {selectedEmotions.size > 0 ? `אשרי רגשות (${selectedEmotions.size} נבחרו)` : 'המשך ללא רגשות ספציפיים'}
                  </button>
                </div>
              )}

              {/* Final generate button */}
              {narrativeIdeaApproved && informationalIdeaApproved && emotionsApproved && (
                <div className="space-y-2 border-t pt-4">
                  {selectedEmotions.size > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {Array.from(selectedEmotions).map(em => (
                        <span key={em} className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-medium">{em}</span>
                      ))}
                    </div>
                  )}
                  <Button loading={generating} onClick={() => handleGenerateTexts()}>
                    <RefreshCw size={16} />
                    {generating ? 'יוצרת טקסטים...' : 'צרי טקסטים'}
                  </Button>
                </div>
              )}

              {proposedTheme.blocked && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
                  {proposedTheme.blocked_reason}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Direct generate when theme step was skipped */}
      {skippedTheme && !hasTexts && !generating && (
        <Card className="space-y-3">
          <p className="text-sm text-gray-600">הבינה תייצר טקסטים על בסיס הנושא והערכים שהזנת.</p>
          <Button loading={generating} onClick={() => handleGenerateTexts()}>
            <RefreshCw size={16} />
            צרי טקסטים
          </Button>
        </Card>
      )}

      {generating && (
        <div className="grid grid-cols-2 gap-4">
          {/* Streaming narrative */}
          <Card className="space-y-2">
            <div className="flex items-center gap-2">
              <Spinner size={16} />
              <h3 className="font-semibold text-gray-700">
                {streamPhase === 'saving' ? 'שומר טקסט נרטיבי...' : 'יוצר טקסט נרטיבי...'}
              </h3>
            </div>
            {streamingNarr ? (
              <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto border rounded p-2 bg-green-50 font-serif" dir="rtl">
                {streamingNarr}
              </div>
            ) : (
              <div className="text-sm text-gray-400 italic">יוצר טקסט... (כ-30 שניות)</div>
            )}
          </Card>
          {/* Generating informational */}
          <Card className="space-y-2">
            <div className="flex items-center gap-2">
              <Spinner size={16} />
              <h3 className="font-semibold text-gray-700">
                {streamPhase === 'saving' ? 'שומר טקסט מידעי...' : 'יוצר טקסט מידעי...'}
              </h3>
            </div>
            {streamingInfo ? (
              <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto border rounded p-2 bg-green-50 font-serif" dir="rtl">
                {streamingInfo}
              </div>
            ) : (
              <div className="text-sm text-gray-400 italic">יוצר טקסט... (כ-30 שניות)</div>
            )}
          </Card>
        </div>
      )}

      {hasTexts && !generating && (
        <div className="grid grid-cols-2 gap-4">
          {/* Narrative */}
          <div className={`space-y-2 transition-all duration-500 ${narrativeApproved ? 'ring-2 ring-green-400 rounded-xl p-1' : lastImprovedTextId === narr?.id ? 'ring-2 ring-blue-300 rounded-xl p-1' : ''}`}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                טקסט נרטיבי
                {narrativeApproved && <span className="flex items-center gap-1 text-xs text-green-700 font-medium bg-green-100 px-2 py-0.5 rounded-full"><Check size={11} /> אושר</span>}
                {!narrativeApproved && lastImprovedTextId === narr?.id && <span className="text-xs text-blue-600 font-medium animate-pulse">✓ שופר</span>}
              </h3>
              <Button
                variant="secondary"
                loading={regenType === 'narrative'}
                onClick={() => { regenMutation.mutate({ type: 'narrative' }); setNarrativeApproved(false) }}
                className="text-xs px-2 py-1"
              >
                <RefreshCw size={12} /> ייצר מחדש
              </Button>
            </div>
            <TextDisplay
              text={narr}
              showAnchors
              editable
              onEdit={(textId: string, content: string, title: string) =>
                editMutation.mutate({ textId, content, title })
              }
            />
            {/* Improve by component */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                <Sparkles size={12} /> שיפור לפי רכיב:
              </p>
              <div className="flex flex-wrap gap-2">
                {IMPROVE_COMPONENTS.map(comp => (
                  <button
                    key={comp.key}
                    onClick={() => { openImproveModal(narr.id, comp, 'narrative'); setNarrativeApproved(false) }}
                    disabled={improvingText === narr.id}
                    title={comp.intro}
                    className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-purple-50 hover:border-purple-300 transition-colors disabled:opacity-50 font-medium"
                  >
                    {improvingText === narr.id ? <span className="flex items-center gap-1"><Spinner size={10} /> משפר...</span> : `${comp.icon} ${comp.label}`}
                  </button>
                ))}
              </div>
            </div>
            {/* Approval row */}
            {narrativeApproved ? (
              <div className="flex items-center justify-between bg-green-50 border border-green-300 rounded-xl px-4 py-2">
                <span className="text-sm text-green-700 font-medium flex items-center gap-1"><Check size={14} /> הטקסט הנרטיבי אושר</span>
                <button onClick={() => setNarrativeApproved(false)} className="text-xs text-gray-400 hover:text-gray-600 underline">בטל אישור</button>
              </div>
            ) : (
              <button
                onClick={() => setNarrativeApproved(true)}
                className="w-full text-sm font-semibold py-2 rounded-xl bg-green-600 text-white hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <Check size={15} /> אשרי טקסט נרטיבי
              </button>
            )}
          </div>

          {/* Informational */}
          <div className={`space-y-2 transition-all duration-500 ${informationalApproved ? 'ring-2 ring-green-400 rounded-xl p-1' : lastImprovedTextId === info?.id ? 'ring-2 ring-blue-300 rounded-xl p-1' : ''}`}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                טקסט מידעי
                {informationalApproved && <span className="flex items-center gap-1 text-xs text-green-700 font-medium bg-green-100 px-2 py-0.5 rounded-full"><Check size={11} /> אושר</span>}
                {!informationalApproved && lastImprovedTextId === info?.id && <span className="text-xs text-blue-600 font-medium animate-pulse">✓ שופר</span>}
              </h3>
              <Button
                variant="secondary"
                loading={regenType === 'informational'}
                onClick={() => { regenMutation.mutate({ type: 'informational' }); setInformationalApproved(false) }}
                className="text-xs px-2 py-1"
              >
                <RefreshCw size={12} /> ייצר מחדש
              </Button>
            </div>
            <TextDisplay
              text={info}
              showAnchors
              editable
              onEdit={(textId: string, content: string, title: string) =>
                editMutation.mutate({ textId, content, title })
              }
            />
            {/* Improve by component */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                <Sparkles size={12} /> שיפור לפי רכיב:
              </p>
              <div className="flex flex-wrap gap-2">
                {IMPROVE_COMPONENTS.map(comp => (
                  <button
                    key={comp.key}
                    onClick={() => { openImproveModal(info.id, comp, 'informational'); setInformationalApproved(false) }}
                    disabled={improvingText === info.id}
                    title={comp.intro}
                    className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-purple-50 hover:border-purple-300 transition-colors disabled:opacity-50 font-medium"
                  >
                    {improvingText === info.id ? <span className="flex items-center gap-1"><Spinner size={10} /> משפר...</span> : `${comp.icon} ${comp.label}`}
                  </button>
                ))}
              </div>
            </div>
            {/* Approval row */}
            {informationalApproved ? (
              <div className="flex items-center justify-between bg-green-50 border border-green-300 rounded-xl px-4 py-2">
                <span className="text-sm text-green-700 font-medium flex items-center gap-1"><Check size={14} /> הטקסט המידעי אושר</span>
                <button onClick={() => setInformationalApproved(false)} className="text-xs text-gray-400 hover:text-gray-600 underline">בטל אישור</button>
              </div>
            ) : (
              <button
                onClick={() => setInformationalApproved(true)}
                className="w-full text-sm font-semibold py-2 rounded-xl bg-green-600 text-white hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <Check size={15} /> אשרי טקסט מידעי
              </button>
            )}
          </div>
        </div>
      )}

      {/* General improvement instruction — shown once below both text panels */}
      {hasTexts && !generating && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-1">
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1">
            <Sparkles size={12} /> הנחיה כללית לשיפור הטקסטים (אופציונלי)
          </label>
          <textarea
            value={customInstruction}
            onChange={e => setCustomInstruction(e.target.value)}
            rows={2}
            placeholder="כל הנחיה חופשית שתתווסף לכל שיפור — לדוגמה: 'שמרי על שפה פשוטה' או 'הוסיפי יותר דוגמאות'"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right resize-none focus:outline-none focus:ring-2 focus:ring-gray-300 bg-white"
          />
        </div>
      )}

      {/* Continue button */}
      {hasTexts && !generating && (
        <div className="flex flex-col items-center gap-2 pt-2">
          {!afterLinguisticEdit && (!narrativeApproved || !informationalApproved) ? (
            <p className="text-sm text-amber-600 font-medium flex items-center gap-1">
              ⚠️ יש לאשר את שני הטקסטים לפני המשך
              {narrativeApproved && <span className="text-green-600 mr-1">(נרטיבי ✓)</span>}
              {informationalApproved && <span className="text-green-600 mr-1">(מידעי ✓)</span>}
            </p>
          ) : null}
          {afterLinguisticEdit ? (
            // Came back from linguistic edit — go directly to questions, no need to re-edit
            <Button
              onClick={() => navigate(`/teacher/exam/${examId}/questions`)}
              className="px-8"
            >
              המשך לייצור שאלות
              <ChevronLeft size={16} />
            </Button>
          ) : (
            <Button
              onClick={() => navigate(`/teacher/exam/${examId}/language-edit`)}
              disabled={!narrativeApproved || !informationalApproved}
              className="px-8"
            >
              המשך לעריכה לשונית
              <ChevronLeft size={16} />
            </Button>
          )}
        </div>
      )}

      {/* Improve component modal */}
      {improveModal && (() => {
        const comp = improveModal.component
        const colorMap: Record<string, { border: string; text: string; bg: string; badge: string; ring: string }> = {
          purple: { border: 'border-purple-300', text: 'text-purple-700', bg: 'bg-purple-50', badge: 'bg-purple-100 text-purple-800', ring: 'focus:ring-purple-300' },
          amber:  { border: 'border-amber-300',  text: 'text-amber-700',  bg: 'bg-amber-50',  badge: 'bg-amber-100 text-amber-800',   ring: 'focus:ring-amber-300' },
          blue:   { border: 'border-blue-300',   text: 'text-blue-700',   bg: 'bg-blue-50',   badge: 'bg-blue-100 text-blue-800',     ring: 'focus:ring-blue-300' },
          green:  { border: 'border-green-300',  text: 'text-green-700',  bg: 'bg-green-50',  badge: 'bg-green-100 text-green-800',   ring: 'focus:ring-green-300' },
        }
        const colors = colorMap[comp.badgeColor] || colorMap.purple
        const textTypeName = improveModal.textType === 'narrative' ? 'טקסט נרטיבי' : 'טקסט מידעי'

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">

              {/* Header */}
              <div className={`flex items-center justify-between px-5 py-4 border-b ${colors.bg} rounded-t-2xl`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-2xl">{comp.icon}</span>
                  <h2 className={`font-bold text-lg ${colors.text}`}>שיפור רכיב {comp.label}</h2>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colors.badge}`}>{textTypeName}</span>
                </div>
                <button onClick={() => setImproveModal(null)} className="text-gray-400 hover:text-gray-600 text-2xl p-1">&times;</button>
              </div>

              <div className="overflow-y-auto flex-1 p-5 space-y-5">

                {/* AI suggestions */}
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                    הצעות יועצת ספרותית-פדגוגית — סמני מה לשפר:
                  </p>
                  {loadingSuggestions ? (
                    <SuggestionsLoader />
                  ) : suggestionsError ? (
                    <div className="py-3 space-y-2 text-center">
                      <p className="text-xs text-red-500">לא הצלחתי לטעון הצעות. נסי שוב.</p>
                      <button
                        onClick={() => { setSuggestionsError(false); suggestionsMutation.mutate({ textId: improveModal!.textId, component: improveModal!.component.key }) }}
                        className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-300 font-medium"
                      >
                        🔄 נסי שוב
                      </button>
                    </div>
                  ) : suggestions.length === 0 ? (
                    <div className="py-3 space-y-2 text-center">
                      <p className="text-xs text-gray-400">לא התקבלו הצעות.</p>
                      <button
                        onClick={() => suggestionsMutation.mutate({ textId: improveModal!.textId, component: improveModal!.component.key })}
                        className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-300 font-medium"
                      >
                        🔄 טעני הצעות
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {suggestions.map((s, i) => (
                        <label
                          key={i}
                          className={`flex items-start gap-3 cursor-pointer p-3.5 rounded-xl border-2 transition-colors ${
                            selectedSuggestions.has(i)
                              ? `${colors.border} ${colors.bg}`
                              : 'border-gray-200 hover:border-gray-300 bg-white'
                          }`}
                        >
                          <div className="flex-shrink-0 flex flex-col items-center gap-1 mt-0.5">
                            <input
                              type="checkbox"
                              checked={selectedSuggestions.has(i)}
                              onChange={() => toggleSuggestion(i)}
                              className="accent-purple-600"
                            />
                            <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${
                              selectedSuggestions.has(i) ? colors.badge : 'bg-gray-100 text-gray-500'
                            }`}>{i + 1}</span>
                          </div>
                          <span className="text-sm leading-6 text-gray-800 whitespace-pre-wrap">{s}</span>
                        </label>
                      ))}
                      {suggestions.length > 0 && (
                        <p className="text-xs text-gray-400 text-center pt-1">
                          {selectedSuggestions.size === 0 ? 'סמני את ההצעות הרצויות ולחצי "שפרי"' : `${selectedSuggestions.size} הצעות נבחרו`}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Layer-specific instruction */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide">
                    הנחיה ספציפית לרכיב {comp.label} (אופציונלי)
                  </label>
                  <textarea
                    value={layerInstruction}
                    onChange={e => setLayerInstruction(e.target.value)}
                    rows={2}
                    placeholder={`לדוגמה: בשכבת ${comp.label} — חזקי את...`}
                    className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right resize-none focus:outline-none focus:ring-2 ${colors.ring} bg-gray-50`}
                  />
                </div>

              </div>

              {/* Footer */}
              <div className="flex gap-3 justify-end p-4 border-t bg-gray-50 rounded-b-2xl">
                <Button variant="secondary" onClick={() => setImproveModal(null)}>ביטול</Button>
                <Button
                  loading={!!improvingText}
                  disabled={loadingSuggestions}
                  onClick={() => improveMutation.mutate({
                    textId: improveModal.textId,
                    component: comp.key,
                    instruction: composeInstruction(),
                  })}
                >
                  <Sparkles size={14} /> שפרי טקסט
                </Button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
