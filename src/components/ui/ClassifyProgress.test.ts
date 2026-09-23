// Task 11 — SPEC.md §2.4 / §10.4 / §10.6 / §10.7: run progress.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ClassifyProgress from './ClassifyProgress.vue'

const progress = (done: number, failed = 0, total = 10) => ({ done, total, failed, rateLimited: 0, concurrency: 4 })

describe('ClassifyProgress', () => {
  it('renders a determinate progress bar and the done / failed / pending counts', () => {
    const wrapper = mount(ClassifyProgress, { props: { progress: progress(4, 1), reducedMotion: false } })
    const bar = wrapper.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('4')
    expect(bar.attributes('aria-valuemax')).toBe('10')
    expect(wrapper.get('[data-test="progress-counts"]').text()).toBe('4 done · 1 failed · 6 pending')
  })

  it('announces progress politely at milestones, not on every result', async () => {
    const wrapper = mount(ClassifyProgress, { props: { progress: progress(0), reducedMotion: false } })
    const live = wrapper.get('[aria-live="polite"]')
    expect(live.text()).toBe('Classifying 10 issues.')

    await wrapper.setProps({ progress: progress(1) })
    expect(live.text()).toBe('Classifying 10 issues.')

    await wrapper.setProps({ progress: progress(3, 1) })
    expect(live.text()).toBe('3 of 10 done, 1 failed.')

    await wrapper.setProps({ progress: progress(10, 1) })
    expect(live.text()).toBe('10 of 10 done, 1 failed.')
  })

  it('shows when the pool was slowed down by rate limits', () => {
    const wrapper = mount(ClassifyProgress, {
      props: { progress: { ...progress(2), rateLimited: 3, concurrency: 2 }, reducedMotion: false },
    })
    expect(wrapper.text()).toContain('Rate limited — 2 parallel requests')
  })

  it('drops the bar animation under reduced motion', () => {
    const moving = mount(ClassifyProgress, { props: { progress: progress(2), reducedMotion: false } })
    expect(moving.get('[data-test="progress-fill"]').classes()).toContain('classify-progress__fill--animated')
    const still = mount(ClassifyProgress, { props: { progress: progress(2), reducedMotion: true } })
    expect(still.get('[data-test="progress-fill"]').classes()).not.toContain('classify-progress__fill--animated')
  })

  it('emits cancel, and shows a disabled "Cancelling" state once requested', async () => {
    const wrapper = mount(ClassifyProgress, { props: { progress: progress(2), reducedMotion: false } })
    await wrapper.get('[data-test="classify-cancel"]').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    await wrapper.setProps({ cancelling: true })
    expect(wrapper.get('[data-test="classify-cancel"]').text()).toBe('Cancelling…')
    expect(wrapper.get('[data-test="classify-cancel"]').attributes('disabled')).toBeDefined()
  })
})
