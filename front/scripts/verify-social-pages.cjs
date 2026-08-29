/* Isolated social UI checks. Application APIs are mocked; unknown writes fail. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const base = process.env.UI_BASE_URL || 'http://localhost:3000'
const output = path.resolve(__dirname, '../../.codex-checks/social-pages')
const now = new Date().toISOString()

const people = {
  self: { user_id: 'social-test-user', username: '小林', avatar: null, bio: '记录学习，也分享思考' },
  lin: { user_id: 'friend-lin', username: '林知夏', avatar: null, bio: '产品设计 · 终身学习者' },
  zhou: { user_id: 'friend-zhou', username: '周望', avatar: null, bio: '关注 RAG 与知识管理' },
  su: { user_id: 'friend-su', username: '苏木', avatar: null, bio: '阅读、写作与研究' },
}

const posts = [
  {
    id: 101,
    user_id: people.lin.user_id,
    author: people.lin,
    content: '重新整理了产品设计笔记，发现把问题、证据和决策连接起来，复盘时会清晰很多。',
    images: [],
    note_id: 'note-product-thinking',
    note_title: '产品设计思维笔记',
    like_count: 18,
    liked_by_me: false,
    comment_count: 3,
    review_status: 'passed',
    created_at: now,
  },
  {
    id: 102,
    user_id: people.self.user_id,
    author: people.self,
    content: '今天把 RAG 的召回、重排序和上下文构建串成了一条完整流程，知识终于从零散变得可复用了。',
    images: [],
    note_id: null,
    note_title: null,
    like_count: 9,
    liked_by_me: true,
    comment_count: 1,
    review_status: 'passed',
    created_at: now,
  },
]

const requests = [
  { request_id: 'request-1', user_id: people.su.user_id, username: people.su.username, avatar: null, created_at: now },
]

const notifications = [
  { id: 'notification-1', type: 'friend_request', post_id: null, content: null, read: false, actor: people.su, created_at: now },
  { id: 'notification-2', type: 'like', post_id: 102, content: null, read: false, actor: people.lin, created_at: now },
  { id: 'notification-3', type: 'comment', post_id: 102, content: '这个整理方式很有启发！', read: true, actor: people.zhou, created_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 'notification-4', type: 'friend_accepted', post_id: null, content: null, read: true, actor: people.lin, created_at: new Date(Date.now() - 172800000).toISOString() },
]

async function run() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1536, height: 1080 }, locale: 'zh-CN', reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const errors = []
  const unexpected = []
  const writes = []

  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && /ErrorBoundary|TypeError|ReferenceError|An error occurred in/.test(message.text())) errors.push(message.text())
  })

  await context.addInitScript(() => {
    const user = { id: 'social-test-user', username: '小林', email: 'preview@example.invalid', avatar: null }
    localStorage.setItem('user-store', JSON.stringify({ state: { userInfo: user, token: 'isolated-test', isLogin: true }, version: 0 }))
    localStorage.setItem('jwt_token', 'isolated-test')
    localStorage.setItem('theme', JSON.stringify({ state: { theme: 'light' }, version: 0 }))
    localStorage.setItem('pet.config', JSON.stringify({ visible: true, nickname: '小卷', affection: 76, characterId: 'cloud', offsetX: 24, offsetY: 24 }))
    localStorage.setItem('pet.greeted', '1')
  })

  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort()
    if (request.isNavigationRequest()) return route.continue()
    if (!/^\/(social\/|user\/)/.test(pathname)) return route.continue()
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status, message: 'fixture', data }) })

    if (pathname === '/user/settings/') return reply({ pet_config: null, habit_config: null })
    if (pathname === '/social/notifications/unread-count') return reply({ count: notifications.filter((item) => !item.read).length })
    if (pathname === '/social/posts/feed') return reply({ posts, next_cursor: null })
    if (pathname === '/social/friends/list') return reply([people.lin, people.zhou])
    if (pathname === '/social/friends/requests') return reply(requests)
    if (pathname === '/social/users/search') return reply([people.su])
    if (pathname === '/social/notifications' && request.method() === 'GET') return reply(notifications)
    if (/^\/social\/posts\/\d+\/like$/.test(pathname) && request.method() === 'POST') { writes.push('POST ' + pathname); return reply({ liked: true }) }
    if (pathname === '/social/friends/request' && request.method() === 'POST') { writes.push('POST ' + pathname); return reply(null) }
    if (pathname === '/social/friends/respond' && request.method() === 'POST') { writes.push('POST ' + pathname); return reply(null) }
    if (pathname === '/social/notifications/read' && request.method() === 'POST') { writes.push('POST ' + pathname); return reply(null) }
    if (request.method() !== 'GET') { unexpected.push(request.method() + ' ' + pathname); return reply(null, 400) }
    return reply(null)
  })

  const assertHealthy = async () => {
    assert.equal(await page.getByText('页面出错了', { exact: true }).count(), 0)
    const dims = await page.locator('main.app-workspace').evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth, doc: document.documentElement.scrollWidth, viewport: innerWidth }))
    assert(dims.scroll <= dims.client + 1 && dims.doc <= dims.viewport + 1, JSON.stringify(dims))
    const sidebarWidth = await page.locator('.app-sidebar').evaluate((element) => Math.round(element.getBoundingClientRect().width))
    assert.equal(sidebarWidth, page.viewportSize().width <= 700 ? 56 : 206)
    assert.equal(await page.locator('.social-pet-card').count(), 1)
  }

  try {
    await page.goto(base + '/social')
    await page.getByRole('heading', { name: '知识动态', exact: true }).waitFor()
    assert.equal(await page.locator('.social-post').count(), 2)
    await page.locator('.social-post-action').first().click()
    await assertHealthy()
    await page.screenshot({ path: path.join(output, 'feed-desktop.png'), fullPage: true, animations: 'disabled' })

    await page.goto(base + '/friends')
    await page.getByRole('heading', { name: '我的好友', exact: true }).first().waitFor()
    assert.equal(await page.locator('.social-friend-card').count(), 2)
    assert.equal(await page.locator('.social-request-row').count(), 1)
    const searchInput = page.locator('.social-search-field input')
    await searchInput.fill('苏木')
    await searchInput.press('Enter')
    await page.getByRole('button', { name: /添加|加好友/ }).waitFor()
    await page.getByRole('button', { name: /添加|加好友/ }).click()
    await assertHealthy()
    await page.screenshot({ path: path.join(output, 'friends-desktop.png'), fullPage: true, animations: 'disabled' })

    await page.goto(base + '/notifications')
    await page.getByRole('heading', { name: '通知中心', exact: true }).waitFor()
    assert.equal(await page.locator('.social-notification-row').count(), notifications.length)
    await page.getByRole('button', { name: /全部已读/ }).click()
    await assertHealthy()
    await page.screenshot({ path: path.join(output, 'notifications-desktop.png'), fullPage: true, animations: 'disabled' })

    await page.setViewportSize({ width: 390, height: 844 })
    for (const pageName of ['social', 'friends', 'notifications']) {
      await page.goto(base + '/' + pageName)
      await page.locator('.social-page').waitFor()
      await assertHealthy()
      await page.screenshot({ path: path.join(output, pageName + '-mobile.png'), fullPage: true, animations: 'disabled' })
    }

    await page.setViewportSize({ width: 1536, height: 1080 })
    await page.goto(base + '/social')
    await page.getByRole('heading', { name: '知识动态', exact: true }).waitFor()
    await page.locator('html').evaluate((element) => element.classList.add('dark'))
    await assertHealthy()
    await page.screenshot({ path: path.join(output, 'feed-dark.png'), fullPage: true, animations: 'disabled' })

    assert.deepEqual(errors, [])
    assert.deepEqual(unexpected, [])
    assert(writes.includes('POST /social/posts/101/like'))
    assert(writes.includes('POST /social/friends/request'))
    assert(writes.includes('POST /social/notifications/read'))
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ checks: 7, errors, unexpected, writes, isolatedFixtures: true }, null, 2))
    console.log('7 social-page checks passed')
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {})
    console.error({ errors, unexpected })
    throw error
  } finally {
    await browser.close()
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
