/* Isolated regression checks for /notes/new. Every API call is mocked.
 * Run against the frontend dev server with PLAYWRIGHT_MODULE set to Playwright.
 * Default templates are read from the backend source, never from the real database.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.UI_BASE_URL || 'http://localhost:3000'
const output = path.resolve(__dirname, '../../.codex-checks/template-previews')
const service = fs.readFileSync(path.resolve(__dirname, '../../backend/app/services/note_template_service.py'), 'utf8')
const literal = service.match(/DEFAULT_TEMPLATES = (\[[\s\S]*?\n\])/)
assert(literal, 'Backend default template fixtures must be present')
const defaults = JSON.parse(literal[1].replace(/,\s*(?=[}\]])/g, '')).map((template, index) => ({
  ...template, id: 'template-' + index, user_id: 'ui-preview', is_default: true,
}))
assert.equal(defaults.length, 6)

async function run() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'msedge' }) })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  const errors = [], unexpected = [], checked = [], saves = [], external = []
  let templates = structuredClone(defaults)
  const user = { id: 'ui-preview', username: '模板测试', email: 'preview@example.invalid' }
  let savedNote
  page.on('pageerror', (error) => errors.push(error.message))
  await context.addInitScript((testUser) => {
    // Only this fresh, disposable browser context receives fake login state.
    localStorage.setItem('user-store', JSON.stringify({ state: { userInfo: testUser, token: 'ui-test-only', isLogin: true, userBio: '' }, version: 0 }))
    localStorage.setItem('jwt_token', 'ui-test-only')
    localStorage.setItem('theme', JSON.stringify({ state: { theme: 'light' }, version: 0 }))
  }, user)
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
      external.push(request.url())
      return route.abort()
    }
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status, message: 'ok', data }) })
    if (pathname === '/note-template/list') return reply(templates)
    if (pathname === '/note/list') return reply({ notes: [], total_count: 0 })
    if (pathname === '/note/stats') return reply({ total: 0, categories: [], uncategorized: 0 })
    if (pathname === '/social/notifications/unread-count') return reply({ count: 0 })
    if (pathname === '/user/settings/') return reply({ pet_config: null, habit_config: null })
    if (pathname === '/user/detail/') return reply(user)
    if (pathname === '/note/autocomplete') return reply({ completion: null })
    if (pathname === '/note/create' && request.method() === 'POST') {
      saves.push(request.postDataJSON())
      savedNote = { ...saves.at(-1), id: 'template-result', user_id: user.id, created_at: '2026-08-27T10:00:00', updated_at: '2026-08-27T10:00:00' }
      return reply(savedNote)
    }
    if (pathname === '/note/template-result') return reply(savedNote)
    if (/^\/note\/[^/]+\/related$/.test(pathname)) return reply([])
    if (/^\/note\/[^/]+\/backlinks$/.test(pathname)) return reply({ backlinks: [], outlinks: [] })
    // Only local static frontend resources may go through to the server.
    if (url.origin === new URL(baseURL).origin && (pathname === '/icon.png' || ['document', 'script', 'stylesheet', 'font', 'image'].includes(request.resourceType()))) return route.continue()
    unexpected.push(request.method() + ' ' + pathname)
    return reply(null, 400)
  })
  const check = async (name, work) => { await work(); checked.push(name); console.log('PASS ' + name) }
  const card = (name) => page.getByRole('button', { name: '使用模板：' + name, exact: true })
  const openPicker = async () => {
    await page.goto(baseURL + '/notes/new')
    await card(templates[0].name).waitFor()
  }
  const noOverflow = async () => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.equal(await page.locator('main').evaluate((el) => el.scrollWidth > el.clientWidth), false)
  }
  const waitForTheme = async () => {
    await page.waitForFunction(() => {
      const color = getComputedStyle(document.documentElement).getPropertyValue('--color-card').trim()
      const rgb = color.slice(1).match(/../g).map((channel) => parseInt(channel, 16))
      const button = document.querySelector('button[aria-label^="使用模板："]')
      return getComputedStyle(button).backgroundColor === `rgb(${rgb.join(', ')})`
    })
  }
  try {
    await openPicker()
    await check('all six defaults render headings, emphasis, lists and GFM without raw markup', async () => {
      assert.equal(await page.getByRole('button', { name: /^使用模板：/ }).count(), 6)
      assert.equal(await card('空白笔记').locator('.template-preview').count(), 0)
      for (const template of defaults.filter((item) => item.content)) {
        const preview = card(template.name).locator('.template-preview')
        assert.equal(await preview.count(), 1)
        assert.deepEqual(await preview.locator('h2').allTextContents(), [...template.content.matchAll(/^## (.+)$/gm)].map((match) => match[1]))
        assert.doesNotMatch(await preview.innerText(), /##|\*\*|\[ \]|\|------/)
      }
      assert.deepEqual(await card('会议纪要').locator('strong').allTextContents(), ['时间', '参与人', '主题'])
      assert.equal(await card('项目计划').locator('table').count(), 1)
      assert.match(await card('日记').locator('.template-preview').textContent(), /☐/)
      assert.equal(await page.locator('.template-preview :is(a, input, button, img)').count(), 0)
      await noOverflow()
      await page.screenshot({ path: path.join(output, 'desktop.png') })
    })
    await check('template manager shares rendered previews and retains editable Markdown source', async () => {
      await page.getByRole('button', { name: '管理模板', exact: true }).click()
      await page.getByRole('heading', { name: '管理模板', exact: true }).waitFor()
      assert.equal(await page.locator('.template-preview--compact').count(), 5)
      assert.doesNotMatch((await page.locator('.template-preview--compact').allInnerTexts()).join('\n'), /##|\*\*|\[ \]|\|------/)
      for (let index = 0; index < defaults.length; index++) {
        await page.getByRole('button', { name: '编辑', exact: true }).nth(index).click()
        assert.equal(await page.locator('textarea').inputValue(), defaults[index].content)
        await page.getByRole('button', { name: '返回', exact: true }).click()
      }
      await page.screenshot({ path: path.join(output, 'manager.png') })
    })
    for (const template of defaults) {
      await check('apply and save original source: ' + template.name, async () => {
        await openPicker()
        await card(template.name).focus()
        await page.keyboard.press('Enter')
        const editor = page.locator('.ProseMirror')
        await editor.waitFor()
        assert.equal(await editor.getAttribute('contenteditable'), 'true')
        assert.equal(await page.getByPlaceholder('未命名笔记', { exact: true }).inputValue(), template.title)
        assert.deepEqual(await editor.locator('h2').allTextContents(), [...template.content.matchAll(/^## (.+)$/gm)].map((match) => match[1]))
        if (template.name === '项目计划') assert.equal(await editor.locator('table').count(), 1)
        if (!template.content) await page.getByPlaceholder('未命名笔记', { exact: true }).fill('空白模板测试')
        await page.getByRole('button', { name: '保存', exact: true }).click()
        await page.waitForURL('**/notes/template-result')
        assert.equal(saves.at(-1).content, template.content)
        assert.deepEqual(saves.at(-1).tags, template.tags)
        assert.equal(saves.at(-1).category || '', template.category)
      })
    }
    await check('long/custom Markdown remains complete, non-interactive and sanitized', async () => {
      const longBold = '完整的加粗内容'.repeat(30)
      templates = [{ ...defaults[1], id: 'custom', name: '自定义预览测试', content: `## 自定义标题\n\n**${longBold}**\n\n- [x] 已完成\n- [ ] 待完成\n\n| 字段 | 值 |\n| --- | --- |\n| 状态 | 正常 |\n\n[安全链接](https://example.invalid/track-preview)\n\n![图片](https://example.invalid/track-preview.png)\n\n<script>window.__templatePreviewExecuted = true</script>\n<img src="https://example.invalid/track-preview.jpg" onerror="window.__templatePreviewExecuted = true">\n` }]
      await openPicker()
      const preview = card(templates[0].name).locator('.template-preview')
      assert.equal(await preview.locator('strong').textContent(), longBold)
      assert.equal(await preview.locator('table th').count(), 2)
      assert.match(await preview.textContent(), /☑.*已完成/s)
      assert.match(await preview.textContent(), /☐.*待完成/s)
      assert.match(await preview.textContent(), /安全链接/)
      assert.equal(await preview.locator('a, input, button, img, script, iframe, style').count(), 0)
      assert.equal(await preview.locator('*').evaluateAll((elements) => elements.some((el) => el.attributes.length > 0)), false)
      assert.equal(await page.evaluate(() => window.__templatePreviewExecuted), undefined)
      assert.equal(external.some((url) => url.includes('track-preview')), false)
      assert.equal(await preview.evaluate((el) => el.clientHeight <= parseFloat(getComputedStyle(el).lineHeight) * 4 + 1), true)
      await noOverflow()
    })
    await check('short and whitespace-only previews do not add a false ellipsis', async () => {
      templates = [
        { ...defaults[0], name: '短模板', content: '**短内容**' },
        { ...defaults[1], name: '空内容', content: ' \n\n ' },
      ]
      await openPicker()
      assert.equal(await card('短模板').locator('.template-preview').innerText(), '短内容')
      assert.equal(await card('空内容').locator('.template-preview').count(), 0)
    })
    await check('dark and mobile layouts remain readable without horizontal overflow', async () => {
      templates = structuredClone(defaults)
      await openPicker()
      await page.locator('html').evaluate((el) => el.classList.add('dark'))
      await waitForTheme()
      await noOverflow()
      await page.screenshot({ path: path.join(output, 'dark.png') })
      await page.locator('html').evaluate((el) => el.classList.remove('dark'))
      await waitForTheme()
      await page.setViewportSize({ width: 390, height: 844 })
      await noOverflow()
      const first = await card(defaults[0].name).boundingBox()
      const second = await card(defaults[1].name).boundingBox()
      assert(second.y >= first.y + first.height)
      await page.screenshot({ path: path.join(output, 'mobile.png') })
    })
    await check('no browser exceptions or unhandled API requests', async () => {
      assert.deepEqual(errors, [])
      assert.deepEqual(unexpected, [])
      assert.equal(saves.length, 6)
    })
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ checked, errors, unexpected, mockSaveCount: saves.length }, null, 2))
    console.log(`${checked.length} isolated template preview checks passed. Screenshots: ${output}`)
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
    console.error({ errors, unexpected })
    throw error
  } finally {
    await browser.close()
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
