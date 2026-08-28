/* Local UI checks in an isolated browser. All application APIs are mocked. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.UI_BASE_URL || 'http://localhost:3000'
const output = path.resolve(__dirname, '../../.codex-checks/dashboard')
const titles = ['产品设计思维笔记', 'AI 在教育领域的应用趋势', '用户研究方法', '我的阅读清单', '知识管理工作流', '让灵感连接起来']
const notes = titles.map((title, index) => ({ id: 'dashboard-' + index, title, content: '## 学习记录\n梳理今天的思考，连接已有的知识，发现新的灵感。', tags: index % 2 ? ['学习', 'AI'] : ['设计'], category: 'study', is_pinned: false, updated_at: `2026-08-${28 - index}T09:24:00`, created_at: `2026-08-${28 - index}T09:24:00` }))
const docs = [{ id: 'document-1', filename: '用户研究方法与实践.pdf', chunk_count: 18, created_at: '2026-08-27T18:30:00' }]

async function run() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1536, height: 1080 }, locale: 'zh-CN', reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  let mode = 'normal'
  const errors = [], unexpected = [], passed = [], graphCalls = []
  page.on('pageerror', (error) => errors.push(error.message))
  // React catches render failures itself, so pageerror alone misses ErrorBoundary crashes.
  page.on('console', (message) => {
    if (message.type() === 'error' && /ErrorBoundary|TypeError|ReferenceError|An error occurred in/.test(message.text())) errors.push(message.text())
  })
  await context.addInitScript(() => {
    const user = { id: 'dashboard-test', username: '小林', email: 'preview@example.invalid' }
    localStorage.setItem('user-store', JSON.stringify({ state: { userInfo: user, isLogin: true, token: 'test-only' }, version: 0 }))
    localStorage.setItem('jwt_token', 'test-only')
    localStorage.setItem('theme', JSON.stringify({ state: { theme: 'light' }, version: 0 }))
    localStorage.setItem('pet.config', JSON.stringify({ nickname: '云朵朵', affection: 65, characterId: 'cloud', visible: true }))
    localStorage.setItem('habit.config', JSON.stringify({ taskDate: new Date().toDateString(), tasksDone: ['note', 'review'], noteStreak: { lastDate: new Date().toDateString(), count: 6, best: 6 } }))
  })
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort()
    const api = /^\/(note\/|note-template\/|user\/|social\/|review\/|knowledge\/|chat\/|stats(?:\/|$))/.test(pathname)
    if (!api) return route.continue()
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status, message: 'ok', data }) })
    if (pathname === '/note/list') {
      const records = notes.map((note, index) => {
        if (mode === 'null-tags') return { ...note, tags: null }
        if (mode === 'empty-tags') return { ...note, tags: [] }
        if (mode === 'missing-tags') { const copy = { ...note }; delete copy.tags; return copy }
        if (mode === 'mixed-tags' && index % 2 === 0) return { ...note, tags: null }
        return note
      })
      return reply({ notes: mode === 'empty' ? [] : records, total_count: mode === 'empty' ? 0 : 6 })
    }
    if (pathname === '/note/stats') return reply({ total: 6, categories: [{ category: 'study', count: 6 }], uncategorized: 0 })
    if (pathname === '/note/search') return reply({ notes: [notes[0]], total_count: 1 })
    if (pathname === '/knowledge/list') return reply({ documents: mode === 'empty' ? [] : docs, total_count: mode === 'empty' ? 0 : docs.length })
    if (pathname === '/note/graph') {
      const semantic = url.searchParams.get('include_semantic')
      graphCalls.push(semantic)
      return mode === 'error' ? reply(null, 500) : reply({ nodes: mode === 'empty' ? [] : notes.map(({ id, title }) => ({ id, title, category: 'study' })), links: mode === 'empty' ? [] : notes.slice(1).map((note, i) => ({ source: notes[i].id, target: note.id, type: 'link' })), semantic_status: semantic === 'true' ? (mode === 'semantic-error' ? 'unavailable' : 'complete') : 'not_requested' })
    }
    if (pathname === '/review/today') return reply({ reviews: [], total_count: mode === 'empty' ? 0 : 4 })
    if (pathname === '/user/settings/') return reply({ pet_config: null, habit_config: null })
    if (pathname === '/social/notifications/unread-count') return reply({ count: 0 })
    if (pathname === '/note-template/list') return reply([])
    if (pathname === '/note/autocomplete') return reply({ completion: null })
    if (/^\/note\/dashboard-\d+$/.test(pathname)) return reply(notes.find((note) => note.id === pathname.split('/')[2]))
    if (/^\/note\/[^/]+\/related$/.test(pathname)) return reply([])
    if (/^\/note\/[^/]+\/backlinks$/.test(pathname)) return reply({ backlinks: [], outlinks: [] })
    unexpected.push(request.method() + ' ' + pathname)
    return reply(null, 400)
  })
  const ready = async () => { await page.goto(baseURL); await page.locator('.dashboard-records[aria-busy="false"]').waitFor(); await page.locator('.dashboard-hero-art img').evaluate((img) => img.decode()) }
  const check = async (name, action) => { await action(); passed.push(name); console.log('PASS ' + name) }
  const noOverflow = async () => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    const overflow = await page.locator('main').evaluate((el) => ({ width: innerWidth, scroll: el.scrollWidth, client: el.clientWidth, offenders: [...el.querySelectorAll('*')].filter((item) => item.getBoundingClientRect().right > el.getBoundingClientRect().right + 1).map((item) => item.className).slice(0, 20) }))
    assert(overflow.scroll <= overflow.client, JSON.stringify(overflow))
  }
  try {
    await ready()
    await check('dashboard uses API records, real graph links and stored growth', async () => {
      assert.equal(await page.locator('.dashboard-record').count(), 3)
      assert.equal(await page.locator('.dashboard-network-node').count(), 6)
      assert.equal(await page.locator('.dashboard-network line').count(), 5)
      assert.match(await page.locator('.dashboard-pet-details').innerText(), /Lv\.2/)
      assert.match(await page.locator('.dashboard-pet-details').innerText(), /65 \/ 150/)
      assert.equal(await page.locator('.dashboard-tasks .done').count(), 2)
      assert.match(await page.locator('.dashboard-streak').innerText(), /6 天/)
      assert.equal(await page.locator('.sidebar-home-link').getAttribute('aria-current'), 'page')
      await noOverflow()
      await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true })
    })
    await check('nullable, missing, empty and mixed note tags never crash the dashboard', async () => {
      for (const fixture of ['null-tags', 'missing-tags', 'empty-tags', 'mixed-tags']) {
        mode = fixture; await ready()
        assert.equal(await page.getByText('页面出错了', { exact: true }).count(), 0, fixture)
        assert.equal(await page.locator('.dashboard-record').count(), 3, fixture)
        assert.equal(await page.locator('.dashboard-network-node').count(), 6, fixture)
        await page.getByRole('group', { name: '记录类型' }).getByRole('button', { name: '笔记', exact: true }).click()
        const first = page.locator('.dashboard-record').first()
        assert.match(await first.innerText(), /产品设计思维笔记/)
        assert.match(await first.locator('.dashboard-record-meta').innerText(), /继续阅读/)
        if (fixture === 'mixed-tags') assert.match(await page.locator('.dashboard-record-meta').nth(1).innerText(), /学习 · AI/)
        await page.goto(baseURL + '/notes')
        await page.locator('.note-card').first().waitFor()
        assert.equal(await page.locator('.note-card').count(), 6, fixture)
        assert.equal(await page.getByText('页面出错了', { exact: true }).count(), 0, fixture)
        if (fixture !== 'mixed-tags') assert.equal(await page.locator('.note-keyword').count(), 0, fixture)
        assert.deepEqual(errors, [], fixture)
      }
      await ready()
      await page.screenshot({ path: path.join(output, 'nullable-tags.png'), fullPage: true })
      mode = 'normal'; await ready()
    })
    await check('recent content filters work', async () => {
      await page.getByRole('group', { name: '记录类型' }).getByRole('button', { name: '资料', exact: true }).click()
      assert.equal(await page.locator('.dashboard-record').count(), 1)
      assert.match(await page.locator('.dashboard-record').innerText(), /用户研究方法与实践.pdf/)
      await page.getByRole('group', { name: '记录类型' }).getByRole('button', { name: '笔记', exact: true }).click()
      assert.equal(await page.locator('.dashboard-file-icon.document').count(), 0)
    })
    await check('top search opens existing command palette and Escape closes it', async () => {
      await page.locator('.dashboard-search').click()
      await page.locator('input').first().waitFor()
      await page.locator('input').first().fill('产品')
      await page.keyboard.press('Escape')
      await page.locator('input').first().waitFor({ state: 'hidden' })
    })
    await check('new-note and recent-note links navigate correctly', async () => {
      await page.locator('.dashboard-hero-actions a').first().click()
      await page.waitForURL('**/notes/new')
      await page.getByText('选择笔记模板', { exact: true }).waitFor()
      await ready()
      await page.locator('.dashboard-record').first().click()
      await page.waitForURL('**/notes/dashboard-0')
      await page.locator('.ProseMirror').waitFor()
      await ready()
    })
    await check('all action targets preserve existing application routes', async () => {
      const targets = await page.locator('.dashboard-quick-actions a').evaluateAll((els) => els.map((el) => el.getAttribute('href')))
      assert.deepEqual(targets, ['/notes/new', '/knowledge', '/chat', '/graph'])
      assert.equal(await page.locator('.dashboard-companion-heading a').getAttribute('href'), '/pet')
      assert.equal(await page.locator('.dashboard-review a').getAttribute('href'), '/review')
    })
    await check('home and graph navigation never request semantic retrieval automatically', async () => {
      assert(graphCalls.length > 0)
      assert(graphCalls.every((value) => value === 'false'))
      await page.locator('.dashboard-quick-actions a[href="/graph"]').click()
      await page.getByRole('button', { name: '加载语义关联', exact: true }).waitFor()
      assert(graphCalls.every((value) => value === 'false'))
    })
    await check('semantic retrieval is manual and failure is visible without losing graph', async () => {
      mode = 'semantic-error'
      await page.getByRole('button', { name: '加载语义关联', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: '语义检索暂时不可用' }).waitFor()
      // The graph is interactive, not a presentational image: its nodes are focusable buttons.
      assert.equal(await page.getByRole('group', { name: '知识图谱', exact: true }).count(), 1)
      assert.equal(graphCalls.filter((value) => value === 'true').length, 1)
      mode = 'normal'
      await page.getByRole('button', { name: '加载语义关联', exact: true }).click()
      await page.getByRole('status').filter({ hasText: '语义关联已更新' }).waitFor()
      assert.equal(graphCalls.filter((value) => value === 'true').length, 2)
      assert.equal(await page.getByRole('alert').count(), 0)
      await ready()
    })
    await check('empty state contains no fabricated records or graph nodes', async () => {
      mode = 'empty'; await ready()
      assert.equal(await page.locator('.dashboard-record').count(), 0)
      assert.equal(await page.locator('.dashboard-network-node').count(), 0)
      await page.getByText('创建第一篇笔记', { exact: true }).waitFor()
      await page.screenshot({ path: path.join(output, 'empty.png'), fullPage: true })
    })
    await check('partial API failure keeps notes visible and supports retry', async () => {
      mode = 'error'; await ready()
      await page.getByRole('alert').waitFor()
      assert.equal(await page.locator('.dashboard-record').count(), 3)
      mode = 'normal'; await page.getByRole('button', { name: '重试', exact: true }).click()
      await page.getByRole('alert').waitFor({ state: 'hidden' })
    })
    await check('dark, tablet, mobile and compact navigation have no horizontal overflow', async () => {
      await page.locator('html').evaluate((el) => el.classList.add('dark'))
      await noOverflow(); await page.screenshot({ path: path.join(output, 'dark.png'), fullPage: true })
      await page.locator('html').evaluate((el) => el.classList.remove('dark'))
      for (const width of [1280, 900, 768, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 })
        await noOverflow()
      }
      await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true })
      assert.equal(await page.locator('.app-sidebar.is-collapsed').count(), 1)
    })
    await check('no runtime errors or unhandled API traffic', async () => {
      assert.deepEqual(errors, [])
      assert.deepEqual(unexpected, [])
    })
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed, errors, unexpected }, null, 2))
    console.log(`${passed.length} dashboard checks passed`)
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {})
    console.error({ errors, unexpected }); throw error
  } finally { await browser.close() }
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
