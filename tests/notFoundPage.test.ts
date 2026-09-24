// public/404.html (GitHub issue #8, docs/architecture.md "SEO"). The app has no path-based
// routing (no vue-router dependency, no History API push/replaceState beyond App.test.ts's own
// afterEach reset, view switching is in-memory state via src/composables/useView.ts) — every
// in-app view lives at `/`. Without a top-level 404.html, Cloudflare Pages assumes a SPA and
// serves index.html (200) for any unmatched path; a top-level 404.html disables that fallback
// and Pages returns a real 404 instead (developers.cloudflare.com/pages/configuration/serving-pages/:
// "If your project does not include a top-level 404.html file, Pages assumes that you are
// deploying a single-page application").
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const HTML = readFileSync(join(ROOT, 'public', '404.html'), 'utf8')

describe('public/404.html', () => {
  it('is small', () => {
    expect(HTML.length).toBeLessThan(4000)
  })

  it('is on-brand (names the product) and tells the visitor the page does not exist', () => {
    expect(HTML).toMatch(/Issue Classifier|local-issue-classifier/)
    expect(HTML.toLowerCase()).toMatch(/not found|doesn't exist|does not exist/)
  })

  it('links back home', () => {
    expect(HTML).toMatch(/<a\s+href="\/"[^>]*>/)
  })

  it('ships no script (a plain, dependency-free page)', () => {
    expect(HTML).not.toMatch(/<script/)
  })

  it('is marked noindex (a 404 page should never rank)', () => {
    expect(HTML).toMatch(/<meta\s+name="robots"\s+content="noindex"\s*\/?>/)
  })
})
