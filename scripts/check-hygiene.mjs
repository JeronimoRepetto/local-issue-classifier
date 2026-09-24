#!/usr/bin/env node
// local-issue-classifier — public-repo hygiene checker (Task 15).
//
// Scans the tracked file list for the things that must never reach a public
// repository: a committed .env, token-like strings, real personal data
// (e-mail addresses, local machine paths) and stray Streamline assets outside
// their licensed home. Exported functions operate on a plain in-memory file
// list, so tests can exercise them with tiny fake trees; `main()` wires them
// to `git ls-files` and process exit codes for CLI/CI use.
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { extname, isAbsolute, join } from 'node:path'

// ── Rule: a tracked .env file ─────────────────────────────────────────────
// `.env.example` is the one intentionally-committed exception (see .gitignore).
export function findTrackedEnvFiles(paths) {
  return paths
    .filter((p) => {
      const base = p.split('/').pop() ?? p
      if (base === '.env.example') return false
      return base === '.env' || base.startsWith('.env.')
    })
    .map((path) => ({
      rule: 'tracked-env-file',
      path,
      message: `${path} looks like a real .env file and must not be committed.`,
    }))
}

// ── Rule: token-like strings ──────────────────────────────────────────────
// Length-bounded so a synthetic test placeholder (e.g. "ghp_test", used
// throughout this repo's own fixtures) never trips the check: real GitHub
// tokens are much longer than 20 characters after their prefix (classic ghp_
// and gho_ tokens are 36; fine-grained github_pat_ tokens are ~82). 20 is a
// conservative floor shared with the Bearer pattern below.
const TOKEN_PATTERNS = [
  { name: 'github-personal-access-token', re: /ghp_[A-Za-z0-9]{20,}/g },
  { name: 'github-fine-grained-token', re: /github_pat_[A-Za-z0-9_]{20,}/g },
  { name: 'github-oauth-token', re: /gho_[A-Za-z0-9]{20,}/g },
  { name: 'bearer-token', re: /Bearer [A-Za-z0-9]{20,}/g },
]

export function findTokenLikeStrings(files) {
  const findings = []
  for (const { path, content } of files) {
    if (content == null) continue
    for (const { name, re } of TOKEN_PATTERNS) {
      re.lastIndex = 0
      const match = re.exec(content)
      if (match) {
        findings.push({
          rule: 'token-like-string',
          path,
          message: `${path} contains a ${name}-shaped string: "${redact(match[0])}".`,
        })
      }
    }
  }
  return findings
}

function redact(s) {
  return s.length <= 10 ? s : `${s.slice(0, 6)}…${s.slice(-2)}`
}

// ── Rule: real personal data (e-mail addresses, local machine paths) ─────
// Scoped to fixtures and docs, since
// that is where synthetic-vs-real data actually matters; application source
// legitimately contains `git@github.com`-shaped SSH remote examples that are
// not personal data.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const ALLOWED_EMAIL_DOMAINS = /@([a-z0-9-]+\.)*example\.(com|org|net|test)$/i
// A trailing ellipsis ("C:\Users\…") means the text is *documenting* the
// pattern (as internal docs legitimately do), not
// naming a real path; a negative lookahead keeps a real "C:\Users\jane\..."
// failing while sparing that documented form.
const LOCAL_PATH_PATTERNS = [/C:\\Users\\(?!…)/i, /\/Users\/(?!…)/, /\/home\/(?!…)/]

export function isFixtureOrDoc(path) {
  return path.startsWith('tests/fixtures/') || path.endsWith('.md') || path === 'LICENSE'
}

export function findPersonalData(files, { scope = isFixtureOrDoc } = {}) {
  const findings = []
  for (const { path, content } of files) {
    if (content == null || !scope(path)) continue
    const lines = content.split(/\r?\n/)
    for (const line of lines) {
      EMAIL_RE.lastIndex = 0
      let match
      while ((match = EMAIL_RE.exec(line))) {
        const email = match[0]
        if (email.toLowerCase().startsWith('noreply@')) continue
        if (ALLOWED_EMAIL_DOMAINS.test(email)) continue
        findings.push({
          rule: 'personal-email',
          path,
          message: `${path} contains what looks like a real e-mail address: "${email}".`,
        })
      }

      for (const pattern of LOCAL_PATH_PATTERNS) {
        if (pattern.test(line)) {
          findings.push({
            rule: 'local-machine-path',
            path,
            message: `${path} contains what looks like a local machine path (matches ${pattern}).`,
          })
        }
      }
    }
  }
  return findings
}

// ── Rule: stray Streamline assets ─────────────────────────────────────────
// Only design/icons/streamline-pixel/'s own README and LICENSE may live
// there; any other file means an icon asset was added without going through
// the documented attribution step (docs/design.md "Icon source decision").
export function findStrayStreamlineAssets(paths) {
  const allowedBasenames = new Set(['readme.md', 'readme', 'license', 'license.md', 'license.txt'])
  return paths
    .filter((p) => p.startsWith('design/icons/streamline-pixel/'))
    .filter((p) => {
      const base = p.slice('design/icons/streamline-pixel/'.length).toLowerCase()
      return base !== '' && !allowedBasenames.has(base)
    })
    .map((path) => ({
      rule: 'stray-streamline-asset',
      path,
      message: `${path} is not README/LICENSE under design/icons/streamline-pixel/; needs its CC BY 4.0 attribution reviewed (THIRD_PARTY_NOTICES.md).`,
    }))
}

// ── Rule: author/committer e-mail on new commits ──────────────────────────
// 1669a23 is the commit where this repo's identity switched to the noreply
// address; every commit after it must carry that address, so a future commit
// authored with a real e-mail is caught here instead of shipping to the
// public repo. Commits at or before the boundary are exempt by design (the
// user declined a history rewrite for those).
export const NOREPLY_BOUNDARY_COMMIT = '1669a23c4b09ae4bcf430df5d2bb13340ec7183e'
const NOREPLY_DOMAIN = '@users.noreply.github.com'

// `git log --format=%H%x1f%h%x1f%ae%x1f%ce` output: one record per line, with
// `\x1f` (unit separator) between the full hash, short hash, author e-mail
// and committer e-mail.
export function parseCommitLog(raw) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, authorEmail, committerEmail] = line.split('\x1f')
      return { hash, shortHash, authorEmail, committerEmail }
    })
}

export function findNonNoreplyAuthorCommits(commits, { domain = NOREPLY_DOMAIN } = {}) {
  const lower = domain.toLowerCase()
  const isCompliant = (email) => email != null && email.toLowerCase().endsWith(lower)
  const findings = []
  for (const { shortHash, authorEmail, committerEmail } of commits) {
    const badAuthor = !isCompliant(authorEmail)
    const badCommitter = !isCompliant(committerEmail)
    if (!badAuthor && !badCommitter) continue
    const parts = []
    if (badAuthor) parts.push(`author e-mail "${authorEmail}"`)
    if (badCommitter) parts.push(`committer e-mail "${committerEmail}"`)
    findings.push({
      rule: 'non-noreply-author-email',
      path: `commit ${shortHash}`,
      message: `commit ${shortHash} has a non-noreply ${parts.join(' and ')}; expected an address ending in ${domain}.`,
    })
  }
  return findings
}

// ── Aggregate ──────────────────────────────────────────────────────────────
export function runHygieneChecks(files) {
  const paths = files.map((f) => f.path)
  return [
    ...findTrackedEnvFiles(paths),
    ...findTokenLikeStrings(files),
    ...findPersonalData(files),
    ...findStrayStreamlineAssets(paths),
  ]
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const BINARY_EXTENSIONS = new Set(['.png', '.woff2', '.woff', '.ico', '.jpg', '.jpeg', '.gif'])

export function loadTrackedFiles(repoRoot) {
  const out = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
  const paths = out.split('\n').map((l) => l.trim()).filter(Boolean)
  return paths.map((path) => {
    if (BINARY_EXTENSIONS.has(extname(path).toLowerCase())) {
      return { path, content: null }
    }
    const abs = isAbsolute(path) ? path : join(repoRoot, path)
    try {
      if (!statSync(abs).isFile()) return { path, content: null }
      return { path, content: readFileSync(abs, 'utf8') }
    } catch {
      return { path, content: null }
    }
  })
}

export function loadAuthorCommitLog(repoRoot, { boundaryRef = NOREPLY_BOUNDARY_COMMIT } = {}) {
  const out = execFileSync(
    'git',
    ['log', '--format=%H%x1f%h%x1f%ae%x1f%ce', `${boundaryRef}..HEAD`],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  return parseCommitLog(out)
}

export function main(repoRoot = process.cwd()) {
  const files = loadTrackedFiles(repoRoot)
  const findings = runHygieneChecks(files)

  try {
    const commits = loadAuthorCommitLog(repoRoot)
    findings.push(...findNonNoreplyAuthorCommits(commits))
  } catch (err) {
    findings.push({
      rule: 'author-email-check-unavailable',
      path: '.git',
      message: `could not run the author/committer e-mail check: ${err.message}`,
    })
  }

  if (findings.length === 0) {
    console.log(`hygiene: ok (${files.length} tracked files checked)`)
    return 0
  }
  console.error(`hygiene: ${findings.length} finding(s):`)
  for (const f of findings) console.error(`  [${f.rule}] ${f.message}`)
  return 1
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
if (isMain || process.argv[1]?.endsWith('check-hygiene.mjs')) {
  process.exitCode = main()
}
