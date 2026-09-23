// issue-criticity — text trimming helpers for the Jev state and stored
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

  const omitted = text.length - headBudget - tailBudget
  const headPart = text.slice(0, headBudget)
  const tailPart = tailBudget > 0 ? text.slice(text.length - tailBudget) : ''
  return `${headPart}\n[… ${omitted} characters omitted …]\n${tailPart}`
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
