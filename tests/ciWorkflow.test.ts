// GitHub Actions CI workflow (Task 3, 2026-09-24). js-yaml is not a project
// dependency (see package.json devDependencies), so this validates the
// workflow's shape structurally: consistent, tab-free indentation, and the
// exact triggers/steps the CI contract requires, in order. A real YAML
// parse would give more general coverage, but would mean adding a
// dependency for one test file; the structural checks below are specific
// enough to catch the failures that matter (a missing step, wrong order,
// or a step commented out).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const WORKFLOW_PATH = join(__dirname, '..', '.github', 'workflows', 'ci.yml')
const SOURCE = readFileSync(WORKFLOW_PATH, 'utf8')
const LINES = SOURCE.split(/\r?\n/)

/** Index of the first line matching `re`, or -1. Used to assert relative order. */
function firstIndexOf(re: RegExp): number {
  return LINES.findIndex((line) => re.test(line))
}

describe('.github/workflows/ci.yml', () => {
  it('is well-formed enough to be YAML: no tabs, no trailing whitespace, consistent 2-space indent', () => {
    expect(SOURCE).not.toMatch(/\t/)
    for (const line of LINES) {
      expect(line).not.toMatch(/[ \t]+$/)
      const indent = /^ */.exec(line)![0].length
      expect(indent % 2, `odd indent in line: "${line}"`).toBe(0)
    }
  })

  it('triggers on push to main and on every pull request', () => {
    expect(SOURCE).toMatch(/^on:\s*$/m)
    expect(SOURCE).toMatch(/push:\s*\n\s*branches:\s*\[\s*main\s*\]/)
    expect(SOURCE).toMatch(/pull_request:\s*$/m)
  })

  it('cancels superseded runs via a concurrency group', () => {
    expect(SOURCE).toMatch(/^concurrency:\s*$/m)
    expect(SOURCE).toMatch(/group:\s*.+/)
    expect(SOURCE).toMatch(/cancel-in-progress:\s*true/)
  })

  it('runs on ubuntu-latest', () => {
    expect(SOURCE).toMatch(/runs-on:\s*ubuntu-latest/)
  })

  it('sets up pnpm from the packageManager field, then Node 24 with the pnpm cache', () => {
    expect(SOURCE).toMatch(/uses:\s*actions\/checkout@v\d/)
    expect(SOURCE).toMatch(/uses:\s*pnpm\/action-setup@v\d/)
    expect(SOURCE).toMatch(/uses:\s*actions\/setup-node@v\d/)
    expect(SOURCE).toMatch(/node-version:\s*['"]?24['"]?/)
    expect(SOURCE).toMatch(/cache:\s*pnpm/)

    const checkout = firstIndexOf(/actions\/checkout@/)
    const pnpmSetup = firstIndexOf(/pnpm\/action-setup@/)
    const nodeSetup = firstIndexOf(/actions\/setup-node@/)
    expect(checkout).toBeGreaterThanOrEqual(0)
    expect(pnpmSetup).toBeGreaterThan(checkout)
    expect(nodeSetup).toBeGreaterThan(pnpmSetup)
  })

  it('runs install --frozen-lockfile, typecheck, test, hygiene and build, in that order', () => {
    const install = firstIndexOf(/run:\s*pnpm install --frozen-lockfile\s*$/)
    const typecheck = firstIndexOf(/run:\s*pnpm typecheck\s*$/)
    const test = firstIndexOf(/run:\s*pnpm test\s*$/)
    const hygiene = firstIndexOf(/run:\s*pnpm hygiene\s*$/)
    const build = firstIndexOf(/run:\s*pnpm build\s*$/)

    for (const [name, index] of Object.entries({ install, typecheck, test, hygiene, build })) {
      expect(index, `missing step: pnpm ${name}`).toBeGreaterThanOrEqual(0)
    }
    expect(typecheck).toBeGreaterThan(install)
    expect(test).toBeGreaterThan(typecheck)
    expect(hygiene).toBeGreaterThan(test)
    expect(build).toBeGreaterThan(hygiene)
  })

  it('documents that the hygiene author-e-mail check is warning-only, so it never fails CI', () => {
    expect(SOURCE).toMatch(/warning-only/)
  })
})
