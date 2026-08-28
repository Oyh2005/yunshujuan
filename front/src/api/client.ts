import axios from 'axios'
import { toast } from 'sonner'
import i18n from '../i18n'

const JWT_KEY = 'jwt_token'

const client = axios.create({
  baseURL: '',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem(JWT_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(JWT_KEY)
      window.location.href = '/login'
    } else if (error.response?.status === 429) {
      // 限流：直接告知用户原因，避免误以为是网络/加载故障
      toast.error(i18n.t('common.rateLimited'))
    }
    return Promise.reject(error)
  }
)

export default client
