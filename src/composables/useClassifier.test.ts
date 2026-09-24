// Task 11 — the classifier composable, wired to the
// real useAnalysis / useSecrets / useRunGuard singletons and a fake Jev client.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyClassification, createAnalysis, dismiss } from '../domain/analysis'
import type { Analysis, Preferences } from '../domain/types'
import { STORAGE_KEYS, defaultPreferences, defaultProjectContext } from '../domain/types'
import type { Scheduler } from './useAnalysis'
import { fakeClassification, fakeIssue, fakeRepo } from '../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../tests/fakes/memoryStorage'
import { http, jevBody, ok, scriptedClient } from '../../tests/fakes/fakeJev'
import { QUESTIONS_VERSION } from '../adapters/jev/questions'
import { BATCH_QUESTION_BUDGET } from '../adapters/jev/batchQuestions'
import { ANSWER_DIMENSIONS } from '../domain/classification'
import type { Handler, ScriptedClient } from '../../tests/fakes/fakeJev'

type Mods = {
  classifier: typeof import('./useClassifier')
  analysis: typeof import('./useAnalysis')
  secrets: typeof import('./useSecrets')
  runGuard: typeof import('./useRunGuard')
}

let storage: MemoryStorage
let mods: Mods
let client: ScriptedClient
let timers: (() => void)[]

const manualScheduler: Scheduler = {
  setTimeout: (fn) => {
    timers.push(fn)
    return timers.length
  },
  clearTimeout: () => undefined,
}

const NOW = '2026-09-23T00:00:00Z'

/** #1 unclassified, #2 done (current), #3 dismissed, #4 unclassified. */
function analysis(overrides: { v2?: number } = {}): Analysis {
  let a = createAnalysis({
    id: 'a1',
    repo: fakeRepo(),
    stateFilter: 'open',
    now: NOW,
    prefs: defaultPreferences(),
    projectContext: defaultProjectContext('acme/widgets'),
    issues: [1, 2, 3, 4].map((n) => fakeIssue(n)),
    commentsFetched: false,
  })
  a = applyClassification(
    a,
    2,
    { ok: true, classification: fakeClassification({ questionsVersion: overrides.v2 ?? QUESTIONS_VERSION }) },
    NOW,
  )
  return dismiss(a, [3], NOW)
}

/** Existing scenarios run per-issue (one request per issue); batched ones opt in. */
async function load(handler: Handler, prefs: Partial<Preferences> = { classifyMode: 'per-issue' }) {
  storage = storage ?? new MemoryStorage()
  if (storage.getItem(STORAGE_KEYS.preferences) === null) {
    storage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ ...defaultPreferences(), ...prefs }))
  }
  const { setAppStorage } = await import('../adapters/storage/appStorage')
  setAppStorage(storage)
  mods = {
    analysis: await import('./useAnalysis'),
    secrets: await import('./useSecrets'),
    runGuard: await import('./useRunGuard'),
    classifier: await import('./useClassifier'),
  }
  timers = []
  mods.analysis.configureAnalysis({ scheduler: manualScheduler, clock: () => NOW })
  client = scriptedClient(handler)
  mods.classifier.configureClassifier({
    createClient: () => client,
    sleep: async () => undefined,
    now: () => new Date(NOW),
  })
}

/** The saved copy in IndexedDB (the per-test fake), once pending saves have landed. */
async function stored(): Promise<Analysis | null> {
  await mods.analysis.useAnalysis().settled()
  const { getAnalysisDb } = await import('../adapters/storage/analysisDb')
  const result = await getAnalysisDb().loadAnalysis('a1')
  return result.ok ? result.analysis : null
}

const row = (a: Analysis | null, n: number) => a?.rows.find((r) => r.issue.number === n)

beforeEach(() => {
  vi.resetModules()
  storage = new MemoryStorage()
})

describe('useClassifier: selection', () => {
  it('sends only unclassified issues and skips dismissed ones', async () => {
    await load(() => ok())
    mods.analysis.useAnalysis().setCurrent(analysis())
    mods.secrets.useSecrets().setJevKey('jev-test')

    const summary = await mods.classifier.useClassifier().start()
    expect(client.calls.map((c) => c.issue).sort()).toEqual([1, 4])
    expect(summary).toMatchObject({ status: 'completed', classified: 2 })
  })

  it('marks classifications from an older questions version stale and re-sends them', async () => {
    await load(() => ok())
    mods.analysis.useAnalysis().setCurrent(analysis({ v2: 0 }))
    mods.secrets.useSecrets().setJevKey('jev-test')

    await mods.classifier.useClassifier().start()
    expect(client.calls.map((c) => c.issue).sort()).toEqual([1, 2, 4])
  })

  it('does nothing without a Jev key', async () => {
    await load(() => ok())
    mods.analysis.useAnalysis().setCurrent(analysis())
    expect(await mods.classifier.useClassifier().start()).toBeNull()
    expect(client.calls).toEqual([])
    expect(mods.classifier.useClassifier().canClassify.value).toBe(false)
  })

  it('reports scope counts and a cost estimate before the run', async () => {
    await load(() => ok())
    mods.analysis.useAnalysis().setCurrent(analysis())
    const classifier = mods.classifier.useClassifier()
    expect(classifier.counts([1, 2])).toEqual({ unclassified: 2, all: 3, filtered: 1 })
    const estimate = classifier.estimate({ scope: 'unclassified' })
    expect(estimate).toMatchObject({ requests: 2, tooLarge: 0 })
    expect(estimate?.inputTokens).toBeGreaterThan(0)
    expect(estimate?.costUsd).toBeGreaterThan(0)
    expect(estimate?.seconds).toBeGreaterThan(0)
  })
})

describe('useClassifier: incremental apply and run guard', () => {
  it('applies each result as it arrives and coalesces the saves', async () => {
    const gates = new Map<number, () => void>()
    await load(
      (issue) =>
        new Promise((resolve) => {
          gates.set(issue, () => resolve(ok()))
        }),
    )
    const store = mods.analysis.useAnalysis()
    store.setCurrent(analysis())
    mods.secrets.useSecrets().setJevKey('jev-test')
    await store.settled()
    const save = vi.spyOn((await import('../adapters/storage/analysisDb')).getAnalysisDb(), 'saveAnalysis')

    const run = mods.classifier.useClassifier().start()
    await vi.waitFor(() => expect(gates.size).toBe(2))
    expect(mods.runGuard.isRunActive()).toBe(true)
    expect(mods.classifier.useClassifier().state.phase).toBe('running')

    gates.get(1)?.()
    await vi.waitFor(() => expect(row(store.current.value, 1)?.status).toBe('done'))
    expect(row(store.current.value, 4)?.status).toBe('unclassified')
    // Saved by the coalesced timer, not on every result.
    expect(save).not.toHaveBeenCalled()
    expect(timers).toHaveLength(1)
    timers[0]()
    expect(row(await stored(), 1)?.status).toBe('done')

    gates.get(4)?.()
    await run
    expect(mods.runGuard.isRunActive()).toBe(false)
    expect(row(await stored(), 4)?.status).toBe('done') // flushed at the end of the run
  })
})

describe('useClassifier: auth failures', () => {
  it.each([
    ['401', http(401)],
    ['403 authentication_error', http(403, { error_type: 'authentication_error' })],
  ])('%s aborts the run and clears the Jev key', async (_, response) => {
    await load(() => response)
    mods.analysis.useAnalysis().setCurrent(analysis())
    const secrets = mods.secrets.useSecrets()
    secrets.setJevKey('jev-bad')
    secrets.setGitHubToken('ghp-keep')

    const summary = await mods.classifier.useClassifier().start()
    expect(summary?.status).toBe('auth-failed')
    expect(secrets.hasJevKey.value).toBe(false)
    expect(secrets.state.githubToken).toBe('ghp-keep')
    expect(mods.runGuard.isRunActive()).toBe(false)
    expect(row(mods.analysis.useAnalysis().current.value, 1)?.status).toBe('unclassified')
  })
})

describe('useClassifier: cancel, retry failed, resume', () => {
  it('cancel keeps completed results and leaves the rest unclassified', async () => {
    await load(async (issue, _attempt, signal) => {
      if (issue === 1) return ok()
      return new Promise((_, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    })
    const store = mods.analysis.useAnalysis()
    store.setCurrent(analysis())
    mods.secrets.useSecrets().setJevKey('jev-test')
    const classifier = mods.classifier.useClassifier()

    const run = classifier.start()
    await vi.waitFor(() => expect(row(store.current.value, 1)?.status).toBe('done'))
    classifier.cancel()
    const summary = await run

    expect(summary).toMatchObject({ status: 'cancelled', classified: 1, skipped: 1 })
    expect(row(await stored(), 1)?.status).toBe('done')
    expect(row(await stored(), 4)?.status).toBe('unclassified')
    expect(classifier.state.phase).toBe('finished')
  })

  it('retry failed re-sends only the failures of the last run', async () => {
    await load((issue, attempt) => (issue === 4 && attempt === 1 ? http(404) : ok()))
    mods.analysis.useAnalysis().setCurrent(analysis({ v2: 0 }))
    mods.secrets.useSecrets().setJevKey('jev-test')
    const classifier = mods.classifier.useClassifier()

    const first = await classifier.start()
    expect(first?.failedNumbers).toEqual([4])
    client.calls.length = 0
    const second = await classifier.retryFailed()
    expect(client.calls.map((c) => c.issue)).toEqual([4])
    expect(second).toMatchObject({ classified: 1, failed: 0 })
  })

  it('after a reload, re-entering the key and starting again sends only what is left', async () => {
    await load(async (issue, _attempt, signal) => {
      if (issue === 1) return ok()
      return new Promise((_, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    })
    const store = mods.analysis.useAnalysis()
    store.setCurrent(analysis())
    mods.secrets.useSecrets().setJevKey('jev-test')
    const run = mods.classifier.useClassifier().start()
    await vi.waitFor(() => expect(row(store.current.value, 1)?.status).toBe('done'))
    timers[0]() // the coalesced save lands before the "reload"
    mods.classifier.useClassifier().cancel()
    await run
    await store.settled()

    vi.resetModules()
    await load(() => ok())
    expect(mods.secrets.useSecrets().hasJevKey.value).toBe(false)
    expect(await mods.analysis.useAnalysis().restoreLastOpened()).toBe(true)
    mods.secrets.useSecrets().setJevKey('jev-test')
    await mods.classifier.useClassifier().start()
    expect(client.calls.map((c) => c.issue)).toEqual([4])
  })
})

describe('useClassifier: batched mode (the default)', () => {
  it('sends the selected issues in ONE request and applies each result', async () => {
    await load(() => ok(), {})
    mods.analysis.useAnalysis().setCurrent(analysis())
    mods.secrets.useSecrets().setJevKey('jev-test')
    const classifier = mods.classifier.useClassifier()

    const summary = await classifier.start()
    expect(client.batches).toEqual([[1, 4]])
    expect(summary).toMatchObject({ status: 'completed', classified: 2, requests: 1, profile: 'standard' })
    expect(classifier.state.progress).toMatchObject({ done: 2, total: 2, requests: 1, profile: 'standard' })
    expect(row(mods.analysis.useAnalysis().current.value, 4)?.status).toBe('done')
  })

  it('estimates one request, its tokens once, the profile and one call of latency', async () => {
    await load(() => ok(), {})
    mods.analysis.useAnalysis().setCurrent(analysis())
    const estimate = mods.classifier.useClassifier().estimate({ scope: 'unclassified' })
    expect(estimate).toMatchObject({ mode: 'batched', requests: 1, profile: 'standard', tooLarge: 0, seconds: 2 })
    const perIssueTokens = BATCH_QUESTION_BUDGET.perIssueTokens
    expect(estimate?.inputTokens).toBeGreaterThan(2 * perIssueTokens)
    expect(estimate?.costUsd).toBeCloseTo(((estimate?.inputTokens ?? 0) / 1_000_000) * 0.042, 10)
  })

  it('per-issue mode estimates one request per issue and no profile', async () => {
    await load(() => ok())
    mods.analysis.useAnalysis().setCurrent(analysis())
    const estimate = mods.classifier.useClassifier().estimate({ scope: 'unclassified' })
    expect(estimate).toMatchObject({ mode: 'per-issue', requests: 2, profile: null, seconds: 1 })
  })

  it('passes the trimming floor to the fitter', async () => {
    await load(() => ok(), { trimmingFloor: 'standard' })
    mods.analysis.useAnalysis().setCurrent(analysis())
    mods.secrets.useSecrets().setJevKey('jev-test')
    const summary = await mods.classifier.useClassifier().start()
    expect(summary?.profile).toBe('standard')
  })
})

describe('useClassifier: local provider (T16)', () => {
  const LOCAL = { kind: 'local' as const, baseUrl: 'http://localhost:8009', model: 'kev-latest' }

  it('prices a local run at 0 but keeps the request count and latency estimate', async () => {
    await load(() => ok(), { classifyMode: 'per-issue', provider: LOCAL })
    mods.analysis.useAnalysis().setCurrent(analysis())
    const estimate = mods.classifier.useClassifier().estimate({ scope: 'unclassified' })
    expect(estimate).toMatchObject({ mode: 'per-issue', requests: 2, costUsd: 0, seconds: 1 })
    expect(estimate?.inputTokens).toBeGreaterThan(0)
  })

  it('assumes a small per-call latency for a local provider, not the cloud one (T-provider-switch)', async () => {
    // concurrency 1 makes the two assumptions diverge: 2 requests at the cloud's
    // 2 s/call would be ceil(2*2/1)=4; at the local constant (1 s/call) it is 2.
    await load(() => ok(), { classifyMode: 'per-issue', provider: LOCAL, concurrency: 1 })
    mods.analysis.useAnalysis().setCurrent(analysis())
    const { useClassifier, LOCAL_SECONDS_PER_CALL } = mods.classifier
    expect(LOCAL_SECONDS_PER_CALL).toBeLessThan(2)
    const estimate = useClassifier().estimate({ scope: 'unclassified' })
    expect(estimate?.seconds).toBe(Math.ceil(2 * LOCAL_SECONDS_PER_CALL))
  })

  it('stores the model the local server actually answered with, not just the requested one', async () => {
    await load(() => ok({ ...jevBody(), model: 'kev-latest' }), { classifyMode: 'per-issue', provider: LOCAL })
    mods.analysis.useAnalysis().setCurrent(analysis())
    await mods.classifier.useClassifier().start()
    const stored1 = row(await stored(), 1)
    expect(stored1?.classification?.model).toBe('kev-latest')
  })

  it('classifies with a local provider without any key, using the local model', async () => {
    const factory = vi.fn()
    await load(() => ok(), { classifyMode: 'per-issue', provider: LOCAL })
    mods.classifier.configureClassifier({
      createClient: (options) => {
        factory(options.model, options.getApiKey())
        return client
      },
    })
    mods.analysis.useAnalysis().setCurrent(analysis())
    const classifier = mods.classifier.useClassifier()
    expect(classifier.canClassify.value).toBe(true)
    const summary = await classifier.start()
    expect(summary).toMatchObject({ status: 'completed', classified: 2 })
    expect(factory).toHaveBeenCalledWith('kev-latest', '')
  })

  /** Six issues whose bodies alone overflow a small local state budget in one request. */
  function bigAnalysis(): Analysis {
    return createAnalysis({
      id: 'big',
      repo: fakeRepo(),
      stateFilter: 'open',
      now: NOW,
      prefs: defaultPreferences(),
      projectContext: defaultProjectContext('acme/widgets'),
      issues: [1, 2, 3, 4, 5, 6].map((n) => fakeIssue(n, { body: `${'word '.repeat(700)}`.trim() })),
      commentsFetched: false,
    })
  }

  it('caps a local batch at localMaxStateTokens (docs/batching.md), in the estimate and the run', async () => {
    await load(() => ok(), { classifyMode: 'batched', provider: LOCAL, localMaxStateTokens: 2_000 })
    mods.analysis.useAnalysis().setCurrent(bigAnalysis())
    const classifier = mods.classifier.useClassifier()
    const estimate = classifier.estimate({ scope: 'unclassified' })
    expect(estimate?.requests).toBeGreaterThan(1)
    const summary = await classifier.start()
    expect(client.batches.length).toBe(estimate?.requests)
    expect(client.batches.every((b) => b.length < 6)).toBe(true)
    expect(summary).toMatchObject({ status: 'completed', classified: 6 })
  })

  it('keeps the cloud plan unchanged: the same issues go in one request', async () => {
    await load(() => ok(), { classifyMode: 'batched', localMaxStateTokens: 2_000 })
    mods.analysis.useAnalysis().setCurrent(bigAnalysis())
    mods.secrets.useSecrets().setJevKey('jev-test')
    await mods.classifier.useClassifier().start()
    expect(client.batches).toEqual([[1, 2, 3, 4, 5, 6]])
  })

  it('a rejected local key drops the local key, never the Jev key', async () => {
    await load(() => http(401), { classifyMode: 'per-issue', provider: LOCAL })
    mods.analysis.useAnalysis().setCurrent(analysis())
    const secrets = mods.secrets.useSecrets()
    secrets.setJevKey('jev-test')
    secrets.setLocalApiKey('local-test')
    const summary = await mods.classifier.useClassifier().start()
    expect(summary?.status).toBe('auth-failed')
    expect(secrets.state.localApiKey).toBe('')
    expect(secrets.state.jevApiKey).toBe('jev-test')
  })
})

describe('useClassifier: browser provider (docs/browser-inference.md)', () => {
  const BROWSER = { kind: 'browser' as const, modelId: 'onnx-community/Qwen3-0.6B-ONNX' }

  async function loadBrowser() {
    // Batched and 4 in parallel are the preferences here; the browser provider overrides both.
    await load(() => ok(), { classifyMode: 'batched', concurrency: 4, provider: BROWSER })
    const { configureProvider, useProvider } = await import('./useProvider')
    configureProvider({
      browser: {
        detectSupport: async () => 'webgpu',
        loadModel: async (opts) => ({
          id: opts.modelId,
          device: opts.backend,
          encode: () => [1],
          letterTokenIds: (letters) => letters.map((_, i) => i),
          logitsAt: async (_t, ids) => ids.map(() => 0),
          dispose: async () => {},
        }),
        cachedBytes: async () => 0,
        removeCached: async () => 0,
      },
    })
    return useProvider()
  }

  it('cannot classify before the model is downloaded', async () => {
    await loadBrowser()
    mods.analysis.useAnalysis().setCurrent(analysis())
    expect(mods.classifier.useClassifier().canClassify.value).toBe(false)
  })

  it('estimates per-issue requests at no cost, whatever the preferred mode', async () => {
    await loadBrowser()
    mods.analysis.useAnalysis().setCurrent(analysis())
    expect(mods.classifier.useClassifier().estimate({ scope: 'unclassified' })).toMatchObject({
      mode: 'per-issue',
      requests: 2,
      costUsd: 0,
      profile: null,
    })
  })

  it('assumes 2.5 s per question, five questions per issue, at the forced concurrency of 1', async () => {
    await loadBrowser()
    mods.analysis.useAnalysis().setCurrent(analysis())
    const { BROWSER_SECONDS_PER_QUESTION } = mods.classifier
    const estimate = mods.classifier.useClassifier().estimate({ scope: 'unclassified' })
    expect(estimate?.seconds).toBe(Math.ceil(2 * BROWSER_SECONDS_PER_QUESTION * ANSWER_DIMENSIONS.length))
  })

  it('runs one issue at a time, per issue, never batched', async () => {
    const provider = await loadBrowser()
    await provider.downloadBrowserModel()
    mods.analysis.useAnalysis().setCurrent(analysis())
    const classifier = mods.classifier.useClassifier()
    expect(classifier.canClassify.value).toBe(true)
    const summary = await classifier.start()
    expect(summary).toMatchObject({ status: 'completed', classified: 2, profile: null })
    expect(client.batches).toEqual([])
    expect(client.calls.map((c) => c.issue).sort()).toEqual([1, 4])
    expect(classifier.state.progress?.concurrency).toBe(1)
  })
})
