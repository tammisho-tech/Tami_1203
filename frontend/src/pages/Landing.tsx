import { useNavigate } from 'react-router-dom'
import { BookOpen, Plus, Library } from 'lucide-react'

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(160deg, #E8F4FD 0%, #EEF2FF 50%, #F0F7FF 100%)' }}>

      {/* Logo + title */}
      <div className="mb-10 text-center">
        <img
          src="/rama-logo.png"
          alt="ראמ״ה"
          className="h-14 object-contain mx-auto mb-5"
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"
          style={{ background: 'linear-gradient(135deg, #1565C0, #2D3EA0)' }}
        >
          <BookOpen size={32} className="text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-800">מחולל מבחני הבנת הנקרא</h1>
        <p className="text-gray-500 text-sm mt-2">סטנדרט ראמ״ה | ד״ר תמי סבג שושן</p>
      </div>

      {/* 2 main buttons */}
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button
          onClick={() => navigate('/teacher/new-exam')}
          className="flex items-center justify-center gap-3 text-white text-lg font-bold px-8 py-4 rounded-2xl shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5"
          style={{ background: 'linear-gradient(135deg, #1565C0, #2D3EA0)' }}
        >
          <Plus size={22} />
          מבחן חדש
        </button>

        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center justify-center gap-3 text-blue-800 text-lg font-bold px-8 py-4 rounded-2xl border-2 border-blue-200 bg-white shadow hover:bg-blue-50 transition-all hover:-translate-y-0.5"
        >
          <Library size={22} />
          ספריית מבחנים
        </button>
      </div>

      <p className="mt-10 text-xs text-gray-400">© ד״ר תמי סבג שושן | מבוסס על מבחני ראמ״ה</p>
    </div>
  )
}
