// local-issue-classifier — token and cost estimates for a Jev run (see docs/jev-questions.md).
// Pure: the caller passes each issue's state tokens and the question tokens
// (QUESTIONS_TOKENS lives with the questions in the Jev adapter).
import { estimateTokens } from './text'

/** Jev 1.13 price: input tokens only, output is free (Jev docs, models.md). */
export const JEV_USD_PER_MILLION_INPUT_TOKENS = 0.042

/** Estimated tokens of a state as sent: ceil(chars / 3.5) of its JSON (§4.3). */
export function estimateStateTokens(state: unknown): number {
  return estimateTokens(JSON.stringify(state))
}

export interface RunEstimate {
  requests: number
  inputTokens: number
  costUsd: number
}

/** Batched (docs/batching.md): one request per planned batch, its tokens counted once. */
export function estimateBatchedRun(
  batches: readonly { totalTokens: number }[],
  usdPerMillionInputTokens = JEV_USD_PER_MILLION_INPUT_TOKENS,
): RunEstimate {
  const inputTokens = batches.reduce((sum, batch) => sum + batch.totalTokens, 0)
  return {
    requests: batches.length,
    inputTokens,
    costUsd: (inputTokens / 1_000_000) * usdPerMillionInputTokens,
  }
}

/**
 * One request per issue: each costs its state tokens plus the question tokens.
 * An estimate for a confirmation prompt, not a bill.
 */
export function estimateRun(
  stateTokens: readonly number[],
  questionsTokens: number,
  usdPerMillionInputTokens = JEV_USD_PER_MILLION_INPUT_TOKENS,
): RunEstimate {
  const inputTokens = stateTokens.reduce((sum, tokens) => sum + tokens + questionsTokens, 0)
  return {
    requests: stateTokens.length,
    inputTokens,
    costUsd: (inputTokens / 1_000_000) * usdPerMillionInputTokens,
  }
}
