/* Isolated UI regression checks. All app API calls are mocked; no real notes are modified.
 * Start the frontend, then run with PLAYWRIGHT_MODULE pointing to an installed playwright package.
 * UI_BASE_URL and BROWSER_EXECUTABLE can override the local server and browser.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.UI_BASE_URL || 'http://localhost:3000'
const output = path.resolve(__dirname, '../../.codex-checks/lilac-ui')
const fixtures = [
  ['RAG 学习笔记', '梳理检索增强生成的核心流程，记录分块、向量检索与重排序的实践。', 'project', ['RAG', '知识库']],
  ['大模型学习路线', '从基础概念到应用实践，整理这一阶段的学习重点。', 'study', ['学习计划']],
  ['产品设计复盘', '记录本周的设计讨论，整理交互细节与下一步优化方向。', 'work', ['设计', '复盘']],
  ['周末阅读清单', '留一点时间给阅读，把喜欢的句子和新的想法记下来。', 'life', ['阅读']],
  ['前端组件整理', '统一按钮、卡片与导航样式，让页面保持清晰一致的视觉节奏。', 'project', ['前端', '组件']],
  ['英语学习计划', '积累常用表达，记录每天的练习与复习内容。', 'study', ['每日学习']],
].map(([title, content, category, tags], index) => ({
  id: 'preview-' + index, user_id: 'ui-preview', title, content, category, tags,
  is_pinned: index < 2, is_public: false, view_count: 0,
  created_at: '2026-08-' + (20 - index) + 'T08:00:00', updated_at: '2026-08-' + (27 - index) + 'T09:00:00',
}))

async function run() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'msedge' }) })
  const context = await browser.newContext({ viewport: { width: 1536, height: 1024 }, locale: 'zh-CN', reducedMotion: 'reduce' })
  const page = await context.newPage()
  const errors = []
  const checked = []
  const requests = []
  const unexpected = []
  let notes = structuredClone(fixtures)
  let mode = 'normal'
  let deleteCalls = 0
  page.on('pageerror', (error) => errors.push(error.message))
  await context.addInitScript(() => {
    const user = { id: 'ui-preview', username: '体验空间', email: 'preview@example.invalid' }
    localStorage.setItem('user-store', JSON.stringify({ state: { userInfo: user, token: 'ui-test-only', isLogin: true, userBio: '' }, version: 0 }))
    localStorage.setItem('jwt_token', 'ui-test-only')
    if (!localStorage.getItem('theme')) localStorage.setItem('theme', JSON.stringify({ state: { theme: 'light' }, version: 0 }))
  })
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort()
    const api = /^\/(note\/|note-template\/|user\/|social\/|review\/|knowledge\/|chat\/|stats(?:\/|$))/.test(pathname)
    if (!api) return route.continue()
    requests.push({ path: pathname, method: request.method(), query: url.search })
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status, message: 'ok', data }) })
    if (pathname === '/note/list') {
      if (mode === 'error') return reply(null, 500)
      if (mode === 'loading') await new Promise((resolve) => setTimeout(resolve, 650))
      const items = mode === 'empty' ? [] : notes.filter((note) => !url.searchParams.get('category') || note.category === url.searchParams.get('category'))
      const sort = url.searchParams.get('sort_by') || 'updated_at'
      items.sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || (sort === 'title' ? a.title.localeCompare(b.title) : Date.parse(b[sort]) - Date.parse(a[sort])))
      const pageNumber = Number(url.searchParams.get('page') || 1), size = Number(url.searchParams.get('page_size') || 20)
      return reply({ notes: items.slice((pageNumber - 1) * size, pageNumber * size), total_count: items.length })
    }
    if (pathname === '/note/stats') return reply({ total: notes.length, categories: [...new Set(notes.map((note) => note.category))].map((category) => ({ category, count: notes.filter((note) => note.category === category).length })), uncategorized: 0 })
    if (pathname === '/note/search') {
      const q = url.searchParams.get('q') || ''
      if (q === 'slow') { await new Promise((resolve) => setTimeout(resolve, 1000)); return reply({ notes: [fixtures[3]], total_count: 1 }) }
      const items = notes.filter((note) => (note.title + note.content).includes(q))
      return reply({ notes: items, total_count: items.length })
    }
    if (pathname === '/note/batch/pin') {
      const payload = request.postDataJSON()
      notes.forEach((note) => { if (payload.ids.includes(note.id)) note.is_pinned = payload.is_pinned })
      return reply(null)
    }
    if (pathname === '/note/batch/category') {
      const payload = request.postDataJSON()
      notes.forEach((note) => { if (payload.ids.includes(note.id)) note.category = payload.category })
      return reply(null)
    }
    if (pathname === '/note/batch/delete') {
      deleteCalls++
      const payload = request.postDataJSON()
      notes = notes.filter((note) => !payload.ids.includes(note.id))
      return reply(null)
    }
    if (pathname === '/note/batch/download') return route.fulfill({ contentType: 'application/zip', body: Buffer.from('isolated-ui-download-test') })
    if (/^\/note\/[^/]+\/pin$/.test(pathname)) {
      const note = notes.find((item) => item.id === pathname.split('/')[2])
      note.is_pinned = !note.is_pinned
      return reply(note)
    }
    if (/^\/note\/[^/]+\/related$/.test(pathname)) return reply([])
    if (/^\/note\/[^/]+\/backlinks$/.test(pathname)) return reply({ backlinks: [], outlinks: [] })
    if (/^\/note\/preview-\d+$/.test(pathname) && request.method() === 'GET') return reply(notes.find((note) => note.id === pathname.split('/')[2]))
    if (pathname === '/note-template/list') return reply([])
    if (pathname === '/social/notifications/unread-count') return reply({ count: 2 })
    if (pathname === '/user/settings/') return reply({ pet_config: null, habit_config: null })
    if (pathname === '/user/detail/') return reply({ id: 'ui-preview', username: '体验空间', email: 'preview@example.invalid' })
    // Never let an unrecognised API call reach the real backend, including editor autosave.
    unexpected.push(request.method() + ' ' + pathname)
    return reply(null, 400)
  })
  const check = async (name, work) => { await work(); checked.push(name); console.log('PASS ' + name) }
  const count = async (expected) => page.waitForFunction((n) => document.querySelectorAll('.note-card').length === n, expected)
  const overflow = async () => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.equal(await page.locator('main').evaluate((el) => el.scrollWidth > el.clientWidth), false)
  }
  try {
    await page.goto(baseURL + '/notes')
    await count(6)
    await check('desktop grid, true total and violet theme', async () => {
      await page.getByText('共 6 篇笔记', { exact: true }).waitFor()
      assert.equal(await page.locator('.notes-collection').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length), 3)
      assert.equal(await page.locator(':root').evaluate((el) => getComputedStyle(el).getPropertyValue('--color-accent').trim()), '#7C3AED')
      await overflow()
      await page.screenshot({ path: path.join(output, 'desktop.png') })
    })
    await check('view switch persists across reload', async () => {
      await page.getByRole('button', { name: '列表视图', exact: true }).click()
      await page.reload(); await count(6)
      assert.equal(await page.locator('.notes-collection.is-list').count(), 1)
      await page.getByRole('button', { name: '卡片视图', exact: true }).click()
    })
    await check('category and server-side sort', async () => {
      await page.getByRole('group', { name: '分类', exact: true }).getByRole('button', { name: '学习', exact: true }).click()
      await count(2)
      await page.getByText('共 2 篇笔记', { exact: true }).waitFor()
      await page.getByRole('group', { name: '分类', exact: true }).getByRole('button', { name: '全部', exact: true }).click()
      await count(6)
      await page.getByRole('combobox', { name: '笔记排序' }).selectOption('title')
      await page.waitForResponse((response) => response.url().includes('sort_by=title'))
      assert(requests.some((request) => request.path === '/note/list' && request.query.includes('sort_by=title')))
    })
    await check('debounced semantic search, clear and empty results', async () => {
      const search = page.getByRole('textbox', { name: '搜索笔记...' })
      await search.fill('RAG'); await count(1)
      assert.equal(await page.getByRole('combobox', { name: '笔记排序' }).isDisabled(), true)
      await search.fill('no-such-note')
      await page.getByRole('heading', { name: '没有找到匹配的笔记' }).waitFor()
      await page.getByRole('button', { name: '清除筛选' }).click(); await count(6)
    })
    await check('stale search responses cannot replace newer results', async () => {
      const search = page.getByRole('textbox', { name: '搜索笔记...' })
      const slow = page.waitForResponse((response) => response.url().includes('q=slow'))
      const requested = page.waitForRequest((request) => request.url().includes('q=slow'))
      await search.fill('slow'); await requested
      await search.fill('RAG'); await count(1); await slow
      assert.equal(await page.locator('.note-card-title').innerText(), 'RAG 学习笔记')
      await page.getByRole('button', { name: '清空搜索' }).click(); await count(6)
    })
    await check('pin action does not open the editor', async () => {
      const card = page.locator('.note-card').filter({ hasText: '产品设计复盘' })
      await card.getByRole('button', { name: '置顶', exact: true }).click()
      await card.getByRole('button', { name: '取消置顶', exact: true }).waitFor()
      assert.equal(new URL(page.url()).pathname, '/notes')
      await card.getByRole('button', { name: '取消置顶', exact: true }).click()
    })
    await check('long press selects without navigating', async () => {
      const area = page.getByRole('button', { name: '打开笔记：RAG 学习笔记', exact: true })
      await area.hover(); await page.mouse.down()
      await page.locator('.notes-header').getByText('已选 1 项').waitFor()
      await page.mouse.up()
      assert.equal(new URL(page.url()).pathname, '/notes')
      await page.getByRole('button', { name: '取消', exact: true }).click()
    })
    await check('selection menu and confirmed batch delete', async () => {
      await page.getByRole('button', { name: '更多操作：产品设计复盘' }).click()
      await page.getByRole('menuitem', { name: '选择笔记', exact: true }).click()
      await page.getByRole('button', { name: '删除', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
      assert.equal(deleteCalls, 0)
      await page.getByRole('button', { name: '删除', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
      await count(5); assert.equal(deleteCalls, 1)
      notes = structuredClone(fixtures); await page.reload(); await count(6)
    })
    await check('batch category changes and download preserve selection behaviour', async () => {
      await page.getByRole('button', { name: '更多操作：产品设计复盘' }).click()
      await page.getByRole('menuitem', { name: '选择笔记', exact: true }).click()
      await page.getByRole('button', { name: '分类', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: '学习', exact: true }).click()
      await page.locator('.note-card').filter({ hasText: '产品设计复盘' }).locator('.note-category').filter({ hasText: '学习' }).waitFor()
      await page.getByRole('button', { name: '更多操作：产品设计复盘' }).click()
      await page.getByRole('menuitem', { name: '选择笔记', exact: true }).click()
      const downloaded = page.waitForEvent('download')
      await page.getByRole('button', { name: '下载', exact: true }).click()
      assert.match((await downloaded).suggestedFilename(), /\.zip$/)
      notes = structuredClone(fixtures); await page.reload(); await count(6)
    })
    await check('keyboard can open an existing note', async () => {
      const open = page.getByRole('button', { name: '打开笔记：RAG 学习笔记', exact: true })
      await open.focus(); await open.press('Enter')
      await page.waitForURL('**/notes/preview-0')
      await page.goBack(); await count(6)
    })
    await check('collapsed groups remain reachable in icon-only sidebar', async () => {
      await page.getByRole('button', { name: '知识', exact: true }).click()
      await page.getByRole('button', { name: '收起侧栏' }).click()
      await page.getByRole('link', { name: '笔记', exact: true }).waitFor()
      await page.getByRole('button', { name: '展开侧栏' }).click()
      await page.getByRole('button', { name: '知识', exact: true }).click()
    })
    await check('account menu retains settings, profile, about and logout', async () => {
      await page.getByRole('button', { name: '账户菜单' }).click()
      for (const name of ['个人信息', '设置', '关于我们', '退出登录']) assert.equal(await page.getByRole('menuitem', { name, exact: true }).count(), 1)
      await page.getByRole('menuitem', { name: '设置', exact: true }).click()
      await page.getByRole('switch').first().click()
      await page.getByRole('link', { name: '笔记', exact: true }).click(); await count(6)
      assert.equal(await page.locator('html.dark').count(), 1)
      await page.screenshot({ path: path.join(output, 'dark.png') })
    })
    await check('mobile layout and compact navigation', async () => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.locator('.app-sidebar.is-collapsed').waitFor(); await overflow()
      assert.equal(await page.locator('.notes-collection').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length), 1)
      await page.screenshot({ path: path.join(output, 'mobile-dark.png') })
    })
    await page.setViewportSize({ width: 1536, height: 1024 })
    await page.getByRole('button', { name: '账户菜单' }).click()
    await page.getByRole('menuitem', { name: '设置', exact: true }).click()
    await page.getByRole('switch').first().click()
    await page.getByRole('button', { name: 'English', exact: true }).click()
    await page.getByRole('link', { name: 'Notes', exact: true }).click(); await count(6)
    await check('English labels and counts', async () => {
      await page.getByText('6 notes', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'Manage categories', exact: true }).waitFor()
      await page.getByRole('group', { name: 'Category', exact: true }).getByRole('button', { name: 'Study', exact: true }).waitFor()
    })
    await check('loading and empty states', async () => {
      mode = 'loading'; await page.reload()
      await page.locator('.note-skeleton').first().waitFor(); await count(6)
      mode = 'empty'; await page.reload()
      await page.locator('.notes-empty h2').waitFor()
      await page.screenshot({ path: path.join(output, 'empty.png') })
    })
    await check('failed request and retry', async () => {
      mode = 'error'; await page.reload()
      await page.getByRole('alert').waitFor()
      mode = 'normal'; await page.locator('.notes-error button').click(); await count(6)
    })
    await check('pagination, correct total and no duplicate cards', async () => {
      notes = Array.from({ length: 45 }, (_, index) => ({ ...fixtures[index % 6], id: 'preview-' + index, title: 'Note ' + String(index).padStart(2, '0'), is_pinned: false }))
      await page.reload(); await count(20)
      await page.locator('main').evaluate((el) => { el.scrollTop = el.scrollHeight })
      await count(40)
      await page.locator('main').evaluate((el) => { el.scrollTop = el.scrollHeight })
      await count(45)
      await page.locator('.notes-subtitle').filter({ hasText: '45' }).waitFor()
      assert.equal(new Set(await page.locator('.note-card-title').allTextContents()).size, 45)
    })
    await check('no runtime errors or real API mutations', async () => {
      assert.deepEqual(errors, [])
      assert.deepEqual(unexpected, [])
    })
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ checked, screenshotsUseMockNotes: true, errors, unexpected }, null, 2))
    console.log(JSON.stringify({ passed: checked.length, output }))
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png'), animations: 'disabled' })
    console.error((await page.locator('body').innerText()).slice(0, 1800))
    throw error
  } finally { await browser.close() }
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
