// Shared copy-with-feedback behaviour used by LocalSetupGuide.vue (Settings)
// and ProviderOnboardingCard.vue (Home), so both show the exact same
// "Copied" feedback per command line without duplicating the clipboard /
// execCommand-fallback logic.
import { describe, expect, it, vi, afterEach } from 'vitest'
import { useClipboardCopy } from './useClipboardCopy'

describe('useClipboardCopy', () => {
  const originalClipboard = navigator.clipboard

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true })
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('copies the exact text via navigator.clipboard and marks it copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    const { copiedId, copy } = useClipboardCopy()
    expect(copiedId.value).toBeNull()
    await copy('serve', 'uv run --no-sync --extra serve python -m kev.serve --run jaredpalmer/kev-0.8b --port 8009')

    expect(writeText).toHaveBeenCalledWith(
      'uv run --no-sync --extra serve python -m kev.serve --run jaredpalmer/kev-0.8b --port 8009',
    )
    expect(copiedId.value).toBe('serve')
  })

  it('falls back to document.execCommand when navigator.clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    const execCommand = vi.fn().mockReturnValue(true)
    document.execCommand = execCommand

    const { copiedId, copy } = useClipboardCopy()
    await copy('clone', 'git clone https://github.com/jaredpalmer/kev.git && cd kev')

    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(copiedId.value).toBe('clone')
  })

  it('clears copiedId after the feedback window, and only for the same id', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    const { copiedId, copy } = useClipboardCopy()
    await copy('sync', 'uv sync --extra serve')
    expect(copiedId.value).toBe('sync')

    vi.advanceTimersByTime(2000)
    expect(copiedId.value).toBeNull()
  })

  it('does nothing for an empty/null command', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    const { copiedId, copy } = useClipboardCopy()
    await copy('cuda-note', '')

    expect(writeText).not.toHaveBeenCalled()
    expect(copiedId.value).toBeNull()
  })
})
