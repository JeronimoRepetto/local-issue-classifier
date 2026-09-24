// local-issue-classifier — Jev client: builds the `/v1/systemone` request for one
// issue state or for a batch of issues (docs/batching.md) and
// sends it through a JevTransport. The model
// name is an option defaulting to DEFAULT_JEV_MODEL, so a compatible provider
// serving the same request shape only needs a different model and baseUrl.
import { DEFAULT_JEV_MODEL } from '../../domain/types'
import type { JevState } from '../../domain/jevState'
import type { JevBatchState } from '../../domain/jevBatchState'
import { QUESTIONS } from './questions'
import type { JevQuestion } from './questions'
import type {
  JevHttpResult,
  JevTransport,
  ModelsResponseBody,
  SystemOneRequestBody,
  SystemOneResponseBody,
} from './transport'

/** The request body: `model`, `state`, `questions`, in the §4.6 order. */
export function buildSystemOneBody(state: JevState, model: string): SystemOneRequestBody {
  return { model, state, questions: QUESTIONS }
}

/** A batched request: the composite state and its namespaced questions (docs/batching.md). */
export function buildBatchSystemOneBody(
  state: JevBatchState,
  questions: Readonly<Record<string, JevQuestion>>,
  model: string,
): SystemOneRequestBody {
  return { model, state, questions }
}

export interface JevClientOptions {
  transport: JevTransport
  /** Preferences.jevModel; default DEFAULT_JEV_MODEL ('jev-latest'). */
  model?: string
}

export interface JevClient {
  /** The model name sent with every request (also the fallback for Classification.model). */
  readonly model: string
  classify(state: JevState, signal?: AbortSignal): Promise<JevHttpResult<SystemOneResponseBody>>
  classifyBatch(
    state: JevBatchState,
    questions: Readonly<Record<string, JevQuestion>>,
    signal?: AbortSignal,
  ): Promise<JevHttpResult<SystemOneResponseBody>>
  listModels(signal?: AbortSignal): Promise<JevHttpResult<ModelsResponseBody>>
}

export function createJevClient(options: JevClientOptions): JevClient {
  const { transport } = options
  const model = options.model ?? DEFAULT_JEV_MODEL
  return {
    model,
    classify: (state, signal) => transport.systemOne(buildSystemOneBody(state, model), signal),
    classifyBatch: (state, questions, signal) =>
      transport.systemOne(buildBatchSystemOneBody(state, questions, model), signal),
    listModels: (signal) => transport.listModels(signal),
  }
}
