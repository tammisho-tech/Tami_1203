import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { studentsApi } from '../../api/students'
import { Card, Button, Alert } from '../../components/ui'
import { BookOpen } from 'lucide-react'

export default function ExamLobby() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [className, setClassName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code || !name) return
    setLoading(true)
    setError(null)
    try {
      const session = await studentsApi.startSession({
        access_code: code,
        student_name: name,
        student_id: studentId || name,
        class_name: className,
      })
      navigate(`/student/exam/${session.id}`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'קוד המבחן לא נמצא. בדקי את הקוד ונסי שוב.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-green-50 px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center">
          <div className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <BookOpen size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold">מבחן הבנת הנקרא</h1>
          <p className="text-gray-500 text-sm mt-1">הכנס את קוד המבחן שקיבלת מהמורה</p>
        </div>

        <Card>
          <form onSubmit={handleStart} className="space-y-4">
            <div>
              <label className="label">קוד המבחן *</label>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="לדוגמה: AB3X7K"
                className="input-field text-center text-2xl font-mono tracking-widest uppercase"
                maxLength={6}
                required
              />
            </div>
            <div>
              <label className="label">שם מלא *</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="שם פרטי ושם משפחה"
                className="input-field"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">מספר תלמיד/ה</label>
                <input
                  value={studentId}
                  onChange={e => setStudentId(e.target.value)}
                  placeholder="מספר ת.ז. / ת.ז."
                  className="input-field"
                />
              </div>
              <div>
                <label className="label">כיתה</label>
                <input
                  value={className}
                  onChange={e => setClassName(e.target.value)}
                  placeholder="לדוגמה: ה'2"
                  className="input-field"
                />
              </div>
            </div>

            {error && <Alert type="error">{error}</Alert>}

            <Button type="submit" loading={loading} className="w-full justify-center">
              התחל מבחן
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
