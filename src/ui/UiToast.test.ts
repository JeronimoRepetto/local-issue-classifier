import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import UiToast from './UiToast.vue'
import UiToastStack from './UiToastStack.vue'

describe('UiToast', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it.each(['success', 'info', 'warning'] as const)('uses role="status" for %s', (kind) => {
    const wrapper = mount(UiToast, { props: { kind, message: 'Saved' } })
    expect(wrapper.get('.ui-toast').attributes('role')).toBe('status')
  })

  it('uses role="alert" for errors', () => {
    const wrapper = mount(UiToast, { props: { kind: 'error', message: 'Failed' } })
    expect(wrapper.get('.ui-toast').attributes('role')).toBe('alert')
  })

  it('auto-dismisses after 5 s', () => {
    const wrapper = mount(UiToast, { props: { kind: 'info', message: 'Done' } })
    vi.advanceTimersByTime(4999)
    expect(wrapper.emitted('dismiss')).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  it('never auto-dismisses an error', () => {
    const wrapper = mount(UiToast, { props: { kind: 'error', message: 'Failed' } })
    vi.advanceTimersByTime(60_000)
    expect(wrapper.emitted('dismiss')).toBeUndefined()
  })

  it('pauses the timer while hovered', async () => {
    const wrapper = mount(UiToast, { props: { kind: 'success', message: 'Saved' } })
    vi.advanceTimersByTime(3000)
    await wrapper.get('.ui-toast').trigger('mouseenter')
    vi.advanceTimersByTime(10_000)
    expect(wrapper.emitted('dismiss')).toBeUndefined()
    await wrapper.get('.ui-toast').trigger('mouseleave')
    vi.advanceTimersByTime(2000)
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  it('emits its action and a manual dismiss', async () => {
    const wrapper = mount(UiToast, {
      props: { kind: 'info', message: 'Issue dismissed', actionLabel: 'Undo' },
    })
    await wrapper.get('[data-test="toast-action"]').trigger('click')
    expect(wrapper.emitted('action')).toHaveLength(1)
    await wrapper.get('[data-test="toast-close"]').trigger('click')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })
})

describe('UiToastStack', () => {
  it('shows at most 3 toasts, newest last', () => {
    const toasts = [1, 2, 3, 4].map((id) => ({ id, kind: 'info' as const, message: `T${id}` }))
    const wrapper = mount(UiToastStack, { props: { toasts } })
    const rendered = wrapper.findAll('.ui-toast')
    expect(rendered).toHaveLength(3)
    expect(rendered.map((t) => t.text())).toEqual([
      expect.stringContaining('T2'),
      expect.stringContaining('T3'),
      expect.stringContaining('T4'),
    ])
  })
})
