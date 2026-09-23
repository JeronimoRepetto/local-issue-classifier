import { describe, expect, it } from 'vitest'
import {
  CONTRIBUTING_BUDGET,
  DOCS_INDEX_LIMIT,
  README_BUDGET,
  buildProjectContext,
  parseManifest,
  type ProjectSources,
} from './projectContext'
import type { Repo } from './types'

const repo: Repo = {
  ref: { owner: 'acme', repo: 'widgets' },
  fullName: 'acme/widgets',
  description: 'Widgets for testing',
  topics: ['widgets', 'testing'],
  defaultBranch: 'main',
  isPrivate: false,
  hasIssues: true,
  openIssuesCount: 3,
  htmlUrl: 'https://github.com/acme/widgets',
}

const noSources: ProjectSources = { readme: null, contributing: null, docs: null, manifest: null }

describe('buildProjectContext', () => {
  it('takes name, description and topics from the repo', () => {
    const ctx = buildProjectContext(repo, noSources)
    expect(ctx.name).toBe('acme/widgets')
    expect(ctx.description).toBe('Widgets for testing')
    expect(ctx.topics).toEqual(['widgets', 'testing'])
    expect(ctx.topics).not.toBe(repo.topics)
  })

  it('turns every missing (404) source into a null field', () => {
    const ctx = buildProjectContext(repo, noSources)
    expect(ctx.readmeExcerpt).toBeNull()
    expect(ctx.contributingExcerpt).toBeNull()
    expect(ctx.docsIndex).toEqual([])
    expect(ctx.manifest).toEqual({ source: null, name: null, description: null })
  })

  it('treats a blank README or CONTRIBUTING as absent', () => {
    const ctx = buildProjectContext(repo, { ...noSources, readme: '  \n\n', contributing: '' })
    expect(ctx.readmeExcerpt).toBeNull()
    expect(ctx.contributingExcerpt).toBeNull()
  })

  it('strips README noise: comments, badges, images and long code blocks', () => {
    const longBlock = ['```js', ...Array.from({ length: 20 }, (_, i) => `line ${i}`), '```'].join('\n')
    const readme = [
      '# Widgets',
      '<!-- hidden note -->',
      '[![build](https://example.test/badge.svg)](https://example.test/ci)',
      '![logo](logo.png)',
      '',
      '',
      '',
      'Widgets does things.',
      longBlock,
    ].join('\n')
    const ctx = buildProjectContext(repo, { ...noSources, readme })
    expect(ctx.readmeExcerpt).toBe('# Widgets\n\nWidgets does things.\n[code block omitted]')
  })

  it('keeps only the head of the README within its 6 000 char budget', () => {
    const readme = `# Title\n\n${'a'.repeat(README_BUDGET * 2)}`
    const ctx = buildProjectContext(repo, { ...noSources, readme })
    expect(README_BUDGET).toBe(6000)
    expect(ctx.readmeExcerpt).toHaveLength(README_BUDGET)
    expect(ctx.readmeExcerpt!.startsWith('# Title')).toBe(true)
  })

  it('keeps only the head of CONTRIBUTING within its 1 500 char budget', () => {
    const ctx = buildProjectContext(repo, { ...noSources, contributing: `Start\n${'b'.repeat(5000)}` })
    expect(CONTRIBUTING_BUDGET).toBe(1500)
    expect(ctx.contributingExcerpt).toHaveLength(CONTRIBUTING_BUDGET)
    expect(ctx.contributingExcerpt!.startsWith('Start')).toBe(true)
  })

  it('caps the docs index at 40 names', () => {
    const docs = Array.from({ length: 55 }, (_, i) => `page-${i}.md`)
    const ctx = buildProjectContext(repo, { ...noSources, docs })
    expect(DOCS_INDEX_LIMIT).toBe(40)
    expect(ctx.docsIndex).toHaveLength(40)
    expect(ctx.docsIndex[0]).toBe('page-0.md')
  })

  it('parses the manifest into name and description', () => {
    const ctx = buildProjectContext(repo, {
      ...noSources,
      manifest: { source: 'package.json', text: '{"name":"widgets","description":"Widget kit"}' },
    })
    expect(ctx.manifest).toEqual({ source: 'package.json', name: 'widgets', description: 'Widget kit' })
  })
})

describe('parseManifest (4 ecosystems)', () => {
  it('package.json: JSON name and description', () => {
    expect(parseManifest('package.json', '{"name":"@acme/widgets","description":"Kit","version":"1.0.0"}')).toEqual({
      source: 'package.json',
      name: '@acme/widgets',
      description: 'Kit',
    })
  })

  it('package.json: malformed JSON or non-string fields give nulls, never a throw', () => {
    expect(parseManifest('package.json', '{not json')).toEqual({ source: 'package.json', name: null, description: null })
    expect(parseManifest('package.json', '{"name":42}')).toEqual({ source: 'package.json', name: null, description: null })
  })

  it('pyproject.toml: [project] table wins over other tables', () => {
    const toml = [
      '[build-system]',
      'requires = ["hatchling"]',
      '',
      '[project]',
      'name = "widgets-py"',
      "description = 'Python widgets'",
      'version = "0.1.0"',
    ].join('\n')
    expect(parseManifest('pyproject.toml', toml)).toEqual({
      source: 'pyproject.toml',
      name: 'widgets-py',
      description: 'Python widgets',
    })
  })

  it('pyproject.toml: falls back to [tool.poetry]', () => {
    const toml = ['[tool.poetry]', 'name = "poetry-widgets"', 'description = "Poetry kit"'].join('\n')
    expect(parseManifest('pyproject.toml', toml)).toEqual({
      source: 'pyproject.toml',
      name: 'poetry-widgets',
      description: 'Poetry kit',
    })
  })

  it('Cargo.toml: [package] name and description, ignoring [dependencies]', () => {
    const toml = [
      '[dependencies]',
      'name = "not-this"',
      '',
      '[package]',
      'name = "widgets-rs"',
      'description = "Rust widgets"',
    ].join('\n')
    expect(parseManifest('Cargo.toml', toml)).toEqual({
      source: 'Cargo.toml',
      name: 'widgets-rs',
      description: 'Rust widgets',
    })
  })

  it('go.mod: module line as name, no description', () => {
    expect(parseManifest('go.mod', '// comment\nmodule example.test/acme/widgets\n\ngo 1.22\n')).toEqual({
      source: 'go.mod',
      name: 'example.test/acme/widgets',
      description: null,
    })
  })

  it('a manifest without the fields keeps its source and null values', () => {
    expect(parseManifest('Cargo.toml', '[workspace]\nmembers = ["a"]')).toEqual({
      source: 'Cargo.toml',
      name: null,
      description: null,
    })
  })
})
