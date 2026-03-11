import React, { useState, useRef, useEffect } from 'react'
import type { ChatMessage } from '../../types'
import { Button, Spinner } from '../ui'
import { Send } from 'lucide-react'

interface RefinementChatProps {
  messages: ChatMessage[]
  onSend: (message: string) => Promise<void>
  loading?: boolean
}

export const RefinementChat: React.FC<RefinementChatProps> = ({
  messages,
  onSend,
  loading = false,
}) => {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    await onSend(msg)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Message history */}
      <div className="flex-1 overflow-y-auto space-y-3 p-4 min-h-0">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 py-8 text-sm">
            <p>שאלי אותי כל שאלה על המבחן.</p>
            <p className="mt-1">לדוגמה: "הפכי את שאלה 5 לפורמט פתוח" או "שאלה 3 קשה מדי, פשטי אותה"</p>
          </div>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'TEACHER' ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                msg.role === 'TEACHER'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-gray-100 text-gray-800 rounded-bl-sm'
              }`}
            >
              <p>{msg.content}</p>
              {msg.action_taken && (
                <div className={`mt-1.5 text-xs ${msg.role === 'TEACHER' ? 'text-blue-200' : 'text-green-600'}`}>
                  ✓ פעולה בוצעה: {(msg.action_taken as Record<string, string>).type}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-end">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-3 flex gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="כתבי הוראה לשיפור המבחן..."
          rows={2}
          disabled={loading}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-right resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <Button onClick={handleSend} loading={loading} className="self-end">
          <Send size={16} />
        </Button>
      </div>
    </div>
  )
}
