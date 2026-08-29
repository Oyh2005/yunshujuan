import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

const BACKEND_TARGET = process.env.VITE_BACKEND_TARGET || 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [
    react(),
    // PWA：Service Worker + manifest（离线壳 + 可安装）。缓存策略与现有
    // HTTP ETag/304 体系协同——SW 只预缓存构建产物与 /media 静态文件，
    // API 请求一律不缓存（交给浏览器 HTTP 缓存，ETag 保证新鲜度）
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.png'],
      manifest: {
        name: '云舒卷 · RAG Notebook',
        short_name: '云舒卷',
        description: 'AI 驱动的个人知识管理平台：笔记、知识库、AI 对话、间隔回顾',
        lang: 'zh-CN',
        theme_color: '#7C5CFC',
        background_color: '#F7F5FF',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon.png', sizes: '1254x1254', type: 'image/png', purpose: 'any' },
          { src: '/icon.png', sizes: '1254x1254', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        // 页面导航离线时回退 SPA 壳；API/媒体等非导航请求不受 navigateFallback 影响，
        // 此清单仅防地址栏直达后端路径的导航被错误回退
        navigateFallbackDenylist: [/^\/media\//, /^\/telemetry\//, /^\/file\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // 头像/动态图片：CacheFirst + 1 天，与后端 Cache-Control 头策略一致
            urlPattern: /\/media\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'media-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 86400 },
            },
          },
        ],
      },
    }),
  ],
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
