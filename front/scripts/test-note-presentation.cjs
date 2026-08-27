const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../src/components/note/notePresentation.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } })
const exportsObject = {}
vm.runInNewContext(compiled.outputText, { exports: exportsObject })
const { categoryTone, notePreview, sortNotes } = exportsObject

assert.equal(categoryTone('study'), 'mint')
assert.equal(categoryTone('work'), 'amber')
assert.equal(categoryTone('project'), 'violet')
assert.equal(categoryTone('自定义分类'), 'neutral')
assert.equal(notePreview('# 标题\n\n**加粗**与[链接](https://example.invalid) ![配图](image.png)'), '标题 加粗与链接')
assert.equal(notePreview(''), '')
assert.equal(notePreview('a'.repeat(5000)).length, 220)
const notes = [
  { id: '1', title: 'Z', is_pinned: false, updated_at: '2026-08-27', created_at: '2026-08-20' },
  { id: '2', title: 'B', is_pinned: true, updated_at: '2026-08-20', created_at: '2026-08-25' },
  { id: '3', title: 'A', is_pinned: false, updated_at: '2026-08-25', created_at: '2026-08-26' },
]
const ids = (items) => Array.from(items, (note) => note.id).join(',')
assert.equal(ids(sortNotes(notes, 'updated_at')), '2,1,3')
assert.equal(ids(sortNotes(notes, 'created_at')), '2,3,1')
assert.equal(ids(sortNotes(notes, 'title')), '2,3,1')
assert.equal(ids(notes), '1,2,3')
const css = fs.readFileSync(path.join(__dirname, '../src/index.css'), 'utf8')
const luminance = (hex) => {
  const rgb = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
  const linear = rgb.map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722
}
const pairs = [
  ['--color-text', '--color-card'], ['--color-text-secondary', '--color-card'],
  ['--color-text-placeholder', '--color-card'], ['--color-accent', '--color-accent-bg'],
  ['--color-accent-foreground', '--color-accent'], ['--category-mint-text', '--category-mint-bg'],
  ['--category-amber-text', '--category-amber-bg'], ['--category-violet-text', '--category-violet-bg'],
  ['--category-rose-text', '--category-rose-bg'],
]
for (const selector of [/:root\s*\{([\s\S]*?)\}/, /\.dark\s*\{([\s\S]*?)\}/]) {
  const block = css.match(selector)[1]
  const tokens = Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[\da-f]{6});/gi)].map((match) => [match[1], match[2]]))
  for (const [foreground, background] of pairs) {
    const a = luminance(tokens[foreground]), b = luminance(tokens[background])
    const contrast = (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
    assert(contrast >= 4.5, foreground + ' on ' + background + ': ' + contrast.toFixed(2))
  }
}
console.log('PASS 29 presentation and theme-contrast assertions')
