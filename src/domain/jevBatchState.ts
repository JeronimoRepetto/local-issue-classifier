// local-issue-classifier — the composite Jev `state` for batched classification and
// the adaptive fitter that packs issues into requests (docs/batching.md). Pure.
//
// One request carries the project context ONCE plus a compact entry per issue,
// each with an explicit id the namespaced questions point at. The fitter aims
// for a single request per run: it tries every selected issue under the
// loosest trimming profile, steps down through tighter profiles until the
// request fits the documented limits, and only splits when even the floor
// profile does not fit (then into the minimum number of requests).
//
// Limits (Jev docs, models.md): 64k tokens per request for the state plus all
// questions; 32k tokens for the state plus the longest question. Both are used
// with a 10% safety margin because token counts here are estimates.
import type { Clock } from './dates'
import { headText, sanitizeJsonStrings, trimMiddle } from './text'
import {
  commentsNotLoaded,
  selectComments,
  toJevIssue,
  toJevProject,
  trimBody,
  DEFAULT_MAX_COMMENTS,
  type JevIssue,
  type JevProject,
} from './jevState'
import type { Issue, ProjectContext, TrimmingProfileId } from './types'

// ── Limits ───────────────────────────────────────────────────────────
export interface RequestLimits {
  /** Budget for the state plus the single longest question. */
  stateTokens: number
  /** Budget for the state plus every question of the request. */
  totalTokens: number
}

/** models.md, "Context length". */
export const JEV_REQUEST_LIMITS: RequestLimits = { stateTokens: 32_000, totalTokens: 64_000 }
export const SAFETY_MARGIN = 0.1
export const DEFAULT_REQUEST_LIMITS: RequestLimits = {
  stateTokens: Math.floor(JEV_REQUEST_LIMITS.stateTokens * (1 - SAFETY_MARGIN)),
  totalTokens: Math.floor(JEV_REQUEST_LIMITS.totalTokens * (1 - SAFETY_MARGIN)),
}

// ── Trimming profiles ────────────────────────────────────────────────
export interface TrimmingProfile {
  id: TrimmingProfileId
  /** Body budget in estimated tokens; null = the standard per-issue trimming (§4.3). */
  bodyTokens: number | null
  /** Comments kept per issue; null = Preferences.maxCommentsPerIssue. Never above it. */
  maxComments: number | null
  commentChars: number
  docsIndex: boolean
  readmeChars: number
  contributingChars: number
}

const CHARS_PER_TOKEN = 3.5

/** Loosest → tightest. Each step first sheds the least useful context. */
export const TRIMMING_PROFILES: readonly TrimmingProfile[] = [
  { id: 'standard', bodyTokens: null, maxComments: null, commentChars: 1_000, docsIndex: true, readmeChars: 6_000, contributingChars: 1_500 },
  { id: 'compact', bodyTokens: 1_500, maxComments: 6, commentChars: 800, docsIndex: false, readmeChars: 6_000, contributingChars: 1_500 },
  { id: 'condensed', bodyTokens: 800, maxComments: 2, commentChars: 600, docsIndex: false, readmeChars: 3_000, contributingChars: 800 },
  { id: 'tight', bodyTokens: 400, maxComments: 0, commentChars: 0, docsIndex: false, readmeChars: 1_500, contributingChars: 0 },
  { id: 'minimal', bodyTokens: 200, maxComments: 0, commentChars: 0, docsIndex: false, readmeChars: 800, contributingChars: 0 },
]

export const TRIMMING_PROFILE_IDS: readonly TrimmingProfileId[] = TRIMMING_PROFILES.map((p) => p.id)
export const DEFAULT_TRIMMING_FLOOR: TrimmingProfileId = 'minimal'

export function trimmingProfile(id: TrimmingProfileId): TrimmingProfile {
  return TRIMMING_PROFILES.find((p) => p.id === id) ?? TRIMMING_PROFILES[0]
}

/** The profiles the fitter may try, loosest first, down to `floor` included. */
export function profilesUpTo(floor: TrimmingProfileId): TrimmingProfile[] {
  const end = TRIMMING_PROFILE_IDS.indexOf(floor)
  return TRIMMING_PROFILES.slice(0, end < 0 ? TRIMMING_PROFILES.length : end + 1)
}

// ── Composite state ──────────────────────────────────────────────────
export type JevBatchIssue = Omit<JevIssue, 'number'> & { id: string }

export interface JevBatchState {
  project: JevProject
  issues: JevBatchIssue[]
}

/** The id an issue carries inside the composite state and the questions. */
export const batchIssueId = (issueNumber: number) => `#${issueNumber}`

export interface BatchStateOptions {
  now: Clock
  /** Preferences.maxCommentsPerIssue; default 8. */
  maxCommentsPerIssue?: number
}

function projectFor(ctx: ProjectContext, profile: TrimmingProfile): JevProject {
  const base = toJevProject(ctx)
  return sanitizeJsonStrings({
    ...base,
    readme_excerpt: base.readme_excerpt === null ? null : headText(base.readme_excerpt, profile.readmeChars),
    contributing_excerpt:
      base.contributing_excerpt === null || profile.contributingChars === 0
        ? null
        : headText(base.contributing_excerpt, profile.contributingChars),
    docs_index: profile.docsIndex ? base.docs_index : [],
  })
}

function bodyFor(body: string, profile: TrimmingProfile): string {
  if (profile.bodyTokens === null) return trimBody(body)
  const chars = Math.floor(profile.bodyTokens * CHARS_PER_TOKEN)
  if (body.length <= chars) return body
  const headChars = Math.floor(chars * 0.75)
  return trimMiddle(body, headChars, chars - headChars)
}

function issueFor(issue: Issue, profile: TrimmingProfile, opts: BatchStateOptions): JevBatchIssue {
  const preferred = opts.maxCommentsPerIssue ?? DEFAULT_MAX_COMMENTS
  const max = profile.maxComments === null ? preferred : Math.min(profile.maxComments, preferred)
  const selection =
    commentsNotLoaded(issue) ?? selectComments(issue.comments, issue.commentCount, max, profile.commentChars)
  const { number, ...rest } = toJevIssue(issue, opts.now, bodyFor(issue.body, profile), selection)
  return sanitizeJsonStrings({ id: batchIssueId(number), ...rest })
}

/** The composite state: `project` once, then one entry per issue, in order. */
export function buildBatchState(
  issues: readonly Issue[],
  ctx: ProjectContext,
  profileId: TrimmingProfileId,
  opts: BatchStateOptions,
): JevBatchState {
  const profile = trimmingProfile(profileId)
  return { project: projectFor(ctx, profile), issues: issues.map((issue) => issueFor(issue, profile, opts)) }
}

// ── Fitter ───────────────────────────────────────────────────────────
/** Estimated question tokens, computed by the Jev adapter from the real questions. */
export interface QuestionBudget {
  /** The five namespaced questions of one issue (upper bound over ids). */
  perIssueTokens: number
  /** The longest single question (for the 32k state budget). */
  longestQuestionTokens: number
}

export interface PlannedBatch {
  issues: Issue[]
  state: JevBatchState
  stateTokens: number
  questionsTokens: number
  totalTokens: number
}

export interface BatchPlan {
  /** The profile every batch of this plan uses. */
  profile: TrimmingProfileId
  batches: PlannedBatch[]
  /** Issues that do not fit a request alone, even at the floor profile. Never sent. */
  tooLarge: Issue[]
}

export interface PlanBatchesOptions extends BatchStateOptions {
  questions: QuestionBudget
  /** The tightest profile the fitter may use; default 'minimal'. */
  floor?: TrimmingProfileId
  /** Use exactly this profile (the agreement harness compares profiles). */
  only?: TrimmingProfileId
  limits?: RequestLimits
}

// JSON.stringify({ project, issues: [a, b] }) = '{"project":' + P + ',"issues":[' + a + ',' + b + ']}'.
const ENVELOPE_CHARS = '{"project":,"issues":[]}'.length

/** Serialized pieces of one profile, so packing is arithmetic instead of re-serializing. */
interface Sized {
  project: JevProject
  projectChars: number
  entries: { issue: Issue; entry: JevBatchIssue; chars: number }[]
}

function sizeFor(issues: readonly Issue[], ctx: ProjectContext, profile: TrimmingProfile, opts: BatchStateOptions): Sized {
  const project = projectFor(ctx, profile)
  return {
    project,
    projectChars: JSON.stringify(project).length,
    entries: issues.map((issue) => {
      const entry = issueFor(issue, profile, opts)
      return { issue, entry, chars: JSON.stringify(entry).length }
    }),
  }
}

/** estimateStateTokens of the composed state, computed from the piece lengths. */
const stateTokensOf = (projectChars: number, issueChars: number, count: number) =>
  Math.ceil((ENVELOPE_CHARS + projectChars + issueChars + Math.max(0, count - 1)) / CHARS_PER_TOKEN)

function fits(stateTokens: number, count: number, q: QuestionBudget, limits: RequestLimits): boolean {
  return (
    stateTokens + q.longestQuestionTokens <= limits.stateTokens &&
    stateTokens + count * q.perIssueTokens <= limits.totalTokens
  )
}

/** Greedy in-order packing (optimal for contiguous splits); null when one issue alone does not fit. */
function pack(sized: Sized, q: QuestionBudget, limits: RequestLimits): PlannedBatch[] | null {
  const batches: PlannedBatch[] = []
  let current: Sized['entries'] = []
  let chars = 0
  const close = () => {
    if (current.length === 0) return
    const stateTokens = stateTokensOf(sized.projectChars, chars, current.length)
    const questionsTokens = current.length * q.perIssueTokens
    batches.push({
      issues: current.map((c) => c.issue),
      state: { project: sized.project, issues: current.map((c) => c.entry) },
      stateTokens,
      questionsTokens,
      totalTokens: stateTokens + questionsTokens,
    })
    current = []
    chars = 0
  }
  for (const item of sized.entries) {
    const tokens = stateTokensOf(sized.projectChars, chars + item.chars, current.length + 1)
    if (fits(tokens, current.length + 1, q, limits)) {
      current.push(item)
      chars += item.chars
      continue
    }
    close()
    if (!fits(stateTokensOf(sized.projectChars, item.chars, 1), 1, q, limits)) return null
    current.push(item)
    chars = item.chars
  }
  close()
  return batches
}

/**
 * Plans the requests of a batched run: the minimum number of requests the
 * floor profile allows, using the loosest profile that achieves that count.
 * For a typical repository that is ONE request with the standard profile.
 */
export function planBatches(issues: readonly Issue[], ctx: ProjectContext, opts: PlanBatchesOptions): BatchPlan {
  const limits = opts.limits ?? DEFAULT_REQUEST_LIMITS
  const profiles = opts.only ? [trimmingProfile(opts.only)] : profilesUpTo(opts.floor ?? DEFAULT_TRIMMING_FLOOR)
  const floor = profiles[profiles.length - 1]

  // Too large alone at the floor means too large at every looser profile too.
  const floorSized = sizeFor(issues, ctx, floor, opts)
  const tooLarge = floorSized.entries
    .filter((e) => !fits(stateTokensOf(floorSized.projectChars, e.chars, 1), 1, opts.questions, limits))
    .map((e) => e.issue)
  const excluded = new Set(tooLarge)
  const eligible = issues.filter((issue) => !excluded.has(issue))
  if (eligible.length === 0) return { profile: profiles[0].id, batches: [], tooLarge }

  const floorBatches = pack(sizeFor(eligible, ctx, floor, opts), opts.questions, limits) ?? []
  for (const profile of profiles.slice(0, -1)) {
    const batches = pack(sizeFor(eligible, ctx, profile, opts), opts.questions, limits)
    if (batches && batches.length === floorBatches.length) return { profile: profile.id, batches, tooLarge }
  }
  return { profile: floor.id, batches: floorBatches, tooLarge }
}
