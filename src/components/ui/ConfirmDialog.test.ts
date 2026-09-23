import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmDialog from './ConfirmDialog.vue'

describe('ConfirmDialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('a plain confirm emits confirm on click, no typed phrase required', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, title: "Delete analysis 'acme/widgets'?" },
      attachTo: document.body,
    })
    const confirm = document.querySelector('[data-test="confirm-dialog-confirm"]') as HTMLButtonElement
    expect(confirm.disabled).toBe(false)
    confirm.click()
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    wrapper.unmount()
  })

  it('close emits close', async () => {
    const wrapper = mount(ConfirmDialog, { props: { open: true, title: 'Delete?' }, attachTo: document.body })
    ;(document.querySelector('[data-test="dialog-close"]') as HTMLButtonElement).click()
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('the typed-confirmation variant only enables Confirm once the phrase matches', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, title: 'Clear all local data?', confirmPhrase: 'delete', confirmLabel: 'Clear all' },
      attachTo: document.body,
    })
    const confirm = document.querySelector('[data-test="dialog-confirm"]') as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    expect(confirm.textContent?.trim()).toBe('Clear all')

    const input = document.querySelector('[data-test="dialog-phrase"]') as HTMLInputElement
    input.value = 'delete'
    input.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()
    expect(confirm.disabled).toBe(false)
    confirm.click()
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    wrapper.unmount()
  })
})
