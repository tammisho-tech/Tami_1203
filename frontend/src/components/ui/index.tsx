import React from 'react'
import { Loader2 } from 'lucide-react'

// ─── Button ───────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  loading?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  loading,
  size = 'md',
  children,
  className = '',
  disabled,
  style,
  ...props
}) => {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs rounded-lg',
    md: 'px-5 py-2.5 text-sm rounded-xl',
    lg: 'px-6 py-3 text-base rounded-xl',
  }

  const base = `inline-flex items-center gap-2 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses[size]}`

  if (variant === 'primary') {
    return (
      <button
        {...props}
        disabled={disabled || loading}
        className={`${base} text-white ${className}`}
        style={{
          background: 'linear-gradient(135deg, #16a34a, #15803d)',
          boxShadow: '0 2px 8px rgba(22,163,74,0.25)',
          ...style,
        }}
        onMouseEnter={e => {
          if (!disabled && !loading) {
            const el = e.currentTarget
            el.style.background = 'linear-gradient(135deg, #15803d, #166534)'
            el.style.boxShadow = '0 4px 14px rgba(21,128,61,0.4)'
            el.style.transform = 'translateY(-1px)'
          }
        }}
        onMouseLeave={e => {
          const el = e.currentTarget
          el.style.background = 'linear-gradient(135deg, #16a34a, #15803d)'
          el.style.boxShadow = '0 2px 8px rgba(22,163,74,0.25)'
          el.style.transform = ''
        }}
      >
        {loading && <Loader2 size={15} className="animate-spin" />}
        {children}
      </button>
    )
  }

  const variants = {
    secondary: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-sm',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
    ghost: 'text-gray-600 hover:bg-gray-100',
  }

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`${base} ${variants[variant as keyof typeof variants]} ${className}`}
      style={style}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 ${className}`}>
    {children}
  </div>
)

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeColor = 'blue' | 'green' | 'yellow' | 'red' | 'pink' | 'gray' | 'purple' | 'teal'

export const Badge: React.FC<{ children: React.ReactNode; color?: BadgeColor; className?: string }> = ({
  children,
  color = 'blue',
  className = '',
}) => {
  const colors: Record<BadgeColor, string> = {
    blue: 'bg-blue-100 text-blue-800',
    green: 'bg-green-100 text-green-800',
    yellow: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800',
    pink: 'bg-pink-100 text-pink-800',
    gray: 'bg-gray-100 text-gray-600',
    purple: 'bg-purple-100 text-purple-800',
    teal: 'bg-teal-100 text-teal-800',
  }
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[color]} ${className}`}>
      {children}
    </span>
  )
}

// ─── DimensionBadge ───────────────────────────────────────────────────────────
export const DimensionBadge: React.FC<{ dim: string }> = ({ dim }) => {
  const map: Record<string, { label: string; className: string }> = {
    A: { label: 'איתור מידע', className: 'bg-blue-100 text-blue-800' },
    B: { label: 'הסקת מסקנות', className: 'bg-green-100 text-green-800' },
    C: { label: 'פירוש', className: 'bg-amber-100 text-amber-800' },
    D: { label: 'הערכה ביקורתית', className: 'bg-pink-100 text-pink-800' },
    BC: { label: 'הבנה ופרשנות', className: 'bg-teal-100 text-teal-800' },
    LANG: { label: 'לשון', className: 'bg-orange-100 text-orange-800' },
  }
  const info = map[dim] || { label: `ממד ${dim}`, className: 'bg-gray-100 text-gray-700' }
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${info.className}`}>
      {info.label}
    </span>
  )
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export const Spinner: React.FC<{ size?: number; text?: string }> = ({ size = 28, text }) => (
  <div className="flex flex-col items-center gap-3 py-10 text-gray-400">
    <Loader2 size={size} className="animate-spin" style={{ color: '#16a34a' }} />
    {text && <span className="text-sm font-medium text-gray-500">{text}</span>}
  </div>
)

// ─── Modal ────────────────────────────────────────────────────────────────────
export const Modal: React.FC<{
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}> = ({ open, onClose, title, children, className = '' }) => {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto ${className || 'w-full max-w-lg'}`}>
        {title && (
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-bold text-gray-800">{title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">&times;</button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────
export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, { label: string; color: BadgeColor }> = {
    DRAFT: { label: 'טיוטה', color: 'gray' },
    THEME_PENDING: { label: 'ממתין לאישור תמה', color: 'purple' },
    TEXTS_READY: { label: 'טקסטים מוכנים', color: 'blue' },
    QUESTIONS_READY: { label: 'שאלות מוכנות', color: 'teal' },
    QA_DONE: { label: 'בקרה הושלמה', color: 'yellow' },
    PUBLISHED: { label: 'פורסם', color: 'green' },
    CLOSED: { label: 'נסגר', color: 'red' },
  }
  const info = map[status] || { label: status, color: 'gray' as BadgeColor }
  return <Badge color={info.color}>{info.label}</Badge>
}

// ─── Alert ────────────────────────────────────────────────────────────────────
export const Alert: React.FC<{
  type?: 'error' | 'warning' | 'success' | 'info'
  children: React.ReactNode
}> = ({ type = 'info', children }) => {
  const styles = {
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    success: 'bg-green-50 border-green-200 text-green-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }
  return (
    <div className={`border rounded-xl p-4 text-sm font-medium ${styles[type]}`}>
      {children}
    </div>
  )
}

// ─── WorkflowSteps ────────────────────────────────────────────────────────────
// 5-step workflow stepper shown at the top of every teacher page
const WORKFLOW_STEPS = [
  { num: 1, label: 'פתיחה' },
  { num: 2, label: 'תכנון' },
  { num: 3, label: 'טקסטים' },
  { num: 4, label: 'שאלות' },
  { num: 5, label: 'עיצוב ופרסום' },
]

export const WorkflowSteps: React.FC<{ current: 1 | 2 | 3 | 4 | 5 }> = ({ current }) => (
  <div className="flex items-center gap-1 text-xs flex-wrap mb-1">
    {WORKFLOW_STEPS.map((step, i) => {
      const done = step.num < current
      const active = step.num === current
      return (
        <React.Fragment key={step.num}>
          {i > 0 && <div className={`h-px w-4 ${done ? 'bg-green-400' : active ? 'bg-green-300' : 'bg-gray-200'}`} />}
          <span className={`px-2.5 py-1 rounded-full font-semibold ${
            done   ? 'bg-green-600 text-white' :
            active ? 'bg-green-600 text-white' :
                     'bg-gray-100 text-gray-400'
          }`}>
            {done ? `✓ ${step.label}` : `${step.num} ${step.label}`}
          </span>
        </React.Fragment>
      )
    })}
  </div>
)

// ─── PageHeader ───────────────────────────────────────────────────────────────
// Consistent RAMA-branded page header bar (used by inner pages)
export const PageHeader: React.FC<{
  title: string
  subtitle?: string
  grade?: string
  timing?: string
  teacher?: string
  actions?: React.ReactNode
}> = ({ title, subtitle, grade, timing, teacher, actions }) => (
  <div
    className="rounded-2xl text-white p-5 mb-6 flex items-center justify-between gap-4"
    style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' }}
  >
    <div className="space-y-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-xl font-bold truncate">{title}</h1>
        {grade && (
          <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
            כיתה {grade}׳
          </span>
        )}
        {timing && (
          <span className="bg-white/15 text-white/80 text-xs px-2 py-0.5 rounded-full">
            {timing}
          </span>
        )}
      </div>
      {teacher && <p className="text-green-200 text-lg font-semibold">מורה: {teacher}</p>}
      {subtitle && <p className="text-green-200 text-sm">{subtitle}</p>}
    </div>
    {actions && <div className="flex-shrink-0">{actions}</div>}
  </div>
)
