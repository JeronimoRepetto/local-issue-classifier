// FB-4 (docs/local-providers.md): beginner-proof, copy-pasteable steps to run
// a local Jev-compatible server (Kev, JevK5), shown inside ProviderSelector when
// "Local server" is selected. Presentational: it owns no persistence and no
// network; `status` (the last connection-test result) only drives whether it
// starts collapsed.
import { describe, expect, it, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LocalSetupGuide from './LocalSetupGuide.vue'

function mountGuide(props: Partial<{ status: 'direct' | 'proxied' | 'unreachable' | null }> = {}) {
  return mount(LocalSetupGuide, { props: { status: null, ...props } })
}

describe('LocalSetupGuide', () => {
  it('is open by default, defaults to Kev on Windows', () => {
    const wrapper = mountGuide()
    const details = wrapper.get('[data-test="local-setup-guide"]').element as HTMLDetailsElement
    expect(details.open).toBe(true)
    expect(wrapper.get('[data-test="segment-kev"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.get('[data-test="segment-windows"]').attributes('aria-checked')).toBe('true')
  })

  it.each([['direct'], ['proxied']] as const)('collapses once the probe reports %s', async (status) => {
    const wrapper = mountGuide()
    await wrapper.setProps({ status })
    expect((wrapper.get('[data-test="local-setup-guide"]').element as HTMLDetailsElement).open).toBe(false)
  })

  it('stays open when the probe is unreachable', async () => {
    const wrapper = mountGuide()
    await wrapper.setProps({ status: 'unreachable' })
    expect((wrapper.get('[data-test="local-setup-guide"]').element as HTMLDetailsElement).open).toBe(true)
  })

  it('shows the Kev commands for Windows, split into separate copyable lines (no &&), plus the repo shortcut', () => {
    const wrapper = mountGuide()
    expect(wrapper.get('[data-test="command-uv-install"]').text()).toBe('winget install astral-sh.uv')
    expect(wrapper.get('[data-test="command-clone"]').text()).toBe('git clone https://github.com/jaredpalmer/kev.git')
    expect(wrapper.get('[data-test="command-cd"]').text()).toBe('cd kev')
    expect(wrapper.get('[data-test="command-sync"]').text()).toBe('uv sync --extra serve')
    expect(wrapper.get('[data-test="command-cuda"]').text()).toBe(
      'uv pip install --python .venv torch torchvision --index-url https://download.pytorch.org/whl/cu130',
    )
    expect(wrapper.get('[data-test="command-serve"]').text()).toBe(
      'uv run --no-sync --extra serve python -m kev.serve --run jaredpalmer/kev-0.8b --port 8009',
    )
    expect(wrapper.get('[data-test="command-shortcut"]').text()).toBe('pnpm local:kev --model kev-0.8b')
    expect(wrapper.text()).toMatch(/test connection/i)
  })

  it('macOS folds clone+cd into one && line and has no separate cd step', async () => {
    const wrapper = mountGuide()
    await wrapper.get('[data-test="segment-macos"]').trigger('click')
    expect(wrapper.get('[data-test="command-clone"]').text()).toBe(
      'git clone https://github.com/jaredpalmer/kev.git && cd kev',
    )
    expect(wrapper.find('[data-test="command-cd"]').exists()).toBe(false)
  })

  it('notes that --no-sync is needed after installing CUDA torch, or uv reinstalls the CPU build', () => {
    const wrapper = mountGuide()
    expect(wrapper.text()).toMatch(/always start with `--no-sync`.*or uv will reinstall the cpu build/i)
  })

  it('shows the --dir reuse hint under the shortcut, with a Windows-style example path', () => {
    const wrapper = mountGuide()
    expect(wrapper.text()).toMatch(/--dir `?C:\\path\\to\\kev/)
    expect(wrapper.text()).toMatch(/skips clone and sync/)
  })

  describe('critical-information callouts (UiCallout)', () => {
    it('shows Prerequisites as a warning note', () => {
      const wrapper = mountGuide()
      const note = wrapper.get('[data-test="callout-prereqs"]')
      expect(note.classes()).toContain('ui-callout--warning')
      expect(note.text()).toMatch(/git, python 3\.12 or 3\.13, and uv/i)
    })

    it('shows the GPU-optional note (with measured numbers) as a warning', () => {
      const wrapper = mountGuide()
      const note = wrapper.get('[data-test="callout-gpu-optional"]')
      expect(note.classes()).toContain('ui-callout--warning')
      expect(note.text()).toMatch(/nvidia gpu is optional/i)
      expect(note.text()).toMatch(/470 ms/)
      expect(note.text()).toMatch(/197 ms/)
    })

    it('shows the CUDA/--no-sync reminder as a warning callout attached to the CUDA step', () => {
      const wrapper = mountGuide()
      const note = wrapper.get('[data-test="callout-cuda"]')
      expect(note.classes()).toContain('ui-callout--warning')
      expect(note.text()).toMatch(/always start with `--no-sync`/i)
    })

    it('shows what will not work as a danger callout', () => {
      const wrapper = mountGuide()
      const note = wrapper.get('[data-test="callout-unsupported"]')
      expect(note.classes()).toContain('ui-callout--danger')
      expect(note.attributes('role')).toBe('alert')
      expect(note.text()).toMatch(/won't work/i)
      expect(note.text()).toMatch(/python/i)
      expect(note.text()).toMatch(/uv/i)
    })
  })

  it('changing the model tier updates the serve command and the shortcut', async () => {
    const wrapper = mountGuide()
    await wrapper.get('[data-test="kev-model"] select').setValue('kev-4b')
    expect(wrapper.get('[data-test="command-serve"]').text()).toBe(
      'uv run --no-sync --extra serve python -m kev.serve --run jaredpalmer/kev-4b --port 8009',
    )
    expect(wrapper.get('[data-test="command-shortcut"]').text()).toBe('pnpm local:kev --model kev-4b')
  })

  it('macOS swaps the uv install command and replaces the CUDA step with a note', async () => {
    const wrapper = mountGuide()
    await wrapper.get('[data-test="segment-macos"]').trigger('click')
    expect(wrapper.get('[data-test="command-uv-install"]').text()).toBe(
      'curl -LsSf https://astral.sh/uv/install.sh | sh',
    )
    expect(wrapper.find('[data-test="command-cuda"]').exists()).toBe(false)
    expect(wrapper.text()).toMatch(/not applicable on macos/i)
    expect(wrapper.text()).toMatch(/--dir `?\/path\/to\/kev/)
  })

  it('Linux keeps the curl uv install and the same CUDA command as Windows', async () => {
    const wrapper = mountGuide()
    await wrapper.get('[data-test="segment-linux"]').trigger('click')
    expect(wrapper.get('[data-test="command-uv-install"]').text()).toBe(
      'curl -LsSf https://astral.sh/uv/install.sh | sh',
    )
    expect(wrapper.get('[data-test="command-cuda"]').text()).toBe(
      'uv pip install --python .venv torch torchvision --index-url https://download.pytorch.org/whl/cu130',
    )
  })

  it('shows the JevK5 commands (with a warning prereqs callout) and no CUDA step or Kev model picker', async () => {
    const wrapper = mountGuide()
    await wrapper.get('[data-test="segment-jevk5"]').trigger('click')
    expect(wrapper.get('[data-test="command-install"]').text()).toBe(
      'pip install "jevk5[fast] @ git+https://github.com/allebee/jevk5@v0.2.0"',
    )
    expect(wrapper.get('[data-test="command-serve"]').text()).toBe(
      'jevk5-serve --model alibiserikbay/JevK5 --port 8090',
    )
    expect(wrapper.find('[data-test="command-cuda"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="kev-model"]').exists()).toBe(false)
    expect(wrapper.text()).toMatch(/~10 GB/)
    expect(wrapper.get('[data-test="callout-prereqs"]').classes()).toContain('ui-callout--warning')
  })

  describe('copy buttons (CopyCommandLine)', () => {
    const originalClipboard = navigator.clipboard

    afterEach(() => {
      Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true })
      vi.restoreAllMocks()
    })

    it('copies the exact command text via navigator.clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
      const wrapper = mountGuide()
      await wrapper.get('[data-test="copy-clone"]').trigger('click')
      expect(writeText).toHaveBeenCalledWith('git clone https://github.com/jaredpalmer/kev.git')
      expect(wrapper.get('[data-test="copied-clone"]').text()).toMatch(/copied/i)
    })

    it('falls back to document.execCommand when navigator.clipboard is unavailable', async () => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
      const execCommand = vi.fn().mockReturnValue(true)
      document.execCommand = execCommand
      const wrapper = mountGuide()
      await wrapper.get('[data-test="copy-sync"]').trigger('click')
      expect(execCommand).toHaveBeenCalledWith('copy')
      expect(wrapper.get('[data-test="copied-sync"]').text()).toMatch(/copied/i)
    })

    it('every copy button is icon-only with a fixed aria-label (no textual Copy/Copied button)', () => {
      const wrapper = mountGuide()
      for (const id of ['uv-install', 'clone', 'cd', 'sync', 'cuda', 'serve', 'shortcut']) {
        const button = wrapper.get(`[data-test="copy-${id}"]`)
        expect(button.attributes('aria-label'), id).toBe('Copy command')
        expect(button.text(), id).not.toMatch(/copy|copied/i)
      }
    })
  })
})
