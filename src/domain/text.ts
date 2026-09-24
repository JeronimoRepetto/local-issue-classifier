// local-issue-classifier — text trimming helpers for the Jev state and stored
// issue bodies (SPEC.md §3 / §4.3). Pure string manipulation only.

/**
 * Keeps the first `head` and last `tail` characters of `text`, replacing the
 * middle with an `[… N characters omitted …]` marker. Returns `text`
 * unchanged when it already fits within `head + tail` characters.
 */
export function trimMiddle(text: string, head: number, tail: number): string {
  const headBudget = Math.max(0, head)
  const tailBudget = Math.max(0, tail)
  if (text.length <= headBudget + tailBudget) return text

  const headPart = headText(text, headBudget)
  const tailPart = tailText(text, tailBudget)
  const omitted = text.length - headPart.length - tailPart.length
  return `${headPart}\n[… ${omitted} characters omitted …]\n${tailPart}`
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff

/**
 * The first `chars` UTF-16 code units of `text`, one fewer when the cut would
 * split a surrogate pair (an emoji, say): half a pair is invalid Unicode, and
 * Jev rejects the whole request that carries it.
 */
export function headText(text: string, chars: number): string {
  let end = Math.max(0, Math.min(text.length, Math.floor(chars)))
  if (end > 0 && end < text.length && isHighSurrogate(text.charCodeAt(end - 1)) && isLowSurrogate(text.charCodeAt(end))) {
    end -= 1
  }
  return text.slice(0, end)
}

/** The last `chars` UTF-16 code units of `text`, one fewer when the cut would split a surrogate pair. */
export function tailText(text: string, chars: number): string {
  const count = Math.max(0, Math.min(text.length, Math.floor(chars)))
  if (count === 0) return ''
  let start = text.length - count
  if (start > 0 && isLowSurrogate(text.charCodeAt(start)) && isHighSurrogate(text.charCodeAt(start - 1))) {
    start += 1
  }
  return text.slice(start)
}

const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd)

/** `String.prototype.toWellFormed` for runtimes without it: lone surrogates become U+FFFD. */
export function toWellFormedFallback(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (isHighSurrogate(code) && i + 1 < text.length && isLowSurrogate(text.charCodeAt(i + 1))) {
      out += text.slice(i, i + 2)
      i++
    } else {
      out += isHighSurrogate(code) || isLowSurrogate(code) ? REPLACEMENT_CHARACTER : text[i]
    }
  }
  return out
}

type MaybeWellFormed = string & { toWellFormed?: () => string }

function toWellFormed(text: string): string {
  const native = (text as MaybeWellFormed).toWellFormed
  return typeof native === 'function' ? native.call(text) : toWellFormedFallback(text)
}

const TAB = 0x09
const NEWLINE = 0x0a

/** C0 controls other than tab and newline: never meaningful in an issue, and refused by strict decoders. */
const isDroppedControl = (code: number) => code < 0x20 && code !== TAB && code !== NEWLINE

/** U+FDD0..U+FDEF and the last two code points of every plane. */
const isNoncharacter = (code: number) => (code >= 0xfdd0 && code <= 0xfdef) || (code & 0xfffe) === 0xfffe

/** Strict mode also drops DEL, the C1 controls, the BOM (zero-width no-break space) and noncharacters. */
const isStrictNoise = (code: number) =>
  code === 0x7f || (code >= 0x80 && code <= 0x9f) || code === 0xfeff || isNoncharacter(code)

export interface SanitizeOptions {
  /** Also strip DEL, C1 controls, the BOM and noncharacters (the retry after a Unicode rejection). */
  strict?: boolean
}

/**
 * Makes user text safe to send: lone surrogates become U+FFFD and C0 control
 * characters other than tab and newline are removed. `strict` also removes the
 * rarer code points a strict decoder may refuse.
 */
export function sanitizeText(text: string, options: SanitizeOptions = {}): string {
  const wellFormed = toWellFormed(text)
  let out = ''
  for (const char of wellFormed) {
    const code = char.codePointAt(0) ?? 0
    if (isDroppedControl(code) || (options.strict && isStrictNoise(code))) continue
    out += char
  }
  return out
}

/** `sanitizeText` over every string value of a JSON-like value; keys, numbers, booleans and null are kept. */
export function sanitizeJsonStrings<T>(value: T, options: SanitizeOptions = {}): T {
  if (typeof value === 'string') return sanitizeText(value, options) as T
  if (Array.isArray(value)) return value.map((item) => sanitizeJsonStrings(item, options)) as T
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeJsonStrings(item, options)]),
    ) as T
  }
  return value
}

/** ceil(chars / 3.5): an intentionally high-side token estimate (§4.3). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}

const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g
const BADGE_LINK_RE = /\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g
const IMAGE_RE = /!\[[^\]]*\]\([^)]*\)/g
const IMG_TAG_RE = /<img\b[^>]*\/?>(?:<\/img>)?/gi
const FENCE_RE = /^\s*(```|~~~)/
const MAX_CODE_BLOCK_LINES = 15

/** A line that, once every badge/image construct is removed, is blank. */
function isBadgeOrImageLine(line: string): boolean {
  if (line.trim() === '') return false
  const stripped = line
    .replace(BADGE_LINK_RE, '')
    .replace(IMAGE_RE, '')
    .replace(IMG_TAG_RE, '')
  return stripped.trim() === ''
}

/**
 * Strips README noise before it is sent to Jev or stored (§4.3): HTML
 * comments, pure badge/image lines, and fenced code blocks over 15 lines
 * (replaced by a `[code block omitted]` marker). Collapses runs of blank
 * lines to a single blank line.
 */
export function stripMarkdownNoise(markdown: string): string {
  const withoutComments = markdown.replace(HTML_COMMENT_RE, '')
  const lines = withoutComments.split(/\r\n|\r|\n/)
  const output: string[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const fenceMatch = FENCE_RE.exec(line)
    if (fenceMatch) {
      const fence = fenceMatch[1]
      const closeRe = new RegExp(`^\\s*${fence}\\s*$`)
      const body: string[] = []
      let j = i + 1
      while (j < lines.length && !closeRe.test(lines[j])) {
        body.push(lines[j])
        j++
      }
      const hasClosingFence = j < lines.length
      if (body.length > MAX_CODE_BLOCK_LINES) {
        output.push('[code block omitted]')
      } else {
        output.push(line, ...body)
        if (hasClosingFence) output.push(lines[j])
      }
      i = hasClosingFence ? j + 1 : j
      continue
    }

    if (!isBadgeOrImageLine(line)) {
      output.push(line)
    }
    i++
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
