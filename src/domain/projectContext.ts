// issue-criticity — project context builder (SPEC.md §4.3, §5.5 step 2). Pure.
// The GitHub loader fetches the raw sources (each 404 becomes `null`) and this
// module turns them into the budgeted `ProjectContext` sent to Jev once per load.
// Lives here instead of `jevState.ts` so the loader lane does not share a file
// with the Jev state builder.
import { stripMarkdownNoise } from './text'
import type { ProjectContext, Repo } from './types'

export type ManifestSource = NonNullable<ProjectContext['manifest']['source']>

/** Manifest files probed in this order; the first one that exists wins (§5.5). */
export const MANIFEST_FILES: readonly ManifestSource[] = ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod']

export const README_BUDGET = 6000
export const CONTRIBUTING_BUDGET = 1500
export const DOCS_INDEX_LIMIT = 40

/** Raw inputs as fetched from GitHub. `null` means the file was not found. */
export interface ProjectSources {
  readme: string | null
  contributing: string | null
  /** Top-level names under `docs/`. */
  docs: string[] | null
  manifest: { source: ManifestSource; text: string } | null
}

function head(text: string | null, budget: number, clean: (s: string) => string): string | null {
  if (text === null) return null
  const cleaned = clean(text)
  return cleaned === '' ? null : cleaned.slice(0, budget)
}

const collapseBlankLines = (text: string) => text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

export function buildProjectContext(repo: Repo, sources: ProjectSources): ProjectContext {
  return {
    name: repo.fullName,
    description: repo.description,
    topics: [...repo.topics],
    manifest: sources.manifest
      ? parseManifest(sources.manifest.source, sources.manifest.text)
      : { source: null, name: null, description: null },
    readmeExcerpt: head(sources.readme, README_BUDGET, stripMarkdownNoise),
    contributingExcerpt: head(sources.contributing, CONTRIBUTING_BUDGET, collapseBlankLines),
    docsIndex: (sources.docs ?? []).slice(0, DOCS_INDEX_LIMIT),
  }
}

const TABLE_HEADER = /^\s*\[([^[\]]+)\]\s*(?:#.*)?$/

/** The body lines of one `[table]` in a TOML document, or `null` when absent. */
function tomlTable(text: string, table: string): string[] | null {
  let current: string | null = null
  let found: string[] | null = null
  for (const line of text.split(/\r\n|\r|\n/)) {
    const header = TABLE_HEADER.exec(line)
    if (header) {
      current = header[1].trim()
      if (current === table && !found) found = []
      continue
    }
    if (/^\s*\[\[/.test(line)) current = null
    else if (current === table && found) found.push(line)
  }
  return found
}

/** A basic or literal single-line TOML string value for `key`. */
function tomlString(lines: string[], key: string): string | null {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|'([^']*)')`)
  for (const line of lines) {
    const match = re.exec(line)
    if (match) return match[1] !== undefined ? match[1].replace(/\\(["\\])/g, '$1') : match[2]
  }
  return null
}

const asString = (value: unknown) => (typeof value === 'string' ? value : null)

/** Extracts `name` and `description` only (§5.5). Never throws. */
export function parseManifest(source: ManifestSource, text: string): ProjectContext['manifest'] {
  const result = (name: string | null, description: string | null) => ({ source, name, description })
  switch (source) {
    case 'package.json': {
      try {
        const json: unknown = JSON.parse(text)
        if (!json || typeof json !== 'object') return result(null, null)
        const record = json as Record<string, unknown>
        return result(asString(record.name), asString(record.description))
      } catch {
        return result(null, null)
      }
    }
    case 'pyproject.toml':
    case 'Cargo.toml': {
      const tables = source === 'Cargo.toml' ? ['package'] : ['project', 'tool.poetry']
      for (const table of tables) {
        const lines = tomlTable(text, table)
        if (lines) return result(tomlString(lines, 'name'), tomlString(lines, 'description'))
      }
      return result(null, null)
    }
    case 'go.mod': {
      const match = /^\s*module\s+"?([^\s"]+)"?/m.exec(text)
      return result(match ? match[1] : null, null)
    }
  }
}
