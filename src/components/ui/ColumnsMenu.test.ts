// Design v2: the "Columns" menu re-enables the table columns hidden by default.
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ColumnsMenu from './ColumnsMenu.vue'
import { DEFAULT_VISIBLE_COLUMNS, TABLE_COLUMN_IDS } from '../../domain/columns'

afterEach(() => {
  document.body.innerHTML = ''
})

async function openMenu(visible = [...DEFAULT_VISIBLE_COLUMNS]) {
  const wrapper = mount(ColumnsMenu, { props: { visible }, attachTo: document.body })
  await wrapper.get('[data-test="columns-trigger"]').trigger('click')
  return wrapper
}

describe('ColumnsMenu', () => {
  it('says how many columns are shown on its trigger', () => {
    const wrapper = mount(ColumnsMenu, { props: { visible: ['number', 'title', 'priority'] } })
    expect(wrapper.get('[data-test="columns-trigger"]').text()).toContain('Columns')
    expect(wrapper.get('[data-test="columns-trigger"]').attributes('aria-label')).toBe(
      `Columns: 3 of ${TABLE_COLUMN_IDS.length} shown`,
    )
  })

  it('lists every column as a checkbox; the number and title cannot be hidden', async () => {
    const wrapper = await openMenu()
    const boxes = wrapper.findAll('[data-test^="column-toggle-"]')
    expect(boxes).toHaveLength(TABLE_COLUMN_IDS.length)
    expect(wrapper.get('[data-test="column-toggle-number"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test="column-toggle-title"]').attributes('disabled')).toBeDefined()
    expect((wrapper.get('[data-test="column-toggle-complexity"]').element as HTMLInputElement).checked).toBe(false)
    expect((wrapper.get('[data-test="column-toggle-priority"]').element as HTMLInputElement).checked).toBe(true)
  })

  it('emits toggle for a column and reset for the defaults', async () => {
    const wrapper = await openMenu()
    await wrapper.get('[data-test="column-toggle-complexity"]').setValue(true)
    await wrapper.get('[data-test="columns-reset"]').trigger('click')
    expect(wrapper.emitted('toggle')).toEqual([['complexity']])
    expect(wrapper.emitted('reset')).toHaveLength(1)
  })
})
