import axios from 'axios'

const client = axios.create({
  baseURL: '/api',
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
