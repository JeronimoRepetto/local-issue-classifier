import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StorageMeter from './StorageMeter.vue'

const MB = 1024 * 1024
const GB = 1024 * MB

describe('StorageMeter', () => {
  it('shows usage against the real quota from navigator.storage.estimate()', () => {
    const wrapper = mount(StorageMeter, { props: { usedBytes: 12.3 * MB, quotaBytes: 48.2 * GB } })
    expect(wrapper.text()).toContain('Local storage used: 12.3 MB of 48.2 GB available')
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(true)
  })

  it('formats a sub-gigabyte quota in MB', () => {
    const wrapper = mount(StorageMeter, { props: { usedBytes: 2.1 * MB, quotaBytes: 300 * MB } })
    expect(wrapper.text()).toContain('Local storage used: 2.1 MB of 300.0 MB available')
  })

  it('falls back to a plain usage line, with no bar, when the quota is unknown', () => {
    const wrapper = mount(StorageMeter, { props: { usedBytes: 2.1 * MB, quotaBytes: null } })
    expect(wrapper.text()).toContain('Local storage used: 2.1 MB (browser quota unknown)')
    expect(wrapper.text()).not.toContain('~5')
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false)
    expect(wrapper.find('.storage-meter').classes()).toContain('storage-meter--ok')
  })

  it('is ok below 80%, warning above 80%, critical above 95%', () => {
    const quotaBytes = 1000
    const status = (usedBytes: number) =>
      mount(StorageMeter, { props: { usedBytes, quotaBytes } }).find('.storage-meter').classes()
    expect(status(500)).toContain('storage-meter--ok')
    expect(status(850)).toContain('storage-meter--warning')
    expect(status(960)).toContain('storage-meter--critical')
  })
})
