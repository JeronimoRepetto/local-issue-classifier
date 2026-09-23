// Task 4 — SPEC.md §6.1 key status indicator: "Jev key: in memory / missing",
// "GitHub: token / anonymous". Booleans only in props — it can never render a
// secret value.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import KeyStatus from './KeyStatus.vue'

describe('KeyStatus', () => {
  it('shows "Jev key: in memory" when a key is set, "missing" otherwise', () => {
    expect(mount(KeyStatus, { props: { jevKeySet: true, githubTokenSet: false } }).text()).toContain(
      'Jev key: in memory',
    )
    expect(mount(KeyStatus, { props: { jevKeySet: false, githubTokenSet: false } }).text()).toContain(
      'Jev key: missing',
    )
  })

  it('shows "GitHub: token" when a token is set, "anonymous" otherwise', () => {
    expect(mount(KeyStatus, { props: { jevKeySet: false, githubTokenSet: true } }).text()).toContain(
      'GitHub: token',
    )
    expect(mount(KeyStatus, { props: { jevKeySet: false, githubTokenSet: false } }).text()).toContain(
      'GitHub: anonymous',
    )
  })

  it('never renders anything resembling an actual key value', () => {
    const wrapper = mount(KeyStatus, { props: { jevKeySet: true, githubTokenSet: true } })
    expect(wrapper.html()).not.toMatch(/sk-|ghp_|github_pat_/)
  })
})
