import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

const rootEl = document.getElementById('root')
if (!rootEl) {
  document.body.innerHTML = '<div dir="rtl" style="padding:2rem;font-family:Rubik;text-align:center"><h1>שגיאה</h1><p>לא נמצא אלמנט root. נסי לרענן את הדף.</p></div>'
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>
  )
}
