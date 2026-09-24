// Vitest setup (vite.config.ts `test.setupFiles`): no test may reach the real
// network. The app now probes local Kev/JevK5 servers on load and when Home is
// shown (docs/local-providers.md "Connection status"); useProvider's default
// fetch goes through globalThis.fetch, so it is replaced with a rejection that
// reads like "nothing is listening". Tests that need answers inject their own
// fake with configureProvider({ fetch }) or the adapters' own fetch options.
// Node-environment tests (tests/server/*, which talk to their own fake
// upstream on an ephemeral port) keep the real fetch.
import { beforeEach, vi } from 'vitest'

beforeEach(() => {
  if (typeof window === 'undefined') return
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Network access is disabled in tests')))
})
