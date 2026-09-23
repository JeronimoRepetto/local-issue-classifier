import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import UiPopover from './UiPopover.vue'

const Host = defineComponent({
  components: { UiPopover },
  template: `
    <UiPopover label="Weights">
      <template #trigger="{ toggle, attrs }">
        <button id="trigger" v-bind="attrs" @click="toggle">Weights</button>
      </template>
      <button id="a">A</button>
      <button id="b">B</button>
    </UiPopover>`,
})

const flush = async () => {
  await nextTick()
  await nextTick()
}

describe('UiPopover', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('toggles on click, focuses inside, traps Tab and returns focus on Escape', async () => {
    const wrapper = mount(Host, { attachTo: document.body })
    const trigger = wrapper.get('#trigger')
    expect(trigger.attributes('aria-expanded')).toBe('false')

    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click')
    await flush()
    expect(trigger.attributes('aria-expanded')).toBe('true')
    const panel = wrapper.get('[role="dialog"]')
    expect(panel.attributes('aria-label')).toBe('Weights')
    expect(document.activeElement?.id).toBe('a')

    const b = document.getElementById('b') as HTMLElement
    b.focus()
    b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(document.activeElement?.id).toBe('a')

    await panel.trigger('keydown', { key: 'Escape' })
    await flush()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })

  it('closes on an outside click without stealing focus', async () => {
    const wrapper = mount(Host, { attachTo: document.body })
    await wrapper.get('#trigger').trigger('click')
    await flush()
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flush()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
