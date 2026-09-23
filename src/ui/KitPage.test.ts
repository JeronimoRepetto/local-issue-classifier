import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import KitPage from './KitPage.vue'
import { ICON_NAMES } from '../assets/icons'

describe('KitPage', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  it('shows every kit component side by side in both themes', async () => {
    const wrapper = mount(KitPage, { attachTo: document.body })
    await nextTick()
    const panels = wrapper.findAll('[data-kit-theme]')
    expect(panels.map((p) => p.attributes('data-kit-theme'))).toEqual(['light', 'dark'])
    for (const panel of panels) {
      for (const selector of [
        '.ui-button--primary',
        '.ui-button--secondary',
        '.ui-button--ghost',
        '.ui-button--danger',
        '.ui-button--loading',
        '.ui-control',
        '.ui-secret',
        '.ui-select',
        '.ui-multiselect',
        '.ui-slider',
        '.ui-tooltip',
        '.ui-popover',
        '.ui-toast--success',
        '.ui-toast--error',
        '.level-badge--high',
        '.level-badge--stale',
        '.confidence-badge--low',
        '.score-bar',
        '.filter-chip--active',
        '.empty-state',
      ]) {
        expect(panel.find(selector).exists(), `${selector} in ${panel.attributes('data-kit-theme')}`).toBe(
          true,
        )
      }
      expect(panel.findAll('[data-kit-icon]')).toHaveLength(ICON_NAMES.length)
    }
    wrapper.unmount()
  })

  it('scopes both token themes and a forced reduced-motion block to the page', async () => {
    const wrapper = mount(KitPage, { attachTo: document.body })
    await nextTick()
    const css = document.getElementById('ic-kit-tokens')?.textContent ?? ''
    expect(css).toContain('[data-kit-theme="light"] {')
    expect(css).toContain('[data-kit-theme="dark"] {')
    expect(css).toContain('[data-kit-motion="reduced"] {')

    await wrapper.get('[data-test="kit-reduced-motion"]').setValue(true)
    expect(wrapper.get('.kit').attributes('data-kit-motion')).toBe('reduced')
    wrapper.unmount()
    expect(document.getElementById('ic-kit-tokens')).toBeNull()
  })
})
