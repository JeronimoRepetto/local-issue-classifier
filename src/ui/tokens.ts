// Design tokens (SPEC §10.2). A typed, pure object; `tokensToCss` turns it into
// CSS custom properties scoped to `:root[data-theme=light|dark]`. This is the only
// file in `src/` allowed to hold raw colors, pixel sizes and durations.

export const THEMES = ['light', 'dark'] as const
export type ThemeName = (typeof THEMES)[number]

export const COLOR_ROLES = [
  'bg',
  'surface',
  'surface-2',
  'border',
  'border-strong',
  'text',
  'text-muted',
  'accent',
  'accent-hover',
  'accent-soft',
  'on-accent',
  'success',
  'warning',
  'danger',
  'danger-hover',
  'info',
  'on-danger',
  'inverse-surface',
  'on-inverse',
  'level-high-fg',
  'level-high-bg',
  'level-medium-fg',
  'level-medium-bg',
  'level-low-fg',
  'level-low-bg',
  'scale-1',
  'scale-2',
  'scale-3',
  'scale-4',
  'scale-5',
] as const
export type ColorRole = (typeof COLOR_ROLES)[number]

export interface TypeStep {
  size: number
  lineHeight: number
}

export interface Tokens {
  color: Record<ThemeName, Record<ColorRole, string>>
  /** Scrim behind dialogs; alpha color, so it is outside the contrast pairs. */
  overlay: Record<ThemeName, string>
  elevation: Record<ThemeName, { 1: string; 2: string; 3: string }>
  space: Record<1 | 2 | 3 | 4 | 5 | 6 | 7, number>
  size: { compact: number; default: number; large: number; row: number }
  icon: { sm: number; md: number; lg: number }
  radius: { sm: number; md: number; lg: number; pixel: number; round: number }
  line: { thin: number; thick: number }
  font: { sans: string; pixel: string; mono: string }
  type: Record<'caption' | 'table' | 'body' | 'h3' | 'h2' | 'h1', TypeStep>
  weight: { regular: number; medium: number; semibold: number }
  duration: { fast: number; base: number; slow: number }
  /** Upper bound for opacity fades under `prefers-reduced-motion` (SPEC §10.6). */
  reducedFadeCap: number
  easing: { out: string; in: string; standard: string; pixel: string }
  motion: { shift: number; scale: number }
  z: { popover: number; toast: number; dialog: number }
  /** Largest width used by popovers, tooltips and toasts. */
  measure: { tooltip: number; popover: number; toast: number; dialog: number }
}

export const tokens: Tokens = {
  color: {
    light: {
      bg: '#F7F7FA',
      surface: '#FFFFFF',
      'surface-2': '#F0F1F5',
      border: '#DADCE5',
      'border-strong': '#7E8494',
      text: '#16181D',
      'text-muted': '#5B6070',
      accent: '#4B4BC8',
      'accent-hover': '#3B3BA8',
      'accent-soft': '#ECECFB',
      'on-accent': '#FFFFFF',
      success: '#1E6B3A',
      warning: '#8A5A00',
      danger: '#A3261D',
      'danger-hover': '#861E17',
      info: '#1F5BB8',
      'on-danger': '#FFFFFF',
      'inverse-surface': '#16181D',
      'on-inverse': '#F7F7FA',
      'level-high-fg': '#A3261D',
      'level-high-bg': '#FDE7E4',
      'level-medium-fg': '#7A5000',
      'level-medium-bg': '#FFF1D6',
      'level-low-fg': '#1E6B3A',
      'level-low-bg': '#E3F4E8',
      'scale-1': '#8B8BDB',
      'scale-2': '#6F6FD2',
      'scale-3': '#5A5ACB',
      'scale-4': '#4B4BC8',
      'scale-5': '#3B3BA8',
    },
    dark: {
      bg: '#111318',
      surface: '#1A1D24',
      'surface-2': '#232733',
      border: '#333848',
      'border-strong': '#6B7186',
      text: '#ECEEF3',
      'text-muted': '#A3A9B8',
      accent: '#9A9AF2',
      'accent-hover': '#B4B4F7',
      'accent-soft': '#26284A',
      'on-accent': '#111318',
      success: '#7FD69B',
      warning: '#F5C56B',
      danger: '#FF9C92',
      'danger-hover': '#FFB7AF',
      info: '#8DB8FF',
      'on-danger': '#111318',
      'inverse-surface': '#ECEEF3',
      'on-inverse': '#111318',
      'level-high-fg': '#FF9C92',
      'level-high-bg': '#3A1A18',
      'level-medium-fg': '#F5C56B',
      'level-medium-bg': '#3A2C10',
      'level-low-fg': '#7FD69B',
      'level-low-bg': '#15301F',
      'scale-1': '#5E5EB8',
      'scale-2': '#7070CC',
      'scale-3': '#8A8AE4',
      'scale-4': '#9A9AF2',
      'scale-5': '#B4B4F7',
    },
  },
  overlay: {
    light: 'rgba(22, 24, 29, 0.4)',
    dark: 'rgba(0, 0, 0, 0.6)',
  },
  elevation: {
    light: {
      1: '0 1px 2px rgba(22, 24, 29, 0.06), 0 1px 3px rgba(22, 24, 29, 0.08)',
      2: '0 4px 12px rgba(22, 24, 29, 0.1), 0 2px 4px rgba(22, 24, 29, 0.06)',
      3: '0 16px 40px rgba(22, 24, 29, 0.16), 0 4px 12px rgba(22, 24, 29, 0.08)',
    },
    dark: {
      1: '0 1px 2px rgba(0, 0, 0, 0.3)',
      2: '0 4px 12px rgba(0, 0, 0, 0.35)',
      3: '0 16px 40px rgba(0, 0, 0, 0.45)',
    },
  },
  space: { 1: 4, 2: 8, 3: 16, 4: 24, 5: 32, 6: 48, 7: 64 },
  size: { compact: 32, default: 40, large: 48, row: 40 },
  icon: { sm: 16, md: 24, lg: 32 },
  radius: { sm: 4, md: 8, lg: 12, pixel: 0, round: 999 },
  line: { thin: 1, thick: 2 },
  font: {
    sans: "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    pixel: "Silkscreen, ui-monospace, 'Cascadia Mono', Consolas, monospace",
    mono: "ui-monospace, 'Cascadia Mono', Consolas, monospace",
  },
  type: {
    caption: { size: 12, lineHeight: 16 },
    table: { size: 14, lineHeight: 20 },
    body: { size: 16, lineHeight: 24 },
    h3: { size: 20, lineHeight: 28 },
    h2: { size: 24, lineHeight: 32 },
    h1: { size: 32, lineHeight: 40 },
  },
  weight: { regular: 400, medium: 500, semibold: 600 },
  duration: { fast: 120, base: 200, slow: 320 },
  reducedFadeCap: 80,
  easing: {
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    pixel: 'steps(4, end)',
  },
  motion: { shift: 4, scale: 0.98 },
  z: { popover: 20, toast: 30, dialog: 40 },
  measure: { tooltip: 280, popover: 360, toast: 400, dialog: 520 },
}

export type ContrastKind = 'text' | 'ui'

export interface ContrastPair {
  fg: ColorRole
  bg: ColorRole
  /** `text` needs 4.5:1; `ui` (borders, focus rings, scale bars) needs 3:1. */
  kind: ContrastKind
}

const TEXT_ON_SURFACES: ColorRole[] = [
  'text',
  'text-muted',
  'accent',
  'success',
  'warning',
  'danger',
  'info',
]
const SURFACES: ColorRole[] = ['bg', 'surface', 'surface-2']

/**
 * Every foreground/background pair the kit renders. The decorative `border`
 * (dividers, card outlines) is intentionally absent: WCAG 1.4.11 only requires
 * 3:1 for boundaries needed to identify a control, which use `border-strong`.
 */
export const CONTRAST_PAIRS: ContrastPair[] = [
  ...TEXT_ON_SURFACES.flatMap((fg) => SURFACES.map((bg) => ({ fg, bg, kind: 'text' as const }))),
  { fg: 'text', bg: 'accent-soft', kind: 'text' },
  { fg: 'accent', bg: 'accent-soft', kind: 'text' },
  { fg: 'on-accent', bg: 'accent', kind: 'text' },
  { fg: 'on-accent', bg: 'accent-hover', kind: 'text' },
  { fg: 'on-danger', bg: 'danger', kind: 'text' },
  { fg: 'on-danger', bg: 'danger-hover', kind: 'text' },
  { fg: 'on-inverse', bg: 'inverse-surface', kind: 'text' },
  { fg: 'level-high-fg', bg: 'level-high-bg', kind: 'text' },
  { fg: 'level-medium-fg', bg: 'level-medium-bg', kind: 'text' },
  { fg: 'level-low-fg', bg: 'level-low-bg', kind: 'text' },
  ...SURFACES.map((bg) => ({ fg: 'border-strong' as const, bg, kind: 'ui' as const })),
  ...SURFACES.map((bg) => ({ fg: 'accent' as const, bg, kind: 'ui' as const })),
  ...(['scale-1', 'scale-2', 'scale-3', 'scale-4', 'scale-5'] as const).map((fg) => ({
    fg,
    bg: 'surface' as const,
    kind: 'ui' as const,
  })),
]

const px = (n: number) => `${n}px`
const ms = (n: number) => `${n}ms`

function themeVariables(t: Tokens, theme: ThemeName): [string, string][] {
  const vars: [string, string][] = []
  for (const role of COLOR_ROLES) vars.push([`--color-${role}`, t.color[theme][role]])
  vars.push(['--color-overlay', t.overlay[theme]])
  for (const level of [1, 2, 3] as const) vars.push([`--elev-${level}`, t.elevation[theme][level]])
  for (const [k, v] of Object.entries(t.space)) vars.push([`--space-${k}`, px(v)])
  for (const [k, v] of Object.entries(t.size)) vars.push([`--size-${k}`, px(v)])
  for (const [k, v] of Object.entries(t.icon)) vars.push([`--icon-${k}`, px(v)])
  for (const [k, v] of Object.entries(t.radius)) vars.push([`--radius-${k}`, px(v)])
  for (const [k, v] of Object.entries(t.line)) vars.push([`--line-${k}`, px(v)])
  for (const [k, v] of Object.entries(t.font)) vars.push([`--font-${k}`, v])
  for (const [k, v] of Object.entries(t.type)) {
    vars.push([`--text-${k}-size`, px(v.size)], [`--text-${k}-line`, px(v.lineHeight)])
  }
  for (const [k, v] of Object.entries(t.weight)) vars.push([`--weight-${k}`, String(v)])
  for (const [k, v] of Object.entries(t.duration)) vars.push([`--dur-${k}`, ms(v)])
  vars.push(['--dur-fade-base', ms(t.duration.base)], ['--dur-fade-slow', ms(t.duration.slow)])
  for (const [k, v] of Object.entries(t.easing)) vars.push([`--ease-${k}`, v])
  vars.push(['--motion-shift', px(t.motion.shift)], ['--motion-scale', String(t.motion.scale)])
  for (const [k, v] of Object.entries(t.z)) vars.push([`--z-${k}`, String(v)])
  for (const [k, v] of Object.entries(t.measure)) vars.push([`--measure-${k}`, px(v)])
  return vars
}

function block(selector: string, vars: [string, string][], indent = ''): string {
  const body = vars.map(([name, value]) => `${indent}  ${name}: ${value};`).join('\n')
  return `${indent}${selector} {\n${body}\n${indent}}`
}

/** CSS custom properties for one theme, scoped to `:root[data-theme="<theme>"]`. */
export function tokensToCss(t: Tokens, theme: ThemeName): string {
  return block(`:root[data-theme="${theme}"]`, themeVariables(t, theme))
}

/** Reduced-motion override: durations to 0 ms, fades capped, no transforms. */
export function reducedMotionCss(t: Tokens): string {
  const fade = ms(Math.min(t.reducedFadeCap, t.duration.base))
  const vars: [string, string][] = [
    ...Object.keys(t.duration).map((k): [string, string] => [`--dur-${k}`, ms(0)]),
    ['--dur-fade-base', fade],
    ['--dur-fade-slow', ms(Math.min(t.reducedFadeCap, t.duration.slow))],
    ['--motion-shift', px(0)],
    ['--motion-scale', '1'],
  ]
  return `@media (prefers-reduced-motion: reduce) {\n${block(':root', vars, '  ')}\n}`
}

/** The full token stylesheet: both themes plus the reduced-motion override. */
export function buildStylesheet(t: Tokens): string {
  return [tokensToCss(t, 'light'), tokensToCss(t, 'dark'), reducedMotionCss(t)].join('\n\n')
}
