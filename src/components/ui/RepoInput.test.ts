import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RepoInput from './RepoInput.vue'

describe('RepoInput', () => {
  it('parses a valid repo reference and emits submit with the state filter', async () => {
    const wrapper = mount(RepoInput, { props: { defaultStateFilter: 'open' } })
    await wrapper.find('input[type="text"]').setValue('acme/widgets')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toEqual([[{ owner: 'acme', repo: 'widgets' }, 'open', 'acme/widgets']])
  })

  it('shows an inline error for an invalid reference and does not emit', async () => {
    const wrapper = mount(RepoInput)
    await wrapper.find('input[type="text"]').setValue('owner!/repo')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.find('[data-test="error"]').text()).toContain("doesn't look like a valid repository")
  })

  it('shows a missing-repo error for empty-ish input', async () => {
    const wrapper = mount(RepoInput)
    await wrapper.find('input[type="text"]').setValue('not-a-repo')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.find('[data-test="error"]').text()).toContain('Enter a repository')
  })

  it('prefills from initialText and clears the error while typing', async () => {
    const wrapper = mount(RepoInput, { props: { initialText: 'acme/widgets' } })
    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe('acme/widgets')
    await wrapper.find('input[type="text"]').setValue('bad ref!!')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.find('[data-test="error"]').exists()).toBe(true)
    await wrapper.find('input[type="text"]').setValue('acme/other')
    expect(wrapper.find('[data-test="error"]').exists()).toBe(false)
  })

  it('emits the picked state filter (closed / all)', async () => {
    const wrapper = mount(RepoInput)
    await wrapper.find('input[type="text"]').setValue('acme/widgets')
    await wrapper.find('select').setValue('all')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[0]?.[1]).toBe('all')
  })
})
