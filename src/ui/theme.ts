// Theme switching (SPEC §10.2): the preference is 'system' | 'light' | 'dark';
// the resolved theme lands on `<html data-theme>`, which the token CSS keys on.
import { buildStylesheet, tokens } from './tokens'
import type { ThemeName } from './tokens'

export type ThemePreference = 'system' | ThemeName

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark']
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'
export const TOKEN_STYLE_ID = 'ic-design-tokens'

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ThemeName {
  if (preference !== 'system') return preference
  return systemPrefersDark ? 'dark' : 'light'
}

/** Order used by the top-bar toggle. */
export function nextThemePreference(preference: ThemePreference): ThemePreference {
  const i = THEME_PREFERENCES.indexOf(preference)
  return THEME_PREFERENCES[(i + 1) % THEME_PREFERENCES.length]
}

export interface ThemeEnvironment {
  root: HTMLElement
  matchMedia?: (query: string) => MediaQueryList
}

/**
 * Writes the resolved theme to `root.dataset.theme`. For 'system' it keeps
 * following `prefers-color-scheme`; call the returned function to stop.
 */
export function applyTheme(preference: ThemePreference, env: ThemeEnvironment): () => void {
  const mql = env.matchMedia?.(DARK_SCHEME_QUERY)
  env.root.dataset.theme = resolveTheme(preference, mql?.matches ?? false)
  if (preference !== 'system' || !mql) return () => {}
  const onChange = (event: { matches: boolean }) => {
    env.root.dataset.theme = resolveTheme('system', event.matches)
  }
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

/** Injects the generated token stylesheet into `<head>` once (bundled, no CDN). */
export function installTokenStylesheet(doc: Document): HTMLStyleElement {
  const existing = doc.getElementById(TOKEN_STYLE_ID)
  if (existing instanceof HTMLStyleElement) return existing
  const style = doc.createElement('style')
  style.id = TOKEN_STYLE_ID
  style.textContent = buildStylesheet(tokens)
  doc.head.appendChild(style)
  return style
}
