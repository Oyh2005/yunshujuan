/* Isolated fixtures only: every application API, including writes, is intercepted. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.UI_BASE_URL || 'http://localhost:3000'
const output = path.resolve(__dirname, '../../.codex-checks/knowledge-pages')
const names = ['RAG 学习笔记', '产品设计复盘', '大模型学习路线', '周末阅读清单', '前端组件整理', '英语学习计划']
const notes = names.map((title, index) => ({ id: 'knowledge-test-' + index, title, content: '## 学习记录\n梳理核心概念与实践经验，连接已有的知识，发现新的灵感。', category: ['project', 'work', 'study', 'life', 'project', 'study'][index], tags: index === 1 ? null : ['学习', '方法'], is_pinned: index === 0, created_at: '2026-08-25T09:00:00', updated_at: '2026-08-28T09:00:00' }))
const initialDocs = ['用户研究方法与实践.pdf', 'RAG 技术入门.pdf', '产品需求文档.docx', '知识管理工作流.md', '阅读摘录.txt'].map((filename, index) => ({ id: 'doc-' + index, filename, chunk_count: 20 + index, created_at: index === 3 ? null : index === 4 ? 'invalid' : '2026-08-28T09:00:00' }))
const publicNotes = notes.map((note, index) => ({ ...note, content_preview: note.content, author: { user_id: 'author-' + index, username: ['小林', '知行', '轻舟', '读书的云', '南风', '小夏'][index], avatar: null }, view_count: 138 - index * 13, updated_at: index === 2 ? null : note.updated_at }))
const ranks = Object.fromEntries(['writing', 'review', 'streak'].map((key, group) => [key, publicNotes.slice(0, 5).map((n, i) => ({ ...n.author, value: group === 0 ? 12800 - i * 1200 : 16 - i * 2 }))]))
const daily = Array.from({ length: 365 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return { date: [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'), count: i % 9 < 5 ? i % 7 + 1 : 0 } })
const stats = { summary: { total_notes: 48, total_chars: 32640, year_notes: 36, year_chars: 28400, total_reviews: 26, week_reviews: 8, today_reviews: 2, ai_messages: 19, kb_docs: 5 }, heatmap: Object.fromEntries(daily.map((d) => [d.date, d.count])), trend: daily.slice(0, 30).map((d, i) => ({ date: d.date, chars: d.count ? 130 + (i * 179) % 1100 : 0 })), categories: [{ category: 'study', count: 20 }, { category: 'work', count: 12 }, { category: 'project', count: 10 }, { category: 'life', count: 6 }], uncategorized: 0 }

async function run() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1536, height: 1080 }, locale: 'zh-CN', reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  let mode = 'normal', docs = structuredClone(initialDocs), lang = 'zh-CN'
  const errors = [], unexpected = [], passed = [], calls = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error' && /ErrorBoundary|TypeError|ReferenceError|An error occurred in/.test(message.text())) errors.push(message.text()) })
  await context.addInitScript(() => {
    const user = { id: 'knowledge-preview', username: '小林', avatar: null, email: 'preview@example.invalid' }
    localStorage.setItem('user-store', JSON.stringify({ state: { userInfo: user, token: 'isolated-test', isLogin: true }, version: 0 }))
    localStorage.setItem('jwt_token', 'isolated-test')
    localStorage.setItem('theme', JSON.stringify({ state: { theme: 'light' }, version: 0 }))
    localStorage.setItem('pet.config', JSON.stringify({ visible: true, nickname: '云朵朵', affection: 65, characterId: 'cloud', offsetX: 24, offsetY: 24 }))
    localStorage.setItem('pet.greeted', '1')
    localStorage.setItem('habit.config', JSON.stringify({ taskDate: new Date().toDateString(), tasksDone: ['note'], noteStreak: { lastDate: new Date().toDateString(), count: 6, best: 9 } }))
  })
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort()
    if (request.isNavigationRequest()) return route.continue()
    if (!/^\/(note\/|note-template\/|user\/|social\/|review\/|knowledge\/|chat\/|stats(?:\/|$))/.test(p)) return route.continue()
    calls.push({ method: request.method(), path: p, query: url.search })
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status, message: 'fixture', data }) })
    if (mode === 'error' && ['/knowledge/list', '/note/graph', '/stats/dashboard', '/social/plaza'].includes(p)) return reply(null, 500)
    if (mode === 'rank-error' && p === '/stats/leaderboard') return reply(null, 500)
    if (mode === 'slow' && ['/knowledge/list', '/note/graph', '/stats/dashboard', '/social/plaza'].includes(p)) await new Promise((resolve) => setTimeout(resolve, 500))
    if (p === '/user/settings/') return reply({ pet_config: null, habit_config: null })
    if (p === '/social/notifications/unread-count') return reply({ count: 0 })
    if (p === '/note/list') return reply({ notes: mode === 'empty' ? [] : notes, total_count: mode === 'empty' ? 0 : 6 })
    if (p === '/note/stats') return reply({ total: 6, categories: stats.categories, uncategorized: 0 })
    if (p === '/note/search') return reply({ notes: [notes[0]], total_count: 1 })
    if (p === '/review/today') return reply({ reviews: [], total_count: 0 })
    if (p === '/note-template/list') return reply([])
    if (p === '/knowledge/list') return reply({ documents: mode === 'empty' ? [] : docs, total_count: mode === 'empty' ? 0 : docs.length })
    if (p === '/knowledge/detail') return reply({ filename: url.searchParams.get('filename'), content: '隔离测试文档正文', images: [], chunks: [{ chunk_id: 'chunk-1', index: 0, page: 1, content: '隔离测试片段', images: [] }] })
    if (p === '/knowledge/delete/filename' && request.method() === 'DELETE') { docs = docs.filter((d) => d.filename !== url.searchParams.get('filename')); return reply(null) }
    if (p === '/knowledge/clean' && request.method() === 'DELETE') { docs = []; return reply(null) }
    if (p === '/knowledge/clip' && request.method() === 'POST') return reply({ filename: '网页剪藏.md', chunk_count: 3, title: '测试网页' })
    if (p === '/knowledge/add/multiple/stream') {
      if (mode === 'upload-error') return reply(null, 502)
      const events = [{ event_type: 'processing', filename: '测试上传.txt', progress: 35 }, { event_type: 'completed', filename: '测试上传.txt' }, { event_type: 'finish' }]
      if (mode !== 'upload-dropped') docs.push({ id: 'upload-test', filename: '测试上传.txt', chunk_count: 2, created_at: null })
      return route.fulfill({ contentType: 'text/event-stream', body: (mode === 'upload-dropped' ? events.slice(0, 1) : events).map((e) => 'data: ' + JSON.stringify(e) + '\n\n').join('') })
    }
    if (p === '/note/graph') {
      const semantic = url.searchParams.get('include_semantic') === 'true'
      if (mode === 'dense') return reply({ nodes: Array.from({ length: 50 }, (_, i) => ({ id: 'dense-' + i, title: '知识节点 ' + i, category: 'study' })), links: Array.from({ length: 49 }, (_, i) => ({ source: 'dense-' + i, target: 'dense-' + (i + 1), type: 'link' })), semantic_status: 'not_requested' })
      return reply({ nodes: mode === 'empty' ? [] : notes.map(({ id, title, category }) => ({ id, title, category })), links: mode === 'empty' ? [] : [{ source: notes[0].id, target: notes[1].id, type: 'link' }, { source: notes[1].id, target: notes[2].id, type: 'link' }, ...(mode === 'dangling' ? [{ source: 'deleted-note', target: notes[0].id, type: 'link' }] : [])], semantic_status: semantic ? (mode === 'semantic-error' ? 'unavailable' : 'complete') : 'not_requested' })
    }
    if (p === '/stats/dashboard') return reply(mode === 'empty' ? { ...stats, summary: Object.fromEntries(Object.keys(stats.summary).map((key) => [key, 0])), heatmap: {}, trend: [], categories: [] } : stats)
    if (p === '/stats/leaderboard') return reply(mode === 'empty' ? { writing: [], review: [], streak: [] } : ranks)
    if (p === '/social/plaza') return reply({ notes: mode === 'empty' ? [] : Number(url.searchParams.get('page') || 1) === 1 ? publicNotes.slice(0, 4) : publicNotes.slice(3), total: mode === 'empty' ? 0 : 6, has_more: mode !== 'empty' && Number(url.searchParams.get('page') || 1) === 1 })
    unexpected.push(request.method() + ' ' + p)
    return reply(null, 400)
  })
  const check = async (name, work) => { await work(); passed.push(name); console.log('PASS ' + name) }
  const goto = async (route) => { await page.goto(base + route); await page.locator('main h1').first().waitFor(); await page.locator('.pet-root').waitFor() }
  const settled = async (route) => {
    await goto(route)
    const selector = { '/notes': '.note-card', '/knowledge': '.knowledge-table tbody tr', '/graph': '.knowledge-graph-node', '/stats': '.knowledge-stat-card', '/plaza': '.knowledge-public-note', '/': '.dashboard-record' }[route]
    if (selector) await page.locator(selector).first().waitFor()
  }
  const noOverflow = async () => {
    const dims = await page.locator('main').evaluate((el) => ({ width: el.clientWidth, scroll: el.scrollWidth, document: document.documentElement.scrollWidth, viewport: innerWidth }))
    assert(dims.scroll <= dims.width + 1 && dims.document <= dims.viewport + 1, JSON.stringify(dims))
    assert.equal(await page.getByText('页面出错了', { exact: true }).count(), 0)
    const pet = await page.locator('.pet-root').boundingBox(), viewport = page.viewportSize()
    assert(pet.x >= 0 && pet.y >= 0 && pet.x + pet.width <= viewport.width && pet.y + pet.height <= viewport.height, JSON.stringify({ pet, viewport }))
  }
  const snap = async (name) => { await page.locator('main').evaluate((el) => { el.scrollTop = 0 }); await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true, animations: 'disabled' }) }
  try {
    await check('five knowledge pages render real fixture data, unified layout and a single floating pet', async () => {
      for (const route of ['/notes', '/knowledge', '/graph', '/stats', '/plaza']) {
        await settled(route); await noOverflow()
        assert.equal(await page.locator('.pet-root').count(), 1)
        assert.equal(await page.locator('.knowledge-global-search').count(), 1)
        await page.locator('.knowledge-page img[src="/illustrations/study-cloud.png"]').first().evaluate((img) => img.decode())
        await snap(route.slice(1) + '-desktop')
      }
      assert(calls.filter((c) => c.path === '/note/graph').every((c) => c.query.includes('include_semantic=false')))
    })
    await check('floating pet remains mounted on home, knowledge navigation and settings', async () => {
      await settled('/')
      const pet = await page.locator('.pet-root').elementHandle()
      await page.locator('.sidebar-link[href="/notes"]').click(); await page.locator('.note-card').first().waitFor()
      assert.equal(await pet.evaluate((el) => el.isConnected), true)
      await page.locator('.sidebar-link[href="/knowledge"]').click(); await page.locator('.knowledge-table').waitFor()
      assert.equal(await pet.evaluate((el) => el.isConnected), true)
      await goto('/settings'); await noOverflow()
    })
    await check('pet drag, keyboard interaction, visibility switch and mobile position are usable', async () => {
      await settled('/notes')
      const before = await page.evaluate(() => JSON.parse(localStorage.getItem('pet.config')).affection)
      let box = await page.locator('.pet-root').boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(90, 110, { steps: 12 }); await page.mouse.up()
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pet.config')).affection), before, 'dragging is not a pet reward')
      await page.setViewportSize({ width: 390, height: 844 }); await noOverflow()
      await page.locator('.pet-root').focus(); await page.keyboard.press('Enter'); await page.locator('.pet-bubble').waitFor()
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pet.config')).affection), before + 1)
      await page.setViewportSize({ width: 1536, height: 1080 })
      await page.getByRole('button', { name: '隐藏页宠', exact: true }).click(); await page.locator('.pet-root').waitFor({ state: 'hidden' })
      await page.getByRole('button', { name: '显示页宠', exact: true }).click(); await page.locator('.pet-root').waitFor(); await noOverflow()
    })
    await check('shared top search opens the existing command palette', async () => {
      await settled('/knowledge'); await page.locator('.knowledge-global-search').click()
      await page.locator('.global-command-palette input').waitFor()
      assert.equal(await page.locator('.pet-root').evaluate((pet) => { const r = pet.getBoundingClientRect(); return Boolean(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.global-command-palette')) }), true, 'command overlay must cover the floating pet')
      await page.keyboard.press('Escape'); await page.locator('.global-command-palette input').waitFor({ state: 'hidden' })
    })
    await check('library filters, real chunk totals and nullable dates', async () => {
      assert.equal(await page.locator('.knowledge-table tbody tr').count(), 5)
      assert.equal(await page.locator('.knowledge-metric strong').nth(1).innerText(), '110')
      assert.doesNotMatch(await page.locator('main').innerText(), /Invalid Date|1970/)
      await page.getByRole('button', { name: 'PDF', exact: true }).click(); assert.equal(await page.locator('.knowledge-table tbody tr').count(), 2)
      await page.getByRole('textbox', { name: '搜索资料名称…' }).fill('RAG'); assert.equal(await page.locator('.knowledge-table tbody tr').count(), 1)
      await page.getByRole('textbox', { name: '搜索资料名称…' }).fill('不存在'); await page.getByRole('button', { name: '清除筛选' }).click(); assert.equal(await page.locator('.knowledge-table tbody tr').count(), 5)
    })
    await check('document drawer, chunks and destructive-action cancellation', async () => {
      await page.getByRole('button', { name: '用户研究方法与实践.pdf', exact: true }).click()
      await page.getByText('隔离测试文档正文', { exact: true }).waitFor()
      assert.equal(await page.getByRole('dialog').evaluate((el) => getComputedStyle(el).zIndex), '50')
      await page.getByRole('button', { name: '文档片段 (1)' }).click(); await page.getByText('隔离测试片段', { exact: true }).waitFor()
      await page.keyboard.press('Escape')
      const deletes = calls.filter((c) => c.method === 'DELETE').length
      await page.getByRole('button', { name: '删除：用户研究方法与实践.pdf' }).click()
      await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
      assert.equal(calls.filter((c) => c.method === 'DELETE').length, deletes)
      assert.equal(await page.locator('.knowledge-table tbody tr').count(), 5)
    })
    await check('web clip dialog is keyboard accessible and remains connected to its API', async () => {
      await page.getByRole('button', { name: '剪藏网页', exact: true }).click(); await page.getByRole('dialog').waitFor()
      await page.getByRole('textbox').last().fill('https://example.invalid/fixture')
      await page.getByRole('button', { name: '开始剪藏' }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' })
      assert(calls.some((c) => c.path === '/knowledge/clip' && c.method === 'POST'))
    })
    await check('successful upload refreshes documents; failed and dropped streams do not stay busy', async () => {
      const file = { name: '测试上传.txt', mimeType: 'text/plain', buffer: Buffer.from('isolated fixture') }
      await page.locator('input[type=file]').setInputFiles(file); await page.getByText('上传成功', { exact: true }).first().waitFor(); await page.locator('.knowledge-table tbody tr').filter({ hasText: '测试上传.txt' }).waitFor()
      for (const failure of ['upload-error', 'upload-dropped']) {
        mode = failure; await settled('/knowledge')
        const before = await page.evaluate(() => JSON.parse(localStorage.getItem('pet.config')).affection)
        await page.locator('input[type=file]').setInputFiles(file); await page.getByText('上传失败', { exact: true }).first().waitFor()
        assert.equal(await page.getByRole('button', { name: '上传文档', exact: true }).isEnabled(), true)
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pet.config')).affection), before)
      }
      mode = 'normal'; docs = structuredClone(initialDocs)
    })
    await check('graph keyboard selection, real connections, zoom and reset work', async () => {
      await settled('/graph')
      await page.locator('.knowledge-graph-node').nth(1).focus(); await page.keyboard.press('Enter')
      assert.match(await page.locator('.knowledge-graph-detail').innerText(), /产品设计复盘/)
      assert.equal(await page.locator('.knowledge-graph-detail li').count(), 2)
      assert.equal(await page.locator('.knowledge-graph-detail a').getAttribute('href'), '/notes/knowledge-test-1')
      await page.getByRole('button', { name: '放大图谱', exact: true }).click(); assert.equal(await page.locator('output').innerText(), '120%')
      await page.getByRole('button', { name: '重置视图', exact: true }).first().click(); assert.equal(await page.locator('output').innerText(), '100%')
      mode = 'dangling'; await settled('/graph'); assert.equal(await page.locator('.knowledge-graph-node').count(), 6)
    })
    await check('semantic retrieval stays manual and failures preserve usable graph', async () => {
      mode = 'semantic-error'; await settled('/graph')
      const previous = calls.filter((c) => c.path === '/note/graph' && c.query.includes('true')).length
      assert.equal(previous, 0)
      await page.getByRole('button', { name: '加载语义关联', exact: true }).click(); await page.getByRole('alert').waitFor()
      assert.equal(await page.locator('.knowledge-graph-node').count(), 6)
      mode = 'normal'; await page.getByRole('button', { name: '加载语义关联', exact: true }).click(); await page.getByRole('status').filter({ hasText: '语义关联已更新' }).waitFor()
    })
    await check('statistics retain all eleven metrics and real chart data after refresh failure', async () => {
      await settled('/stats'); assert.equal(await page.locator('.knowledge-stat-card').count(), 11)
      assert.match(await page.locator('.knowledge-stats-primary').innerText(), /48/)
      assert.equal(await page.locator('.knowledge-stats-charts svg').count(), 2)
      mode = 'error'; await page.getByRole('button', { name: '刷新数据', exact: true }).click(); await page.getByRole('alert').waitFor()
      assert.equal(await page.locator('.knowledge-stat-card').count(), 11)
      mode = 'normal'; await page.getByRole('button', { name: '重试', exact: true }).click(); await page.getByRole('alert').waitFor({ state: 'hidden' })
    })
    await check('dense graph keeps fifty notes reachable and supports panning', async () => {
      mode = 'dense'; await settled('/graph'); assert.equal(await page.locator('.knowledge-graph-node').count(), 50)
      await page.getByRole('combobox', { name: '选择笔记' }).selectOption('dense-49')
      assert.match(await page.locator('.knowledge-graph-detail h3').innerText(), /知识节点 49/)
      const svg = page.locator('.knowledge-graph-canvas > svg'), before = await svg.locator(':scope > g').getAttribute('transform'), rect = await svg.boundingBox()
      await page.mouse.move(rect.x + 8, rect.y + 60); await page.mouse.down(); await page.mouse.move(rect.x + 60, rect.y + 100, { steps: 5 }); await page.mouse.up()
      assert.notEqual(await svg.locator(':scope > g').getAttribute('transform'), before)
      await noOverflow(); mode = 'normal'
    })
    await check('plaza author/note links are separate, nullable tags safe and pagination deduplicated', async () => {
      await settled('/plaza'); assert.equal(await page.locator('.knowledge-public-note').count(), 4)
      assert.equal(await page.locator('.knowledge-public-author').first().getAttribute('href'), '/user/author-0')
      assert.equal(await page.locator('.knowledge-public-body').first().getAttribute('href'), '/share/knowledge-test-0')
      assert.doesNotMatch(await page.locator('.knowledge-public-body').first().innerText(), /##/)
      await page.getByRole('button', { name: '加载更多', exact: true }).click()
      await page.waitForFunction(() => document.querySelectorAll('.knowledge-public-note').length === 6)
      await page.getByRole('group', { name: '学习榜', exact: true }).getByRole('button', { name: '回顾', exact: true }).click()
      await page.getByText('本周回顾榜', { exact: true }).waitFor()
      await page.getByRole('button', { name: '查看完整榜单', exact: true }).click(); assert.equal(await page.locator('.knowledge-rank-all section').count(), 3)
    })
    await check('leaderboard failure is independent from public notes and retries', async () => {
      mode = 'rank-error'; await settled('/plaza'); await page.getByRole('alert').waitFor()
      assert.equal(await page.locator('.knowledge-public-note').count(), 4)
      mode = 'normal'; await page.getByRole('button', { name: '重试', exact: true }).click(); await page.locator('.knowledge-rank-list').waitFor()
    })
    await check('empty and failure states are distinct across knowledge pages', async () => {
      for (const route of ['/knowledge', '/graph', '/stats', '/plaza']) {
        mode = 'error'; await goto(route); await page.getByRole('alert').first().waitFor()
        assert.equal(await page.locator('.knowledge-empty').count(), 0, route)
        mode = 'normal'; await page.getByRole('button', { name: '重试', exact: true }).first().click(); await page.getByRole('alert').waitFor({ state: 'hidden' })
        mode = 'empty'; await goto(route)
        if (route === '/stats') { await page.locator('.knowledge-stat-card').first().waitFor(); assert.equal(await page.locator('.knowledge-stat-value').first().innerText(), '0') }
        else await page.locator('.knowledge-empty').waitFor()
        await snap(route.slice(1) + '-empty')
      }
      mode = 'normal'
    })
    await check('all five pages fit desktop, tablet, mobile and dark mode', async () => {
      for (const route of ['/notes', '/knowledge', '/graph', '/stats', '/plaza']) {
        await settled(route)
        for (const width of [1280, 900, 768, 390]) { await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 }); await noOverflow() }
        await snap(route.slice(1) + '-mobile')
        await page.setViewportSize({ width: 1536, height: 1080 }); await page.locator('html').evaluate((el) => el.classList.add('dark')); await noOverflow(); await snap(route.slice(1) + '-dark')
      }
    })
    await check('English labels remain readable without raw translation keys', async () => {
      lang = 'en-US'; await page.evaluate((language) => localStorage.setItem('language', language), lang)
      for (const route of ['/notes', '/knowledge', '/graph', '/stats', '/plaza']) { await settled(route); assert.doesNotMatch(await page.locator('main').innerText(), /knowledgeUI\./); await page.setViewportSize({ width: 390, height: 844 }); await noOverflow() }
    })
    await check('no render errors or unmocked application requests', async () => { assert.deepEqual(errors, []); assert.deepEqual(unexpected, []) })
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed, screenshotsUseIsolatedFixtures: true, errors, unexpected }, null, 2))
    console.log(passed.length + ' knowledge-page checks passed')
  } catch (error) { await snap('failure').catch(() => {}); console.error({ errors, unexpected }); throw error }
  finally { await browser.close() }
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
