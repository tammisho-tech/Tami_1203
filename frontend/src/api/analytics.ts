import client from './client'
import type { ClassAnalytics, ItemAnalysis, StudentListItem } from '../types'

export const analyticsApi = {
  classStats: (examId: string) =>
    client.get<ClassAnalytics>(`/analytics/${examId}/class`).then(r => r.data),

  itemAnalysis: (examId: string) =>
    client.get<ItemAnalysis>(`/analytics/${examId}/items`).then(r => r.data),

  allStudents: (examId: string) =>
    client.get<{ students: StudentListItem[]; total: number }>(`/analytics/${examId}/students`).then(r => r.data),

  studentProfile: (examId: string, sessionId: string) =>
    client.get(`/analytics/${examId}/students/${sessionId}`).then(r => r.data),

  gradingQueue: (examId: string) =>
    client.get(`/analytics/${examId}/grading-queue`).then(r => r.data),

  approveGrade: (examId: string, answerId: string, overrideScore?: number) =>
    client.post(`/analytics/${examId}/approve-grade/${answerId}`, {
      override_score: overrideScore ?? null,
    }).then(r => r.data),
}
