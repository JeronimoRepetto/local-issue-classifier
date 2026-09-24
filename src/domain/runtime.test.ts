// Bugfix (2026-09-24): the Home card's "hosted page" hint was gated on
// `import.meta.env.DEV` alone, which is false for a production build served
// from the repo's own dev machine (`vite preview`, or a self-hosted static
// build on localhost) — so the hint incorrectly claimed the page was
// "hosted" even on localhost:5200. `isLocalRuntime` widens the check to
// "either Vite's dev server, or a loopback hostname", matching how
// docs/local-providers.md already defines "local" for the CORS/proxy rules.
import { describe, expect, it } from 'vitest'
import { isLocalRuntime } from './runtime'

describe('isLocalRuntime', () => {
  it('is local when Vite is in dev mode, regardless of hostname', () => {
    expect(isLocalRuntime({ dev: true, hostname: 'example.com' })).toBe(true)
    expect(isLocalRuntime({ dev: true, hostname: 'localhost' })).toBe(true)
  })

  it.each(['localhost', '127.0.0.1', '[::1]'])(
    'is local on %s even outside dev mode (a production build served locally, e.g. vite preview)',
    (hostname) => {
      expect(isLocalRuntime({ dev: false, hostname })).toBe(true)
    },
  )

  it('is not local for a real hostname outside dev mode', () => {
    expect(isLocalRuntime({ dev: false, hostname: 'example.com' })).toBe(false)
    expect(isLocalRuntime({ dev: false, hostname: 'my-app.pages.dev' })).toBe(false)
  })

  it('is case-sensitive-safe: only the exact loopback hostnames count as local', () => {
    expect(isLocalRuntime({ dev: false, hostname: 'notlocalhost' })).toBe(false)
    expect(isLocalRuntime({ dev: false, hostname: 'localhost.example.com' })).toBe(false)
  })
})
