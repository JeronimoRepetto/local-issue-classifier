// Wraps domain/runtime.ts's isLocalRuntime with the real `import.meta.env.DEV`
// / `location.hostname` globals, with both overridable (ProviderOnboardingCard
// passes them through its own `isDev`/`hostname` test props — see its test).
import { describe, expect, it } from 'vitest'
import { useRuntime } from './useRuntime'

describe('useRuntime', () => {
  it('defaults to the real import.meta.env.DEV and location.hostname (both local under vitest)', () => {
    const runtime = useRuntime()
    expect(runtime.dev).toBe(true) // vitest runs with Vite's dev mode
    expect(runtime.hostname).toBe('localhost') // happy-dom's default location
    expect(runtime.isLocal.value).toBe(true)
  })

  it('is local when overridden dev=true, regardless of hostname', () => {
    expect(useRuntime({ dev: true, hostname: 'example.com' }).isLocal.value).toBe(true)
  })

  it('is local when overridden hostname is loopback, even with dev=false', () => {
    expect(useRuntime({ dev: false, hostname: 'localhost' }).isLocal.value).toBe(true)
    expect(useRuntime({ dev: false, hostname: '127.0.0.1' }).isLocal.value).toBe(true)
  })

  it('is not local for a real hostname with dev=false', () => {
    expect(useRuntime({ dev: false, hostname: 'example.com' }).isLocal.value).toBe(false)
  })
})
