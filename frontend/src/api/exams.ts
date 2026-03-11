import client from './client'
import type { Exam, ValidationReport, ChatMessage, LanguageEditResult } from '../types'

export const examsApi = {
  list: () => client.get<Exam[]>('/exams/').then(r => r.data),

  get: (id: string) => client.get<Exam>(`/exams/${id}`).then(r => r.data),

  create: (data: {
    title: string
    grade_cluster: string
    topic: string
    values: string
    specific_topic?: string
    prefer_narrative?: boolean
    prefer_informational?: boolean
    text_continuity?: string
    sidebar_types?: string[]
    teacher_name?: string
    exam_timing?: string
    grade?: string
  }) => client.post<Exam>('/exams/', data).then(r => r.data),

  delete: (id: string) =>
    client.delete(`/exams/${id}`).then(r => r.data),

  proposeTheme: (id: string) =>
    client.post<{ theme: string; rationale: string; blocked: boolean; blocked_reason: string }>(
      `/exams/${id}/propose-theme`
    ).then(r => r.data),

  approveTheme: (id: string, approved: boolean) =>
    client.post(`/exams/${id}/approve-theme`, { approved }).then(r => r.data),

  generateIdea: (id: string, target: 'both' | 'narrative' | 'informational' = 'both') =>
    client.post<{
      narrative?: { hero: string; conflict: string; logic: string; value: string; summary: string }
      informational?: { subject: string; aspects: string; message: string; summary: string }
    }>(`/exams/${id}/generate-idea`, { target }).then(r => r.data),

  generatePlan: (id: string) =>
    client.post<{
      theme: { theme: string; rationale: string; blocked: boolean; blocked_reason: string }
      idea: {
        narrative?: { hero: string; conflict: string; logic: string; value: string; summary: string }
        informational?: { subject: string; aspects: string; message: string; summary: string }
      }
      emotions: string[]
    }>(`/exams/${id}/generate-plan`).then(r => r.data),

  suggestEmotions: (id: string) =>
    client.post<{ emotions: string[] }>(`/exams/${id}/suggest-emotions`).then(r => r.data),

  suggestImprovements: (examId: string, text_id: string, component: string) =>
    client.post<{ suggestions: string[] }>(`/exams/${examId}/suggest-improvements`, { text_id, component }).then(r => r.data),

  improveText: (id: string, text_id: string, component: string, custom_instruction = '') =>
    client.post(`/exams/${id}/improve-text`, { text_id, component, custom_instruction }).then(r => r.data),

  generateTexts: (id: string, opts?: { text_continuity?: string; non_continuous_type?: string; emotions?: string[] }) =>
    client.post(`/exams/${id}/generate-texts`, opts || {}).then(r => r.data),

  regenerateText: (id: string, text_type: string, text_continuity?: string) =>
    client.post(`/exams/${id}/regenerate-text`, { text_type, text_continuity }).then(r => r.data),

  updateText: (examId: string, textId: string, data: { content: string; title?: string }) =>
    client.put(`/exams/${examId}/texts/${textId}`, data).then(r => r.data),

  generateQuestions: (id: string) =>
    client.post(`/exams/${id}/generate-questions`).then(r => r.data),

  updateQuestion: (examId: string, qId: string, data: Record<string, unknown>) =>
    client.put(`/exams/${examId}/questions/${qId}`, data).then(r => r.data),

  fixDistractors: (examId: string, qId: string, stem: string, correctAnswer: string) =>
    client.post<{ options: string[] }>(`/exams/${examId}/questions/${qId}/fix-distractors`, { stem, correct_answer: correctAnswer }).then(r => r.data),

  fixQuestion: (examId: string, qId: string, message: string) =>
    client.post<{ explanation: string; question: import('../types').Question }>(`/exams/${examId}/questions/${qId}/fix`, { message }).then(r => r.data),

  deleteQuestion: (examId: string, qId: string) =>
    client.delete(`/exams/${examId}/questions/${qId}`).then(r => r.data),

  validate: (id: string) =>
    client.post<ValidationReport>(`/exams/${id}/validate`).then(r => r.data),

  languageEdit: (id: string) =>
    client.post<{ edits: LanguageEditResult[] }>(`/exams/${id}/language-edit`).then(r => r.data),

  linguisticEditChat: (examId: string, textId: string, message: string) =>
    client.post<{ content: string; explanation: string }>(`/exams/${examId}/linguistic-edit-chat`, { text_id: textId, message }).then(r => r.data),

  ideaChat: (id: string, text_type: string, current_idea: object, message: string) =>
    client.post<{ idea: object }>(`/exams/${id}/idea-chat`, { text_type, current_idea, message }).then(r => r.data),

  chat: (id: string, message: string) =>
    client.post(`/exams/${id}/chat`, { message }).then(r => r.data),

  getChatHistory: (id: string) =>
    client.get<ChatMessage[]>(`/exams/${id}/chat-history`).then(r => r.data),

  publish: (id: string) =>
    client.post(`/exams/${id}/publish`).then(r => r.data),

  exportUrl: (id: string, booklet: string) =>
    `/api/exams/${id}/export/${booklet}`,
}
