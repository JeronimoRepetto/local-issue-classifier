// robots.txt and sitemap.xml (GitHub issue #8, docs/architecture.md "SEO"). Both ship from
// public/ verbatim (Vite's default publicDir behaviour), so `pnpm build:check`
// (tests/buildCheck.test.ts) is the integration check that a real `pnpm build` actually
// produces dist/robots.txt and dist/sitemap.xml. Before this task, the live
// https://issueclassifier.com/robots.txt and /sitemap.xml fell through to the SPA's
// index.html (200, text/html) because neither file existed under public/.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const ROBOTS = readFileSync(join(ROOT, 'public', 'robots.txt'), 'utf8')
const SITEMAP = readFileSync(join(ROOT, 'public', 'sitemap.xml'), 'utf8')

describe('public/robots.txt', () => {
  it('allows every crawler', () => {
    expect(ROBOTS).toMatch(/^User-agent:\s*\*/m)
    expect(ROBOTS).toMatch(/^Allow:\s*\/\s*$/m)
  })

  it('points at the sitemap by absolute URL', () => {
    expect(ROBOTS).toMatch(/^Sitemap:\s*https:\/\/issueclassifier\.com\/sitemap\.xml\s*$/m)
  })
})

/** Minimal, dependency-free sitemaps.org XML sanity check (same spirit as
 * tests/wranglerConfig.test.ts's hand-rolled JSONC strip: a real XML parser
 * would be more general, but this file's own shape is simple enough that a
 * small hand-rolled check catches a broken document without a new dependency). */
function parseSitemap(xml: string): { urlset: boolean; xmlns: string | null; urls: { loc: string; lastmod: string | null }[] } {
  const declMatch = /^<\?xml\s+version="1\.0"\s+encoding="UTF-8"\?>/.exec(xml.trim())
  if (!declMatch) throw new Error('sitemap.xml must start with an <?xml ...?> declaration')

  const urlsetMatch = /<urlset\s+xmlns="([^"]+)">([\s\S]*)<\/urlset>\s*$/.exec(xml.trim())
  if (!urlsetMatch) throw new Error('sitemap.xml must have a single top-level <urlset xmlns="..."> element')
  const [, xmlns, body] = urlsetMatch

  const urls: { loc: string; lastmod: string | null }[] = []
  const urlBlockRe = /<url>([\s\S]*?)<\/url>/g
  let m: RegExpExecArray | null
  while ((m = urlBlockRe.exec(body))) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(m[1])?.[1] ?? ''
    const lastmod = /<lastmod>([^<]+)<\/lastmod>/.exec(m[1])?.[1] ?? null
    urls.push({ loc, lastmod })
  }
  return { urlset: true, xmlns, urls }
}

describe('public/sitemap.xml', () => {
  it('is a valid sitemaps.org document (0.9 namespace)', () => {
    const doc = parseSitemap(SITEMAP)
    expect(doc.urlset).toBe(true)
    expect(doc.xmlns).toBe('http://www.sitemaps.org/schemas/sitemap/0.9')
  })

  it('lists exactly the production URL', () => {
    const doc = parseSitemap(SITEMAP)
    expect(doc.urls.map((u) => u.loc)).toEqual(['https://issueclassifier.com/'])
  })

  it('has a plain yyyy-mm-dd lastmod (docs/architecture.md explains how to update it)', () => {
    const doc = parseSitemap(SITEMAP)
    expect(doc.urls[0]?.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
