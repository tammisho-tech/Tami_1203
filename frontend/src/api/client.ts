import axios from 'axios'

// When deployed separately: VITE_API_URL = backend public URL (e.g. https://xxx.railway.app/api)
// When same-origin: use relative /api
const baseURL = import.meta.env.VITE_API_URL || '/api'

const client = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
})

// Extract Hebrew error detail from FastAPI responses
client.interceptors.response.use(
  r => r,
  err => {
    const detail = err.response?.data?.detail
    if (detail) err.message = typeof detail === 'string' ? detail : JSON.stringify(detail)
    return Promise.reject(err)
  }
)

export default client
