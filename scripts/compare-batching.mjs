#!/usr/bin/env node
// Batching agreement harness (docs/batching.md). Classifies the same issues
// per-issue (the baseline) and batched under each trimming profile, then prints
// calls, tokens, seconds and per-dimension agreement with the baseline, so the
// tightest profile whose agreement stays acceptable can be chosen as
// Preferences.trimmingFloor.
//
//   JEV_API_KEY=... node scripts/compare-batching.mjs analysis.json [options]
//
// The analysis JSON is one saved analysis exported from localStorage (see
// docs/batching.md). The app's TypeScript modules are loaded through Vite's SSR
// loader, so the harness runs exactly the code the app runs. The key is read
// from the environment only and is never printed.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createServer } from 'vite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROFILES = ['standard', 'compact', 'condensed', 'tight', 'minimal']

const USAGE = `Usage: node scripts/compare-batching.mjs <analysis.json> [options]

Options:
  --profiles <list>     comma-separated trimming profiles (default: all: ${PROFILES.join(',')})
  --limit <n>           classify at most n issues (default: all non-dismissed)
  --concurrency <n>     pool size, 1..8 (default: 4)
  --model <name>        Jev model (default: jev-latest)
  --noise               run the per-issue baseline twice to show run-to-run noise
  --plan                print the request plan per profile and exit (no API calls, no key)
  -h, --help            show this help

Environment:
  JEV_API_KEY           Jev API key (required unless --plan)
  JEV_BASE_URL          API base URL (default: https://api.typesafe.ai)`

function fail(message) {
  console.error(`compare-batching: ${message}`)
  process.exit(1)
}

function parse() {
  let parsed
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        profiles: { type: 'string' },
        limit: { type: 'string' },
        concurrency: { type: 'string' },
        model: { type: 'string' },
        noise: { type: 'boolean', default: false },
        plan: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    })
  } catch (error) {
    fail(`${error.message}\n\n${USAGE}`)
  }
  const { values, positionals } = parsed
  if (values.help) {
    console.log(USAGE)
    process.exit(0)
  }
  if (positionals.length !== 1) fail(`expected one analysis JSON file\n\n${USAGE}`)
  const profiles = values.profiles ? values.profiles.split(',').map((p) => p.trim()).filter(Boolean) : PROFILES
  const unknown = profiles.filter((p) => !PROFILES.includes(p))
  if (unknown.length > 0) fail(`unknown profile(s): ${unknown.join(', ')}`)
  const limit = values.limit === undefined ? Infinity : Number(values.limit)
  const concurrency = values.concurrency === undefined ? 4 : Number(values.concurrency)
  if (!(limit > 0)) fail('--limit must be a positive number')
  if (!(concurrency >= 1 && concurrency <= 8)) fail('--concurrency must be 1..8')
  return {
    file: positionals[0],
    profiles,
    limit,
    concurrency: Math.round(concurrency),
    model: values.model ?? 'jev-latest',
    noise: values.noise,
    planOnly: values.plan,
  }
}

/** Accepts the stored Analysis JSON (or that JSON as a quoted string). */
function readAnalysis(file) {
  let value
  try {
    value = JSON.parse(readFileSync(file, 'utf8'))
    if (typeof value === 'string') value = JSON.parse(value)
  } catch (error) {
    fail(`could not read ${file}: ${error.message}`)
  }
  if (!value || !Array.isArray(value.rows) || !value.projectContext) {
    fail(`${file} is not a saved analysis (expected "rows" and "projectContext")`)
  }
  return value
}

async function loadModules() {
  const server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  const load = (path) => server.ssrLoadModule(path)
  const [runner, client, transport, batchState, agreement, questions] = await Promise.all([
    load('/src/adapters/jev/runner.ts'),
    load('/src/adapters/jev/client.ts'),
    load('/src/adapters/jev/transport.ts'),
    load('/src/domain/jevBatchState.ts'),
    load('/src/domain/agreement.ts'),
    load('/src/adapters/jev/questions.ts'),
  ])
  const batchQuestions = await load('/src/adapters/jev/batchQuestions.ts')
  const jevState = await load('/src/domain/jevState.ts')
  return { server, runner, client, transport, batchState, agreement, questions, batchQuestions, jevState }
}

function printPlan(m, issues, projectContext, profiles) {
  const opts = { now: () => new Date(), questions: m.batchQuestions.BATCH_QUESTION_BUDGET }
  const auto = m.batchState.planBatches(issues, projectContext, opts)
  console.log(`${issues.length} issues; the default fitter uses ${auto.batches.length} request(s), profile "${auto.profile}".`)
  console.log('')
  console.log('mode        requests  tokens (estimated)')
  let perIssueTokens = 0
  let perIssueRequests = 0
  for (const issue of issues) {
    const built = m.jevState.buildIssueState(issue, projectContext, { now: opts.now })
    if (!built.ok) continue
    perIssueRequests++
    perIssueTokens += built.estimatedTokens + m.questions.QUESTIONS_TOKENS
  }
  console.log(`${'per-issue'.padEnd(10)}  ${String(perIssueRequests).padEnd(8)}  ${perIssueTokens}`)
  for (const profile of profiles) {
    const plan = m.batchState.planBatches(issues, projectContext, { ...opts, only: profile })
    const tokens = plan.batches.reduce((sum, b) => sum + b.totalTokens, 0)
    console.log(`${profile.padEnd(10)}  ${String(plan.batches.length).padEnd(8)}  ${tokens}`)
  }
}

async function main() {
  const args = parse()
  const analysis = readAnalysis(args.file)
  const dismissed = new Set(analysis.working?.dismissed ?? [])
  const issues = analysis.rows
    .map((row) => row.issue)
    .filter((issue) => !dismissed.has(issue.number))
    .slice(0, args.limit)
  if (issues.length === 0) fail('the analysis has no issues to classify')

  const apiKey = process.env.JEV_API_KEY?.trim() ?? ''
  if (!args.planOnly && !apiKey) fail('JEV_API_KEY is not set (use --plan for a keyless dry run)')

  const m = await loadModules()
  try {
    printPlan(m, issues, analysis.projectContext, args.profiles)
    if (args.planOnly) return

    const transport = m.transport.createHttpJevTransport({
      baseUrl: process.env.JEV_BASE_URL?.trim() || 'https://api.typesafe.ai',
      getApiKey: () => apiKey,
      fetch: (input, init) => globalThis.fetch(input, init),
      timeoutMs: 120_000,
    })
    const jev = m.client.createJevClient({ transport, model: args.model })

    const runOnce = async (label, extra) => {
      let calls = 0
      const counted = {
        model: jev.model,
        classify: (...a) => (calls++, jev.classify(...a)),
        classifyBatch: (...a) => (calls++, jev.classifyBatch(...a)),
      }
      const results = new Map()
      process.stderr.write(`running ${label}…\n`)
      const summary = await m.runner.runClassification({
        issues,
        projectContext: analysis.projectContext,
        client: counted,
        concurrency: args.concurrency,
        questionsVersion: m.questions.QUESTIONS_VERSION,
        onResult: (n, outcome) => {
          if (outcome.ok) results.set(n, outcome.classification)
        },
        ...extra,
      })
      if (summary.status === 'auth-failed') fail('the Jev key was rejected')
      if (summary.failed > 0) process.stderr.write(`  ${label}: ${summary.failed} issue(s) failed\n`)
      return { label, results, calls, inputTokens: summary.inputTokens, seconds: summary.elapsedMs / 1000 }
    }

    const baseline = await runOnce('per-issue', { mode: 'per-issue' })
    const runs = []
    if (args.noise) runs.push(await runOnce('per-issue (repeat)', { mode: 'per-issue' }))
    for (const profile of args.profiles) {
      runs.push(await runOnce(`batched ${profile}`, { mode: 'batched', forceProfile: profile }))
    }

    const rows = [
      { label: baseline.label, requests: baseline.calls, inputTokens: baseline.inputTokens, seconds: baseline.seconds, report: null },
      ...runs.map((run) => ({
        label: run.label,
        requests: run.calls,
        inputTokens: run.inputTokens,
        seconds: run.seconds,
        report: m.agreement.compareClassifications(baseline.results, run.results),
      })),
    ]
    console.log('')
    console.log(m.agreement.formatAgreementTable(rows))
    console.log('')
    console.log('cmplx/crit/effort/kind: exact matches with per-issue; rel±: mean |Δ| of relevance (0..100);')
    console.log('conf±: mean signed confidence change. calls include retries and validation splits.')
  } finally {
    await m.server.close()
  }
}

main().catch((error) => fail(error?.message ?? String(error)))
