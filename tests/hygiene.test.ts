// Task 15 — public-repo hygiene checker (SPEC.md §12.2). Exercises the pure
// rule functions against tiny fake tracked trees first, then runs the real
// checker against this repository's actual tracked files.
import { describe, expect, it } from 'vitest'
import {
  findPersonalData,
  findStrayStreamlineAssets,
  findTokenLikeStrings,
  findTrackedEnvFiles,
  runHygieneChecks,
} from '../scripts/check-hygiene.mjs'

// `loadTrackedFiles`/`main` shell out to `git ls-files` and are exercised
// directly with `pnpm hygiene` against the real repository (see
// docs/release-checklist.md and the Task 15 report) rather than from inside
// this suite: spawning a subprocess from a test worker is exactly the kind
// of environment-dependent behaviour these tests are meant to avoid.

describe('findTrackedEnvFiles', () => {
  it('fails on a tracked .env', () => {
    const findings = findTrackedEnvFiles(['.env', 'src/main.ts'])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ rule: 'tracked-env-file', path: '.env' })
  })

  it('fails on a tracked .env.local variant', () => {
    const findings = findTrackedEnvFiles(['.env.local'])
    expect(findings).toHaveLength(1)
  })

  it('allows the committed .env.example', () => {
    expect(findTrackedEnvFiles(['.env.example'])).toEqual([])
  })
})

describe('findTokenLikeStrings', () => {
  it('fails on a real-shaped classic GitHub token (ghp_)', () => {
    const findings = findTokenLikeStrings([
      { path: 'oops.txt', content: `token=ghp_${'a'.repeat(36)}` },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ rule: 'token-like-string', path: 'oops.txt' })
  })

  it('fails on a real-shaped fine-grained token (github_pat_)', () => {
    const findings = findTokenLikeStrings([
      { path: 'oops.txt', content: `github_pat_${'a'.repeat(70)}` },
    ])
    expect(findings).toHaveLength(1)
  })

  it('fails on a real-shaped OAuth token (gho_)', () => {
    const findings = findTokenLikeStrings([{ path: 'oops.txt', content: `gho_${'b'.repeat(36)}` }])
    expect(findings).toHaveLength(1)
  })

  it('fails on a long Bearer token', () => {
    const findings = findTokenLikeStrings([
      { path: 'oops.txt', content: `Authorization: Bearer ${'x'.repeat(32)}` },
    ])
    expect(findings).toHaveLength(1)
  })

  it('does not fail on a short synthetic test placeholder', () => {
    const findings = findTokenLikeStrings([
      { path: 'a.test.ts', content: `secrets.setGitHubToken('ghp_test')` },
      { path: 'b.test.ts', content: `github_pat_fake_secret_4b2d8e` },
      { path: 'c.test.ts', content: `expect(header).toBe('Bearer test-key')` },
      { path: 'd.vue', content: `placeholder="ghp_… or github_pat_…"` },
    ])
    expect(findings).toEqual([])
  })
})

describe('findPersonalData', () => {
  it('fails on a real e-mail address in a fixture', () => {
    const findings = findPersonalData([
      { path: 'tests/fixtures/github/repo.json', content: '{"owner":"jane.doe@gmail.com"}' },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ rule: 'personal-email' })
  })

  it('fails on a real e-mail address in a doc', () => {
    const findings = findPersonalData([{ path: 'README.md', content: 'Contact jane.doe@gmail.com' }])
    expect(findings).toHaveLength(1)
  })

  it('allows a noreply@ address', () => {
    expect(
      findPersonalData([{ path: 'README.md', content: 'noreply@example-host.com' }]),
    ).toEqual([])
  })

  it('allows an example-domain address', () => {
    expect(findPersonalData([{ path: 'README.md', content: 'jane.doe@example.com' }])).toEqual([])
  })

  it('fails on a local machine path in a fixture or doc', () => {
    const findings = findPersonalData([
      { path: 'docs/design.md', content: 'See C:\\Users\\jane\\project for the source.' },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ rule: 'local-machine-path' })
  })

  it('fails on a /Users/ or /home/ path too', () => {
    expect(
      findPersonalData([{ path: 'README.md', content: 'Lives at /Users/jane/repo' }]),
    ).toHaveLength(1)
    expect(
      findPersonalData([{ path: 'README.md', content: 'Lives at /home/jane/repo' }]),
    ).toHaveLength(1)
  })

  it('ignores source files outside the fixtures/docs scope, e.g. an SSH remote example', () => {
    const findings = findPersonalData([
      { path: 'src/domain/repoRef.ts', content: 'the `git@github.com:{owner}/{repo}.git` SSH form' },
    ])
    expect(findings).toEqual([])
  })

  it('allows a documented placeholder path ending in an ellipsis, in any doc', () => {
    const findings = findPersonalData([
      { path: 'SPEC.md', content: 'No machine paths such as `C:\\Users\\…`.' },
      { path: 'docs/release-checklist.md', content: 'No machine paths such as `C:\\Users\\…`.' },
    ])
    expect(findings).toEqual([])
  })
})

describe('findStrayStreamlineAssets', () => {
  it('allows README and LICENSE under design/icons/streamline-pixel/', () => {
    expect(
      findStrayStreamlineAssets([
        'design/icons/streamline-pixel/README.md',
        'design/icons/custom/repo.svg',
      ]),
    ).toEqual([])
  })

  it('fails on any other file under design/icons/streamline-pixel/', () => {
    const findings = findStrayStreamlineAssets(['design/icons/streamline-pixel/bug.svg'])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ rule: 'stray-streamline-asset' })
  })
})

describe('runHygieneChecks', () => {
  it('combines every rule and reports nothing for a clean tree', () => {
    expect(
      runHygieneChecks([
        { path: '.env.example', content: 'VITE_JEV_BASE_URL=/jev' },
        { path: 'README.md', content: 'Nothing suspicious here.' },
        { path: 'design/icons/streamline-pixel/README.md', content: 'ok' },
      ]),
    ).toEqual([])
  })

  it('reports every rule violated by a dirty tree', () => {
    const findings = runHygieneChecks([
      { path: '.env', content: 'JEV_API_KEY=whatever' },
      { path: 'tests/fixtures/leak.json', content: `{"token":"ghp_${'a'.repeat(36)}"}` },
      { path: 'README.md', content: 'Contact jane.doe@gmail.com from C:\\Users\\jane\\repo' },
      { path: 'design/icons/streamline-pixel/bug.svg', content: '<svg></svg>' },
    ])
    const rules = findings.map((f) => f.rule).sort()
    expect(rules).toEqual(
      [
        'tracked-env-file',
        'token-like-string',
        'personal-email',
        'local-machine-path',
        'stray-streamline-asset',
      ].sort(),
    )
  })
})
