// Task 12 — expanding a row shows the stored, trimmed body and
// comments exactly as Jev saw them, as plain text (never v-html / innerHTML).
// The drawer teleports to <body>, so assertions read the real DOM, matching
// the pattern in src/ui/UiDialog.test.ts.
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import IssueDetailDrawer from './IssueDetailDrawer.vue'
import { fakeIssue } from '../../../tests/fakes/domainFixtures'

const flush = async () => {
  await nextTick()
  await nextTick()
}

describe('IssueDetailDrawer', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders nothing when closed', () => {
    mount(IssueDetailDrawer, { props: { open: false, issue: null }, attachTo: document.body })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('shows the issue number, title and body as plain text', async () => {
    const issue = fakeIssue(42, { title: 'Crash on empty list', body: 'Steps to reproduce...' })
    mount(IssueDetailDrawer, { props: { open: true, issue }, attachTo: document.body })
    await flush()
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.textContent).toContain('#42')
    expect(dialog.textContent).toContain('Crash on empty list')
    expect(dialog.textContent).toContain('Steps to reproduce...')
  })

  it('never renders the body or a comment as HTML', async () => {
    const issue = fakeIssue(1, {
      body: '<img src=x onerror="window.__pwned = true">',
      comments: [
        {
          id: 1,
          author: 'octo',
          authorAssociation: 'NONE',
          createdAt: '2026-01-01T00:00:00Z',
          body: '<script>window.__pwned2 = true<' + '/script>',
        },
      ],
    })
    mount(IssueDetailDrawer, { props: { open: true, issue }, attachTo: document.body })
    await flush()
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.querySelector('img')).toBeNull()
    expect(dialog.querySelector('script')).toBeNull()
    expect(dialog.textContent).toContain('<img src=x onerror="window.__pwned = true">')
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined()
    expect((window as unknown as { __pwned2?: boolean }).__pwned2).toBeUndefined()
  })

  it('lists comments with author and date, as plain text', async () => {
    const issue = fakeIssue(1, {
      comments: [
        { id: 1, author: 'octo', authorAssociation: 'OWNER', createdAt: '2026-01-01T00:00:00Z', body: 'First!' },
      ],
    })
    mount(IssueDetailDrawer, { props: { open: true, issue }, attachTo: document.body })
    await flush()
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.textContent).toContain('octo')
    expect(dialog.textContent).toContain('First!')
  })

  it('emits close from the close button and Escape', async () => {
    const issue = fakeIssue(1)
    const wrapper = mount(IssueDetailDrawer, { props: { open: true, issue }, attachTo: document.body })
    await flush()
    const closeButton = document.querySelector('[data-test="drawer-close"]') as HTMLButtonElement
    closeButton.click()
    expect(wrapper.emitted('close')).toHaveLength(1)

    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('close')).toHaveLength(2)
  })
})
