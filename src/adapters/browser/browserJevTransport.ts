// local-issue-classifier — a JevTransport that answers in-process, with a model
// running in this page (docs/browser-inference.md). No fetch, no proxy: the
// `/v1/systemone` body is answered by readout.ts over the injected model, and
// the result has the same `JevHttpResult` shape the HTTP transport returns, so
// nothing above the transport seam changes.
//
// - Per-issue states only: a batched composite state is refused with
//   BrowserBatchUnsupportedError (a 28k-token state does not fit a browser's
//   attention buffers; useClassifier runs a browser provider per issue).
// - Cancellation is checked between questions (one forward pass each).
// - Nothing here logs; the state never leaves the page.
import type { JevHttpResult, JevTransport, ModelsResponseBody, SystemOneResponseBody } from '../jev/transport'
import { JevTransportError } from '../jev/transport'
import { JEVK5_TEMPERATURE, buildReadoutPrompt, decisionOptions, optionLetters, softmaxWithTemperature, toAnswer } from './readout'
import type { ReadoutAnswer } from './readout'

/** The model surface the readout needs; browserModel.ts implements it with transformers.js. */
export interface ReadoutModel {
  /** The repo id the weights came from, echoed as the answer's `model`. */
  readonly id: string
  /** Prompt text → token ids, without adding special tokens (the prompt carries its own). */
  encode(text: string): number[]
  /** One token id per letter; an empty or shorter list means a letter is not a single token. */
  letterTokenIds(letters: readonly string[]): number[]
  /** Next-token logits at the last prompt position, for the candidate ids only, in their order. */
  logitsAt(promptTokens: readonly number[], candidateTokenIds: readonly number[]): Promise<number[]>
}

export const BATCH_UNSUPPORTED_MESSAGE = 'browser mode supports per-issue states only'

/** A batched (multi-issue) state was sent to the in-browser model. */
export class BrowserBatchUnsupportedError extends Error {
  constructor() {
    super(BATCH_UNSUPPORTED_MESSAGE)
    this.name = 'BrowserBatchUnsupportedError'
  }
}

export interface BrowserJevTransportOptions {
  /** Resolves the loaded model (useProvider owns the download and the cache). */
  getModel: () => Promise<ReadoutModel>
  /** Calibration temperature; default JevK5's 1.532. */
  temperature?: number
}

const isBatchState = (state: unknown) =>
  typeof state === 'object' && state !== null && Array.isArray((state as { issues?: unknown }).issues)

const ok = <T>(body: T): JevHttpResult<T> => ({ status: 200, ok: true, body, retryAfterMs: null })

export function createBrowserJevTransport(options: BrowserJevTransportOptions): JevTransport {
  const temperature = options.temperature ?? JEVK5_TEMPERATURE

  async function model(): Promise<ReadoutModel> {
    try {
      return await options.getModel()
    } catch {
      // The loader's own error stays in useProvider's status; the runner only needs a kind.
      throw new JevTransportError('network')
    }
  }

  return {
    async systemOne(body, signal): Promise<JevHttpResult<SystemOneResponseBody>> {
      if (isBatchState(body.state)) throw new BrowserBatchUnsupportedError()
      if (signal?.aborted) throw new JevTransportError('aborted')
      const loaded = await model()
      const answers: Record<string, ReadoutAnswer> = {}
      let inputTokens = 0
      for (const [id, question] of Object.entries(body.questions)) {
        if (signal?.aborted) throw new JevTransportError('aborted')
        const letters = optionLetters(decisionOptions(question).length)
        const candidates = loaded.letterTokenIds(letters)
        if (candidates.length !== letters.length) throw new Error('An option letter is not a single token for this model')
        const tokens = loaded.encode(buildReadoutPrompt(body.state, question))
        const logits = await loaded.logitsAt(tokens, candidates)
        answers[id] = toAnswer(question, softmaxWithTemperature(logits, temperature), tokens.length)
        inputTokens += tokens.length
      }
      if (signal?.aborted) throw new JevTransportError('aborted')
      return ok({ model: loaded.id, answers, usage: { input_tokens: inputTokens } })
    },

    async listModels(): Promise<JevHttpResult<ModelsResponseBody>> {
      const loaded = await model()
      return ok({ models: [{ name: loaded.id, description: 'Runs in this browser (transformers.js)', release_date: '' }] })
    },
  }
}
