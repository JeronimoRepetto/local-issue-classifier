// local-issue-classifier — the in-browser decision readout (docs/browser-inference.md).
// A TypeScript port of JevK5's prompt and readout (allebee/jevk5, jevk5/prompt.py
// and jevk5/runtime.py, which follow SemIf, TheoLeeCJ/SemIf, MIT):
//
// - one prompt per question: a fixed system instruction, then the decision as
//   JSON (`evidence` = the state, `criterion` = the instructions, lettered
//   `options`), in Qwen's chat template with thinking off;
// - one forward pass; the next-token logits of the option letters, divided by
//   a calibration temperature (JevK5: 1.532), then a softmax;
// - Score: the expected value over the ordered levels; Choice: the argmax;
//   `confidence`: the largest probability (as JevK5's `answer()` does).
//
// The prompt is built byte-for-byte as JevK5's Python server builds it
// (`json.dumps(..., ensure_ascii=False)` separators, and a Python `repr` for a
// structured level), so a real JevK5 export reads the same tokens (phase B).
// Pure: no model, no Vue, no network.
import type { JevQuestion } from '../jev/questions'

/** JevK5's fitted calibration temperature (jevk5_config.json). */
export const JEVK5_TEMPERATURE = 1.532

/** One letter per option. JevK5 itself stops at 16 (A–P); the protocol allows A–Z. */
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const MAX_OPTIONS = LETTERS.length

export const READOUT_SYSTEM =
  'Apply the supplied criterion to the supplied evidence. Choose exactly one listed option. ' +
  'Respond with only its uppercase letter, with no explanation or reasoning.'

/** A question whose options cannot be lettered (fewer than 2, or more than 26). */
export class TooManyOptionsError extends Error {
  readonly count: number

  constructor(count: number) {
    super(`A question needs 2 to ${MAX_OPTIONS} options to be lettered, not ${count}`)
    this.name = 'TooManyOptionsError'
    this.count = count
  }
}

export function optionLetters(count: number): string[] {
  if (!Number.isInteger(count) || count < 2 || count > MAX_OPTIONS) throw new TooManyOptionsError(count)
  return LETTERS.slice(0, count).split('')
}

/** softmax(logits / temperature), numerically stable (max subtracted first). */
export function softmaxWithTemperature(logits: readonly number[], temperature = JEVK5_TEMPERATURE): number[] {
  if (logits.length === 0) throw new Error('softmax needs at least one logit')
  if (!(temperature > 0)) throw new Error('temperature must be positive')
  const scaled = logits.map((l) => l / temperature)
  const max = Math.max(...scaled)
  const exps = scaled.map((s) => Math.exp(s - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map((e) => e / sum)
}

// ── Python-compatible serialization ─────────────────────────────────
type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json }

/** `json.dumps(value, ensure_ascii=False)`: JSON with `", "` and `": "` separators. */
export function pythonJson(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) return `[${value.map(pythonJson).join(', ')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${JSON.stringify(k)}: ${pythonJson(v)}`)
    return `{${entries.join(', ')}}`
  }
  return JSON.stringify(value as Json)
}

function pythonStr(text: string): string {
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'"
  let out = ''
  for (const ch of text) {
    if (ch === '\\') out += '\\\\'
    else if (ch === quote) out += `\\${quote}`
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else out += ch
  }
  return `${quote}${out}${quote}`
}

/** Python's `repr` for the str / list / dict / number / bool / None values a question holds. */
export function pythonRepr(value: unknown): string {
  if (value === null || value === undefined) return 'None'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return pythonStr(value)
  if (Array.isArray(value)) return `[${value.map(pythonRepr).join(', ')}]`
  const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => `${pythonStr(k)}: ${pythonRepr(v)}`)
  return `{${entries.join(', ')}}`
}

// ── Options and prompt ───────────────────────────────────────────────
export interface DecisionOption {
  /** The answer key: a level index ("0".."n-1") for Score, a criteria key for Choice. */
  id: string
  /** "id: description", as JevK5's decision_options() renders it. */
  text: string
}

const describe = (value: unknown) => (typeof value === 'string' ? value : pythonRepr(value))

export function decisionOptions(question: JevQuestion): DecisionOption[] {
  const pairs: [string, unknown][] =
    question.type === 'choice'
      ? Object.entries(question.criteria).map(([k, v]) => [k, v ?? k])
      : question.criteria.map((level, i) => [String(i), level])
  optionLetters(pairs.length)
  return pairs.map(([id, d]) => ({ id, text: `${id}: ${describe(d)}` }))
}

/** The full prompt text, chat template included (thinking off). */
export function buildReadoutPrompt(state: unknown, question: JevQuestion): string {
  const options = decisionOptions(question)
  const letters = optionLetters(options.length)
  const user = pythonJson({
    evidence: state,
    criterion: question.instructions,
    options: options.map((o, i) => ({ letter: letters[i], description: o.text })),
  })
  return (
    `<|im_start|>system\n${READOUT_SYSTEM}<|im_end|>\n` +
    `<|im_start|>user\n${user}<|im_end|>\n` +
    '<|im_start|>assistant\n<think>\n\n</think>\n\n'
  )
}

// ── Answer ───────────────────────────────────────────────────────────
export interface ReadoutAnswer {
  type: 'score' | 'choice'
  score?: number
  choice?: string
  probabilities: Record<string, number>
  confidence: number
  input_tokens: number
}

/** TypeSafe's `/v1/systemone` answer for a distribution over the options, in option order. */
export function toAnswer(question: JevQuestion, probabilities: readonly number[], inputTokens: number): ReadoutAnswer {
  const options = decisionOptions(question)
  if (probabilities.length !== options.length) {
    throw new Error(`expected ${options.length} probabilities, got ${probabilities.length}`)
  }
  const keyed = Object.fromEntries(options.map((o, i) => [o.id, probabilities[i]]))
  const confidence = Math.max(...probabilities)
  if (question.type === 'choice') {
    const best = probabilities.indexOf(confidence)
    return { type: 'choice', choice: options[best].id, probabilities: keyed, confidence, input_tokens: inputTokens }
  }
  const score = probabilities.reduce((sum, p, i) => sum + i * p, 0)
  return { type: 'score', score, probabilities: keyed, confidence, input_tokens: inputTokens }
}
