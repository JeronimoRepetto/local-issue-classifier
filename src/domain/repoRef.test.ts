// Task 3 — accepted repository URL forms and typed parse errors.
import { describe, expect, it } from 'vitest'
import { parseRepoRef } from './repoRef'

const EXPECTED = { owner: 'acme', repo: 'widgets' }

describe('parseRepoRef — accepted forms', () => {
  it('parses a plain https URL', () => {
    expect(parseRepoRef('https://github.com/acme/widgets')).toEqual({ ok: true, ref: EXPECTED })
  })

  it('parses a plain http URL', () => {
    expect(parseRepoRef('http://github.com/acme/widgets')).toEqual({ ok: true, ref: EXPECTED })
  })

  it('parses an https URL with a trailing slash', () => {
    expect(parseRepoRef('https://github.com/acme/widgets/')).toEqual({ ok: true, ref: EXPECTED })
  })

  it('parses an https URL with a .git suffix', () => {
    expect(parseRepoRef('https://github.com/acme/widgets.git')).toEqual({
      ok: true,
      ref: EXPECTED,
    })
  })

  it('parses an https URL with an /issues suffix', () => {
    expect(parseRepoRef('https://github.com/acme/widgets/issues')).toEqual({
      ok: true,
      ref: EXPECTED,
    })
  })

  it('parses an https URL with a deeper path', () => {
    expect(parseRepoRef('https://github.com/acme/widgets/issues/42')).toEqual({
      ok: true,
      ref: EXPECTED,
    })
  })

  it('parses an https www URL', () => {
    expect(parseRepoRef('https://www.github.com/acme/widgets')).toEqual({
      ok: true,
      ref: EXPECTED,
    })
  })

  it('parses a schemeless www host', () => {
    expect(parseRepoRef('www.github.com/acme/widgets')).toEqual({ ok: true, ref: EXPECTED })
  })

  it('parses a schemeless host', () => {
    expect(parseRepoRef('github.com/acme/widgets')).toEqual({ ok: true, ref: EXPECTED })
  })

  it('parses the owner/repo shorthand', () => {
    expect(parseRepoRef('acme/widgets')).toEqual({ ok: true, ref: EXPECTED })
  })

  it('parses the git@github.com SSH form', () => {
    expect(parseRepoRef('git@github.com:acme/widgets.git')).toEqual({ ok: true, ref: EXPECTED })
  })

  it('parses the SSH form without a .git suffix', () => {
    expect(parseRepoRef('git@github.com:acme/widgets')).toEqual({ ok: true, ref: EXPECTED })
  })

  it('trims surrounding whitespace', () => {
    expect(parseRepoRef('  acme/widgets  ')).toEqual({ ok: true, ref: EXPECTED })
  })
})

describe('parseRepoRef — typed errors', () => {
  it('rejects a non-GitHub https host', () => {
    const result = parseRepoRef('https://gitlab.com/acme/widgets')
    expect(result).toEqual({ ok: false, error: { kind: 'invalid-host', host: 'gitlab.com' } })
  })

  it('rejects a non-GitHub SSH host', () => {
    const result = parseRepoRef('git@gitlab.com:acme/widgets.git')
    expect(result).toEqual({ ok: false, error: { kind: 'invalid-host', host: 'gitlab.com' } })
  })

  it('rejects a URL missing the repo segment', () => {
    expect(parseRepoRef('https://github.com/acme')).toEqual({
      ok: false,
      error: { kind: 'missing-repo' },
    })
  })

  it('rejects a bare host with no owner or repo', () => {
    expect(parseRepoRef('github.com')).toEqual({ ok: false, error: { kind: 'missing-repo' } })
  })

  it('rejects an empty string', () => {
    expect(parseRepoRef('')).toEqual({ ok: false, error: { kind: 'missing-repo' } })
  })

  it('rejects invalid characters in the owner', () => {
    expect(parseRepoRef('ac me/widgets')).toEqual({
      ok: false,
      error: { kind: 'invalid-characters' },
    })
  })

  it('rejects invalid characters in the repo', () => {
    expect(parseRepoRef('acme/wid gets')).toEqual({
      ok: false,
      error: { kind: 'invalid-characters' },
    })
  })
})
