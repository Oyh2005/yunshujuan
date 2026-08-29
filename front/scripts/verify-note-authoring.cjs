/* Isolated visual and interaction checks for the note writing workspace.
 * Every API request is mocked so this script never changes a real account.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const baseURL = process.env.UI_BASE_URL || 'http://localhost:3000'
const output = path.resolve(__dirname, '../../.codex-checks/note-authoring')
const service = fs.readFileSync(path.resolve(__dirname, '../../backend/app/services/note_template_service.py'), 'utf8')
const literal = service.match(/DEFAULT_TEMPLATES = (\[[\s\S]*?\n\])/)
assert(literal, 'Backend default template fixtures must be present')

const templates = JSON.parse(literal[1].replace(/,\s*(?=[}\]])/g, '')).map((template, index) => ({
  ...template,
  id: `template-${index}`,
  user_id: 'ui-preview',
  is_default: true,
}))
const meetingTemplate = templates.find((template) => template.name === '会议纪要')
assert(meetingTemplate, 'The meeting template must be present')

const user = { id: 'ui-preview', username: '撰写页测试', email: 'preview@example.invalid' }
const existingNote = {
  id: 'editor-preview',
  user_id: user.id,
  title: '产品周会纪要',
  content: meetingTemplate.content,
  category: meetingTemplate.category,
  tags: ['周会', '产品'],
  is_public: false,
  is_pinned: false,
  created_at: '2026-08-29T08:00:00',
  updated_at: '2026-08-29T09:00:00',
}

async function run() {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'msedge' }),
  })
  const context = await browser.newContext({ viewport: { width: 1440, height: 940 }, locale: 'zh-CN', reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.setDefaultTimeout(12000)

  const checked = []
  const errors = []
  const unexpected = []
  const external = []
  page.on('pageerror', (error) => errors.push(error.message))

  await context.addInitScript((testUser) => {
    localStorage.setItem('user-store', JSON.stringify({
      state: { userInfo: testUser, token: 'ui-test-only', isLogin: true, userBio: '' },
      version: 0,
    }))
    localStorage.setItem('jwt_token', 'ui-test-only')
    localStorage.setItem('theme', JSON.stringify({ state: { theme: 'light' }, version: 0 }))
  }, user)

  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname
    const reply = (data, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ code: status, message: 'ok', data }),
    })

    if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) {
      return route.abort()
    }
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
      external.push(request.url())
      return route.abort()
    }
    if (pathname === '/note-template/list') return reply(templates)
    if (pathname === '/note/editor-preview') return reply(existingNote)
    if (pathname === '/note/editor-preview/related') return reply([])
    if (pathname === '/note/editor-preview/backlinks') return reply({ backlinks: [], outlinks: [] })
    if (pathname === '/note/list') return reply({ notes: [], total_count: 0 })
    if (pathname === '/note/stats') return reply({ total: 0, categories: [], uncategorized: 0 })
    if (pathname === '/social/notifications/unread-count') return reply({ count: 0 })
    if (pathname === '/social/chat/unread-count') return reply({ count: 0 })
    if (pathname === '/user/settings/') return reply({ pet_config: null, habit_config: null })
    if (pathname === '/user/detail/') return reply(user)
    if (pathname === '/note/autocomplete') return reply({ completion: null })
    if (url.origin === new URL(baseURL).origin && (
      pathname === '/icon.png' || ['document', 'script', 'stylesheet', 'font', 'image'].includes(request.resourceType())
    )) return route.continue()

    unexpected.push(`${request.method()} ${pathname}`)
    return reply(null, 400)
  })

  const check = async (name, work) => {
    await work()
    checked.push(name)
    console.log(`PASS ${name}`)
  }
  const noOverflow = async () => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.equal(await page.locator('.app-workspace').evaluate((element) => element.scrollWidth > element.clientWidth), false)
  }
  const expectPet = async () => {
    const pet = page.locator('.pet-root')
    await pet.waitFor()
    const box = await pet.boundingBox()
    assert(box && box.width > 0 && box.height > 0, 'The global companion must remain visible')
  }
  const expectFullScreenShell = async (sidebarWidth) => {
    const metrics = await page.locator('.app-shell').evaluate((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      const workspace = element.querySelector('.app-workspace')
      return {
        variant: element.classList.contains('is-note-authoring'),
        left: rect.left,
        top: rect.top,
        width: rect.width,
        viewport: innerWidth,
        padding: style.padding,
        gap: style.gap,
        workspaceRadius: getComputedStyle(workspace).borderRadius,
      }
    })
    const viewportWidth = page.viewportSize().width
    assert.deepEqual(metrics, { variant: true, left: 0, top: 0, width: viewportWidth, viewport: viewportWidth, padding: '0px', gap: '0px', workspaceRadius: '0px' })
    assert.equal(Math.round(await page.locator('.app-sidebar').evaluate((element) => element.getBoundingClientRect().width)), sidebarWidth)
  }
  const openNewMeetingNote = async () => {
    await page.goto(`${baseURL}/notes/new`)
    await page.getByRole('button', { name: '使用模板：会议纪要', exact: true }).click()
    await page.locator('.note-writing-page .ProseMirror').waitFor()
  }

  try {
    await openNewMeetingNote()
    await check('new-note writing surface keeps template content and desktop layout', async () => {
      assert.equal(await page.getByPlaceholder('未命名笔记', { exact: true }).inputValue(), meetingTemplate.title)
      assert.deepEqual(
        await page.locator('.note-writing-page .ProseMirror h2').allTextContents(),
        [...meetingTemplate.content.matchAll(/^## (.+)$/gm)].map((match) => match[1]),
      )
      await expectFullScreenShell(206)
      assert.equal(await page.locator('.note-writing-document').count(), 1)
      assert.equal(await page.getByRole('button', { name: '保存笔记', exact: true }).count(), 1)
      assert.equal(await page.locator('.note-writing-body > .w-60').isVisible(), true)
      assert.equal(await page.locator('.note-writing-inspector').isVisible(), true)
      const toolbarText = await page.locator('.tiptap-toolbar').innerText()
      for (const label of ['正文', '加粗', '任务', '代码块', '表格']) assert(toolbarText.includes(label), label)
      await expectPet()
      await noOverflow()
      await page.screenshot({ path: path.join(output, 'editor-desktop.png'), fullPage: true })
    })

    await check('outline panel remains reachable and aligned with the writing surface', async () => {
      const firstHeading = meetingTemplate.content.match(/^## (.+)$/m)?.[1]
      assert(firstHeading, 'The meeting template must include an outline heading')
      assert.equal(await page.getByText(firstHeading, { exact: true }).count() > 0, true)
      await page.getByTitle('目录', { exact: true }).click()
      assert.equal(await page.locator('.note-writing-body > .w-60').count(), 0)
      await page.getByTitle('目录', { exact: true }).click()
      assert.equal(await page.locator('.note-writing-body > .w-60').isVisible(), true)
      await noOverflow()
      await page.screenshot({ path: path.join(output, 'editor-outline.png'), fullPage: true })
    })

    await page.goto(`${baseURL}/notes/editor-preview`)
    await page.locator('.note-writing-page .ProseMirror').waitFor()
    await check('existing-note auxiliary actions and dialogs remain reachable', async () => {
      assert.equal(await page.getByPlaceholder('未命名笔记', { exact: true }).inputValue(), existingNote.title)
      await page.getByTitle('关联片段', { exact: true }).click()
      assert.equal(await page.locator('.note-writing-body > .w-80 h2').filter({ hasText: '关联片段' }).count() > 0, true)
      await page.getByTitle('反向链接', { exact: true }).click()
      assert.equal(await page.locator('.note-writing-body > .w-80 h2').filter({ hasText: '反向链接' }).count() > 0, true)

      await page.getByRole('button', { name: '分享', exact: true }).click()
      await page.getByRole('heading', { name: '分享笔记', exact: true }).waitFor()
      await page.getByRole('button', { name: '取消', exact: true }).click()

      await page.getByRole('button', { name: '更多', exact: true }).click()
      await page.getByRole('menuitem', { name: '存为模板', exact: true }).click()
      await page.getByRole('heading', { name: '保存为模板', exact: true }).waitFor()
      await page.getByRole('button', { name: '取消', exact: true }).click()
      await expectPet()
      await noOverflow()
      await page.screenshot({ path: path.join(output, 'editor-panels.png'), fullPage: true })
    })

    await check('dark writing surface remains readable', async () => {
      await page.locator('html').evaluate((element) => element.classList.add('dark'))
      await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--color-card').trim().length > 0)
      await noOverflow()
      await expectPet()
      await page.screenshot({ path: path.join(output, 'editor-dark.png'), fullPage: true })
      await page.locator('html').evaluate((element) => element.classList.remove('dark'))
    })

    await check('mobile writing surface keeps the 56px rail, controls and companion visible', async () => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`${baseURL}/notes/editor-preview`)
      await page.locator('.note-writing-page .ProseMirror').waitFor()
      await expectFullScreenShell(56)
      assert.equal(await page.getByRole('button', { name: '保存笔记', exact: true }).count(), 1)
      assert.equal(await page.locator('.note-writing-body > .w-60').count(), 0)
      await expectPet()
      await noOverflow()
      await page.screenshot({ path: path.join(output, 'editor-mobile.png'), fullPage: true })
    })

    await check('no browser exceptions, external requests or unexpected API calls', async () => {
      assert.deepEqual(errors, [])
      assert.deepEqual(external, [])
      assert.deepEqual(unexpected, [])
    })

    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ checked, errors, unexpected, external }, null, 2))
    console.log(`${checked.length} isolated note-authoring checks passed. Screenshots: ${output}`)
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {})
    console.error({ errors, unexpected, external })
    throw error
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
