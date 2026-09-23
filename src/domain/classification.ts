// local-issue-classifier — maps a Jev `/v1/systemone` response to a Classification
// (SPEC.md §4.4). Pure. Validates the untrusted response shape: any missing or
// malformed answer fails the whole classification, so partial answers are never
// stored. A batched response is split per issue first (toBatchClassifications),
// so there the unit of failure is one issue. Tolerant where compatible
// providers may differ: `confidence` and the echoed `model` are optional, and
// nothing depends on the model string.
import type { ClassificationOutcome } from './analysis'
import type {
  Classification,
  IssueKind,
  Level,
  RelevanceResult,
  ScoreDimension,
} from './types'

export const UNEXPECTED_JEV_RESPONSE = 'Unexpected Jev response'

/** Thrown for any response that does not match the five expected answers. */
export class UnexpectedJevResponseError extends Error {
  /** Which check failed, for debugging; never contains request data. */
  readonly detail: string

  constructor(detail: string) {
    super(UNEXPECTED_JEV_RESPONSE)
    this.name = 'UnexpectedJevResponseError'
    this.detail = detail
  }
}

/** Choice options of the `kind` question, in the order questions.ts declares them. */
export const ISSUE_KINDS: readonly IssueKind[] = [
  'bug',
  'feature',
  'documentation',
  'question',
  'maintenance',
  'other',
]

/** The five answers of a classification, in request order. */
export type AnswerDimension = 'complexity' | 'criticality' | 'effort' | 'relevance' | 'kind'
export const ANSWER_DIMENSIONS: readonly AnswerDimension[] = ['complexity', 'criticality', 'effort', 'relevance', 'kind']

/** Short prefixes of the namespaced answer ids in a batched request (docs/batching.md). */
export const BATCH_ANSWER_PREFIXES: Readonly<Record<AnswerDimension, string>> = {
  complexity: 'c',
  criticality: 'k',
  effort: 'e',
  relevance: 'r',
  kind: 't',
}

/** e.g. `c_123`: the complexity answer for issue #123 in a batched response. */
export const batchAnswerId = (dimension: AnswerDimension, issueNumber: number) =>
  `${BATCH_ANSWER_PREFIXES[dimension]}_${issueNumber}`

const LEVELS: readonly Level[] = ['low', 'medium', 'high']
const RELEVANCE_TOP_LEVEL = 4 // 5 levels: 0..4

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Nearest level: round(score), clamped to 0..2 (primitives/score.md §Reading a Score). */
export function levelOf(score: number): Level {
  return LEVELS[clamp(Math.round(score), 0, LEVELS.length - 1)]
}

/** 0..100 ordinal ranking signal: round(100 · score / 4). Not a calibrated percentage. */
export function relevanceValue(score: number): number {
  return Math.round((100 * clamp(score, 0, RELEVANCE_TOP_LEVEL)) / RELEVANCE_TOP_LEVEL)
}

export interface ClassificationMeta {
  /** The model name the request asked for; used when the response does not echo one. */
  requestedModel: string
  questionsVersion: number
  issueUpdatedAt: string
  classifiedAt: string
}

// ── Validation helpers ───────────────────────────────────────────────
type Obj = Record<string, unknown>

const isObject = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

function fail(detail: string): never {
  throw new UnexpectedJevResponseError(detail)
}

function answerOf(answers: Obj, id: string, type: 'score' | 'choice'): Obj {
  const answer = answers[id]
  if (!isObject(answer)) fail(`missing answer ${id}`)
  if (answer.type !== type) fail(`answer ${id} has type ${String(answer.type)}`)
  return answer
}

/** Absent (or null) → undefined; present must be a finite number. */
function optionalConfidence(answer: Obj, id: string): number | undefined {
  const { confidence } = answer
  if (confidence === undefined || confidence === null) return undefined
  if (!isNumber(confidence)) fail(`answer ${id} confidence is not a number`)
  return confidence
}

/** Probabilities keyed "0".."n-1", returned as an array in level order. */
function levelProbabilities(answer: Obj, id: string, levels: number): number[] {
  const probabilities = answer.probabilities
  if (!isObject(probabilities) || Object.keys(probabilities).length !== levels) {
    fail(`answer ${id} probabilities do not have ${levels} levels`)
  }
  return Array.from({ length: levels }, (_, i) => {
    const p = probabilities[String(i)]
    if (!isNumber(p)) fail(`answer ${id} probability ${i} is not a number`)
    return p
  })
}

function scoreAnswer(answers: Obj, id: string, levels: number) {
  const answer = answerOf(answers, id, 'score')
  if (!isNumber(answer.score)) fail(`answer ${id} score is not a number`)
  return {
    score: answer.score,
    confidence: optionalConfidence(answer, id),
    probabilities: levelProbabilities(answer, id, levels),
  }
}

function withConfidence<T extends object>(base: T, confidence: number | undefined) {
  return confidence === undefined ? base : { ...base, confidence }
}

function dimension(answers: Obj, id: string): ScoreDimension {
  const { score, confidence, probabilities } = scoreAnswer(answers, id, LEVELS.length)
  return withConfidence(
    { level: levelOf(score), score, probabilities: probabilities as ScoreDimension['probabilities'] },
    confidence,
  ) as ScoreDimension
}

function relevance(answers: Obj): RelevanceResult {
  const { score, confidence, probabilities } = scoreAnswer(answers, 'relevance', RELEVANCE_TOP_LEVEL + 1)
  return withConfidence(
    { value: relevanceValue(score), score, probabilities: probabilities as RelevanceResult['probabilities'] },
    confidence,
  ) as RelevanceResult
}

function kind(answers: Obj): Classification['kind'] {
  const answer = answerOf(answers, 'kind', 'choice')
  const choice = answer.choice
  if (typeof choice !== 'string' || !(ISSUE_KINDS as readonly string[]).includes(choice)) {
    fail('answer kind has an unknown choice')
  }
  return withConfidence({ choice: choice as IssueKind }, optionalConfidence(answer, 'kind'))
}

// ── Mapping ──────────────────────────────────────────────────────────
/**
 * Maps a parsed `/v1/systemone` response body. Throws UnexpectedJevResponseError
 * when any of the five answers is missing or malformed.
 */
export function toClassification(response: unknown, meta: ClassificationMeta): Classification {
  if (!isObject(response) || !isObject(response.answers)) fail('response has no answers')
  const answers = response.answers

  const complexity = dimension(answers, 'complexity')
  const criticality = dimension(answers, 'criticality')
  const effort = dimension(answers, 'effort')
  const rel = relevance(answers)
  const kindResult = kind(answers)

  // kind is speculative and excluded (§4.4).
  const confidences = [complexity, criticality, effort, rel]
    .map((d) => d.confidence)
    .filter((c): c is number => c !== undefined)
  const usage = isObject(response.usage) ? response.usage : {}

  const classification: Classification = {
    complexity,
    criticality,
    effort,
    relevance: rel,
    kind: kindResult,
    model: typeof response.model === 'string' ? response.model : meta.requestedModel,
    questionsVersion: meta.questionsVersion,
    issueUpdatedAt: meta.issueUpdatedAt,
    classifiedAt: meta.classifiedAt,
    inputTokens: isNumber(usage.input_tokens) ? usage.input_tokens : 0,
  }
  if (confidences.length > 0) classification.minConfidence = Math.min(...confidences)
  return classification
}

// ── Batched responses (docs/batching.md) ─────────────────────────────
export interface BatchEntry {
  issueNumber: number
  issueUpdatedAt: string
}

/**
 * Splits a batched `/v1/systemone` response back into one outcome per issue,
 * keyed by issue number in batch order. Each issue's five answers are read by
 * id suffix (`c_123`, …) and validated on their own: a missing or malformed
 * subset fails that issue only. The request's input tokens are shared evenly.
 */
export function toBatchClassifications(
  response: unknown,
  entries: readonly BatchEntry[],
  meta: Omit<ClassificationMeta, 'issueUpdatedAt'>,
): Map<number, ClassificationOutcome> {
  const outcomes = new Map<number, ClassificationOutcome>()
  const body = isObject(response) ? response : {}
  const answers = isObject(body.answers) ? body.answers : null
  const usage = isObject(body.usage) ? body.usage : {}
  const total = isNumber(usage.input_tokens) ? Math.max(0, Math.round(usage.input_tokens)) : 0
  const share = entries.length > 0 ? Math.floor(total / entries.length) : 0
  const remainder = total - share * entries.length

  entries.forEach((entry, index) => {
    if (answers === null) {
      outcomes.set(entry.issueNumber, { ok: false, error: UNEXPECTED_JEV_RESPONSE })
      return
    }
    const own = Object.fromEntries(
      ANSWER_DIMENSIONS.map((d) => [d, answers[batchAnswerId(d, entry.issueNumber)]]),
    )
    try {
      const classification = toClassification(
        { model: body.model, answers: own, usage: { input_tokens: share + (index < remainder ? 1 : 0) } },
        { ...meta, issueUpdatedAt: entry.issueUpdatedAt },
      )
      outcomes.set(entry.issueNumber, { ok: true, classification })
    } catch {
      outcomes.set(entry.issueNumber, { ok: false, error: UNEXPECTED_JEV_RESPONSE })
    }
  })
  return outcomes
}

/** A stored classification is current only for the same issue update and questions version (§4.8). */
export function isClassificationCurrent(
  classification: Classification,
  issueUpdatedAt: string,
  questionsVersion: number,
): boolean {
  return (
    classification.issueUpdatedAt === issueUpdatedAt &&
    classification.questionsVersion === questionsVersion
  )
}
