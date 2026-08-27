const axios = require('axios')

async function main() {
  // 模拟 client.ts：默认 Content-Type: application/json
  const client = axios.create({
    baseURL: 'http://localhost:8012',
    headers: { 'Content-Type': 'application/json' },
  })

  // 1. 登录
  const login = await client.post('/user/login/', { username: 'admin', password: 'admin1234' })
  const token = login.data.token
  client.defaults.headers.common.Authorization = `Bearer ${token}`

  // 2. 模拟当前 uploadAvatar（不带 multipart 头）
  const fd = new FormData()
  fd.append('file', new Blob(['fake-png'], { type: 'image/png' }), 'avatar.png')
  try {
    const res = await client.post('/file/upload/', fd)
    console.log('复现-无multipart头: 成功?', res.status, JSON.stringify(res.data).slice(0, 80))
  } catch (e) {
    console.log('复现-无multipart头:', e.response?.status, JSON.stringify(e.response?.data).slice(0, 100))
  }

  // 3. 带 multipart/form-data 头
  try {
    const res = await client.post('/file/upload/', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    console.log('修复-带multipart头:', res.status, JSON.stringify(res.data).slice(0, 100))
  } catch (e) {
    console.log('修复-带multipart头 失败:', e.response?.status, JSON.stringify(e.response?.data).slice(0, 100))
  }
}
main()
