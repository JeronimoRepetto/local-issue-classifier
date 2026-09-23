// local-issue-classifier — parses the repository URL/shorthand forms from SPEC.md §2.3
// into a normalized RepoRef, or a typed error. Pure: no fetch, no browser APIs.
import type { RepoRef } from './types'

export type RepoRefError =
  | { kind: 'invalid-host'; host: string }
  | { kind: 'missing-repo' }
  | { kind: 'invalid-characters' }

export type ParseRepoRefResult = { ok: true; ref: RepoRef } | { ok: false; error: RepoRefError }

// GitHub usernames/orgs: alphanumeric or single hyphens, 1..39 chars, never
// starting or ending with a hyphen (GitHub's own rule, kept permissive here).
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
// GitHub repo names: letters, digits, '.', '-', '_'.
const REPO_RE = /^[A-Za-z0-9_.-]+$/

function isGithubHost(host: string): boolean {
  return host.toLowerCase().replace(/^www\./, '') === 'github.com'
}

function stripDotGit(segment: string): string {
  return segment.replace(/\.git$/i, '')
}

function fail(error: RepoRefError): ParseRepoRefResult {
  return { ok: false, error }
}

/** Splits "owner/repo/anything-else", validates the first two segments. */
function finishFromPath(pathPart: string): ParseRepoRefResult {
  // A pasted issue URL may carry a query string or a #fragment; both are
  // irrelevant to identifying the repository.
  const withoutQuery = pathPart.split(/[?#]/)[0]
  const segments = withoutQuery.split('/').filter((segment) => segment.length > 0)
  if (segments.length < 2) return fail({ kind: 'missing-repo' })

  const owner = segments[0]
  const repo = stripDotGit(segments[1])
  if (repo === '') return fail({ kind: 'missing-repo' })
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo)) {
    return fail({ kind: 'invalid-characters' })
  }
  return { ok: true, ref: { owner, repo } }
}

/**
 * Normalizes any accepted GitHub repository reference (SPEC.md §2.3):
 * `https://github.com/{owner}/{repo}` (+ trailing slash, `.git`, `/issues`
 * or a deeper path), the `http://` and `www.` variants, the schemeless
 * `github.com/{owner}/{repo}` host form, the `{owner}/{repo}` shorthand,
 * and the `git@github.com:{owner}/{repo}.git` SSH form.
 */
export function parseRepoRef(rawInput: string): ParseRepoRefResult {
  const input = rawInput.trim()

  const ssh = /^git@([^:\s]+):(.+)$/.exec(input)
  if (ssh) {
    const [, host, pathPart] = ssh
    if (!isGithubHost(host)) return fail({ kind: 'invalid-host', host })
    return finishFromPath(pathPart)
  }

  let rest = input.replace(/^https?:\/\//i, '')
  rest = rest.replace(/^www\./i, '')

  const hostMatch = /^([^/]+)\/(.*)$/.exec(rest)
  const hostCandidate = hostMatch?.[1] ?? ''
  const looksLikeHost = hostCandidate.includes('.')

  if (hostMatch && looksLikeHost) {
    if (!isGithubHost(hostCandidate)) {
      return fail({ kind: 'invalid-host', host: hostCandidate })
    }
    return finishFromPath(hostMatch[2])
  }

  // No recognizable host segment: treat the whole input as the
  // `{owner}/{repo}` shorthand (or as missing/invalid, per finishFromPath).
  return finishFromPath(rest)
}
