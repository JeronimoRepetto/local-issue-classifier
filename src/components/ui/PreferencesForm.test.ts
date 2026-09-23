// Task 4 — SPEC.md §2.1 step 5: the non-secret preferences form. Presentational:
// takes the current Preferences as modelValue and emits a partial patch, so
// usePreferences() owns persistence and this component owns no state.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PreferencesForm from './PreferencesForm.vue'
import { defaultPreferences } from '../../domain/types'
import type { Preferences } from '../../domain/types'

function mountForm(overrides: Partial<Preferences> = {}) {
  return mount(PreferencesForm, { props: { modelValue: { ...defaultPreferences(), ...overrides } } })
}

describe('PreferencesForm', () => {
  it('reflects the current theme selection in a segmented control', () => {
    const wrapper = mountForm({ theme: 'dark' })
    expect(wrapper.get('[data-test="theme"] [role="radio"][aria-checked="true"]').text()).toBe('dark')
  })

  it('emits a theme patch when changed', async () => {
    const wrapper = mountForm()
    await wrapper.get('[data-test="theme"] [data-test="segment-light"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ theme: 'light' }])
  })

  it('offers a classify-mode slot next to the classification settings', () => {
    const wrapper = mount(PreferencesForm, {
      props: { modelValue: defaultPreferences() },
      slots: { 'classify-mode': '<p data-test="classify-mode-slot">mode</p>' },
    })
    expect(wrapper.find('[data-test="classify-mode-slot"]').exists()).toBe(true)
  })

  it('emits an includeClosedByDefault patch as a boolean, not a string', async () => {
    const wrapper = mountForm({ includeClosedByDefault: false })
    await wrapper.get('[data-test="include-closed"] select').setValue('true')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ includeClosedByDefault: true }])
  })

  it('emits a fetchComments patch', async () => {
    const wrapper = mountForm()
    await wrapper.get('[data-test="fetch-comments"] select').setValue('always')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ fetchComments: 'always' }])
  })

  it('emits a concurrency patch as a number from its slider', async () => {
    const wrapper = mountForm({ concurrency: 4 })
    await wrapper.get('[data-test="concurrency"] input[type="range"]').setValue(6)
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted?.at(-1)).toEqual([{ concurrency: 6 }])
  })

  it('renders every documented preference field once', () => {
    const wrapper = mountForm()
    ;['theme', 'include-closed', 'fetch-comments', 'concurrency', 'max-comments', 'max-issues', 'low-confidence'].forEach(
      (name) => {
        expect(wrapper.find(`[data-test="${name}"]`).exists(), name).toBe(true)
      },
    )
  })
})
