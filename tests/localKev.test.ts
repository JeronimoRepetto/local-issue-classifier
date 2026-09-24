// FB-4 — scripts/local-kev.mjs: `pnpm local:kev` clones, installs and starts
// Kev in one command. Only the pure parts are exercised here (arg parsing,
// command planning, prerequisite checks with a fake spawnSync); the real
// clone/sync/serve is never run by this test.
import { describe, expect, it, vi } from 'vitest'
import {
  CUDA_TORCH_INDEX_URL,
  checkPrerequisites,
  cudaCheckCommand,
  cudaInstallCommand,
  formatGpuNotice,
  parseArgs,
  parseCudaCheckOutput,
  planCommands,
  uvInstallHint,
} from '../scripts/local-kev.mjs'

describe('local-kev parseArgs', () => {
  it('defaults to kev-0.8b on port 8009, in .local/kev', () => {
    expect(parseArgs([])).toEqual({
      ok: true,
      value: { model: 'kev-0.8b', port: 8009, dir: '.local/kev', cuda: false, sync: false, help: false },
    })
  })

  it('accepts --model, --port, --dir and --cuda', () => {
    expect(parseArgs(['--model', 'kev-4b', '--port', '9000', '--dir', 'somewhere', '--cuda'])).toEqual({
      ok: true,
      value: { model: 'kev-4b', port: 9000, dir: 'somewhere', cuda: true, sync: false, help: false },
    })
  })

  it('accepts --sync', () => {
    expect(parseArgs(['--sync'])).toEqual({
      ok: true,
      value: { model: 'kev-0.8b', port: 8009, dir: '.local/kev', cuda: false, sync: true, help: false },
    })
  })

  it('accepts -h/--help', () => {
    expect(parseArgs(['--help'])).toEqual({
      ok: true,
      value: { model: 'kev-0.8b', port: 8009, dir: '.local/kev', cuda: false, sync: false, help: true },
    })
  })

  it('rejects an unknown model', () => {
    const result = parseArgs(['--model', 'kev-huge'])
    expect(result.ok).toBe(false)
    expect(result.ok || result.error).toMatch(/--model/)
  })

  it.each([['0'], ['-1'], ['70000'], ['abc']])('rejects an invalid --port %s', (port) => {
    const result = parseArgs(['--port', port])
    expect(result.ok).toBe(false)
  })
})

describe('local-kev uvInstallHint', () => {
  it('suggests winget on Windows', () => {
    expect(uvInstallHint('win32')).toBe('winget install astral-sh.uv')
  })

  it.each([['darwin'], ['linux']] as const)('suggests the curl installer on %s', (platform) => {
    expect(uvInstallHint(platform)).toBe('curl -LsSf https://astral.sh/uv/install.sh | sh')
  })
})

describe('local-kev cudaInstallCommand', () => {
  it('returns the CUDA torch install command on Windows and Linux', () => {
    const expected = `uv pip install --python .venv torch torchvision --index-url ${CUDA_TORCH_INDEX_URL}`
    expect(cudaInstallCommand('win32')).toBe(expected)
    expect(cudaInstallCommand('linux')).toBe(expected)
  })

  it('returns null on macOS (Apple Silicon uses Metal/MPS automatically)', () => {
    expect(cudaInstallCommand('darwin')).toBeNull()
  })
})

describe('local-kev planCommands', () => {
  it('clones, syncs and serves (with --no-sync) when the repo and venv do not exist yet', () => {
    const steps = planCommands({
      platform: 'win32',
      dir: '.local/kev',
      model: 'kev-0.8b',
      port: 8009,
      cuda: false,
      repoExists: false,
      venvExists: false,
      sync: false,
    })
    expect(steps.map((s) => s.id)).toEqual(['clone', 'sync', 'serve'])
    expect(steps[0]).toMatchObject({ command: 'git', args: ['clone', 'https://github.com/jaredpalmer/kev.git', '.local/kev'] })
    expect(steps[1]).toMatchObject({ command: 'uv', args: ['sync', '--extra', 'serve'], cwd: '.local/kev' })
    expect(steps[2]).toMatchObject({
      command: 'uv',
      args: ['run', '--no-sync', '--extra', 'serve', 'python', '-m', 'kev.serve', '--run', 'jaredpalmer/kev-0.8b', '--port', '8009'],
      cwd: '.local/kev',
    })
  })

  it('skips the clone and sync steps when the repo and venv already exist', () => {
    const steps = planCommands({
      platform: 'win32',
      dir: '.local/kev',
      model: 'kev-0.8b',
      port: 8009,
      cuda: false,
      repoExists: true,
      venvExists: true,
      sync: false,
    })
    expect(steps.map((s) => s.id)).toEqual(['serve'])
  })

  it('syncs (but does not clone) when the repo exists but the venv does not', () => {
    const steps = planCommands({
      platform: 'win32',
      dir: '.local/kev',
      model: 'kev-0.8b',
      port: 8009,
      cuda: false,
      repoExists: true,
      venvExists: false,
      sync: false,
    })
    expect(steps.map((s) => s.id)).toEqual(['sync', 'serve'])
  })

  it('re-syncs when --sync is passed even though the venv already exists', () => {
    const steps = planCommands({
      platform: 'win32',
      dir: '.local/kev',
      model: 'kev-0.8b',
      port: 8009,
      cuda: false,
      repoExists: true,
      venvExists: true,
      sync: true,
    })
    expect(steps.map((s) => s.id)).toEqual(['sync', 'serve'])
  })

  it('inserts the CUDA step before serve when --cuda is set, on Windows and Linux', () => {
    const steps = planCommands({
      platform: 'linux',
      dir: 'kev',
      model: 'kev-9b',
      port: 8009,
      cuda: true,
      repoExists: true,
      venvExists: true,
      sync: false,
    })
    expect(steps.map((s) => s.id)).toEqual(['cuda', 'serve'])
    expect(steps[0].args.join(' ')).toBe(`pip install --python .venv torch torchvision --index-url ${CUDA_TORCH_INDEX_URL}`)
    expect(steps[0].cwd).toBe('kev')
  })

  it('omits the CUDA step on macOS even when --cuda is set', () => {
    const steps = planCommands({
      platform: 'darwin',
      dir: 'kev',
      model: 'kev-0.8b',
      port: 8009,
      cuda: true,
      repoExists: true,
      venvExists: true,
      sync: false,
    })
    expect(steps.map((s) => s.id)).toEqual(['serve'])
  })

  it('reflects a custom model and port in the serve step, always launched with --no-sync', () => {
    const steps = planCommands({
      platform: 'win32',
      dir: '.local/kev',
      model: 'kev-4b',
      port: 9100,
      cuda: false,
      repoExists: true,
      venvExists: true,
      sync: false,
    })
    const serve = steps.find((s) => s.id === 'serve')!
    expect(serve.args).toEqual(['run', '--no-sync', '--extra', 'serve', 'python', '-m', 'kev.serve', '--run', 'jaredpalmer/kev-4b', '--port', '9100'])
  })
})

describe('local-kev cudaCheckCommand', () => {
  it('checks torch version and CUDA availability with uv run --no-sync (never re-syncs)', () => {
    expect(cudaCheckCommand('.local/kev')).toEqual({
      command: 'uv',
      args: ['run', '--no-sync', 'python', '-c', 'import torch; print(torch.__version__, torch.cuda.is_available())'],
      cwd: '.local/kev',
    })
  })
})

describe('local-kev parseCudaCheckOutput', () => {
  it('parses "<version> True" as CUDA available', () => {
    expect(parseCudaCheckOutput('2.14.0+cu130 True\n')).toEqual({ torchVersion: '2.14.0+cu130', available: true })
  })

  it('parses "<version> False" as CUDA not available', () => {
    expect(parseCudaCheckOutput('2.8.0+cpu False\n')).toEqual({ torchVersion: '2.8.0+cpu', available: false })
  })

  it.each([[''], [undefined], ['Traceback (most recent call last):\n  ModuleNotFoundError']])(
    'returns null for unparseable output %j',
    (stdout) => {
      expect(parseCudaCheckOutput(stdout as string)).toBeNull()
    },
  )
})

describe('local-kev formatGpuNotice', () => {
  it('reports GPU available with the torch version', () => {
    expect(formatGpuNotice({ torchVersion: '2.14.0+cu130', available: true })).toBe('GPU: available (torch 2.14.0+cu130)')
  })

  it('reports GPU not available (with the --cuda hint) when torch has no CUDA build', () => {
    expect(formatGpuNotice({ torchVersion: '2.8.0+cpu', available: false })).toBe(
      'GPU: not available — pass --cuda to install the CUDA build (Windows/Linux, NVIDIA)',
    )
  })

  it('reports GPU not available when the check could not be parsed (e.g. torch missing)', () => {
    expect(formatGpuNotice(null)).toBe('GPU: not available — pass --cuda to install the CUDA build (Windows/Linux, NVIDIA)')
  })
})

describe('local-kev checkPrerequisites', () => {
  function fakeSpawnSync(map: Record<string, { status?: number; stdout?: string; error?: Error }>) {
    return vi.fn((cmd: string) => {
      const entry = map[cmd]
      if (!entry) return { status: 1, stdout: '', stderr: '', error: undefined }
      if (entry.error) return { status: null, stdout: '', stderr: '', error: entry.error }
      return { status: entry.status ?? 0, stdout: entry.stdout ?? '', stderr: '', error: undefined }
    })
  }

  it('reports every tool present and a supported Python version as ok', () => {
    const spawnSync = fakeSpawnSync({
      git: { stdout: 'git version 2.44.0' },
      uv: { stdout: 'uv 0.4.20' },
      py: { stdout: 'Python 3.12.4' },
    })
    const result = checkPrerequisites(spawnSync, 'win32')
    expect(result.git.ok).toBe(true)
    expect(result.uv.ok).toBe(true)
    expect(result.python.ok).toBe(true)
  })

  it('reports uv missing with the platform install hint', () => {
    const spawnSync = fakeSpawnSync({
      git: { stdout: 'git version 2.44.0' },
      py: { stdout: 'Python 3.12.4' },
    })
    const result = checkPrerequisites(spawnSync, 'win32')
    expect(result.uv.ok).toBe(false)
    expect(result.uv.hint).toBe('winget install astral-sh.uv')
  })

  it('flags an unsupported Python version', () => {
    const spawnSync = fakeSpawnSync({
      git: { stdout: 'git version 2.44.0' },
      uv: { stdout: 'uv 0.4.20' },
      py: { stdout: 'Python 3.11.9' },
    })
    const result = checkPrerequisites(spawnSync, 'win32')
    expect(result.python.ok).toBe(false)
  })

  it('uses python3 (not py) to check Python outside Windows', () => {
    const spawnSync = fakeSpawnSync({ git: { stdout: 'git version 2.44.0' }, uv: { stdout: 'uv 0.4.20' }, python3: { stdout: 'Python 3.13.0' } })
    const result = checkPrerequisites(spawnSync, 'linux')
    expect(result.python.ok).toBe(true)
    expect(spawnSync).toHaveBeenCalledWith('python3', ['--version'], expect.anything())
  })

  it('treats a thrown/errored spawnSync as the tool missing, not a crash', () => {
    const spawnSync = fakeSpawnSync({ uv: { error: new Error('ENOENT') } })
    expect(() => checkPrerequisites(spawnSync, 'win32')).not.toThrow()
    expect(checkPrerequisites(spawnSync, 'win32').uv.ok).toBe(false)
  })
})
