// LICENSE must stay the unmodified MIT text (regression, 2026-09-25). GitHub's
// licence detection compares the file with the canonical text; an extra note
// appended after it made the repository show "Other" (NOASSERTION) instead of
// MIT. Third-party notices live in THIRD_PARTY_NOTICES.md, linked from README.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const LICENSE = readFileSync(join(ROOT, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n').trim()
const LAST_MIT_LINE = 'SOFTWARE.'

describe('LICENSE', () => {
  it('is the MIT License with a copyright line', () => {
    expect(LICENSE.startsWith('MIT License\n\nCopyright (c) ')).toBe(true)
    expect(LICENSE).toContain('Permission is hereby granted, free of charge, to any person obtaining a copy')
  })

  it('ends with the MIT disclaimer, with nothing appended that would break licence detection', () => {
    expect(LICENSE.endsWith(`OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n${LAST_MIT_LINE}`)).toBe(true)
  })

  it('keeps the third-party notice discoverable from the README instead', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
    expect(readme).toContain('THIRD_PARTY_NOTICES.md')
  })
})
