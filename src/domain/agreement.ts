// issue-criticity — agreement between two classification runs of the same
// issues (docs/batching.md). Pure. The batching harness
// (scripts/compare-batching.mjs) compares each batched trimming profile with
// the per-issue baseline, so the user can pick the tightest profile whose
// agreement stays acceptable. Jev is not deterministic run to run, so compare
// against a repeated baseline (the harness's --noise) before reading too much
// into small differences.
import type { Classification } from './types'

export interface LevelAgreement {
  /** Share of issues with the same level (0..1); null when nothing was compared. */
  exact: number | null
  /** Mean of candidate − baseline confidence; null when no pair has both. */
  meanConfidenceDelta: number | null
  meanAbsConfidenceDelta: number | null
}

export interface RelevanceAgreement extends LevelAgreement {
  /** Mean |candidate − baseline| of the 0..100 relevance value. */
  meanAbsDiff: number | null
}

export interface AgreementReport {
  /** Issues classified in both runs. */
  compared: number
  /** Baseline issues the candidate did not classify, ascending. */
  missing: number[]
  complexity: LevelAgreement
  criticality: LevelAgreement
  effort: LevelAgreement
  relevance: RelevanceAgreement
  kind: LevelAgreement
}

const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length

type Pair = [Classification, Classification]
type Answer = { confidence?: number }

function agreement(pairs: readonly Pair[], same: (a: Classification, b: Classification) => boolean, pick: (c: Classification) => Answer): LevelAgreement {
  const deltas = pairs
    .map(([a, b]) => [pick(a).confidence, pick(b).confidence] as const)
    .filter((p): p is readonly [number, number] => p[0] !== undefined && p[1] !== undefined)
    .map(([a, b]) => b - a)
  return {
    exact: mean(pairs.map(([a, b]) => (same(a, b) ? 1 : 0))),
    meanConfidenceDelta: mean(deltas),
    meanAbsConfidenceDelta: mean(deltas.map(Math.abs)),
  }
}

/** Compares `candidate` with `baseline` on the issues both classified. */
export function compareClassifications(
  baseline: ReadonlyMap<number, Classification>,
  candidate: ReadonlyMap<number, Classification>,
): AgreementReport {
  const pairs: Pair[] = []
  const missing: number[] = []
  for (const [issueNumber, base] of baseline) {
    const other = candidate.get(issueNumber)
    if (other) pairs.push([base, other])
    else missing.push(issueNumber)
  }
  missing.sort((a, b) => a - b)
  const level = (key: 'complexity' | 'criticality' | 'effort') =>
    agreement(pairs, (a, b) => a[key].level === b[key].level, (c) => c[key])
  return {
    compared: pairs.length,
    missing,
    complexity: level('complexity'),
    criticality: level('criticality'),
    effort: level('effort'),
    relevance: {
      ...agreement(pairs, (a, b) => a.relevance.value === b.relevance.value, (c) => c.relevance),
      meanAbsDiff: mean(pairs.map(([a, b]) => Math.abs(a.relevance.value - b.relevance.value))),
    },
    kind: agreement(pairs, (a, b) => a.kind.choice === b.kind.choice, (c) => c.kind),
  }
}

// ── Table ────────────────────────────────────────────────────────────
export interface HarnessRow {
  label: string
  requests: number
  inputTokens: number
  seconds: number
  /** null for the baseline row itself. */
  report: AgreementReport | null
}

const HEADER = ['mode', 'calls', 'tokens', 'secs', 'cmplx', 'crit', 'effort', 'kind', 'rel±', 'conf±']

const pct = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`)
const num = (value: number | null, digits: number) => (value === null ? '—' : value.toFixed(digits))

/** Mean signed confidence delta over the four scored dimensions (kind excluded, §4.4). */
function confidenceDelta(report: AgreementReport): number | null {
  return mean(
    [report.complexity, report.criticality, report.effort, report.relevance]
      .map((d) => d.meanConfidenceDelta)
      .filter((d): d is number => d !== null),
  )
}

/** A fixed-width text table: agreement columns are exact-match shares vs the baseline. */
export function formatAgreementTable(rows: readonly HarnessRow[]): string {
  const cells = rows.map((row) => {
    const head = [row.label, String(row.requests), String(row.inputTokens), row.seconds.toFixed(1)]
    const r = row.report
    if (!r) return [...head, '(baseline)', '', '', '', '', '']
    return [
      ...head,
      pct(r.complexity.exact),
      pct(r.criticality.exact),
      pct(r.effort.exact),
      pct(r.kind.exact),
      num(r.relevance.meanAbsDiff, 1),
      num(confidenceDelta(r), 2),
    ]
  })
  const table = [HEADER, ...cells]
  const widths = HEADER.map((_, i) => Math.max(...table.map((line) => line[i].length)))
  const render = (line: readonly string[]) =>
    line.map((cell, i) => cell.padEnd(widths[i])).join('  ').trimEnd()
  return [render(HEADER), widths.map((w) => '-'.repeat(w)).join('  '), ...cells.map(render)].join('\n')
}
