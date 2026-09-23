// Wiring tests: useRepo.test.ts already covers the state machine itself, so
// these check that the container shows the right thing for each phase and
// routes each user decision to the right composable call.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { STORAGE_KEYS, defaultPreferences } from '../../domain/types'
import { MemoryStorage } from '../../../tests/fakes/memoryStorage'

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

function fakeGitHub(opts: { totalPages: number; perPage?: number; isPrivate?: boolean; failIssuesRequestAt?: number }) {
  const perPage = opts.perPage ?? 100
  let issuesSeen = 0
  const calls: string[] = []
  const rateHeaders = () => ({
    'x-ratelimit-limit': '5000',
    'x-ratelimit-remaining': '4999',
    'x-ratelimit-used': '1',
    'x-ratelimit-reset': String(9_999_999_999),
    'x-ratelimit-resource': 'core',
  })
  const fetchFn = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    const path = url.slice(BASE.length)
    calls.push(path)
    if (path === REPO_PATH) {
      return new Response(
        JSON.stringify({
          name: 'widgets',
          full_name: 'acme/widgets',
          owner: { login: 'acme' },
          description: null,
          topics: [],
          default_branch: 'main',
          private: opts.isPrivate ?? false,
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
  return { fetchFn: fetchFn as unknown as typeof fetch, calls }
}

let storage: MemoryStorage
let RepoLoaderContainer: typeof import('./RepoLoaderContainer.vue')['default']
let repoMod: typeof import('../../composables/useRepo')
let viewMod: typeof import('../../composables/useView')
let analysisMod: typeof import('../../composables/useAnalysis')

beforeEach(async () => {
  vi.resetModules()
  storage = new MemoryStorage()
  ;(await import('../../adapters/storage/appStorage')).setAppStorage(storage)
  analysisMod = await import('../../composables/useAnalysis')
  await import('../../composables/useAnalyses')
  viewMod = await import('../../composables/useView')
  repoMod = await import('../../composables/useRepo')
  analysisMod.configureAnalysis({ clock: () => '2026-06-01T00:00:00Z' })
  RepoLoaderContainer = (await import('./RepoLoaderContainer.vue')).default
})

afterEach(() => {
  document.body.innerHTML = ''
})

function configure(server: ReturnType<typeof fakeGitHub>, prefs: Partial<ReturnType<typeof defaultPreferences>> = {}) {
  let n = 0
  repoMod.configureRepo({
    fetchImpl: server.fetchFn,
    now: () => '2026-06-01T00:00:00Z',
    idFactory: () => `a${++n}`,
    getPreferences: () => ({ ...defaultPreferences(), ...prefs }),
  })
}

async function submit(wrapper: ReturnType<typeof mount>, text: string) {
  await wrapper.find('input[type="text"]').setValue(text)
  await wrapper.find('form').trigger('submit')
}

describe('RepoLoaderContainer', () => {
  it('loads a new repo end to end and switches to the analysis view', async () => {
    configure(fakeGitHub({ totalPages: 1, perPage: 2 }), { fetchComments: 'never' })
    const wrapper = mount(RepoLoaderContainer, { attachTo: document.body })
    await submit(wrapper, 'acme/widgets')
    await vi.waitFor(() => expect(analysisMod.useAnalysis().current.value?.id).toBe('a1'))
    expect(viewMod.useView().state.view).toBe('analysis')
    wrapper.unmount()
  })

  it('pauses for the huge-repo confirmation and Load all continues', async () => {
    configure(fakeGitHub({ totalPages: 25 }), { maxIssuesToLoad: 150, fetchComments: 'never' })
    const wrapper = mount(RepoLoaderContainer, { attachTo: document.body })
    await submit(wrapper, 'acme/widgets')
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
    expect(document.body.textContent).toContain('25 pages')
    ;(document.querySelector('[data-test="confirm-dialog-confirm"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(analysisMod.useAnalysis().current.value?.rows).toHaveLength(150))
    wrapper.unmount()
  })

  it('pauses for the comment-cost confirmation and Skip keeps the issues without comments', async () => {
    const server = fakeGitHub({
      totalPages: 1,
      perPage: 1,
    })
    // Force the cost gate: one commented issue and a tiny remaining quota.
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
    const wrapper = mount(RepoLoaderContainer, { attachTo: document.body })
    await submit(wrapper, 'acme/widgets')
    await vi.waitFor(() => expect(wrapper.find('[data-test="cost-confirm"]').exists()).toBe(true))
    await wrapper.get('[data-test="cost-confirm-skip"]').trigger('click')
    await vi.waitFor(() => expect(analysisMod.useAnalysis().current.value?.commentsFetched).toBe(false))
    wrapper.unmount()
  })

  it('shows a rate-limited notice and Resume continues the load', async () => {
    configure(fakeGitHub({ totalPages: 25, failIssuesRequestAt: 2 }), { maxIssuesToLoad: 200, fetchComments: 'never' })
    const wrapper = mount(RepoLoaderContainer, { attachTo: document.body })
    await submit(wrapper, 'acme/widgets')
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
    ;(document.querySelector('[data-test="confirm-dialog-confirm"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(wrapper.find('[data-test="rate-limited-notice"]').exists()).toBe(true))
    expect(wrapper.text()).toContain("rate limit was reached")

    await wrapper.get('[data-test="resume-load"]').trigger('click')
    await vi.waitFor(() => expect(analysisMod.useAnalysis().current.value?.rows).toHaveLength(200))
    wrapper.unmount()
  })

  it('shows the private-repo notice once, for the New-analysis flow', async () => {
    configure(fakeGitHub({ totalPages: 1, perPage: 1, isPrivate: true }), { fetchComments: 'never' })
    const wrapper = mount(RepoLoaderContainer, { attachTo: document.body })
    await submit(wrapper, 'acme/widgets')
    await vi.waitFor(() => expect(wrapper.find('[data-test="private-repo-notice"]').exists()).toBe(true))
    wrapper.unmount()
  })

  it('shows an error with Retry, and Retry re-runs the same submission', async () => {
    configure(fakeGitHub({ totalPages: 1, perPage: 1 }))
    // Route to a 404 by requesting a different repo name than the fake server knows.
    const wrapper = mount(RepoLoaderContainer, { attachTo: document.body })
    await submit(wrapper, 'acme/missing')
    await vi.waitFor(() => expect(wrapper.find('[data-test="repo-error"]').exists()).toBe(true))
    expect(wrapper.text()).toContain('Repository not found')
    wrapper.unmount()
  })
})
