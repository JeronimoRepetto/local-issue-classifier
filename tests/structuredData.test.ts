// Canonical URL and JSON-LD structured data (GitHub issue #8, docs/architecture.md "SEO").
//
// The JSON-LD block is a `<script type="application/ld+json">` data island, not executable
// JavaScript: the CSP `script-src` directive (index.html, public/_headers) only governs sources
// that could execute as script (inline handlers, `<script>` elements the UA would run, XSLT
// stylesheets — developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src).
// A `<script>` element whose `type` is not a JavaScript MIME type (the HTML spec's "JavaScript
// MIME type essence match", https://mimesniff.spec.whatwg.org/#javascript-mime-type) is never
// executed by the browser in the first place, so `script-src` has nothing to gate; this is the
// same mechanism Google's own structured-data guidance relies on when it tells sites to ship
// JSON-LD under a strict CSP. No CSP change is needed or made here.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8')

function metaContent(attr: 'property' | 'name', key: string): string | undefined {
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`)
  return re.exec(HTML)?.[1]
}

describe('canonical URL', () => {
  it('declares https://issueclassifier.com/ as canonical', () => {
    expect(HTML).toContain('<link rel="canonical" href="https://issueclassifier.com/" />')
  })
})

describe('JSON-LD structured data', () => {
  const scriptMatch = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(HTML)

  it('is present as its own <script type="application/ld+json"> element', () => {
    expect(scriptMatch).not.toBeNull()
  })

  it('parses as JSON', () => {
    expect(() => JSON.parse(scriptMatch![1])).not.toThrow()
  })

  const data = scriptMatch ? JSON.parse(scriptMatch[1]) : undefined

  it('is a free, web-based SoftwareApplication named Issue Classifier', () => {
    expect(data['@context']).toBe('https://schema.org')
    expect(data['@type']).toBe('SoftwareApplication')
    expect(data.name).toBe('Issue Classifier')
    expect(data.url).toBe('https://issueclassifier.com/')
    expect(data.applicationCategory).toBe('DeveloperApplication')
    expect(data.operatingSystem).toBe('Web browser')
    expect(data.isAccessibleForFree).toBe(true)
    expect(data.offers).toMatchObject({ '@type': 'Offer', price: '0' })
  })

  it('names the MIT license and the GitHub repository', () => {
    expect(data.license).toBe('https://opensource.org/licenses/MIT')
    expect(data.codeRepository).toBe('https://github.com/JeronimoRepetto/local-issue-classifier')
    expect(data.sameAs).toBe('https://github.com/JeronimoRepetto/local-issue-classifier')
  })

  it('describes itself with the same copy as og:description and the meta description (tests/linkPreview.test.ts)', () => {
    expect(data.description).toBe(metaContent('name', 'description'))
    expect(data.description).toBe(metaContent('property', 'og:description'))
  })
})
