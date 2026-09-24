// Static crawlable content inside `<div id="app">` (GitHub issue #8, docs/architecture.md
// "SEO"). `src/main.ts` calls `createApp(App).mount('#app')`, and Vue replaces the target
// element's children on mount (this is not a hydration call — the Vue docs are explicit that
// "the container's content will be replaced"), so this markup is only ever seen by a client
// that does not run the module script: a crawler that skips JS, or a human during the brief
// window before `main.ts` finishes mounting. `src/App.test.ts` has the companion regression
// test that a real `createApp().mount()` over this exact markup leaves exactly one `<h1>`
// (HomeContainer's own), so a crawler that DOES run JS never sees two.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8')
const APP_HTML = /<div id="app">([\s\S]*?)<\/div>/.exec(HTML)?.[1] ?? ''

describe('static fallback content inside #app', () => {
  it('exists (the div is not left empty)', () => {
    expect(APP_HTML.trim().length).toBeGreaterThan(0)
  })

  it('has exactly one <h1> describing the app', () => {
    const h1s = APP_HTML.match(/<h1[^>]*>/g) ?? []
    expect(h1s).toHaveLength(1)
  })

  it('explains what it does in plain paragraphs: rates issues by criticality/complexity/effort/relevance and keeps keys in the browser', () => {
    expect(APP_HTML).toMatch(/<p>/)
    const text = APP_HTML.toLowerCase()
    expect(text).toContain('criticality')
    expect(text).toContain('effort')
    expect(text).toContain('relevance')
    expect(text).toContain('browser')
  })

  it('describes where keys go accurately: GitHub token to GitHub, model keys to the chosen model', () => {
    const text = APP_HTML.replace(/\s+/g, ' ').toLowerCase()
    expect(text).not.toContain('nothing is sent anywhere')
    expect(text).toContain("github's api")
    expect(text).toContain('model you choose')
  })

  it('lists every export format the app offers', () => {
    const text = APP_HTML.toLowerCase()
    for (const format of ['plain text', 'markdown', 'html']) expect(text).toContain(format)
  })

  it('has no inline style or event-handler attributes (plain markup only)', () => {
    expect(APP_HTML).not.toMatch(/\sstyle=/)
    expect(APP_HTML).not.toMatch(/\son[a-z]+=/i)
  })

  it('has no nested <div> (keeps this file\'s #app-closing-tag regex unambiguous)', () => {
    expect(APP_HTML).not.toMatch(/<div/)
  })
})
