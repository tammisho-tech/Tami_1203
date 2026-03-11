export type GradeCluster = '3-4' | '5-6' | '7-9'
export type ExamStatus = 'DRAFT' | 'THEME_PENDING' | 'TEXTS_READY' | 'QUESTIONS_READY' | 'QA_DONE' | 'PUBLISHED' | 'CLOSED'
export type TextType = 'narrative' | 'informational'
export type Dimension = 'A' | 'B' | 'C' | 'D'
export type QuestionFormat = 'MC' | 'OPEN' | 'TABLE' | 'FILL' | 'COMIC' | 'SEQUENCE' | 'TRUE_FALSE' | 'VOCAB'
export type SessionStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED'
export type ChatRole = 'TEACHER' | 'AGENT'

export interface Exam {
  id: string
  title: string
  grade_cluster: GradeCluster
  topic_values: {
    topic: string
    values: string
    specific_topic: string
    text_continuity?: string
    non_continuous_type?: string
    sidebar_types?: string[]
    teacher_name?: string
    exam_timing?: string
    grade?: string
  }
  status: ExamStatus
  access_code: string | null
  created_at: string
  text_titles?: { narrative?: string; informational?: string }
  texts?: ExamText[]
  questions?: Question[]
  spec_entries?: SpecEntry[]
}

export interface ExamText {
  id: string
  exam_id: string
  text_type: TextType
  title: string
  content: string
  word_count: number
  anchor_map: Record<string, string[]>
  version: number
}

export interface QuestionContent {
  stem: string
  options: string[] | null
  correct_answer: string
  distractor_rationale: Record<string, string>
  // TABLE
  table_headers?: string[]
  table_rows?: string[][]
  // SEQUENCE
  items?: string[]
  correct_order?: number[]
  // TRUE_FALSE
  statements?: { text: string; correct: boolean }[]
  // VOCAB
  word?: string
  context_sentence?: string
}

export interface Rubric {
  max_score: number
  criteria: string[]
  partial_credit: string
  sample_answer: string
  answer_lines: number
}

export interface Question {
  id: string
  exam_id: string
  text_id: string
  sequence_number: number
  dimension: Dimension
  format: QuestionFormat
  content: QuestionContent
  rubric: Rubric
  score_points: number
  is_cross_text: boolean
  is_approved: boolean
}

export interface SpecEntry {
  id: string
  question_id: string
  dimension: string
  format: string
  score: number
  text_reference: string
  anchor_sentence: string
  text_type: string
}

export interface ValidationIssue {
  rule: string
  description: string
  severity: 'error' | 'warning'
  question_sequence: number | null
}

export interface ValidationReport {
  passed: boolean
  issues: ValidationIssue[]
  suggestions: string[]
}

export interface LanguageEditChange {
  type: string
  original: string
  corrected: string
  explanation: string
}

export interface LanguageEditResult {
  text_id: string
  title: string
  text_type: string
  changes: LanguageEditChange[]
  change_count: number
  summary: string
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  timestamp: string
  action_taken: Record<string, unknown> | null
}

export interface StudentSession {
  id: string
  exam_id: string
  student_name: string
  student_id: string
  class_name: string
  status: SessionStatus
  started_at: string
  submitted_at: string | null
}

export interface StudentAnswer {
  question_id: string
  raw_answer: string
  score_awarded: number | null
  score_max: number | null
  grading_notes: string
  teacher_approved: boolean
}

export interface StudentProfile {
  level: 1 | 2 | 3 | 4
  label: string
  percentage: number
  description: string
  strengths: Dimension[]
  weaknesses: Dimension[]
  dim_percentages: Record<Dimension, number>
  recommendation: string
}

export interface ClassAnalytics {
  total_students: number
  average: number
  std_deviation: number
  median: number
  level_distribution: Record<string, number>
  dimension_averages: Record<Dimension, number>
}

export interface ItemAnalysis {
  total_students: number
  items: {
    question_id: string
    sequence_number: number
    dimension: Dimension
    format: QuestionFormat
    stem_preview: string
    correct_rate: number
    is_red: boolean
    total_answered: number
    distractor_analysis: Record<string, { count: number; pct: number }>
  }[]
  red_questions: ItemAnalysis['items']
}

export interface StudentListItem {
  session_id: string
  student_name: string
  student_id: string
  class_name: string
  total_score: number
  max_score: number
  percentage: number
  level: number | null
  label: string | null
  recommendation: string | null
  submitted_at: string | null
}
