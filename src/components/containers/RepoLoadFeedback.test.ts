// Task FU — SPEC.md §2.3 edge cases / "Storage full": the refresh-time
// confirmations and notices extracted out of RepoLoaderContainer so the
// analysis view can show the same feedback while refreshing. Driven by
// useRepo().state (huge-repo / comment-cost / progress / rate-limited /
// error / private-repo notice) and, when `showSaveFailed` is on, by
// useAnalysis().status (the "Storage full" save-failed notice) — off by
// default because HomeContainer already renders its own SaveFailedNotice.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createAnalysis } from '../../domain/analysis'
import { defaultPreferences, defaultProjectContext } from '../../domain/types'
import { fakeIssue, fakeRepo } from '../../../tests/fakes/domainFixtures'
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
  return { fetchFn: fetchFn as unknown as typeof fetch }
}

function seedAnalysis(id = 'a1') {
  return createAnalysis({
    id,
    repo: fakeRepo(),
    stateFilter: 'open',
    now: '2026-03-01T10:00:00Z',
    prefs: defaultPreferences(),
    projectContext: defaultProjectContext('acme/widgets'),
    issues: [fakeIssue(1)],
    commentsFetched: false,
  })
}

let storage: MemoryStorage
let RepoLoadFeedback: typeof import('./RepoLoadFeedback.vue')['default']
let repoMod: typeof import('../../composables/useRepo')
let analysisMod: typeof import('../../composables/useAnalysis')

beforeEach(async () => {
  vi.resetModules()
  storage = new MemoryStorage()
  ;(await import('../../adapters/storage/appStorage')).setAppStorage(storage)
  analysisMod = await import('../../composables/useAnalysis')
  await import('../../composables/useAnalyses')
  analysisMod.configureAnalysis({ clock: () => '2026-06-01T00:00:00Z' })
  repoMod = await import('../../composables/useRepo')
  repoMod.resetRepoForTests()
  RepoLoadFeedback = (await import('./RepoLoadFeedback.vue')).default
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

describe('RepoLoadFeedback', () => {
  it('renders nothing while idle and no save failure', async () => {
    const wrapper = mount(RepoLoadFeedback, { attachTo: document.body })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(wrapper.find('[data-test="rate-limited-notice"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="repo-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="save-failed-notice"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the huge-repo confirmation, and Load all continues loading', async () => {
    configure(fakeGitHub({ totalPages: 25 }), { maxIssuesToLoad: 150, fetchComments: 'never' })
    mount(RepoLoadFeedback, { attachTo: document.body })
    repoMod.useRepo().startNew({ owner: 'acme', repo: 'widgets' }, 'open')
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
    expect(document.body.textContent).toContain('25 pages')
    ;(document.querySelector('[data-test="confirm-dialog-confirm"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(repoMod.useRepo().state.phase).toBe('done'))
  })

  it('shows the comment-cost confirmation, and Skip continues without comments', async () => {
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
    mount(RepoLoadFeedback, { attachTo: document.body })
    repoMod.useRepo().startNew({ owner: 'acme', repo: 'widgets' }, 'open')
    await vi.waitFor(() => expect(document.querySelector('[data-test="cost-confirm"]')).not.toBeNull()
    )
    ;(document.querySelector('[data-test="cost-confirm-skip"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(repoMod.useRepo().state.phase).toBe('done'))
    expect(analysisMod.useAnalysis().current.value?.commentsFetched).toBe(false)
  })

  it('shows progress with a Cancel button while loading, and Cancel returns to idle', async () => {
    let resolveFetch!: () => void
    const gate = new Promise<void>((resolve) => {
      resolveFetch = resolve
    })
    configure({
      fetchFn: (async () => {
        await gate
        return new Response('{"message":"Not Found"}', { status: 404 })
      }) as unknown as typeof fetch,
    } as unknown as ReturnType<typeof fakeGitHub>)
    mount(RepoLoadFeedback, { attachTo: document.body })
    void repoMod.useRepo().startNew({ owner: 'acme', repo: 'widgets' }, 'open')
    await vi.waitFor(() => expect(document.querySelector('[data-test="load-progress"]')).not.toBeNull())
    expect(document.querySelector('[data-test="cancel-load"]')).not.toBeNull()

    ;(document.querySelector('[data-test="cancel-load"]') as HTMLButtonElement).click()
    expect(repoMod.useRepo().state.phase).toBe('idle')
    resolveFetch()
  })

  it('shows a rate-limited notice, and Resume continues the load', async () => {
    configure(fakeGitHub({ totalPages: 25, failIssuesRequestAt: 2 }), { maxIssuesToLoad: 200, fetchComments: 'never' })
    mount(RepoLoadFeedback, { attachTo: document.body })
    repoMod.useRepo().startNew({ owner: 'acme', repo: 'widgets' }, 'open')
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
    ;(document.querySelector('[data-test="confirm-dialog-confirm"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(document.querySelector('[data-test="rate-limited-notice"]')).not.toBeNull())
    expect(document.body.textContent).toContain('rate limit was reached')

    ;(document.querySelector('[data-test="resume-load"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(repoMod.useRepo().state.phase).toBe('done'))
  })

  it('shows the private-repo notice once', async () => {
    configure(fakeGitHub({ totalPages: 1, perPage: 1, isPrivate: true }), { fetchComments: 'never' })
    mount(RepoLoadFeedback, { attachTo: document.body })
    repoMod.useRepo().startNew({ owner: 'acme', repo: 'widgets' }, 'open')
    await vi.waitFor(() => expect(document.querySelector('[data-test="private-repo-notice"]')).not.toBeNull())
  })

  it('shows an error notice, and its Retry emits "retry" while Dismiss clears the error', async () => {
    configure(fakeGitHub({ totalPages: 1, perPage: 1 }))
    const wrapper = mount(RepoLoadFeedback, { attachTo: document.body })
    repoMod.useRepo().startNew({ owner: 'acme', repo: 'missing' }, 'open')
    await vi.waitFor(() => expect(document.querySelector('[data-test="repo-error"]')).not.toBeNull())
    expect(document.body.textContent).toContain('Repository not found')

    ;(document.querySelector('[data-test="retry-load"]') as HTMLButtonElement).click()
    expect(wrapper.emitted('retry')).toHaveLength(1)

    ;(document.querySelector('[data-test="dismiss-error"]') as HTMLButtonElement).click()
    expect(repoMod.useRepo().state.phase).toBe('idle')
  })

  it('hides the save-failed notice by default even when the current save failed', async () => {
    vi.spyOn((await import('../../adapters/storage/analysisDb')).getAnalysisDb(), 'saveAnalysis').mockResolvedValueOnce({
      ok: false,
      reason: 'quota',
    })
    await analysisMod.useAnalysis().setCurrent(seedAnalysis())
    expect(analysisMod.useAnalysis().status.save).toBe('failed')

    const wrapper = mount(RepoLoadFeedback, { attachTo: document.body })
    expect(wrapper.find('[data-test="save-failed-notice"]').exists()).toBe(false)
  })

  it('shows the save-failed notice with Retry save when showSaveFailed is on', async () => {
    vi.spyOn((await import('../../adapters/storage/analysisDb')).getAnalysisDb(), 'saveAnalysis').mockResolvedValueOnce({
      ok: false,
      reason: 'quota',
    })
    await analysisMod.useAnalysis().setCurrent(seedAnalysis())
    expect(analysisMod.useAnalysis().status.save).toBe('failed')

    const wrapper = mount(RepoLoadFeedback, { props: { showSaveFailed: true }, attachTo: document.body })
    expect(wrapper.find('[data-test="save-failed-notice"]').exists()).toBe(true)

    await wrapper.get('[data-test="retry-save"]').trigger('click')
    await analysisMod.useAnalysis().settled()
    expect(analysisMod.useAnalysis().status.save).toBe('saved')
  })
})
