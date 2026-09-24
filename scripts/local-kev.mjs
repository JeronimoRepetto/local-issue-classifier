#!/usr/bin/env node
// local-issue-classifier — FB-4: `pnpm local:kev` clones, installs and starts
// Kev (jaredpalmer/kev) in one command, so "Local server" in Settings is not a
// dead end (docs/local-providers.md, src/components/ui/LocalSetupGuide.vue).
//
//   pnpm local:kev [--model kev-0.8b|kev-4b|kev-9b] [--port 8009] [--dir <path>] [--cuda]
//
// Safety: this script clones a third-party repo, downloads a model on first
// run and starts a long-lived server — it does none of that at import time.
// Every side-effecting step lives in main(), guarded by the `isMain` check at
// the bottom, so tests can import the pure parts (parseArgs, planCommands,
// checkPrerequisites, uvInstallHint, cudaInstallCommand) without running
// anything real.
import { spawn, spawnSync as nodeSpawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs as parseNodeArgs } from 'node:util'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_DIR = '.local/kev'
const DEFAULT_PORT = 8009 // matches src/domain/provider.ts's LOCAL_PRESETS "kev" preset
const MODELS = ['kev-0.8b', 'kev-4b', 'kev-9b']

const USAGE = `Usage: pnpm local:kev [options]

Clones jaredpalmer/kev into ${DEFAULT_DIR} (if not already there), installs its
dependencies with uv, and starts the server in the foreground.

Options:
  --model <name>   kev-0.8b (default), kev-4b or kev-9b (docs/hardware-fit.md)
  --port <n>       port to serve on (default: ${DEFAULT_PORT})
  --dir <path>     where to clone/find Kev (default: ${DEFAULT_DIR})
  --cuda           also install a CUDA build of torch into Kev's venv, for an
                   NVIDIA GPU on Windows or Linux (macOS uses Metal already)
  -h, --help       show this help`

// ── Pure: argument parsing ──────────────────────────────────────────────────
/** @returns {{ ok: true, value: { model: string, port: number, dir: string, cuda: boolean, help: boolean } } | { ok: false, error: string }} */
export function parseArgs(argv) {
  let parsed
  try {
    parsed = parseNodeArgs({
      args: argv,
      allowPositionals: false,
      options: {
        model: { type: 'string' },
        port: { type: 'string' },
        dir: { type: 'string' },
        cuda: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    })
  } catch (error) {
    return { ok: false, error: error.message }
  }
  const { values } = parsed
  if (values.help) {
    return { ok: true, value: { model: 'kev-0.8b', port: DEFAULT_PORT, dir: DEFAULT_DIR, cuda: false, help: true } }
  }
  const model = values.model ?? 'kev-0.8b'
  if (!MODELS.includes(model)) {
    return { ok: false, error: `--model must be one of ${MODELS.join(', ')} (got "${model}")` }
  }
  const port = values.port === undefined ? DEFAULT_PORT : Number(values.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: '--port must be an integer between 1 and 65535' }
  }
  return { ok: true, value: { model, port, dir: values.dir ?? DEFAULT_DIR, cuda: values.cuda, help: false } }
}

// ── Pure: prerequisite install hints ────────────────────────────────────────
export function uvInstallHint(platform = process.platform) {
  return platform === 'win32' ? 'winget install astral-sh.uv' : 'curl -LsSf https://astral.sh/uv/install.sh | sh'
}

// CUDA wheel index (pytorch.org/get-started/locally, Windows+Linux, checked
// 2026-09-24 from https://download.pytorch.org/assets/quick-start-module.js).
// Keep in sync with src/components/ui/LocalSetupGuide.vue's CUDA_TORCH_INDEX_URL.
export const CUDA_TORCH_INDEX_URL = 'https://download.pytorch.org/whl/cu130'

/** null on macOS: Apple Silicon uses Metal (MPS) automatically, no separate install. */
export function cudaInstallCommand(platform = process.platform) {
  if (platform === 'darwin') return null
  return `uv pip install --python .venv torch torchvision --index-url ${CUDA_TORCH_INDEX_URL}`
}

// ── Pure: command planning (no execution) ───────────────────────────────────
/**
 * @param {{ platform?: string, dir: string, model: string, port: number, cuda: boolean, repoExists: boolean }} opts
 * @returns {{ id: string, description: string, command: string, args: string[], cwd?: string }[]}
 */
export function planCommands({ platform = process.platform, dir, model, port, cuda, repoExists }) {
  const steps = []
  if (!repoExists) {
    steps.push({
      id: 'clone',
      description: `Clone jaredpalmer/kev into ${dir}`,
      command: 'git',
      args: ['clone', 'https://github.com/jaredpalmer/kev.git', dir],
    })
  }
  steps.push({
    id: 'sync',
    description: "Install Kev's dependencies",
    command: 'uv',
    args: ['sync', '--extra', 'serve'],
    cwd: dir,
  })
  if (cuda) {
    const cudaCommand = cudaInstallCommand(platform)
    if (cudaCommand) {
      const [command, ...args] = cudaCommand.split(' ')
      steps.push({ id: 'cuda', description: 'Install a CUDA build of torch', command, args, cwd: dir })
    }
  }
  steps.push({
    id: 'serve',
    description: `Start Kev (${model}) on port ${port}`,
    command: 'uv',
    args: ['run', '--extra', 'serve', 'python', '-m', 'kev.serve', '--run', `jaredpalmer/${model}`, '--port', String(port)],
    cwd: dir,
  })
  return steps
}

// ── Pure(ish): prerequisite checks — spawnSync is injected, so tests fake it ─
function checkCommand(spawnSyncFn, command, args) {
  let result
  try {
    result = spawnSyncFn(command, args, { encoding: 'utf8' })
  } catch (error) {
    return { ok: false, version: null }
  }
  if (!result || result.error || result.status !== 0) return { ok: false, version: null }
  return { ok: true, version: (result.stdout || result.stderr || '').trim() }
}

/** @returns {{ git: object, uv: object, python: object }} */
export function checkPrerequisites(spawnSyncFn, platform = process.platform) {
  const git = { ...checkCommand(spawnSyncFn, 'git', ['--version']), hint: 'https://git-scm.com/downloads' }
  const uv = { ...checkCommand(spawnSyncFn, 'uv', ['--version']), hint: uvInstallHint(platform) }
  const pythonCmd = platform === 'win32' ? 'py' : 'python3'
  const pythonCheck = checkCommand(spawnSyncFn, pythonCmd, ['--version'])
  const supported = pythonCheck.ok && /\b3\.1[23]\b/.test(pythonCheck.version)
  const python = {
    ok: supported,
    version: pythonCheck.version,
    hint: 'Install Python 3.12 or 3.13 from https://www.python.org/downloads/',
  }
  return { git, uv, python }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function fail(message) {
  console.error(`local-kev: ${message}`)
  process.exitCode = 1
}

function reportPrerequisites(prereqs) {
  let ok = true
  for (const [name, check] of Object.entries(prereqs)) {
    if (check.ok) continue
    ok = false
    console.error(`local-kev: ${name} is missing or unsupported. Install/upgrade it, then try again:`)
    console.error(`  ${check.hint}`)
  }
  return ok
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  if (!parsed.ok) {
    fail(parsed.error)
    console.error('')
    console.error(USAGE)
    return
  }
  if (parsed.value.help) {
    console.log(USAGE)
    return
  }
  const { model, port, dir, cuda } = parsed.value
  const absoluteDir = resolve(ROOT, dir)

  const prereqs = checkPrerequisites(nodeSpawnSync, process.platform)
  // uv is required for every remaining step; git is only required to clone.
  const repoExists = existsSync(join(absoluteDir, '.git'))
  const required = repoExists ? { uv: prereqs.uv } : { git: prereqs.git, uv: prereqs.uv }
  if (!reportPrerequisites(required)) {
    process.exitCode = 1
    return
  }
  if (!prereqs.python.ok) {
    console.warn(`local-kev: warning — ${prereqs.python.hint} (uv can also manage its own Python; continuing).`)
  }

  const steps = planCommands({ platform: process.platform, dir: absoluteDir, model, port, cuda, repoExists })
  const setupSteps = steps.filter((s) => s.id !== 'serve')
  const serveStep = steps.find((s) => s.id === 'serve')

  for (const step of setupSteps) {
    console.log(`local-kev: ${step.description}`)
    console.log(`  $ ${step.command} ${step.args.join(' ')}`)
    const result = nodeSpawnSync(step.command, step.args, { cwd: step.cwd, stdio: 'inherit' })
    if (result.error || result.status !== 0) {
      fail(`"${step.command} ${step.args.join(' ')}" failed`)
      return
    }
  }

  console.log(`local-kev: ${serveStep.description}`)
  console.log(`  $ ${serveStep.command} ${serveStep.args.join(' ')}`)
  const child = spawn(serveStep.command, serveStep.args, { cwd: serveStep.cwd, stdio: 'inherit' })

  // Kill only the child this script spawned — never by image name.
  let shuttingDown = false
  function shutdown() {
    if (shuttingDown) return
    shuttingDown = true
    if (!child.killed) child.kill()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  child.on('exit', (code) => {
    process.exitCode = code ?? 0
  })
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
if (isMain || process.argv[1]?.replaceAll('\\', '/').endsWith('scripts/local-kev.mjs')) {
  main()
}
