/* Isolated AI-page UI checks. Every application API, including writes, is intercepted. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const base = process.env.UI_BASE_URL || 'http://localhost:4173'
const output = path.resolve(__dirname, '../../.codex-checks/ai-pages')
const now = Date.now()
const sessions = Array.from({ length: 10 }, (_, index) => ({
  id: 'ai-session-' + index,
  title: ['RAG 学习路线', '产品需求梳理', '周末阅读总结', '大模型评估指标', '前端组件设计建议', '英语学习计划'][index % 6] + (index > 5 ? ' ' + (index + 1) : ''),
  created_at: new Date(now - index * 86400000).toISOString(),
  updated_at: new Date(now - index * 86400000).toISOString(),
}))

async function run() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1536, height: 1080 }, locale: 'zh-CN', reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  const errors = []
  const unexpected = []
  const writes = []

  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && /ErrorBoundary|TypeError|ReferenceError|An error occurred in/.test(message.text())) errors.push(message.text())
  })

  await context.addInitScript(() => {
    const user = { id: 'ai-test-user', username: '小林', email: 'preview@example.invalid', avatar: null }
    localStorage.setItem('user-store', JSON.stringify({ state: { userInfo: user, token: 'isolated-test', isLogin: true }, version: 0 }))
    localStorage.setItem('jwt_token', 'isolated-test')
    localStorage.setItem('theme', JSON.stringify({ state: { theme: 'light' }, version: 0 }))
    localStorage.setItem('pet.config', JSON.stringify({ visible: true, nickname: '小卷', affection: 65, characterId: 'cloud', offsetX: 24, offsetY: 24 }))
    localStorage.setItem('pet.greeted', '1')
    sessionStorage.removeItem('lastSessionId')
  })

  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort()
    if (request.isNavigationRequest()) return route.continue()
    if (!/^\/(chat\/|user\/|social\/)/.test(pathname)) return route.continue()
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status, message: 'fixture', data }) })
    if (pathname === '/user/settings/') return reply({ pet_config: null, habit_config: null })
    if (pathname === '/social/notifications/unread-count') return reply({ count: 0 })
    if (pathname === '/chat/sessions/ai-test-user') return reply({ sessions })
    if (/^\/chat\/session\/ai-session-\d+$/.test(pathname) && request.method() === 'GET') {
      return reply({ session_id: pathname.split('/').at(-1), history: [['什么是 RAG？', 'RAG 是将检索与生成结合起来的知识问答方法。']] })
    }
    if (/^\/chat\/session\/ai-session-\d+$/.test(pathname) && request.method() === 'DELETE') {
      writes.push('DELETE ' + pathname)
      return reply(null)
    }
    if (pathname === '/chat/agent/query/stream' && request.method() === 'POST') {
      writes.push('POST ' + pathname)
      const events = [
        { type: 'thinking', stage: 'retrieval', content: '正在检索相关笔记' },
        { type: 'thinking', stage: 'reorder', content: '正在筛选高相关内容' },
        { type: 'response', content: '我已经结合你的知识库整理好了回答。', session_id: 'ai-session-0' },
        { type: 'done', session_id: 'ai-session-0' },
      ]
      return route.fulfill({ contentType: 'text/event-stream', body: events.map((event) => 'data: ' + JSON.stringify(event) + '\n\n').join('') })
    }
    unexpected.push(request.method() + ' ' + pathname)
    return reply(null, 400)
  })

  const noOverflow = async () => {
    const dims = await page.locator('main').evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth, doc: document.documentElement.scrollWidth, viewport: innerWidth }))
    assert(dims.scroll <= dims.client + 1 && dims.doc <= dims.viewport + 1, JSON.stringify(dims))
    assert.equal(await page.getByText('页面出错了', { exact: true }).count(), 0)
    const pet = await page.locator('.pet-root').boundingBox()
    const viewport = page.viewportSize()
    assert(pet && pet.x >= 0 && pet.y >= 0 && pet.x + pet.width <= viewport.width && pet.y + pet.height <= viewport.height, JSON.stringify({ pet, viewport }))
  }

  try {
    await page.goto(base + '/chat')
    await page.getByRole('heading', { name: 'AI 助手', exact: true }).waitFor()
    await page.locator('.pet-root').waitFor()
    await page.locator('.ai-recent-item').first().waitFor()
    assert.equal(await page.locator('.ai-recent-item').count(), 6)
    assert.equal(await page.locator('.pet-root').count(), 1)
    await noOverflow()
    await page.screenshot({ path: path.join(output, 'chat-desktop.png'), fullPage: true, animations: 'disabled' })

    await page.getByRole('button', { name: '总结我的知识库', exact: true }).click()
    await page.getByText('我已经结合你的知识库整理好了回答。', { exact: true }).waitFor()
    assert(writes.includes('POST /chat/agent/query/stream'))
    assert.match(await page.locator('.ai-progress-card').innerText(), /检索相关知识/)
    assert.equal(await page.locator('.pet-root').count(), 1)

    await page.goto(base + '/sessions')
    await page.getByRole('heading', { name: '会话管理', exact: true }).waitFor()
    await page.locator('.ai-session-row').first().waitFor()
    assert.equal(await page.locator('.ai-session-row').count(), 8)
    assert.match(await page.locator('.ai-session-overview').innerText(), /10/)
    await page.getByPlaceholder('搜索会话标题…').fill('RAG')
    assert.equal(await page.locator('.ai-session-row').count(), 2)
    await page.getByPlaceholder('搜索会话标题…').fill('')
    await page.getByRole('button', { name: /^今天/ }).click()
    assert(await page.locator('.ai-session-row').count() >= 1)

    await page.getByRole('button', { name: '全部 10', exact: true }).click()
    await page.getByRole('button', { name: '删除会话', exact: true }).first().click()
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
    assert.equal(writes.some((entry) => entry.startsWith('DELETE')), false)
    await noOverflow()
    await page.screenshot({ path: path.join(output, 'sessions-desktop.png'), fullPage: true, animations: 'disabled' })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(base + '/chat')
    await page.getByRole('heading', { name: 'AI 助手', exact: true }).waitFor()
    await noOverflow()
    await page.screenshot({ path: path.join(output, 'chat-mobile.png'), fullPage: true, animations: 'disabled' })
    await page.goto(base + '/sessions')
    await page.getByRole('heading', { name: '会话管理', exact: true }).waitFor()
    await noOverflow()
    await page.screenshot({ path: path.join(output, 'sessions-mobile.png'), fullPage: true, animations: 'disabled' })

    await page.setViewportSize({ width: 1536, height: 1080 })
    await page.locator('html').evaluate((element) => element.classList.add('dark'))
    await noOverflow()
    await page.screenshot({ path: path.join(output, 'sessions-dark.png'), fullPage: true, animations: 'disabled' })

    assert.deepEqual(errors, [])
    assert.deepEqual(unexpected, [])
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ checks: 5, errors, unexpected, writes, isolatedFixtures: true }, null, 2))
    console.log('5 AI-page checks passed')
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {})
    console.error({ errors, unexpected })
    throw error
  } finally {
    await browser.close()
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
