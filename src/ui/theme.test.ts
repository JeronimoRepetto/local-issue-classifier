import { afterEach, describe, expect, it } from 'vitest'
import {
  DARK_SCHEME_QUERY,
  TOKEN_STYLE_ID,
  applyTheme,
  installTokenStylesheet,
  nextThemePreference,
  resolveTheme,
} from './theme'

type Listener = (event: { matches: boolean }) => void

function fakeMatchMedia(prefersDark: boolean) {
  const listeners = new Set<Listener>()
  const mql = {
    matches: prefersDark,
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  }
  return {
    listeners,
    matchMedia: (query: string) => {
      expect(query).toBe(DARK_SCHEME_QUERY)
      return mql as unknown as MediaQueryList
    },
    emit(matches: boolean) {
      mql.matches = matches
      listeners.forEach((l) => l({ matches }))
    },
  }
}

describe('resolveTheme', () => {
  it('follows the system for "system" and ignores it otherwise', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('nextThemePreference', () => {
  it('cycles system → light → dark → system', () => {
    expect(nextThemePreference('system')).toBe('light')
    expect(nextThemePreference('light')).toBe('dark')
    expect(nextThemePreference('dark')).toBe('system')
  })
})

describe('applyTheme', () => {
  afterEach(() => document.documentElement.removeAttribute('data-theme'))

  it('sets data-theme to the explicit preference without listening to the system', () => {
    const fake = fakeMatchMedia(true)
    applyTheme('light', { root: document.documentElement, matchMedia: fake.matchMedia })
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(fake.listeners.size).toBe(0)
  })

  it('tracks prefers-color-scheme for "system" until cleaned up', () => {
    const fake = fakeMatchMedia(false)
    const root = document.documentElement
    const cleanup = applyTheme('system', { root, matchMedia: fake.matchMedia })
    expect(root.dataset.theme).toBe('light')

    fake.emit(true)
    expect(root.dataset.theme).toBe('dark')

    cleanup()
    expect(fake.listeners.size).toBe(0)
    fake.emit(false)
    expect(root.dataset.theme).toBe('dark')
  })
})

describe('installTokenStylesheet', () => {
  it('injects the token stylesheet once', () => {
    const first = installTokenStylesheet(document)
    const second = installTokenStylesheet(document)
    expect(first).toBe(second)
    expect(document.querySelectorAll(`#${TOKEN_STYLE_ID}`)).toHaveLength(1)
    expect(first.textContent).toContain(':root[data-theme="dark"]')
    first.remove()
  })
})
