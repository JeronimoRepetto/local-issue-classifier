// Pure WCAG 2.x contrast math. Used by the token AA test (SPEC §10.2); no DOM.

export type Rgb = [number, number, number]

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** Parses `#RGB` or `#RRGGBB` (the `#` is optional) into 0–255 channels. */
export function parseHex(hex: string): Rgb {
  const match = HEX_RE.exec(hex.trim())
  if (!match) throw new Error(`Not a hex color: "${hex}"`)
  const digits =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((d) => d + d)
          .join('')
      : match[1]
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as Rgb
}

function channelToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Relative luminance as defined by WCAG 2.x, in [0, 1]. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(channelToLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Contrast ratio between two colors, in [1, 21]. Order does not matter. */
export function contrastRatio(fg: string, bg: string): number {
  const a = relativeLuminance(fg)
  const b = relativeLuminance(bg)
  const [light, dark] = a >= b ? [a, b] : [b, a]
  return (light + 0.05) / (dark + 0.05)
}
