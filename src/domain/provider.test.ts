// T16 — classifier provider selection (docs/local-providers.md): the pure
// provider model, the local base URL guard and the tolerant sanitizer.
import { describe, expect, it } from 'vitest'
import {
  BROWSER_MODELS,
  LOCAL_PRESETS,
  candidateIdFor,
  configForCandidateId,
  defaultBrowserProviderConfig,
  defaultProviderConfig,
  deviceLabel,
  findBrowserModel,
  findPreset,
  forcesPerIssue,
  parseFirstModelDevice,
  parseModelNames,
  presetMaxStateTokens,
  providerKey,
  providerLabel,
  sanitizeProviderConfig,
  validateLocalBaseUrl,
} from './provider'
import type { ProviderConfig } from './provider'

describe('defaultProviderConfig', () => {
  it('is the TypeSafe cloud, as a fresh object each call', () => {
    expect(defaultProviderConfig()).toEqual({ kind: 'typesafe' })
    expect(defaultProviderConfig()).not.toBe(defaultProviderConfig())
  })
})

describe('validateLocalBaseUrl', () => {
  it.each([
    ['http://localhost:8009', 'http://localhost:8009'],
    ['http://localhost:8009/', 'http://localhost:8009'],
    ['  http://127.0.0.1:8090  ', 'http://127.0.0.1:8090'],
    ['http://127.1.2.3:8009', 'http://127.1.2.3:8009'],
    ['http://[::1]:8009', 'http://[::1]:8009'],
    ['https://localhost', 'https://localhost'],
    ['http://10.0.0.5:8009', 'http://10.0.0.5:8009'],
    ['http://172.16.0.1:8009', 'http://172.16.0.1:8009'],
    ['http://172.31.255.254:8009', 'http://172.31.255.254:8009'],
    ['http://192.168.1.20:8009', 'http://192.168.1.20:8009'],
    ['http://[fd12:3456::1]:8009', 'http://[fd12:3456::1]:8009'],
    ['http://LOCALHOST:8009/kev/', 'http://localhost:8009/kev'],
  ])('accepts %s as %s', (input, url) => {
    expect(validateLocalBaseUrl(input)).toEqual({ ok: true, url })
  })

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['localhost:8009', 'scheme'],
    ['127.0.0.1:8009', 'scheme'],
    ['javascript:alert(1)', 'scheme'],
    ['ftp://localhost:8009', 'scheme'],
    ['file:///etc/passwd', 'scheme'],
    ['http://', 'invalid'],
    ['https://api.typesafe.ai', 'host'],
    ['http://example.com:8009', 'host'],
    ['http://8.8.8.8:8009', 'host'],
    ['http://172.32.0.1:8009', 'host'],
    ['http://172.15.0.1:8009', 'host'],
    ['http://169.254.169.254', 'host'],
    ['http://0.0.0.0:8009', 'host'],
    ['http://[2001:db8::1]:8009', 'host'],
    ['http://localhost.evil.com:8009', 'host'],
    ['http://mybox.local:8009', 'host'],
    ['http://user:pass@localhost:8009', 'credentials'],
    ['http://localhost:8009/?x=1', 'query'],
    ['http://localhost:8009/#top', 'query'],
  ])('rejects %j with reason %s', (input, reason) => {
    const result = validateLocalBaseUrl(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe(reason)
      expect(result.message.length).toBeGreaterThan(0)
    }
  })
})

describe('LOCAL_PRESETS', () => {
  it('lists Kev, JevK5 and Laya with valid local base URLs', () => {
    expect(LOCAL_PRESETS.map((p) => p.id)).toEqual(['kev', 'jevk5', 'laya'])
    const kev = LOCAL_PRESETS[0]
    expect(kev).toMatchObject({ baseUrl: 'http://localhost:8009', model: 'kev-latest' })
    const laya = LOCAL_PRESETS[2]
    expect(laya).toMatchObject({
      baseUrl: 'http://localhost:8000',
      model: 'convaiinnovations/laya',
      perIssueOnly: true,
      maxStateTokens: 512,
    })
    for (const preset of LOCAL_PRESETS) expect(validateLocalBaseUrl(preset.baseUrl).ok).toBe(true)
  })

  it('gives every preset a distinct port (no clash between Kev, JevK5 and Laya)', () => {
    const ports = LOCAL_PRESETS.map((p) => new URL(p.baseUrl).port)
    expect(new Set(ports).size).toBe(ports.length)
  })
})

describe('forcesPerIssue / presetMaxStateTokens', () => {
  const laya: ProviderConfig = { kind: 'local', baseUrl: 'http://localhost:8000', model: 'convaiinnovations/laya' }
  const kev: ProviderConfig = { kind: 'local', baseUrl: 'http://localhost:8009', model: 'kev-latest' }
  const jevk5: ProviderConfig = { kind: 'local', baseUrl: 'http://localhost:8090', model: 'alibiserikbay/JevK5' }
  const unmatched: ProviderConfig = { kind: 'local', baseUrl: 'http://10.0.0.5:9000', model: 'mine' }

  it('is true, with a 512-token cap, only for the Laya preset', () => {
    expect(forcesPerIssue(laya)).toBe(true)
    expect(presetMaxStateTokens(laya)).toBe(512)
  })

  it('is false, with no cap override, for every other provider', () => {
    for (const config of [kev, jevk5, unmatched, defaultProviderConfig(), defaultBrowserProviderConfig()]) {
      expect(forcesPerIssue(config)).toBe(false)
      expect(presetMaxStateTokens(config)).toBeUndefined()
    }
  })
})

describe('providerLabel / providerKey', () => {
  it('names the provider for the UI', () => {
    expect(providerLabel({ kind: 'typesafe' })).toBe('TypeSafe cloud (Jev)')
    expect(providerLabel({ kind: 'local', baseUrl: 'http://localhost:8009', model: 'kev-latest' })).toBe(
      'Kev (local, http://localhost:8009)',
    )
    expect(providerLabel({ kind: 'local', baseUrl: 'http://10.0.0.5:9000', model: 'mine' })).toBe(
      'Local server (http://10.0.0.5:9000)',
    )
  })

  it('keys the routing cache by provider and normalized base URL', () => {
    expect(providerKey({ kind: 'typesafe' })).toBe('typesafe')
    expect(providerKey({ kind: 'local', baseUrl: 'http://localhost:8009/', model: 'x' })).toBe(
      'local:http://localhost:8009',
    )
  })
})

describe('sanitizeProviderConfig', () => {
  it('falls back to TypeSafe for missing or unknown values', () => {
    for (const value of [undefined, null, 'local', 42, [], {}, { kind: 'openai' }]) {
      expect(sanitizeProviderConfig(value)).toEqual({ kind: 'typesafe' })
    }
  })

  it('keeps a local config and fills a missing base URL or model from the Kev preset', () => {
    expect(sanitizeProviderConfig({ kind: 'local', baseUrl: 'http://10.0.0.5:8009', model: 'kev-4b' })).toEqual({
      kind: 'local',
      baseUrl: 'http://10.0.0.5:8009',
      model: 'kev-4b',
    })
    expect(sanitizeProviderConfig({ kind: 'local', baseUrl: 7, model: '' })).toEqual({
      kind: 'local',
      baseUrl: 'http://localhost:8009',
      model: 'kev-latest',
    })
  })

  it('never keeps a key or any extra field', () => {
    expect(
      sanitizeProviderConfig({ kind: 'local', baseUrl: 'http://localhost:8009', model: 'm', apiKey: 'secret', x: 1 }),
    ).toEqual({ kind: 'local', baseUrl: 'http://localhost:8009', model: 'm' })
    expect(sanitizeProviderConfig({ kind: 'typesafe', apiKey: 'secret' })).toEqual({ kind: 'typesafe' })
  })
})

describe('parseModelNames', () => {
  it('reads the TypeSafe shape and the OpenAI-style shape', () => {
    expect(parseModelNames({ models: [{ name: 'kev-latest' }, { name: 'kev-4b' }] })).toEqual(['kev-latest', 'kev-4b'])
    expect(parseModelNames({ data: [{ id: 'kev-latest' }] })).toEqual(['kev-latest'])
  })

  it('returns null for anything else', () => {
    for (const body of [null, 'x', {}, { models: 'x' }, { models: [{}] }]) expect(parseModelNames(body)).toBeNull()
  })
})

// Phase A of in-browser inference (docs/browser-inference.md): a third kind.
describe('browser provider kind', () => {
  it('ships one small placeholder model with its download sizes', () => {
    const [model] = BROWSER_MODELS
    expect(model.id).toBe('onnx-community/Qwen3-0.6B-ONNX')
    expect(model.placeholder).toBe(true)
    expect(model.downloadBytes.webgpu).toBeLessThan(model.downloadBytes.wasm)
    expect(model.downloadBytes.wasm).toBeLessThan(1_000_000_000)
    expect(defaultBrowserProviderConfig()).toEqual({ kind: 'browser', modelId: model.id })
  })

  it('keeps a stored browser config and only its model id', () => {
    expect(sanitizeProviderConfig({ kind: 'browser', modelId: 'org/other', apiKey: 'x' })).toEqual({
      kind: 'browser',
      modelId: 'org/other',
    })
    expect(sanitizeProviderConfig({ kind: 'browser', modelId: '  ' })).toEqual(defaultBrowserProviderConfig())
    expect(sanitizeProviderConfig({ kind: 'browser' })).toEqual(defaultBrowserProviderConfig())
  })

  it('labels and keys it by model', () => {
    const config = defaultBrowserProviderConfig()
    expect(providerLabel(config)).toBe('In this browser (Qwen3 0.6B, experimental)')
    expect(providerLabel({ kind: 'browser', modelId: 'org/custom' })).toBe('In this browser (org/custom, experimental)')
    expect(providerKey(config)).toBe('browser:onnx-community/Qwen3-0.6B-ONNX')
    expect(findBrowserModel('org/custom')).toBeNull()
    expect(findBrowserModel(config.modelId)?.label).toBe('Qwen3 0.6B')
  })

  it('has no local preset', () => {
    expect(findPreset(defaultBrowserProviderConfig())).toBeNull()
  })
})

// Provider switcher (classification screen): a candidate's id round-trips to a
// ProviderConfig, so selecting one just replaces Preferences.provider.
describe('candidateIdFor / configForCandidateId', () => {
  it('ids TypeSafe and the browser provider directly', () => {
    expect(candidateIdFor({ kind: 'typesafe' })).toBe('typesafe')
    expect(candidateIdFor(defaultBrowserProviderConfig())).toBe('browser')
    expect(configForCandidateId('typesafe')).toEqual({ kind: 'typesafe' })
    expect(configForCandidateId('browser')).toEqual(defaultBrowserProviderConfig())
  })

  it('ids a local config by its matching preset', () => {
    expect(candidateIdFor({ kind: 'local', baseUrl: 'http://localhost:8009', model: 'kev-latest' })).toBe('local:kev')
    expect(candidateIdFor({ kind: 'local', baseUrl: 'http://localhost:8090/', model: 'x' })).toBe('local:jevk5')
    expect(configForCandidateId('local:kev')).toEqual({ kind: 'local', baseUrl: 'http://localhost:8009', model: 'kev-latest' })
    expect(configForCandidateId('local:jevk5')).toEqual({ kind: 'local', baseUrl: 'http://localhost:8090', model: 'alibiserikbay/JevK5' })
  })

  it('ids the Laya local config by its matching preset', () => {
    expect(candidateIdFor({ kind: 'local', baseUrl: 'http://localhost:8000', model: 'convaiinnovations/laya' })).toBe(
      'local:laya',
    )
    expect(configForCandidateId('local:laya')).toEqual({
      kind: 'local',
      baseUrl: 'http://localhost:8000',
      model: 'convaiinnovations/laya',
    })
  })

  it('has no id for a local config that matches no preset, and no config for an unknown id', () => {
    expect(candidateIdFor({ kind: 'local', baseUrl: 'http://10.0.0.5:9000', model: 'mine' })).toBeNull()
    expect(configForCandidateId('local:unknown')).toBeNull()
    expect(configForCandidateId('nonsense')).toBeNull()
  })
})

describe('parseFirstModelDevice / deviceLabel', () => {
  it('reads the first model device from either /v1/models shape', () => {
    expect(parseFirstModelDevice({ models: [{ name: 'kev-latest', device: 'cuda' }] })).toBe('cuda')
    expect(parseFirstModelDevice({ data: [{ id: 'kev-latest', device: 'cpu' }] })).toBe('cpu')
  })

  it('returns null when there is no device field or the body is malformed', () => {
    for (const body of [null, 'x', {}, { models: [] }, { models: [{ name: 'kev-latest' }] }, { models: [{ device: '  ' }] }]) {
      expect(parseFirstModelDevice(body)).toBeNull()
    }
  })

  it('labels a known device kind, CPU distinct from anything else', () => {
    expect(deviceLabel('cpu')).toBe('CPU')
    expect(deviceLabel('CPU')).toBe('CPU')
    expect(deviceLabel('cuda')).toBe('GPU')
    expect(deviceLabel('mps')).toBe('GPU')
    expect(deviceLabel(null)).toBeNull()
  })
})
