import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const BACKEND_TARGET = process.env.VITE_BACKEND_TARGET || 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/chat/agent/': { target: BACKEND_TARGET, changeOrigin: true, ws: true },
      '/chat/rag/': { target: BACKEND_TARGET, changeOrigin: true },
      '/chat/session/': { target: BACKEND_TARGET, changeOrigin: true },
      '/chat/sessions': { target: BACKEND_TARGET, changeOrigin: true },
      '/chat/reorder': { target: BACKEND_TARGET, changeOrigin: true },
      '/knowledge/': { target: BACKEND_TARGET, changeOrigin: true },
      '/note/': { target: BACKEND_TARGET, changeOrigin: true },
      '/note-template/': { target: BACKEND_TARGET, changeOrigin: true },
      '/review/': { target: BACKEND_TARGET, changeOrigin: true },
      // ⚠️ 代理 key 必须是 API 子路径（正则），不能是 SPA 页面路径本身：
      // 例如 '/social' 会连页面路由 /social 一起代理到后端导致 404 白屏
      '^/stats/': { target: BACKEND_TARGET, changeOrigin: true },
      '^/public/': { target: BACKEND_TARGET, changeOrigin: true },
      '^/social/': { target: BACKEND_TARGET, changeOrigin: true },
      '^/user/(login|logout|register|detail|update|reset-password|refresh-token|settings)': { target: BACKEND_TARGET, changeOrigin: true },
      '/health': { target: BACKEND_TARGET, changeOrigin: true },
      '/file': { target: BACKEND_TARGET, changeOrigin: true },
      '/media': { target: BACKEND_TARGET, changeOrigin: true },
    },
  },
})
