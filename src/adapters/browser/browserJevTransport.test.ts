// The in-process JevTransport (docs/browser-inference.md): answers a
// `/v1/systemone` body with a model running in this page. The model here is a
// fake that returns fixed logits, so only the transport's own logic is tested.
import { describe, expect, it, vi } from 'vitest'
import { BrowserBatchUnsupportedError, createBrowserJevTransport } from './browserJevTransport'
import type { ReadoutModel } from './browserJevTransport'
import { softmaxWithTemperature } from './readout'
import { QUESTIONS } from '../jev/questions'
import { buildSystemOneBody, buildBatchSystemOneBody } from '../jev/client'
import { batchQuestions } from '../jev/batchQuestions'
import { toClassification } from '../../domain/classification'
import type { JevState } from '../../domain/jevState'
import type { JevBatchState } from '../../domain/jevBatchState'
import { JevTransportError } from '../jev/transport'

const STATE = {
  project: { name: 'acme/widgets', description: null, topics: [], package: null, readme_excerpt: null, contributing_excerpt: null, docs_index: [] },
  issue: { number: 1, title: 'Crash on start', body: 'It crashes.' },
} as unknown as JevState

/** Letter → token id is 1000 + letter index; logits favour the LAST option. */
function fakeModel(overrides: Partial<ReadoutModel> = {}): ReadoutModel {
  return {
    id: 'fake/model',
    encode: (text) => Array.from({ length: Math.min(text.length, 50) }, (_, i) => i),
    letterTokenIds: (letters) => letters.map((l) => 1000 + l.charCodeAt(0) - 65),
    logitsAt: vi.fn(async (_tokens: number[], ids: number[]) => ids.map((_, i) => i * 10)),
    ...overrides,
  }
}

const meta = { requestedModel: 'fake/model', questionsVersion: 2, issueUpdatedAt: 'x', classifiedAt: 'y' }

describe('createBrowserJevTransport', () => {
  it('answers the five questions in the /v1/systemone shape toClassification accepts', async () => {
    const model = fakeModel()
    const transport = createBrowserJevTransport({ getModel: async () => model })
    const result = await transport.systemOne(buildSystemOneBody(STATE, 'fake/model'))
    expect(result).toMatchObject({ status: 200, ok: true, retryAfterMs: null })
    const classification = toClassification(result.body, meta)
    // Highest logit on the last option → top level / last kind.
    expect(classification.complexity.level).toBe('high')
    expect(classification.kind.choice).toBe('other')
    expect(classification.model).toBe('fake/model')
    expect(classification.minConfidence).toBeGreaterThan(0)
  })

  it('runs one forward pass per question, asking for the lettered option ids', async () => {
    const model = fakeModel()
    const transport = createBrowserJevTransport({ getModel: async () => model })
    await transport.systemOne(buildSystemOneBody(STATE, 'fake/model'))
    const calls = vi.mocked(model.logitsAt).mock.calls
    expect(calls).toHaveLength(5)
    expect(calls[0][1]).toEqual([1000, 1001, 1002]) // complexity: A B C
    expect(calls[3][1]).toEqual([1000, 1001, 1002, 1003, 1004]) // relevance: A..E
    expect(calls[4][1]).toHaveLength(6) // kind
  })

  it('applies the temperature softmax to the letter logits', async () => {
    const transport = createBrowserJevTransport({ getModel: async () => fakeModel(), temperature: 2 })
    const result = await transport.systemOne(buildSystemOneBody(STATE, 'fake/model'))
    const answers = (result.body as { answers: Record<string, { probabilities: Record<string, number>; score?: number }> }).answers
    const expected = softmaxWithTemperature([0, 10, 20], 2)
    expect(Object.values(answers.complexity.probabilities)).toEqual(expected)
    expect(answers.complexity.score).toBeCloseTo(expected[1] + 2 * expected[2], 12)
  })

  it('reports the prompt tokens as usage', async () => {
    const transport = createBrowserJevTransport({ getModel: async () => fakeModel() })
    const result = await transport.systemOne(buildSystemOneBody(STATE, 'fake/model'))
    expect((result.body as { usage: { input_tokens: number } }).usage.input_tokens).toBe(5 * 50)
  })

  it('rejects a batched multi-issue state with a typed error', async () => {
    const model = fakeModel()
    const transport = createBrowserJevTransport({ getModel: async () => model })
    const batch = { project: STATE.project, issues: [] } as unknown as JevBatchState
    await expect(transport.systemOne(buildBatchSystemOneBody(batch, batchQuestions([1]), 'fake/model'))).rejects.toThrow(
      BrowserBatchUnsupportedError,
    )
    await expect(transport.systemOne(buildBatchSystemOneBody(batch, batchQuestions([1]), 'fake/model'))).rejects.toThrow(
      'browser mode supports per-issue states only',
    )
    expect(model.logitsAt).not.toHaveBeenCalled()
  })

  it('refuses a letter that is not a single token', async () => {
    const transport = createBrowserJevTransport({
      getModel: async () => fakeModel({ letterTokenIds: () => [] }),
    })
    await expect(transport.systemOne(buildSystemOneBody(STATE, 'fake/model'))).rejects.toThrow(/letter/i)
  })

  it('stops between questions when cancelled', async () => {
    const controller = new AbortController()
    const model = fakeModel({
      logitsAt: vi.fn(async (_t: number[], ids: number[]) => {
        controller.abort()
        return ids.map(() => 0)
      }),
    })
    const transport = createBrowserJevTransport({ getModel: async () => model })
    await expect(transport.systemOne(buildSystemOneBody(STATE, 'fake/model'), controller.signal)).rejects.toMatchObject({
      name: 'JevTransportError',
      kind: 'aborted',
    })
    expect(model.logitsAt).toHaveBeenCalledTimes(1)
  })

  it('reports a model that failed to load as a network-kind transport error', async () => {
    const transport = createBrowserJevTransport({
      getModel: async () => {
        throw new Error('no adapter')
      },
    })
    await expect(transport.systemOne(buildSystemOneBody(STATE, 'fake/model'))).rejects.toBeInstanceOf(JevTransportError)
  })

  it('lists the loaded model', async () => {
    const transport = createBrowserJevTransport({ getModel: async () => fakeModel() })
    const result = await transport.listModels()
    expect(result.ok).toBe(true)
    expect(result.body).toMatchObject({ models: [{ name: 'fake/model' }] })
  })

  it('keeps question order from the request', async () => {
    const transport = createBrowserJevTransport({ getModel: async () => fakeModel() })
    const result = await transport.systemOne({ model: 'm', state: STATE, questions: { kind: QUESTIONS.kind } })
    expect(Object.keys((result.body as { answers: object }).answers)).toEqual(['kind'])
  })
})
