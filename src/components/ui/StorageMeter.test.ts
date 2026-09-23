import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StorageMeter from './StorageMeter.vue'

describe('StorageMeter', () => {
  it('formats the used and budget sizes in MB', () => {
    const wrapper = mount(StorageMeter, { props: { usedBytes: 2.1 * 1024 * 1024 } })
    expect(wrapper.text()).toContain('Local storage used: 2.1 MB of ~5.0 MB')
  })

  it('is ok below 80%, warning above 80%, critical above 95%', () => {
    const budget = 1000
    expect(mount(StorageMeter, { props: { usedBytes: 500, budgetBytes: budget } }).find('.storage-meter').classes()).toContain(
      'storage-meter--ok',
    )
    expect(mount(StorageMeter, { props: { usedBytes: 850, budgetBytes: budget } }).find('.storage-meter').classes()).toContain(
      'storage-meter--warning',
    )
    expect(mount(StorageMeter, { props: { usedBytes: 960, budgetBytes: budget } }).find('.storage-meter').classes()).toContain(
      'storage-meter--critical',
    )
  })
})
