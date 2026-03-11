import React, { Component, ErrorInfo, ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

import Landing from './pages/Landing'

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError = () => ({ hasError: true })
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('App error:', err, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-8" lang="he">
          <h1 className="text-xl font-bold text-red-600 mb-4">שגיאה בטעינת האפליקציה</h1>
          <p className="text-gray-600 mb-4">נסי לרענן את הדף (F5) או לפתוח בחלון פרטי.</p>
          <a href="/" className="text-blue-600 underline">חזרה לדף הבית</a>
        </div>
      )
    }
    return this.props.children
  }
}
import Home from './pages/Home'
import NewExam from './pages/teacher/NewExam'
import ReviewPlan from './pages/teacher/ReviewPlan'
import ReviewTexts from './pages/teacher/ReviewTexts'
import ReviewQuestions from './pages/teacher/ReviewQuestions'
import LinguisticEdit from './pages/teacher/LinguisticEdit'
import QARefinement from './pages/teacher/QARefinement'
import ExamDesign from './pages/teacher/ExamDesign'
import ExamReady from './pages/teacher/ExamReady'
import ExamLobby from './pages/student/ExamLobby'
import TakeExam from './pages/student/TakeExam'
import ExamComplete from './pages/student/ExamComplete'
import ClassDashboard from './pages/analytics/ClassDashboard'

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <div dir="rtl" lang="he" className="min-h-screen bg-slate-50">
        <Routes>
          {/* Landing / Cover page */}
          <Route path="/" element={<Landing />} />

          {/* Dashboard */}
          <Route path="/dashboard" element={<Home />} />

          {/* Teacher — exam workflow */}
          <Route path="/teacher/new-exam" element={<NewExam />} />
          <Route path="/teacher/exam/:examId/plan" element={<ReviewPlan />} />
          <Route path="/teacher/exam/:examId/texts" element={<ReviewTexts />} />
          <Route path="/teacher/exam/:examId/language-edit" element={<LinguisticEdit />} />
          <Route path="/teacher/exam/:examId/questions" element={<ReviewQuestions />} />
          <Route path="/teacher/exam/:examId/qa" element={<QARefinement />} />
          <Route path="/teacher/exam/:examId/design" element={<ExamDesign />} />
          <Route path="/teacher/exam/:examId/ready" element={<ExamReady />} />
          <Route path="/teacher/exam/:examId/analytics" element={<ClassDashboard />} />

          {/* Student */}
          <Route path="/student" element={<ExamLobby />} />
          <Route path="/student/exam/:sessionId" element={<TakeExam />} />
          <Route path="/student/results/:sessionId" element={<ExamComplete />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
