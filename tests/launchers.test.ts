// @vitest-environment node
// One-click Kev launchers (docs/local-providers.md "One-click launcher"):
// scripts/start-kev.ps1 (Windows PowerShell 5.1+) and scripts/start-kev.sh
// (POSIX sh). Only their planning logic is exercised, through the dry-run flag:
// each script prints what it would do and runs nothing — no clone, no uv, no
// server. Tool detection is pinned with the KEV_LAUNCHER_ASSUME_* variables so
// the plan does not depend on this machine. A shell that is not installed
// skips its suite with a message instead of failing.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { CUDA_TORCH_INDEX_URL } from '../src/domain/localCommands'

const ROOT = join(__dirname, '..')
const PS1 = join(ROOT, 'scripts', 'start-kev.ps1')
const SH = join(ROOT, 'scripts', 'start-kev.sh')
const CLONE = 'git clone https://github.com/jaredpalmer/kev.git'
const CUDA_STEP = `uv pip install --python .venv torch torchvision --index-url ${CUDA_TORCH_INDEX_URL}`
const KERNELS_STEP = 'uv pip install --python .venv causal-conv1d flash-linear-attention'
const serve = (model: string, port: number) =>
  `uv run --no-sync --extra serve python -m kev.serve --run jaredpalmer/${model} --port ${port}`

function available(cmd: string, args: string[]): boolean {
  const probe = spawnSync(cmd, args, { encoding: 'utf8', timeout: 20_000 })
  return !probe.error && probe.status === 0
}

const POWERSHELL = ['pwsh', 'powershell'].find((cmd) => available(cmd, ['-NoProfile', '-Command', 'exit 0'])) ?? null
const SHELL = available('sh', ['-c', 'exit 0']) ? 'sh' : null

const scratch = mkdtempSync(join(tmpdir(), 'kev-launcher-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/** A fresh --dir: absent, cloned (has .git) or synced (also has .venv). */
function kevDir(state: 'absent' | 'cloned' | 'synced'): string {
  const dir = mkdtempSync(join(scratch, 'dir-'))
  const kev = join(dir, 'kev')
  if (state === 'absent') return kev
  mkdirSync(kev)
  mkdirSync(join(kev, '.git'))
  if (state === 'synced') mkdirSync(join(kev, '.venv'))
  return kev
}

interface Assume {
  tools?: string
  python?: string
  cuda?: 'true' | 'false'
}

function envFor(assume: Assume): NodeJS.ProcessEnv {
  return {
    ...process.env,
    KEV_LAUNCHER_ASSUME_TOOLS: assume.tools ?? 'git,python,uv',
    KEV_LAUNCHER_ASSUME_PYTHON: assume.python ?? '3.12.7',
    KEV_LAUNCHER_ASSUME_CUDA: assume.cuda ?? '',
  }
}

type Flags = { model?: string; port?: number; dir: string; fastKernels?: boolean }

interface Launcher {
  name: string
  shell: string | null
  plan: (flags: Flags, assume?: Assume) => { status: number | null; out: string }
}

const launchers: Launcher[] = [
  {
    name: 'start-kev.ps1',
    shell: POWERSHELL,
    plan: (flags, assume = {}) => {
      const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-DryRun', '-Dir', flags.dir]
      if (flags.model) args.push('-Model', flags.model)
      if (flags.port) args.push('-Port', String(flags.port))
      if (flags.fastKernels) args.push('-FastKernels')
      const run = spawnSync(POWERSHELL!, args, { encoding: 'utf8', env: envFor(assume), timeout: 60_000 })
      return { status: run.status, out: `${run.stdout}${run.stderr}` }
    },
  },
  {
    name: 'start-kev.sh',
    shell: SHELL,
    plan: (flags, assume = {}) => {
      const args = [SH, '--dry-run', '--dir', flags.dir]
      if (flags.model) args.push('--model', flags.model)
      if (flags.port) args.push('--port', String(flags.port))
      if (flags.fastKernels) args.push('--fast-kernels')
      const run = spawnSync(SHELL!, args, { encoding: 'utf8', env: envFor(assume), timeout: 60_000 })
      return { status: run.status, out: `${run.stdout}${run.stderr}` }
    },
  },
]

for (const launcher of launchers) {
  describe.skipIf(!launcher.shell)(`${launcher.name} --dry-run`, () => {
    it('on a fresh machine: clones, syncs once, then serves kev-0.8b on :8009', () => {
      const { status, out } = launcher.plan({ dir: kevDir('absent') })
      expect(status).toBe(0)
      expect(out).toContain('Dry run: nothing will be run.')
      expect(out).toContain(`[clone] ${CLONE}`)
      expect(out).toContain('[sync] uv sync --extra serve')
      expect(out).toContain(`[serve] ${serve('kev-0.8b', 8009)}`)
      expect(out).not.toContain('[cuda]')
    })

    it('is idempotent: an existing checkout with .venv only starts the server', () => {
      const { status, out } = launcher.plan({ dir: kevDir('synced'), model: 'kev-4b', port: 8010 })
      expect(status).toBe(0)
      expect(out).toContain('[skip] clone')
      expect(out).toContain('[skip] sync')
      expect(out).not.toContain(`[clone] ${CLONE}`)
      expect(out).toContain(`[serve] ${serve('kev-4b', 8010)}`)
    })

    it('with an NVIDIA GPU and a CPU-only torch, installs the CUDA build before serving', () => {
      const { out } = launcher.plan({ dir: kevDir('synced') }, { tools: 'git,python,uv,nvidia-smi', cuda: 'false' })
      expect(out).toContain(`[cuda] ${CUDA_STEP}`)
      expect(out.indexOf('[cuda]')).toBeLessThan(out.indexOf('[serve]'))
    })

    it('with an NVIDIA GPU whose torch already sees CUDA, skips the CUDA step', () => {
      const { out } = launcher.plan({ dir: kevDir('synced') }, { tools: 'git,python,uv,nvidia-smi', cuda: 'true' })
      expect(out).toContain('[skip] cuda')
      expect(out).not.toContain(`[cuda] ${CUDA_STEP}`)
    })

    it('installs the fast kernels only with the flag', () => {
      expect(launcher.plan({ dir: kevDir('synced') }).out).toContain('[skip] fast kernels')
      expect(launcher.plan({ dir: kevDir('synced'), fastKernels: true }).out).toContain(`[kernels] ${KERNELS_STEP}`)
    })

    it('offers to install uv when it is missing (after a prompt)', () => {
      const { out } = launcher.plan({ dir: kevDir('absent') }, { tools: 'git,python' })
      expect(out).toMatch(/\[uv\] .*(winget install|astral\.sh\/uv\/install\.sh)/)
    })

    it('flags a Python outside 3.12-3.13, and a missing git when a clone is needed', () => {
      const { out } = launcher.plan({ dir: kevDir('absent') }, { tools: 'python,uv', python: '3.11.9' })
      expect(out).toMatch(/\[python\] .*3\.11\.9/)
      expect(out).toMatch(/\[git\] /)
    })

    it('rejects an unknown model', () => {
      const { status, out } = launcher.plan({ dir: kevDir('absent'), model: 'kev-70b' })
      expect(status).not.toBe(0)
      expect(out).toMatch(/kev-0\.8b, kev-4b or kev-9b/)
    })
  })

  if (!launcher.shell) {
    it.skip(`${launcher.name}: skipped, its shell is not available on this machine`, () => {})
  }
}

describe('launcher sources', () => {
  it('start-kev.ps1 stays Windows PowerShell 5.1-compatible', () => {
    const source = readFileSync(PS1, 'utf8')
    expect(source).toContain('Set-StrictMode -Version Latest')
    expect(source).toContain("$ErrorActionPreference = 'Stop'")
    expect(source).not.toMatch(/&&|\|\|/)
    expect(source).not.toMatch(/\?\?/)
    expect([...source].every((ch) => ch.charCodeAt(0) < 128)).toBe(true) // PS 5.1 reads BOM-less files as ANSI
  })

  it('start-kev.sh is POSIX sh with set -eu', () => {
    const source = readFileSync(SH, 'utf8')
    expect(source.startsWith('#!/bin/sh\n')).toBe(true)
    expect(source).toContain('set -eu')
    expect(source).not.toMatch(/\[\[|^\s*function\s|^\s*local\s/m) // no bashisms
  })
})
