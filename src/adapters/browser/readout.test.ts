// In-browser readout (docs/browser-inference.md): the JevK5 / SemIf protocol
// reproduced in TypeScript — prompt, option letters, temperature softmax and
// the `/v1/systemone` answer shape. Pure; no model is loaded here.
import { describe, expect, it } from 'vitest'
import {
  JEVK5_TEMPERATURE,
  MAX_OPTIONS,
  READOUT_SYSTEM,
  TooManyOptionsError,
  buildReadoutPrompt,
  decisionOptions,
  optionLetters,
  pythonJson,
  pythonRepr,
  softmaxWithTemperature,
  toAnswer,
} from './readout'
import { QUESTIONS } from '../jev/questions'

describe('softmaxWithTemperature', () => {
  it('uses the JevK5 calibration temperature by default', () => {
    expect(JEVK5_TEMPERATURE).toBe(1.532)
    const p = softmaxWithTemperature([2, 0])
    const expected = 1 / (1 + Math.exp(-2 / 1.532))
    expect(p[0]).toBeCloseTo(expected, 12)
    expect(p[1]).toBeCloseTo(1 - expected, 12)
  })

  it('sums to 1, keeps order and is stable for large logits', () => {
    const p = softmaxWithTemperature([1000, 999, 998], 1)
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
    expect(p[0]).toBeGreaterThan(p[1])
    expect(p[1]).toBeGreaterThan(p[2])
    expect(p.every(Number.isFinite)).toBe(true)
  })

  it('flattens the distribution as the temperature rises', () => {
    const cold = softmaxWithTemperature([3, 0], 1)
    const warm = softmaxWithTemperature([3, 0], 3)
    expect(warm[0]).toBeLessThan(cold[0])
  })

  it('rejects an empty logit list and a non-positive temperature', () => {
    expect(() => softmaxWithTemperature([])).toThrow()
    expect(() => softmaxWithTemperature([1, 2], 0)).toThrow()
  })
})

describe('optionLetters', () => {
  it('maps options to A, B, C… in order', () => {
    expect(optionLetters(3)).toEqual(['A', 'B', 'C'])
    expect(optionLetters(MAX_OPTIONS).at(-1)).toBe('Z')
  })

  it('refuses more options than there are letters', () => {
    expect(MAX_OPTIONS).toBe(26)
    expect(() => optionLetters(27)).toThrow(TooManyOptionsError)
  })

  it('refuses fewer than two options', () => {
    expect(() => optionLetters(1)).toThrow(TooManyOptionsError)
  })
})

describe('Python-compatible serialization (JevK5 builds its prompt in Python)', () => {
  it('pythonJson matches json.dumps(ensure_ascii=False) separators', () => {
    expect(pythonJson({ a: 1, b: [true, null, 'x'], c: {} , d: [] })).toBe(
      '{"a": 1, "b": [true, null, "x"], "c": {}, "d": []}',
    )
    expect(pythonJson('ñ "q"')).toBe('"ñ \\"q\\""')
  })

  it('pythonRepr renders dicts, lists and strings like Python', () => {
    expect(pythonRepr({ what: 'Small', examples: ['one', 'two'] })).toBe("{'what': 'Small', 'examples': ['one', 'two']}")
    expect(pythonRepr("user's")).toBe('"user\'s"')
    expect(pythonRepr('a\\b\nc')).toBe("'a\\\\b\\nc'")
  })
})

describe('decisionOptions', () => {
  it('numbers Score levels 0..n-1 and prefixes each text with its id', () => {
    const options = decisionOptions(QUESTIONS.relevance)
    expect(options.map((o) => o.id)).toEqual(['0', '1', '2', '3', '4'])
    expect(options[0].text).toBe(`0: ${QUESTIONS.relevance.criteria[0]}`)
  })

  it('renders a structured level the way the JevK5 server does (Python repr)', () => {
    const options = decisionOptions(QUESTIONS.effort)
    expect(options[0].text).toBe(
      "0: {'what': 'Small; a few hours at most', 'examples': ['one-line fix with a test', 'documentation clarification']}",
    )
  })

  it('keys Choice options by their criteria keys', () => {
    const options = decisionOptions(QUESTIONS.kind)
    expect(options.map((o) => o.id)).toEqual(['bug', 'feature', 'documentation', 'question', 'maintenance', 'other'])
    expect(options[5].text).toBe('other: None of the above')
  })
})

describe('buildReadoutPrompt', () => {
  it('follows the chat template with thinking off and asks for a letter', () => {
    const prompt = buildReadoutPrompt({ issue: { title: 'x' } }, QUESTIONS.kind)
    expect(prompt.startsWith(`<|im_start|>system\n${READOUT_SYSTEM}<|im_end|>\n<|im_start|>user\n`)).toBe(true)
    expect(prompt.endsWith('<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n')).toBe(true)
    expect(prompt).toContain('"evidence": {"issue": {"title": "x"}}')
    expect(prompt).toContain('"criterion": "What kind of request is `issue`?"')
    expect(prompt).toContain('{"letter": "A", "description": "bug: Something is broken')
    expect(prompt).toContain('{"letter": "F", "description": "other: None of the above"}')
  })

  it('passes a structured instruction through as an object, like the JevK5 server', () => {
    const prompt = buildReadoutPrompt({}, QUESTIONS.complexity)
    expect(prompt).toContain('"criterion": {"question": "How technically complex')
  })
})

describe('toAnswer', () => {
  it('Score: expected value over the ordered levels, probabilities keyed by level', () => {
    const answer = toAnswer(QUESTIONS.complexity, [0.2, 0.3, 0.5], 42)
    expect(answer).toEqual({
      type: 'score',
      score: 0 * 0.2 + 1 * 0.3 + 2 * 0.5,
      probabilities: { '0': 0.2, '1': 0.3, '2': 0.5 },
      confidence: 0.5,
      input_tokens: 42,
    })
  })

  it('Choice: argmax key, probabilities keyed by option, confidence = max probability', () => {
    const answer = toAnswer(QUESTIONS.kind, [0.1, 0.6, 0.1, 0.1, 0.05, 0.05], 7)
    expect(answer).toMatchObject({ type: 'choice', choice: 'feature', confidence: 0.6, input_tokens: 7 })
    expect(answer.probabilities).toEqual({
      bug: 0.1,
      feature: 0.6,
      documentation: 0.1,
      question: 0.1,
      maintenance: 0.05,
      other: 0.05,
    })
  })

  it('refuses a probability list of the wrong length', () => {
    expect(() => toAnswer(QUESTIONS.complexity, [0.5, 0.5], 1)).toThrow()
  })
})
