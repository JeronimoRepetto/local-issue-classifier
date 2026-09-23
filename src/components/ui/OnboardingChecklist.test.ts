import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OnboardingChecklist from './OnboardingChecklist.vue'

describe('OnboardingChecklist', () => {
  it('shows all three steps, marking completed ones', () => {
    const wrapper = mount(OnboardingChecklist, { props: { steps: { keys: true, repo: false, classify: false } } })
    const items = wrapper.findAll('.onboarding-checklist__item')
    expect(items).toHaveLength(3)
    expect(items[0].classes()).toContain('onboarding-checklist__item--done')
    expect(items[1].classes()).not.toContain('onboarding-checklist__item--done')
    expect(wrapper.text()).toContain('Keys')
    expect(wrapper.text()).toContain('Repository')
    expect(wrapper.text()).toContain('Classify')
  })

  it('hides entirely once every step is done', () => {
    const wrapper = mount(OnboardingChecklist, { props: { steps: { keys: true, repo: true, classify: true } } })
    expect(wrapper.find('[data-test="onboarding-checklist"]').exists()).toBe(false)
  })
})
