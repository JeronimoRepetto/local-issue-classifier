// Shared by LocalSetupGuide.vue (Settings) and ProviderOnboardingCard.vue
// (Home) so both copy-paste lines behave identically: an icon-only copy
// button (never a textual "Copy"/"Copied" button), a tooltip, and a
// ~1.5s "Copied" state announced through aria-live — see
// useClipboardCopy.test.ts for the exact timing.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CopyCommandLine from './CopyCommandLine.vue'

describe('CopyCommandLine', () => {
  const originalClipboard = navigator.clipboard

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true })
    vi.restoreAllMocks()
  })

  it('renders the exact command text', () => {
    const wrapper = mount(CopyCommandLine, { props: { id: 'serve', command: 'uv sync --extra serve' } })
    expect(wrapper.get('[data-test="command-serve"]').text()).toBe('uv sync --extra serve')
  })

  it('the copy control is an icon-only button with a fixed, generic aria-label', () => {
    const wrapper = mount(CopyCommandLine, { props: { id: 'clone', command: 'git clone …' } })
    const button = wrapper.get('[data-test="copy-clone"]')
    expect(button.element.tagName).toBe('BUTTON')
    expect(button.attributes('aria-label')).toBe('Copy command')
    expect(button.text()).not.toMatch(/copy|copied/i)
    expect(button.find('svg').exists()).toBe(true)
  })

  it('shows a tooltip on the copy button', () => {
    const wrapper = mount(CopyCommandLine, { props: { id: 'sync', command: 'uv sync --extra serve' } })
    expect(wrapper.text()).toMatch(/copy command/i)
  })

  it('copies the exact command text via navigator.clipboard, swaps to the check icon, and announces "Copied"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    const wrapper = mount(CopyCommandLine, { props: { id: 'serve', command: 'uv sync --extra serve' } })
    await wrapper.get('[data-test="copy-serve"]').trigger('click')

    expect(writeText).toHaveBeenCalledWith('uv sync --extra serve')
    const announcement = wrapper.get('[data-test="copied-serve"]')
    expect(announcement.attributes('aria-live')).toBe('polite')
    expect(announcement.text()).toMatch(/copied/i)
  })

  it('falls back to document.execCommand when navigator.clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    const execCommand = vi.fn().mockReturnValue(true)
    document.execCommand = execCommand

    const wrapper = mount(CopyCommandLine, { props: { id: 'sync', command: 'uv sync --extra serve' } })
    await wrapper.get('[data-test="copy-sync"]').trigger('click')

    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(wrapper.get('[data-test="copied-sync"]').text()).toMatch(/copied/i)
  })

  it('clears the "Copied" announcement after ~1.5s', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    const wrapper = mount(CopyCommandLine, { props: { id: 'serve', command: 'uv sync --extra serve' } })
    await wrapper.get('[data-test="copy-serve"]').trigger('click')
    expect(wrapper.get('[data-test="copied-serve"]').text()).toMatch(/copied/i)

    await vi.advanceTimersByTimeAsync(1500)
    expect(wrapper.get('[data-test="copied-serve"]').text()).toBe('')
    vi.useRealTimers()
  })

  it('renders the command in a <code> element inside the flex-row root', () => {
    const wrapper = mount(CopyCommandLine, { props: { id: 'serve', command: 'a very long command line' } })
    expect(wrapper.classes()).toContain('copy-command-line')
    expect(wrapper.get('[data-test="command-serve"]').element.tagName).toBe('CODE')
  })
})
