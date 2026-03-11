import client from './client'

export const studentsApi = {
  getExamByCode: (code: string) =>
    client.get(`/students/exam-by-code/${code.toUpperCase()}`).then(r => r.data),

  startSession: (data: {
    access_code: string
    student_name: string
    student_id: string
    class_name?: string
  }) => client.post('/students/sessions/', data).then(r => r.data),

  getSession: (sessionId: string) =>
    client.get(`/students/sessions/${sessionId}`).then(r => r.data),

  getSessionExam: (sessionId: string) =>
    client.get(`/students/sessions/${sessionId}/exam`).then(r => r.data),

  saveAnswer: (sessionId: string, questionId: string, raw_answer: string) =>
    client.put(`/students/sessions/${sessionId}/answers/${questionId}`, { raw_answer }).then(r => r.data),

  submit: (sessionId: string) =>
    client.post(`/students/sessions/${sessionId}/submit`).then(r => r.data),

  getResults: (sessionId: string) =>
    client.get(`/students/sessions/${sessionId}/results`).then(r => r.data),

  saveFeedback: (sessionId: string, data: { satisfaction_rating?: number; feedback_text?: string }) =>
    client.put(`/students/sessions/${sessionId}/feedback`, data).then(r => r.data),
}
