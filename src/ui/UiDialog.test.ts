import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import UiDialog from './UiDialog.vue'

// A host with a trigger outside the dialog, so focus return can be observed.
const Host = defineComponent({
  components: { UiDialog },
  props: { confirmPhrase: { type: String, default: undefined } },
  emits: ['confirm'],
  setup() {
    const open = ref(false)
    return { open }
  },
  template: `
    <div>
      <button id="trigger" @click="open = true">Open</button>
      <UiDialog
        :open="open"
        title="Delete analysis"
        :confirm-phrase="confirmPhrase"
        @close="open = false"
        @confirm="$emit('confirm')"
      >
        <p>Body text</p>
        <template v-if="!confirmPhrase" #actions>
          <button id="first">Cancel</button>
          <button id="last">Delete</button>
        </template>
      </UiDialog>
    </div>`,
})

const flush = async () => {
  await nextTick()
  await nextTick()
}

describe('UiDialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('is a labelled modal dialog', async () => {
    const wrapper = mount(Host, { attachTo: document.body })
    await wrapper.get('#trigger').trigger('click')
    await flush()
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const titleId = dialog.getAttribute('aria-labelledby')!
    expect(document.getElementById(titleId)?.textContent).toBe('Delete analysis')
    wrapper.unmount()
  })

  it('moves focus inside on open and traps Tab / Shift+Tab', async () => {
    const wrapper = mount(Host, { attachTo: document.body })
    const trigger = document.getElementById('trigger') as HTMLButtonElement
    trigger.focus()
    await wrapper.get('#trigger').trigger('click')
    await flush()

    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.contains(document.activeElement)).toBe(true)

    const last = document.getElementById('last') as HTMLButtonElement
    last.focus()
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    // The first focusable element in the panel is the close button.
    expect(document.activeElement?.getAttribute('data-test')).toBe('dialog-close')

    ;(document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    )
    expect(document.activeElement).toBe(last)
    wrapper.unmount()
  })

  it('closes on Escape and returns focus to the element that opened it', async () => {
    const wrapper = mount(Host, { attachTo: document.body })
    const trigger = document.getElementById('trigger') as HTMLButtonElement
    trigger.focus()
    await wrapper.get('#trigger').trigger('click')
    await flush()

    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush()

    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    wrapper.unmount()
  })

  it('requires the typed confirmation phrase in the destructive variant', async () => {
    const wrapper = mount(Host, { props: { confirmPhrase: 'delete' }, attachTo: document.body })
    await wrapper.get('#trigger').trigger('click')
    await flush()

    const confirm = document.querySelector('[data-test="dialog-confirm"]') as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    const input = document.querySelector('[data-test="dialog-phrase"]') as HTMLInputElement
    input.value = 'delete'
    input.dispatchEvent(new Event('input'))
    await flush()
    expect(confirm.disabled).toBe(false)
    confirm.click()
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    wrapper.unmount()
  })
})
