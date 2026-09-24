// Task INT — SPEC.md §2.4 / §2.5 / §6.1 screen 3: the analysis view
// container. Replaces AnalysisViewPlaceholder.vue: mounts IssuesContainer and
// ClassifyContainer over the current analysis, wires refresh/back/open-settings
// and owns the "?" shortcuts help dialog left out by Task 12.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createAnalysis, dismiss } from '../../domain/analysis'
import type { Analysis } from '../../domain/types'
import { defaultPreferences, defaultProjectContext } from '../../domain/types'
import { fakeIssue, fakeRepo } from '../../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../../tests/fakes/memoryStorage'

type AnalysisModule = typeof import('../../composables/useAnalysis')
type ViewModule = typeof import('../../composables/useView')
type RepoModule = typeof import('../../composables/useRepo')
type ContainerModule = typeof import('./AnalysisViewContainer.vue')

let storage: MemoryStorage
let analysisMod: AnalysisModule
let viewMod: ViewModule
let repoMod: RepoModule
let AnalysisViewContainer: ContainerModule['default']

/** #1 and #2 unclassified, #3 dismissed. */
function seedAnalysis(id = 'a1'): Analysis {
  const a = createAnalysis({
    id,
    repo: fakeRepo(),
    stateFilter: 'open',
    now: '2026-03-01T10:00:00Z',
    prefs: defaultPreferences(),
    projectContext: defaultProjectContext('acme/widgets'),
    issues: [fakeIssue(1), fakeIssue(2), fakeIssue(3)],
    commentsFetched: false,
  })
  return dismiss(a, [3], '2026-03-01T10:00:00Z')
}

// ── Task FU: refresh feedback / Export fixtures ──────────────────────────
const BASE = 'https://api.github.com'
const REPO_PATH = '/repos/acme/widgets'
const ISSUES_RE = /^\/repos\/acme\/widgets\/issues\?state=open&sort=updated&direction=desc&per_page=100(?:&page=(\d+))?$/

function rawIssue(number: number, overrides: Record<string, unknown> = {}) {
  return {
    number,
    title: `Issue ${number}`,
    body: `Body ${number}`,
    state: 'open',
    state_reason: null,
    labels: [],
    user: { login: 'octo', type: 'User' },
    author_association: 'NONE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    closed_at: null,
    comments: 0,
    reactions: { total_count: 0 },
    html_url: `https://github.com/acme/widgets/issues/${number}`,
    ...overrides,
  }
}

function fakeGitHub(opts: { totalPages: number; perPage?: number; failIssuesRequestAt?: number }) {
  const perPage = opts.perPage ?? 100
  let issuesSeen = 0
  const rateHeaders = () => ({
    'x-ratelimit-limit': '5000',
    'x-ratelimit-remaining': '4999',
    'x-ratelimit-used': '1',
    'x-ratelimit-reset': String(9_999_999_999),
    'x-ratelimit-resource': 'core',
  })
  const fetchFn = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const path = String(input).slice(BASE.length)
    if (path === REPO_PATH) {
      return new Response(
        JSON.stringify({
          name: 'widgets',
          full_name: 'acme/widgets',
          owner: { login: 'acme' },
          description: null,
          topics: [],
          default_branch: 'main',
          private: false,
          has_issues: true,
          open_issues_count: 1,
          html_url: 'https://github.com/acme/widgets',
        }),
        { status: 200, headers: rateHeaders() },
      )
    }
    const issuesMatch = ISSUES_RE.exec(path)
    if (issuesMatch) {
      issuesSeen += 1
      if (opts.failIssuesRequestAt === issuesSeen) {
        return new Response('{}', { status: 403, headers: { ...rateHeaders(), 'x-ratelimit-remaining': '0' } })
      }
      const page = issuesMatch[1] ? Number(issuesMatch[1]) : 1
      if (page > opts.totalPages) return new Response('[]', { status: 200, headers: rateHeaders() })
      const body = JSON.stringify(Array.from({ length: perPage }, (_, i) => rawIssue((page - 1) * perPage + i + 1)))
      const links = [`<${BASE}${REPO_PATH}/issues?state=open&sort=updated&direction=desc&per_page=100&page=${opts.totalPages}>; rel="last"`]
      if (page < opts.totalPages) {
        links.push(`<${BASE}${REPO_PATH}/issues?state=open&sort=updated&direction=desc&per_page=100&page=${page + 1}>; rel="next"`)
      }
      return new Response(body, { status: 200, headers: { ...rateHeaders(), link: links.join(', ') } })
    }
    return new Response('{"message":"Not Found"}', { status: 404, headers: rateHeaders() })
  })
  return { fetchFn: fetchFn as unknown as typeof fetch }
}

function configure(server: ReturnType<typeof fakeGitHub>, prefs: Partial<ReturnType<typeof defaultPreferences>> = {}) {
  repoMod.configureRepo({
    fetchImpl: server.fetchFn,
    now: () => '2026-06-01T00:00:00Z',
    getPreferences: () => ({ ...defaultPreferences(), ...prefs }),
  })
}

async function freshEnv() {
  vi.resetModules()
  const { setAppStorage } = await import('../../adapters/storage/appStorage')
  storage = new MemoryStorage()
  setAppStorage(storage)
  analysisMod = await import('../../composables/useAnalysis')
  viewMod = await import('../../composables/useView')
  repoMod = await import('../../composables/useRepo')
  analysisMod.configureAnalysis({ clock: () => '2026-03-05T00:00:00Z' })
  repoMod.resetRepoForTests()
  const mod: ContainerModule = await import('./AnalysisViewContainer.vue')
  AnalysisViewContainer = mod.default
}

const flush = async () => {
  await nextTick()
  await nextTick()
}

describe('AnalysisViewContainer', () => {
  beforeEach(async () => {
    await freshEnv()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('mounts IssuesContainer and ClassifyContainer for the current analysis', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
    await flush()
    expect(wrapper.find('[data-test="issue-count"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="classify-start"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('lays out the header (with Refresh and Export), then the classify bar, then the filters and table', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
    await flush()
    const el = (selector: string) => wrapper.get(selector).element
    const before = (a: string, b: string) =>
      Boolean(el(a).compareDocumentPosition(el(b)) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(before('[data-test="issue-count"]', '[data-test="classify-start"]')).toBe(true)
    expect(before('[data-test="classify-start"]', '[data-test="search-input"]')).toBe(true)
    expect(wrapper.get('.analysis-header').find('[data-test="export-open"]').exists()).toBe(true)
    expect(wrapper.get('.analysis-header').find('[data-test="refresh"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('routes "back" to useView().goHome()', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    viewMod.useView().openSettings() // start somewhere else than home
    viewMod.useView().state.view = 'analysis'
    const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
    await flush()
    await wrapper.get('[data-test="back"]').trigger('click')
    expect(viewMod.useView().state.view).toBe('home')
    wrapper.unmount()
  })

  it('routes "open-settings" from ClassifyContainer to useView().openSettings()', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
    await flush()
    await wrapper.get('[data-test="classify-open-settings"]').trigger('click')
    expect(viewMod.useView().state.view).toBe('settings')
    wrapper.unmount()
  })

  it('routes "refresh" to useRepo().refresh(currentAnalysisId), and binds refreshing to the load state', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis('a1'))
    let resolveFetch!: () => void
    const gate = new Promise<void>((resolve) => {
      resolveFetch = resolve
    })
    repoMod.configureRepo({
      fetchImpl: (async () => {
        await gate
        return new Response('{"message":"Not Found"}', { status: 404 })
      }) as unknown as typeof fetch,
    })

    const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
    await flush()
    await wrapper.get('[data-test="refresh"]').trigger('click')
    await flush()
    expect(wrapper.get('[data-test="refresh"]').attributes('disabled')).toBeDefined()

    resolveFetch()
    await flushPromises()
    wrapper.unmount()
  })

  it('passes filteredNumbers to ClassifyContainer as the visible, non-dismissed issue numbers', async () => {
    // #3 is dismissed by seedAnalysis, so only #1 and #2 count toward "filtered".
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
    await flush()
    const optionLabels = wrapper.findAll('option').map((o) => o.text())
    expect(optionLabels).toContain('Classify filtered view (2)')
    wrapper.unmount()
  })

  it('excludes a dismissed row from filteredNumbers even when "Show dismissed" is on', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    analysisMod.useAnalysis().updateWorking({ showDismissed: true })
    const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
    await flush()
    const optionLabels = wrapper.findAll('option').map((o) => o.text())
    expect(optionLabels).toContain('Classify filtered view (2)')
    wrapper.unmount()
  })

  it('"?" opens the shortcuts help dialog, but is ignored while typing', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
    await flush()

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
    await flush()
    expect(document.body.textContent).not.toContain('Keyboard shortcuts')
    input.remove()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))
    await flush()
    expect(document.body.textContent).toContain('Keyboard shortcuts')
    wrapper.unmount()
  })

  describe('Sort popover (WIRE-2)', () => {
    it('mounts SortPopoverContainer in the sort-popover slot, editing the same multi-key sort as shift-click', async () => {
      analysisMod.useAnalysis().setCurrent(seedAnalysis())
      const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
      await flush()

      await wrapper.get('[data-test="sort-popover-trigger"]').trigger('click')
      await flush()
      const items = wrapper.findAll('[data-test="sort-rule"]')
      expect(items.map((item) => item.text().replace(/[0-9↑↓]/g, '').trim())).toEqual([
        expect.stringContaining('Criticality'),
        expect.stringContaining('Relevance'),
        expect.stringContaining('Effort'),
      ])

      await wrapper.findAll('[data-test="sort-rule-remove"]')[0].trigger('click')
      await flush()
      expect(analysisMod.useAnalysis().current.value?.working.tableSort).toEqual([
        { key: 'relevance', direction: 'desc' },
        { key: 'effort', direction: 'asc' },
      ])

      // The same working state also edits from a plain shift-click on a sortable header.
      await wrapper.get('[data-test="sort-updatedAt"]').trigger('click', { shiftKey: true })
      await flush()
      expect(analysisMod.useAnalysis().current.value?.working.tableSort).toEqual([
        { key: 'relevance', direction: 'desc' },
        { key: 'effort', direction: 'asc' },
        { key: 'updatedAt', direction: 'desc' },
      ])
      wrapper.unmount()
    })
  })

  describe('Export (Task FU)', () => {
    it('the Export button opens ExportContainer, and closing it hides the dialog again', async () => {
      analysisMod.useAnalysis().setCurrent(seedAnalysis())
      const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
      await flush()

      expect(document.querySelector('[role="dialog"]')).toBeNull()
      await wrapper.get('[data-test="export-open"]').trigger('click')
      await flush()
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Export issues')

      ;(document.querySelector('[data-test="dialog-close"]') as HTMLButtonElement).click()
      await flush()
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      wrapper.unmount()
    })

    it('disables Export with a tooltip when there are no visible issues', async () => {
      analysisMod.useAnalysis().setCurrent(seedAnalysis())
      // #3 is already dismissed by seedAnalysis; dismiss the remaining #1, #2 too.
      analysisMod.useAnalysis().dismiss([1, 2])
      const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
      await flush()

      const button = wrapper.get('[data-test="export-open"]')
      expect((button.element as HTMLButtonElement).disabled).toBe(true)
      expect(wrapper.find('[role="tooltip"]').exists()).toBe(true)
      wrapper.unmount()
    })
  })

  describe('refresh feedback (Task FU)', () => {
    it('shows the huge-repo confirmation while refreshing, and Load all continues', async () => {
      analysisMod.useAnalysis().setCurrent(seedAnalysis('a1'))
      configure(fakeGitHub({ totalPages: 25 }), { maxIssuesToLoad: 150, fetchComments: 'never' })
      const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
      await flush()

      void repoMod.useRepo().refresh('a1')
      await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
      expect(document.body.textContent).toContain('25 pages')
      ;(document.querySelector('[data-test="confirm-dialog-confirm"]') as HTMLButtonElement).click()
      await vi.waitFor(() => expect(repoMod.useRepo().state.phase).toBe('done'))
      wrapper.unmount()
    })

    it('shows the comment-cost confirmation while refreshing, and Skip continues without comments', async () => {
      analysisMod.useAnalysis().setCurrent(seedAnalysis('a1'))
      const server = fakeGitHub({ totalPages: 1, perPage: 1 })
      ;(server.fetchFn as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
        const path = String(input).slice(BASE.length)
        const headers = {
          'x-ratelimit-limit': '10',
          'x-ratelimit-remaining': '1',
          'x-ratelimit-used': '9',
          'x-ratelimit-reset': '9999999999',
        }
        if (path === REPO_PATH) {
          return new Response(
            JSON.stringify({
              name: 'widgets',
              full_name: 'acme/widgets',
              owner: { login: 'acme' },
              description: null,
              topics: [],
              default_branch: 'main',
              private: false,
              has_issues: true,
              open_issues_count: 1,
              html_url: 'https://github.com/acme/widgets',
            }),
            { status: 200, headers },
          )
        }
        if (ISSUES_RE.test(path)) {
          return new Response(JSON.stringify([rawIssue(1, { comments: 2 })]), { status: 200, headers })
        }
        if (/\/issues\/1\/comments\?per_page=100$/.test(path)) {
          return new Response(
            JSON.stringify([{ id: 1, user: { login: 'a' }, created_at: '2026-01-01T00:00:00Z', body: 'a real comment' }]),
            { status: 200, headers },
          )
        }
        return new Response('{"message":"Not Found"}', { status: 404, headers })
      })
      configure(server)
      const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
      await flush()

      void repoMod.useRepo().refresh('a1')
      await vi.waitFor(() => expect(document.querySelector('[data-test="cost-confirm"]')).not.toBeNull())
      ;(document.querySelector('[data-test="cost-confirm-skip"]') as HTMLButtonElement).click()
      await vi.waitFor(() => expect(repoMod.useRepo().state.phase).toBe('done'))
      expect(analysisMod.useAnalysis().current.value?.commentsFetched).toBe(false)
      wrapper.unmount()
    })

    it('shows progress with a Cancel button while refreshing, and Cancel returns to idle', async () => {
      analysisMod.useAnalysis().setCurrent(seedAnalysis('a1'))
      let resolveFetch!: () => void
      const gate = new Promise<void>((resolve) => {
        resolveFetch = resolve
      })
      repoMod.configureRepo({
        fetchImpl: (async () => {
          await gate
          return new Response('{"message":"Not Found"}', { status: 404 })
        }) as unknown as typeof fetch,
      })
      const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
      await flush()

      void repoMod.useRepo().refresh('a1')
      await vi.waitFor(() => expect(document.querySelector('[data-test="load-progress"]')).not.toBeNull())
      expect(document.querySelector('[data-test="cancel-load"]')).not.toBeNull()

      ;(document.querySelector('[data-test="cancel-load"]') as HTMLButtonElement).click()
      expect(repoMod.useRepo().state.phase).toBe('idle')
      resolveFetch()
      wrapper.unmount()
    })

    it('shows a rate-limited notice while refreshing, and Resume continues the load', async () => {
      analysisMod.useAnalysis().setCurrent(seedAnalysis('a1'))
      configure(fakeGitHub({ totalPages: 25, failIssuesRequestAt: 2 }), { maxIssuesToLoad: 200, fetchComments: 'never' })
      const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
      await flush()

      void repoMod.useRepo().refresh('a1')
      await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
      ;(document.querySelector('[data-test="confirm-dialog-confirm"]') as HTMLButtonElement).click()
      await vi.waitFor(() => expect(document.querySelector('[data-test="rate-limited-notice"]')).not.toBeNull())
      expect(document.body.textContent).toContain('rate limit was reached')

      ;(document.querySelector('[data-test="resume-load"]') as HTMLButtonElement).click()
      await vi.waitFor(() => expect(repoMod.useRepo().state.phase).toBe('done'))
      wrapper.unmount()
    })

    it('shows an error notice while refreshing, and Retry re-calls refresh(id)', async () => {
      analysisMod.useAnalysis().setCurrent(seedAnalysis('a1'))
      const fetchFn = vi.fn(async () => new Response('{"message":"Not Found"}', { status: 404 }))
      repoMod.configureRepo({ fetchImpl: fetchFn as unknown as typeof fetch })
      const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
      await flush()

      void repoMod.useRepo().refresh('a1')
      await vi.waitFor(() => expect(document.querySelector('[data-test="repo-error"]')).not.toBeNull())
      expect(document.body.textContent).toContain('Repository not found')

      const callsBefore = fetchFn.mock.calls.length
      ;(document.querySelector('[data-test="retry-load"]') as HTMLButtonElement).click()
      await vi.waitFor(() => expect(fetchFn.mock.calls.length).toBeGreaterThan(callsBefore))
      wrapper.unmount()
    })

    it('shows the save-failed notice with Retry save when the refreshed analysis fails to persist', async () => {
      vi.spyOn((await import('../../adapters/storage/analysisDb')).getAnalysisDb(), 'saveAnalysis').mockResolvedValueOnce(
        { ok: false, reason: 'quota' },
      )
      await analysisMod.useAnalysis().setCurrent(seedAnalysis('a1'))
      expect(analysisMod.useAnalysis().status.save).toBe('failed')
      const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
      await flush()

      expect(wrapper.find('[data-test="save-failed-notice"]').exists()).toBe(true)
      await wrapper.get('[data-test="retry-save"]').trigger('click')
      await analysisMod.useAnalysis().settled()
      expect(analysisMod.useAnalysis().status.save).toBe('saved')
      wrapper.unmount()
    })
  })
})
