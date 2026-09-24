// One-off smoke check of the in-browser provider (docs/browser-inference.md §Smoke check).
// Loads the default browser model through the same code the app uses
// (loadBrowserModel → createBrowserJevTransport → toClassification) and
// classifies ONE synthetic fixture issue with the five questions. Results go
// to `window.__smoke` for scripts/browser-smoke.mjs to read. Not a benchmark:
// one issue, one pass, no loops.
import { loadBrowserModel } from '../../src/adapters/browser/browserModel'
import type { LoadedBrowserModel } from '../../src/adapters/browser/browserModel'
import { createBrowserJevTransport } from '../../src/adapters/browser/browserJevTransport'
import { detectBrowserSupport } from '../../src/adapters/browser/webgpu'
import { cachedModelBytes } from '../../src/adapters/browser/modelCache'
import { buildSystemOneBody } from '../../src/adapters/jev/client'
import { QUESTIONS_VERSION } from '../../src/adapters/jev/questions'
import { buildIssueState } from '../../src/domain/jevState'
import { toClassification } from '../../src/domain/classification'
import { BROWSER_MODELS } from '../../src/domain/provider'
import { typicalIssues, typicalProjectContext } from '../../tests/fakes/typicalIssues'

interface SmokeResult {
  done: boolean
  error?: string
  support?: string
  device?: string
  modelId?: string
  loadMs?: number
  timeToFirstAnswerMs?: number
  questions: { tokens: number; ms: number }[]
  totalMs?: number
  stateTokensEstimate?: number
  classification?: unknown
  cachedBytes?: number | null
  fetched?: string[]
  progressEvents: number
}

const result: SmokeResult = { done: false, questions: [], progressEvents: 0 }
;(window as unknown as { __smoke: SmokeResult }).__smoke = result
const status = document.getElementById('status')!
const show = () => (status.textContent = JSON.stringify(result, null, 2))

async function run(): Promise<void> {
  const t0 = performance.now()
  const modelId = BROWSER_MODELS[0].id
  result.modelId = modelId
  const support = await detectBrowserSupport()
  result.support = support
  if (support === 'none') throw new Error('Neither WebGPU nor WebAssembly is available')

  const loaded: LoadedBrowserModel = await loadBrowserModel({
    modelId,
    backend: support,
    onProgress: () => {
      result.progressEvents++
    },
  })
  result.device = loaded.device
  result.loadMs = Math.round(performance.now() - t0)
  show()

  // Time every forward pass (one per question).
  const timed = {
    ...loaded,
    logitsAt: async (tokens: readonly number[], ids: readonly number[]) => {
      const start = performance.now()
      const logits = await loaded.logitsAt(tokens, ids)
      result.questions.push({ tokens: tokens.length, ms: Math.round(performance.now() - start) })
      if (result.timeToFirstAnswerMs === undefined) result.timeToFirstAnswerMs = Math.round(performance.now() - t0)
      show()
      return logits
    },
  }

  const now = () => new Date('2026-09-24T00:00:00Z')
  const issue = typicalIssues(1)[0]
  const built = buildIssueState(issue, typicalProjectContext(), { now })
  if (!built.ok) throw new Error('fixture issue too large')
  result.stateTokensEstimate = built.estimatedTokens

  const transport = createBrowserJevTransport({ getModel: async () => timed })
  const response = await transport.systemOne(buildSystemOneBody(built.state, modelId))
  result.classification = toClassification(response.body, {
    requestedModel: modelId,
    questionsVersion: QUESTIONS_VERSION,
    issueUpdatedAt: issue.updatedAt,
    classifiedAt: now().toISOString(),
  })
  result.totalMs = Math.round(performance.now() - t0)
  result.cachedBytes = await cachedModelBytes(modelId)
  result.fetched = performance
    .getEntriesByType('resource')
    .map((e) => e.name.split('?')[0])
    .filter((name) => /\/ort\/|\.wasm$|huggingface\.co|hf\.co/.test(name))
  await loaded.dispose()
}

run()
  .catch((error: unknown) => {
    result.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  })
  .finally(() => {
    result.done = true
    show()
  })
