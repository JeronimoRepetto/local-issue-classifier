// Single source of truth for the Kev setup commands rendered by both
// LocalSetupGuide.vue (Settings) and ProviderOnboardingCard.vue (Home) — see
// this bugfix's report: Home's condensed summary had drifted from the guide
// (fixed kev-0.8b model, missing --no-sync, no copy buttons). Pure: no Vue.
import { describe, expect, it } from 'vitest'
import { kevCommands } from './localCommands'

describe('kevCommands', () => {
  it('includes the shortcut command with the given model only when shortcut is true', () => {
    const withShortcut = kevCommands({ model: 'kev-4b', port: 8009, shortcut: true })
    expect(withShortcut.find((s) => s.id === 'shortcut')?.command).toBe('pnpm local:kev --model kev-4b')

    const withoutShortcut = kevCommands({ model: 'kev-4b', port: 8009, shortcut: false })
    expect(withoutShortcut.find((s) => s.id === 'shortcut')).toBeUndefined()
  })

  it('clones and syncs Kev the same way regardless of model or port', () => {
    const steps = kevCommands({ model: 'kev-9b', port: 9000, shortcut: false })
    expect(steps.find((s) => s.id === 'clone')?.command).toBe(
      'git clone https://github.com/jaredpalmer/kev.git && cd kev',
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

  it('orders clone, sync, cuda, serve, then shortcut last when present', () => {
    const steps = kevCommands({ model: 'kev-0.8b', port: 8009, shortcut: true })
    expect(steps.map((s) => s.id)).toEqual(['clone', 'sync', 'cuda', 'serve', 'shortcut'])
  })
})
