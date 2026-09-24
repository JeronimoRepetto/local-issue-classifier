import { describe, expect, it, vi } from 'vitest'
import { buildSystemOneBody, createJevClient } from './client'
import { QUESTIONS } from './questions'
import type { JevTransport } from './transport'
import { DEFAULT_JEV_MODEL } from '../../domain/types'
import type { JevState } from '../../domain/jevState'

const state = {
  project: { name: 'acme/widgets' },
  issue: { number: 812 },
} as unknown as JevState

function fakeTransport(): JevTransport & { systemOne: ReturnType<typeof vi.fn> } {
  return {
    systemOne: vi.fn(async () => ({ status: 200, ok: true, body: { answers: {} }, retryAfterMs: null })),
    listModels: vi.fn(async () => ({ status: 200, ok: true, body: { models: [] }, retryAfterMs: null })),
  }
}

describe('buildSystemOneBody', () => {
  it('has exactly model, state and questions, in that order', () => {
    const body = buildSystemOneBody(state, 'jev-latest')
    expect(Object.keys(body)).toEqual(['model', 'state', 'questions'])
    expect(body.model).toBe('jev-latest')
    expect(body.state).toBe(state)
    expect(body.questions).toBe(QUESTIONS)
  })

  it('serializes all five questions under their ids', () => {
    const parsed = JSON.parse(JSON.stringify(buildSystemOneBody(state, 'm')))
    expect(Object.keys(parsed.questions)).toEqual(['complexity', 'criticality', 'effort', 'relevance', 'kind'])
  })
})

describe('createJevClient', () => {
  it('defaults the model to the single DEFAULT_JEV_MODEL constant', async () => {
    expect(DEFAULT_JEV_MODEL).toBe('jev-latest')
    const transport = fakeTransport()
    await createJevClient({ transport }).classify(state)
    expect(transport.systemOne.mock.calls[0][0].model).toBe(DEFAULT_JEV_MODEL)
  })

  it('uses a configured model (e.g. a local provider) and forwards the signal', async () => {
    const transport = fakeTransport()
    const signal = new AbortController().signal
    const client = createJevClient({ transport, model: 'jevk5-local' })
    const result = await client.classify(state, signal)
    expect(transport.systemOne).toHaveBeenCalledWith(buildSystemOneBody(state, 'jevk5-local'), signal)
    expect(result.status).toBe(200)
    expect(client.model).toBe('jevk5-local')
  })
})
