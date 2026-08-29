/* Isolated learning-growth UI checks. Application APIs are mocked; unknown writes fail. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const base = process.env.UI_BASE_URL || 'http://localhost:3000'
const output = path.resolve(__dirname, '../../.codex-checks/learning-pages')
const reviews = [
  { review_id: 'r1', note_id: 'n1', title: 'RAG 检索增强学习笔记', content_preview: '重排序、召回与上下文构建的核心流程。', tags: ['RAG'], category: '学习', review_count: 2, last_reviewed_at: null, interval_days: 3 },
  { review_id: 'r2', note_id: 'n2', title: '产品设计思维笔记', content_preview: '从用户问题出发梳理设计决策。', tags: ['产品'], category: '工作', review_count: 1, last_reviewed_at: null, interval_days: 2 },
  { review_id: 'r3', note_id: 'n3', title: 'AI 在教育领域的应用趋势', content_preview: '个性化学习与反馈闭环。', tags: ['AI'], category: '学习', review_count: 3, last_reviewed_at: null, interval_days: 5 },
  { review_id: 'r4', note_id: 'n4', title: '用户研究方法与实践', content_preview: '访谈、观察和洞察归纳。', tags: ['研究'], category: '工作', review_count: 1, last_reviewed_at: null, interval_days: 2 },
]

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
    const user = { id: 'learning-test-user', username: '小林', email: 'preview@example.invalid', avatar: null }
    const today = new Date().toDateString()
    const yesterday = new Date(Date.now() - 86400000).toDateString()
    localStorage.setItem('user-store', JSON.stringify({ state: { userInfo: user, token: 'isolated-test', isLogin: true }, version: 0 }))
    localStorage.setItem('jwt_token', 'isolated-test')
    localStorage.setItem('theme', JSON.stringify({ state: { theme: 'light' }, version: 0 }))
    localStorage.setItem('pet.config', JSON.stringify({ visible: true, nickname: '小卷', affection: 65, characterId: 'cloud', offsetX: 24, offsetY: 24 }))
    localStorage.setItem('habit.config', JSON.stringify({ noteStreak: { lastDate: today, count: 6, best: 12 }, reviewStreak: { lastDate: yesterday, count: 4, best: 7 }, taskDate: today, tasksDone: ['note', 'review'] }))
    localStorage.setItem('pet.greeted', '1')
  })

  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort()
    if (request.isNavigationRequest()) return route.continue()
    if (!/^\/(review\/|user\/|social\/)/.test(pathname)) return route.continue()
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status, message: 'fixture', data }) })
    if (pathname === '/user/settings/') return reply({ pet_config: null, habit_config: null })
    if (pathname === '/social/notifications/unread-count') return reply({ count: 0 })
    if (pathname === '/review/today') return reply({ reviews, total_count: reviews.length })
    if (/^\/review\/question\/n\d+$/.test(pathname)) return reply({ question: '在 RAG 流程中，重排序的主要作用是什么？', choices: ['生成最终回答', '按相关性重新排列候选文档', '将文档写入向量数据库', '创建新的知识库'], answer: '按相关性重新排列候选文档' })
    if (/^\/review\/done\/n\d+$/.test(pathname) && request.method() === 'POST') { writes.push('POST ' + pathname); return reply(null) }
    if (request.method() !== 'GET') { unexpected.push(request.method() + ' ' + pathname); return reply(null, 400) }
    return reply(null)
  })

  const assertHealthy = async () => {
    assert.equal(await page.getByText('页面出错了', { exact: true }).count(), 0)
    const dims = await page.locator('main.app-workspace').evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth, doc: document.documentElement.scrollWidth, viewport: innerWidth }))
    assert(dims.scroll <= dims.client + 1 && dims.doc <= dims.viewport + 1, JSON.stringify(dims))
    const pet = await page.locator('.pet-root').boundingBox()
    const viewport = page.viewportSize()
    assert(pet && pet.x >= 0 && pet.y >= 0 && pet.x + pet.width <= viewport.width && pet.y + pet.height <= viewport.height, JSON.stringify({ pet, viewport }))
    const sidebarWidth = await page.locator('.app-sidebar').evaluate((element) => Math.round(element.getBoundingClientRect().width))
    assert.equal(sidebarWidth, viewport.width <= 700 ? 56 : 206)
  }

  try {
    await page.goto(base + '/review')
    await page.getByRole('heading', { name: '每日回顾', exact: true }).first().waitFor()
    await page.getByRole('button', { name: /生成回顾题目/ }).click()
    await page.getByRole('button', { name: /按相关性重新排列候选文档/ }).click()
    await page.getByText('回答正确！', { exact: true }).waitFor()
    await assertHealthy()
    await page.screenshot({ path: path.join(output, 'review-desktop.png'), fullPage: true, animations: 'disabled' })

    await page.goto(base + '/habit')
    await page.getByRole('heading', { name: '每日任务', exact: true }).first().waitFor()
    assert.match(await page.locator('.habit-tasks-card').innerText(), /2\/3|2 \/ 3/)
    assert.equal(await page.locator('.habit-task-row').count(), 3)
    await assertHealthy()
    await page.screenshot({ path: path.join(output, 'habit-desktop.png'), fullPage: true, animations: 'disabled' })

    await page.goto(base + '/pomodoro')
    await page.getByRole('heading', { name: '番茄专注', exact: true }).waitFor()
    await page.getByRole('button', { name: /开始/ }).click()
    await page.getByRole('button', { name: /暂停/ }).waitFor()
    await assertHealthy()
    await page.screenshot({ path: path.join(output, 'pomodoro-desktop.png'), fullPage: true, animations: 'disabled' })

    await page.setViewportSize({ width: 390, height: 844 })
    for (const pageName of ['review', 'habit', 'pomodoro']) {
      await page.goto(base + '/' + pageName)
      await page.locator('.learning-page').waitFor()
      await assertHealthy()
      await page.screenshot({ path: path.join(output, pageName + '-mobile.png'), fullPage: true, animations: 'disabled' })
    }

    await page.setViewportSize({ width: 1536, height: 1080 })
    await page.goto(base + '/habit')
    await page.locator('html').evaluate((element) => element.classList.add('dark'))
    await assertHealthy()
    await page.screenshot({ path: path.join(output, 'habit-dark.png'), fullPage: true, animations: 'disabled' })

    assert.deepEqual(errors, [])
    assert.deepEqual(unexpected, [])
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ checks: 7, errors, unexpected, writes, isolatedFixtures: true }, null, 2))
    console.log('7 learning-page checks passed')
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {})
    console.error({ errors, unexpected })
    throw error
  } finally {
    await browser.close()
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
