// Task 4 — SPEC.md §8: secrets live in the reactive useSecrets() module state
// only. No storage import is allowed here (enforced by tests/architecture.test.ts).
import { beforeEach, describe, expect, it } from 'vitest'
import { useSecrets } from './useSecrets'

beforeEach(() => {
  useSecrets().__resetForTests()
})

describe('useSecrets singleton', () => {
  it('starts with no keys', () => {
    const secrets = useSecrets()
    expect(secrets.state.jevApiKey).toBe('')
    expect(secrets.state.githubToken).toBe('')
    expect(secrets.hasJevKey.value).toBe(false)
    expect(secrets.hasGitHubToken.value).toBe(false)
  })

  it('returns the same reactive state on every call', () => {
    expect(useSecrets().state).toBe(useSecrets().state)
  })

  it('setJevKey stores a trimmed key and flips hasJevKey', () => {
    const secrets = useSecrets()
    secrets.setJevKey('  sk-test-123  ')
    expect(secrets.state.jevApiKey).toBe('sk-test-123')
    expect(secrets.hasJevKey.value).toBe(true)
  })

  it('an empty or whitespace-only Jev key counts as absent', () => {
    const secrets = useSecrets()
    secrets.setJevKey('   ')
    expect(secrets.state.jevApiKey).toBe('')
    expect(secrets.hasJevKey.value).toBe(false)
  })

  it('setGitHubToken stores a trimmed token and flips hasGitHubToken', () => {
    const secrets = useSecrets()
    secrets.setGitHubToken('  ghp_test  ')
    expect(secrets.state.githubToken).toBe('ghp_test')
    expect(secrets.hasGitHubToken.value).toBe(true)
  })

  it('clearKeys wipes both secrets immediately', () => {
    const secrets = useSecrets()
    secrets.setJevKey('sk-test')
    secrets.setGitHubToken('ghp_test')
    secrets.clearKeys()
    expect(secrets.state.jevApiKey).toBe('')
    expect(secrets.state.githubToken).toBe('')
    expect(secrets.hasJevKey.value).toBe(false)
    expect(secrets.hasGitHubToken.value).toBe(false)
  })

  it('__resetForTests clears the singleton between test files without a module reload', () => {
    const secrets = useSecrets()
    secrets.setJevKey('sk-leftover')
    secrets.__resetForTests()
    expect(secrets.state.jevApiKey).toBe('')
  })
})

describe('useSecrets: local provider key (T16)', () => {
  it('stores a trimmed local key, and clearKeys wipes it too', () => {
    const secrets = useSecrets()
    expect(secrets.state.localApiKey).toBe('')
    secrets.setLocalApiKey('  local-key  ')
    expect(secrets.state.localApiKey).toBe('local-key')
    expect(secrets.hasLocalApiKey.value).toBe(true)
    secrets.clearKeys()
    expect(secrets.state.localApiKey).toBe('')
    expect(secrets.hasLocalApiKey.value).toBe(false)
  })
})
