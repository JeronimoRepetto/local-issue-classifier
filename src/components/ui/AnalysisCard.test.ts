import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AnalysisCard from './AnalysisCard.vue'
import type { IndexEntry } from '../../adapters/storage/analysisStore'

function okEntry(overrides: Partial<IndexEntry & { status: 'ok' }> = {}): IndexEntry {
  return {
    status: 'ok',
    summary: {
      id: 'a1',
      name: 'acme/widgets (open)',
      repoFullName: 'acme/widgets',
      stateFilter: 'open',
      fetchedAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
      counts: { total: 10, classified: 4, stale: 1, dismissed: 2, missing: 0 },
      approxBytes: 20480,
      ...(overrides as { summary?: unknown }).summary,
    },
  }
}

describe('AnalysisCard', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows the name, repo, counts and size, and opens on click', async () => {
    const wrapper = mount(AnalysisCard, { props: { entry: okEntry() } })
    expect(wrapper.text()).toContain('acme/widgets (open)')
    expect(wrapper.text()).toContain('acme/widgets')
    expect(wrapper.text()).toContain('10 total')
    expect(wrapper.text()).toContain('4 classified')
    expect(wrapper.text()).toContain('20.0 KB')

    await wrapper.find('[data-test="analysis-card"]').trigger('click')
    expect(wrapper.emitted('open')).toEqual([['a1']])
  })

  it('clicking an action does not also open the card', async () => {
    const wrapper = mount(AnalysisCard, { props: { entry: okEntry() } })
    await wrapper.get('[data-test="refresh"]').trigger('click')
    expect(wrapper.emitted('open')).toBeUndefined()
    expect(wrapper.emitted('refresh')).toEqual([['a1']])
  })

  it('renames inline and emits the new name', async () => {
    const wrapper = mount(AnalysisCard, { props: { entry: okEntry() } })
    await wrapper.get('[data-test="rename"]').trigger('click')
    const input = wrapper.find('input[type="text"]')
    await input.setValue('Triage list')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('rename')).toEqual([['a1', 'Triage list']])
    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('delete asks for confirmation before emitting delete', async () => {
    const wrapper = mount(AnalysisCard, { props: { entry: okEntry() }, attachTo: document.body })
    await wrapper.get('[data-test="delete"]').trigger('click')
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(wrapper.emitted('delete')).toBeUndefined()
    ;(document.querySelector('[data-test="confirm-dialog-confirm"]') as HTMLButtonElement).click()
    expect(wrapper.emitted('delete')).toEqual([['a1']])
    wrapper.unmount()
  })

  it('an unreadable entry offers delete only, and is not clickable to open', async () => {
    const wrapper = mount(AnalysisCard, {
      props: { entry: { status: 'unreadable', id: 'bad', approxBytes: 512 } },
    })
    expect(wrapper.text()).toContain('Unreadable analysis')
    expect(wrapper.find('[data-test="rename"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="refresh"]').exists()).toBe(false)
    await wrapper.find('[data-test="analysis-card"]').trigger('click')
    expect(wrapper.emitted('open')).toBeUndefined()
  })
})
