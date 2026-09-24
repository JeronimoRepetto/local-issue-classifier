// Pure OKLab color mixing, matching the CSS Color Module Level 4 semantics of
// `color-mix(in oklab, <colorA> P%, <colorB>)` for two fully opaque sRGB
// colors. Used once, at authoring time, to compute the static `*-soft` tint
// tokens in tokens.ts (see its comment) so `tokens.test.ts` can check their
// AA contrast in plain Node — there is no CSS engine there to evaluate a
// live `color-mix()` expression. UiCallout.vue's actual CSS still uses the
// live `color-mix(in oklab, var(--color-<tone>) 5%, var(--color-surface))`
// expression so the tint recomputes from the current theme automatically;
// this file's output is the same formula, precomputed, purely for the test.
//
// Matrices are Björn Ottosson's OKLab (https://bottosson.github.io/posts/oklab/),
// the same ones the CSS Color 4 spec and browser implementations use.
import type { Rgb } from './contrast'
import { parseHex } from './contrast'

function channelToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function linearToChannel(linear: number): number {
  const c = Math.min(1, Math.max(0, linear))
  const encoded = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
  return Math.round(encoded * 255)
}

function linearSrgbToOklab([r, g, b]: Rgb): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ]
}

function oklabToLinearSrgb([L, a, b]: [number, number, number]): Rgb {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ]
}

function hexToOklab(hex: string): [number, number, number] {
  return linearSrgbToOklab(parseHex(hex).map(channelToLinear) as Rgb)
}

function oklabToHex(lab: [number, number, number]): string {
  const [r, g, b] = oklabToLinearSrgb(lab).map(linearToChannel)
  return (
    '#' +
    [r, g, b]
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  )
}

/**
 * `color-mix(in oklab, fgHex pctFg%, bgHex)`: interpolates linearly in OKLab
 * space, weighted by `pctFg` (0–100). Both inputs are opaque, so there is no
 * alpha compositing to do — just a weighted average of (L, a, b).
 */
export function mixOklab(fgHex: string, bgHex: string, pctFg: number): string {
  const t = pctFg / 100
  const [L1, a1, b1] = hexToOklab(fgHex)
  const [L2, a2, b2] = hexToOklab(bgHex)
  return oklabToHex([L1 * t + L2 * (1 - t), a1 * t + a2 * (1 - t), b1 * t + b2 * (1 - t)])
}
