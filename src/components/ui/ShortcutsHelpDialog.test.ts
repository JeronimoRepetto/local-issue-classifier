// Task INT — keyboard shortcuts help, left out by Task 12 (SPEC §6.1 analysis
// view). Presentational: built on the kit UiDialog, props/emits only.
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ShortcutsHelpDialog from './ShortcutsHelpDialog.vue'

describe('ShortcutsHelpDialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('lists the analysis view shortcuts when open', () => {
    mount(ShortcutsHelpDialog, { props: { open: true }, attachTo: document.body })
    const text = document.body.textContent ?? ''
    expect(text).toContain('Keyboard shortcuts')
    expect(text).toContain('/')
    expect(text).toContain('D')
    expect(text).toContain('Enter')
    expect(text).toContain('?')
  })

  it('renders nothing when closed', () => {
    mount(ShortcutsHelpDialog, { props: { open: false }, attachTo: document.body })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('emits close from the close button', async () => {
    const wrapper = mount(ShortcutsHelpDialog, { props: { open: true }, attachTo: document.body })
    ;(document.querySelector('[data-test="dialog-close"]') as HTMLButtonElement).click()
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('the footer Close button also emits close', async () => {
    const wrapper = mount(ShortcutsHelpDialog, { props: { open: true }, attachTo: document.body })
    ;(document.querySelector('[data-test="shortcuts-help-close"]') as HTMLButtonElement).click()
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
