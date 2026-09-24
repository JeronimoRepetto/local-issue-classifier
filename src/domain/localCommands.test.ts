// Single source of truth for the Kev setup commands rendered by both
// LocalSetupGuide.vue (Settings) and ProviderOnboardingCard.vue (Home) — see
// this bugfix's report: Home's condensed summary had drifted from the guide
// (fixed kev-0.8b model, missing --no-sync, no copy buttons). Pure: no Vue.
import { describe, expect, it } from 'vitest'
import { detectOs, kevCommands, kevLauncher, layaCommands } from './localCommands'

describe('kevCommands', () => {
  it('includes the shortcut command with the given model only when shortcut is true', () => {
    const withShortcut = kevCommands({ model: 'kev-4b', port: 8009, shortcut: true })
    expect(withShortcut.find((s) => s.id === 'shortcut')?.command).toBe('pnpm local:kev --model kev-4b')

    const withoutShortcut = kevCommands({ model: 'kev-4b', port: 8009, shortcut: false })
    expect(withoutShortcut.find((s) => s.id === 'shortcut')).toBeUndefined()
  })

  it('installs uv, syncs Kev the same way regardless of model or port', () => {
    const steps = kevCommands({ model: 'kev-9b', port: 9000, os: 'linux', shortcut: false })
    expect(steps.find((s) => s.id === 'uv-install')?.command).toBe(
      'curl -LsSf https://astral.sh/uv/install.sh | sh',
    )
    expect(steps.find((s) => s.id === 'sync')?.command).toBe('uv sync --extra serve')
  })

  it.each([
    ['kev-0.8b', 8009, 'uv run --no-sync --extra serve python -m kev.serve --run jaredpalmer/kev-0.8b --port 8009'],
    ['kev-4b', 8009, 'uv run --no-sync --extra serve python -m kev.serve --run jaredpalmer/kev-4b --port 8009'],
    ['kev-9b', 8123, 'uv run --no-sync --extra serve python -m kev.serve --run jaredpalmer/kev-9b --port 8123'],
  ] as const)('serve command for %s on port %i includes --no-sync', (model, port, expected) => {
    const steps = kevCommands({ model, port, shortcut: false })
    expect(steps.find((s) => s.id === 'serve')?.command).toBe(expected)
  })

  it('includes the CUDA install command by default (Windows/Linux), with the --no-sync reminder note', () => {
    const steps = kevCommands({ model: 'kev-0.8b', port: 8009, shortcut: false })
    const cuda = steps.find((s) => s.id === 'cuda')
    expect(cuda?.command).toBe(
      'uv pip install --python .venv torch torchvision --index-url https://download.pytorch.org/whl/cu130',
    )
    expect(cuda?.note).toMatch(/always start with `--no-sync`.*or uv will reinstall the cpu build/i)
  })

  it('keeps the same CUDA command on Linux explicitly', () => {
    const steps = kevCommands({ model: 'kev-0.8b', port: 8009, os: 'linux', shortcut: false })
    expect(steps.find((s) => s.id === 'cuda')?.command).toBe(
      'uv pip install --python .venv torch torchvision --index-url https://download.pytorch.org/whl/cu130',
    )
  })

  it('replaces the CUDA step with a note on macOS', () => {
    const steps = kevCommands({ model: 'kev-0.8b', port: 8009, os: 'macos', shortcut: false })
    expect(steps.find((s) => s.id === 'cuda')).toBeUndefined()
    const note = steps.find((s) => s.id === 'cuda-note')
    expect(note?.command).toBeNull()
    expect(note?.note).toMatch(/not applicable on macos/i)
  })

  describe('Windows has no && (PowerShell 5.1 predates pipeline chain operators)', () => {
    it('splits clone and cd into two separate copyable lines', () => {
      const steps = kevCommands({ model: 'kev-0.8b', port: 8009, os: 'windows', shortcut: false })
      expect(steps.find((s) => s.id === 'clone')?.command).toBe('git clone https://github.com/jaredpalmer/kev.git')
      expect(steps.find((s) => s.id === 'cd')?.command).toBe('cd kev')
    })

    it('defaults to windows when os is omitted', () => {
      const steps = kevCommands({ model: 'kev-0.8b', port: 8009, shortcut: false })
      expect(steps.find((s) => s.id === 'clone')?.command).toBe('git clone https://github.com/jaredpalmer/kev.git')
      expect(steps.find((s) => s.id === 'cd')?.command).toBe('cd kev')
    })

    it('installs uv with winget', () => {
      const steps = kevCommands({ model: 'kev-0.8b', port: 8009, os: 'windows', shortcut: false })
      expect(steps.find((s) => s.id === 'uv-install')?.command).toBe('winget install astral-sh.uv')
    })
  })

  describe('macOS and Linux keep the && one-liner (bash/zsh always supported it)', () => {
    it.each(['macos', 'linux'] as const)('%s folds clone and cd into one line, with no separate cd step', (os) => {
      const steps = kevCommands({ model: 'kev-0.8b', port: 8009, os, shortcut: false })
      expect(steps.find((s) => s.id === 'clone')?.command).toBe(
        'git clone https://github.com/jaredpalmer/kev.git && cd kev',
      )
      expect(steps.find((s) => s.id === 'cd')).toBeUndefined()
    })

    it('installs uv with the curl script on both', () => {
      for (const os of ['macos', 'linux'] as const) {
        const steps = kevCommands({ model: 'kev-0.8b', port: 8009, os, shortcut: false })
        expect(steps.find((s) => s.id === 'uv-install')?.command).toBe(
          'curl -LsSf https://astral.sh/uv/install.sh | sh',
        )
      }
    })
  })

  describe('--dir reuse hint on the shortcut step', () => {
    it('uses a backslash example path on Windows', () => {
      const steps = kevCommands({ model: 'kev-0.8b', port: 8009, os: 'windows', shortcut: true })
      expect(steps.find((s) => s.id === 'shortcut')?.note).toMatch(/--dir `?C:\\path\\to\\kev/)
      expect(steps.find((s) => s.id === 'shortcut')?.note).toMatch(/reuse it \(skips clone and sync\)/)
    })

    it.each(['macos', 'linux'] as const)('uses a forward-slash example path on %s', (os) => {
      const steps = kevCommands({ model: 'kev-0.8b', port: 8009, os, shortcut: true })
      expect(steps.find((s) => s.id === 'shortcut')?.note).toMatch(/--dir `?\/path\/to\/kev/)
    })

    it('is absent when shortcut is false', () => {
      const steps = kevCommands({ model: 'kev-0.8b', port: 8009, os: 'windows', shortcut: false })
      expect(steps.find((s) => s.id === 'shortcut')).toBeUndefined()
    })
  })

  it('orders uv-install, clone, cd, sync, cuda, serve, then shortcut last on Windows', () => {
    const steps = kevCommands({ model: 'kev-0.8b', port: 8009, os: 'windows', shortcut: true })
    expect(steps.map((s) => s.id)).toEqual(['uv-install', 'clone', 'cd', 'sync', 'cuda', 'serve', 'shortcut'])
  })

  it('orders uv-install, clone, sync, cuda, serve, then shortcut last on macOS/Linux (no cd step)', () => {
    const steps = kevCommands({ model: 'kev-0.8b', port: 8009, os: 'linux', shortcut: true })
    expect(steps.map((s) => s.id)).toEqual(['uv-install', 'clone', 'sync', 'cuda', 'serve', 'shortcut'])
  })
})

describe('layaCommands', () => {
  it('installs the serve extra the same way regardless of OS', () => {
    for (const os of ['windows', 'macos', 'linux'] as const) {
      expect(layaCommands({ port: 8000, os }).find((s) => s.id === 'install')?.command).toBe(
        'pip install "laya[serve]"',
      )
    }
  })

  it('Windows: sets $env:LAYA_PORT as its own step, then starts the server with no flags (laya-serve has no CLI args)', () => {
    const steps = layaCommands({ port: 8000, os: 'windows' })
    expect(steps.map((s) => s.id)).toEqual(['install', 'port-env', 'serve'])
    expect(steps.find((s) => s.id === 'port-env')?.command).toBe('$env:LAYA_PORT = 8000')
    expect(steps.find((s) => s.id === 'serve')?.command).toBe('laya-serve')
  })

  it('defaults to windows when os is omitted', () => {
    const steps = layaCommands({ port: 8000 })
    expect(steps.map((s) => s.id)).toEqual(['install', 'port-env', 'serve'])
  })

  it.each(['macos', 'linux'] as const)('%s: sets LAYA_PORT inline on the serve line, no separate env step', (os) => {
    const steps = layaCommands({ port: 8123, os })
    expect(steps.map((s) => s.id)).toEqual(['install', 'serve'])
    expect(steps.find((s) => s.id === 'serve')?.command).toBe('LAYA_PORT=8123 laya-serve')
  })
})

describe('detectOs', () => {
  it('reads navigator.userAgentData.platform when available', () => {
    expect(detectOs({ userAgentData: { platform: 'Windows' } })).toBe('windows')
    expect(detectOs({ userAgentData: { platform: 'macOS' } })).toBe('macos')
    expect(detectOs({ userAgentData: { platform: 'Linux' } })).toBe('linux')
  })

  it('falls back to navigator.userAgent when userAgentData is absent', () => {
    expect(detectOs({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })).toBe('windows')
    expect(detectOs({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })).toBe('macos')
    expect(detectOs({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })).toBe('linux')
  })

  it('defaults to linux when nothing is recognizable, missing, or nav itself is absent', () => {
    expect(detectOs({})).toBe('linux')
    expect(detectOs({ userAgent: 'some unknown UA' })).toBe('linux')
    expect(detectOs(undefined)).toBe('linux')
    expect(detectOs(null)).toBe('linux')
  })

  it('prefers userAgentData over userAgent when both are present', () => {
    expect(
      detectOs({ userAgentData: { platform: 'macOS' }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }),
    ).toBe('macos')
  })
})

// One-click launchers (docs/local-providers.md "One-click launcher").
describe('kevLauncher', () => {
  it('Windows: the PowerShell launcher, run with a one-off execution-policy bypass', () => {
    expect(kevLauncher({ os: 'windows', model: 'kev-4b' })).toEqual({
      file: 'start-kev.ps1',
      path: 'launchers/start-kev.ps1',
      label: 'Download launcher for Windows',
      run: 'powershell -ExecutionPolicy Bypass -File .\start-kev.ps1 -Model kev-4b',
    })
  })

  it('macOS and Linux: the POSIX sh launcher', () => {
    expect(kevLauncher({ os: 'macos', model: 'kev-0.8b' })).toMatchObject({
      file: 'start-kev.sh',
      path: 'launchers/start-kev.sh',
      label: 'Download launcher for macOS',
      run: 'sh start-kev.sh --model kev-0.8b',
    })
    expect(kevLauncher({ os: 'linux', model: 'kev-9b' }).label).toBe('Download launcher for Linux')
  })
})
