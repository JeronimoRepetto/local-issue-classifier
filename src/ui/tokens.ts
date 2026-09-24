// Design tokens. A typed, pure object; `tokensToCss` turns it into
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
  'text-subtle',
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
  'inverse-hover',
  'on-inverse',
  'icon-social',
  'brand-linkedin-mark',
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
  /** 4 px grid. `2h` (12 px) sits between 8 and 16 for compact padding. */
  space: Record<1 | 2 | '2h' | 3 | 4 | 5 | 6 | 7, number>
  size: { compact: number; default: number; large: number; row: number }
  icon: { sm: number; md: number; lg: number }
  radius: { xs: number; sm: number; md: number; lg: number; round: number }
  line: { thin: number; thick: number }
  /** `pixel` is the identity accent only: wordmark, one page heading, empty-state art. */
  font: { sans: string; mono: string; pixel: string }
  type: Record<'micro' | 'caption' | 'table' | 'body' | 'h3' | 'h2' | 'h1', TypeStep>
  tracking: { micro: string; tight: string }
  weight: { regular: number; medium: number; semibold: number }
  /** `spin` is one turn of the progress arc. */
  duration: { fast: number; base: number; slow: number; spin: number }
  /** Upper bound for opacity fades under `prefers-reduced-motion`. */
  reducedFadeCap: number
  easing: { out: string; in: string; standard: string }
  motion: { shift: number; scale: number }
  z: { popover: number; toast: number; dialog: number }
  /** Largest widths: floating layers, the drawer and the page columns. */
  measure: {
    tooltip: number
    popover: number
    toast: number
    dialog: number
    drawer: number
    narrow: number
    page: number
    wide: number
  }
}

// Design system v2 (docs/redesign-brief.md): neutral zinc surfaces, one indigo
// accent, hairline borders, and a cool-to-hot heat scale that renders as text.
export const tokens: Tokens = {
  color: {
    light: {
      bg: '#FFFFFF',
      surface: '#FAFAFA',
      'surface-2': '#F4F4F5',
      border: '#E4E4E7',
      'border-strong': '#8A8A93',
      text: '#18181B',
      'text-muted': '#52525B',
      'text-subtle': '#67676F',
      accent: '#4F46E5',
      'accent-hover': '#4338CA',
      'accent-soft': '#EEF0FF',
      'on-accent': '#FFFFFF',
      success: '#15803D',
      warning: '#A15C07',
      danger: '#B91C1C',
      'danger-hover': '#991B1B',
      info: '#1D4ED8',
      'on-danger': '#FFFFFF',
      'inverse-surface': '#18181B',
      'inverse-hover': '#3F3F46',
      'on-inverse': '#FAFAFA',
      // App-bar social links: black in light theme to match the LinkedIn mark.
      'icon-social': '#000000',
      // LinkedIn's [in] Logo, unaltered: the official black variant (verified
      // against LinkedIn's own in-logo.zip download — see THIRD_PARTY_NOTICES.md
      // "Brand icons"). Not part of icon-social: brand guidelines forbid
      // recoloring the mark, so it cannot follow the shared grey.
      'brand-linkedin-mark': '#000000',
      'level-high-fg': '#B91C1C',
      'level-high-bg': '#FEF2F2',
      'level-medium-fg': '#A15C07',
      'level-medium-bg': '#FFFBEB',
      'level-low-fg': '#15803D',
      'level-low-bg': '#F0FDF4',
      'scale-1': '#67676F',
      'scale-2': '#2563EB',
      'scale-3': '#975A06',
      'scale-4': '#C2410C',
      'scale-5': '#B91C1C',
    },
    dark: {
      bg: '#09090B',
      surface: '#111113',
      'surface-2': '#18181B',
      border: '#26262B',
      'border-strong': '#6A6A74',
      text: '#EDEDEF',
      'text-muted': '#94949E',
      'text-subtle': '#81818B',
      accent: '#8B93FF',
      'accent-hover': '#A5ABFF',
      'accent-soft': '#1C1D33',
      'on-accent': '#09090B',
      success: '#4ADE80',
      warning: '#FBBF24',
      danger: '#F87171',
      'danger-hover': '#FCA5A5',
      info: '#60A5FA',
      'on-danger': '#09090B',
      'inverse-surface': '#EDEDEF',
      'inverse-hover': '#D4D4D8',
      'on-inverse': '#09090B',
      // App-bar social links: white in dark theme to match the LinkedIn mark.
      'icon-social': '#FFFFFF',
      // The official white variant (verified against in-logo.zip), for legibility
      // on the dark bg — see the light-theme comment above.
      'brand-linkedin-mark': '#FFFFFF',
      'level-high-fg': '#F87171',
      'level-high-bg': '#2A1414',
      'level-medium-fg': '#FBBF24',
      'level-medium-bg': '#2A2110',
      'level-low-fg': '#4ADE80',
      'level-low-bg': '#10261A',
      'scale-1': '#8A8A94',
      'scale-2': '#60A5FA',
      'scale-3': '#FACC15',
      'scale-4': '#FB923C',
      'scale-5': '#F87171',
    },
  },
  overlay: {
    light: 'rgba(9, 9, 11, 0.4)',
    dark: 'rgba(0, 0, 0, 0.7)',
  },
  elevation: {
    light: {
      1: '0 1px 2px rgba(9, 9, 11, 0.04)',
      2: '0 4px 16px rgba(9, 9, 11, 0.08)',
      3: '0 16px 48px rgba(9, 9, 11, 0.14)',
    },
    dark: {
      1: '0 1px 2px rgba(0, 0, 0, 0.4)',
      2: '0 4px 16px rgba(0, 0, 0, 0.4)',
      3: '0 16px 48px rgba(0, 0, 0, 0.6)',
    },
  },
  space: { 1: 4, 2: 8, '2h': 12, 3: 16, 4: 24, 5: 32, 6: 48, 7: 64 },
  size: { compact: 28, default: 32, large: 40, row: 44 },
  icon: { sm: 16, md: 20, lg: 32 },
  radius: { xs: 4, sm: 6, md: 8, lg: 12, round: 999 },
  line: { thin: 1, thick: 2 },
  font: {
    sans: "'Geist Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    mono: "'Geist Mono Variable', ui-monospace, 'Cascadia Mono', Consolas, monospace",
    pixel: "'Geist Pixel', 'Geist Mono Variable', ui-monospace, monospace",
  },
  type: {
    micro: { size: 11, lineHeight: 16 },
    caption: { size: 12, lineHeight: 16 },
    table: { size: 13, lineHeight: 20 },
    body: { size: 15, lineHeight: 24 },
    h3: { size: 17, lineHeight: 24 },
    h2: { size: 22, lineHeight: 28 },
    h1: { size: 36, lineHeight: 40 },
  },
  tracking: { micro: '0.08em', tight: '-0.02em' },
  weight: { regular: 400, medium: 500, semibold: 600 },
  duration: { fast: 120, base: 160, slow: 240, spin: 800 },
  reducedFadeCap: 80,
  easing: {
    out: 'cubic-bezier(0.2, 0.9, 0.3, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
  },
  motion: { shift: 4, scale: 0.98 },
  z: { popover: 20, toast: 30, dialog: 40 },
  measure: {
    tooltip: 280,
    popover: 360,
    toast: 400,
    dialog: 520,
    drawer: 440,
    narrow: 640,
    page: 880,
    wide: 1120,
  },
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
  'text-subtle',
  'accent',
  'success',
  'warning',
  'danger',
  'info',
  // Heat scale: priority and relevance numbers are colored text (v2).
  'scale-1',
  'scale-2',
  'scale-3',
  'scale-4',
  'scale-5',
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
  { fg: 'on-inverse', bg: 'inverse-hover', kind: 'text' },
  { fg: 'danger', bg: 'level-high-bg', kind: 'text' },
  { fg: 'level-high-fg', bg: 'level-high-bg', kind: 'text' },
  { fg: 'level-medium-fg', bg: 'level-medium-bg', kind: 'text' },
  { fg: 'level-low-fg', bg: 'level-low-bg', kind: 'text' },
  ...SURFACES.map((bg) => ({ fg: 'border-strong' as const, bg, kind: 'ui' as const })),
  ...SURFACES.map((bg) => ({ fg: 'accent' as const, bg, kind: 'ui' as const })),
  // App-bar social links sit only on the top bar's `bg` background.
  // `brand-linkedin-mark` is deliberately absent here: WCAG 1.4.11's non-text
  // contrast minimum explicitly excludes logotypes, and the [in] Logo's own
  // brand guidelines fix its color regardless of contrast (see LinkedInMarkIcon.vue).
  { fg: 'icon-social', bg: 'bg', kind: 'ui' },
  ...(['scale-1', 'scale-2', 'scale-3', 'scale-4', 'scale-5'] as const).map((fg) => ({
    fg,
    bg: 'surface' as const,
    kind: 'ui' as const,
  })),
]

const px = (n: number) => `${n}px`
const ms = (n: number) => `${n}ms`

function themeVariables(t: Tokens, theme: ThemeName): [string, string][] {
  const vars: [string, string][] = [['color-scheme', theme]]
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
  for (const [k, v] of Object.entries(t.tracking)) vars.push([`--tracking-${k}`, v])
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

/**
 * CSS custom properties for one theme, scoped to `:root[data-theme="<theme>"]`.
 * A custom `selector` scopes it to a subtree instead (the kit page previews both
 * themes side by side this way).
 */
export function tokensToCss(
  t: Tokens,
  theme: ThemeName,
  selector = `:root[data-theme="${theme}"]`,
): string {
  return block(selector, themeVariables(t, theme))
}

function reducedMotionVariables(t: Tokens): [string, string][] {
  return [
    ...Object.keys(t.duration).map((k): [string, string] => [`--dur-${k}`, ms(0)]),
    ['--dur-fade-base', ms(Math.min(t.reducedFadeCap, t.duration.base))],
    ['--dur-fade-slow', ms(Math.min(t.reducedFadeCap, t.duration.slow))],
    ['--motion-shift', px(0)],
    ['--motion-scale', '1'],
  ]
}

/** Reduced-motion variables under any selector (the kit uses it to force the mode). */
export function reducedMotionBlock(t: Tokens, selector: string): string {
  return block(selector, reducedMotionVariables(t))
}

/** Reduced-motion override: durations to 0 ms, fades capped, no transforms. */
export function reducedMotionCss(t: Tokens): string {
  return `@media (prefers-reduced-motion: reduce) {\n${block(':root', reducedMotionVariables(t), '  ')}\n}`
}

/** The full token stylesheet: both themes plus the reduced-motion override. */
export function buildStylesheet(t: Tokens): string {
  return [tokensToCss(t, 'light'), tokensToCss(t, 'dark'), reducedMotionCss(t)].join('\n\n')
}
