// FB-4 — LocalSetupGuide: beginner-proof, copy-pasteable setup steps for a
// local Jev-compatible server (Kev, JevK5), shown inside ProviderSelector when
// "Local server" is selected. Presentational: it owns no persistence and no
// network; `status` (the last connection-test result) only drives whether it
// starts collapsed.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
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

  it('shows the Kev commands for Windows, including the CUDA step and the repo shortcut', () => {
    const wrapper = mountGuide()
    expect(wrapper.get('[data-test="command-uv-install"]').text()).toBe('winget install astral-sh.uv')
    expect(wrapper.get('[data-test="command-clone"]').text()).toBe(
      'git clone https://github.com/jaredpalmer/kev.git && cd kev',
    )
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

  it('notes that --no-sync is needed after installing CUDA torch, or uv reinstalls the CPU build', () => {
    const wrapper = mountGuide()
    expect(wrapper.text()).toMatch(/always start with `--no-sync`.*or uv will reinstall the cpu build/i)
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

  it('shows the JevK5 commands and no CUDA step or Kev model picker', async () => {
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
  })

  describe('copy buttons', () => {
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
      expect(writeText).toHaveBeenCalledWith('git clone https://github.com/jaredpalmer/kev.git && cd kev')
      expect(wrapper.get('[data-test="copy-clone"]').text()).toMatch(/copied/i)
    })

    it('falls back to document.execCommand when navigator.clipboard is unavailable', async () => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
      const execCommand = vi.fn().mockReturnValue(true)
      document.execCommand = execCommand
      const wrapper = mountGuide()
      await wrapper.get('[data-test="copy-sync"]').trigger('click')
      expect(execCommand).toHaveBeenCalledWith('copy')
      expect(wrapper.get('[data-test="copy-sync"]').text()).toMatch(/copied/i)
    })
  })
})
