// The current analysis: a module singleton. Every change
// goes through a pure domain function, then a save is scheduled:
//   - working state (filter, sort, dismiss, export, weights): debounced 500 ms;
//   - classification results: coalesced to at most one save per second, plus
//     flush() when a run ends;
//   - fetch / refresh results (setCurrent): saved immediately.
// Saves go to IndexedDB (adapters/storage/analysisDb.ts) and are async: the
// in-memory analysis changes synchronously, the write lands later, and writes
// are applied in call order. A save only clears `dirty` when nothing changed
// while it was in flight. A failed save keeps the analysis in memory and
// exposes status.failure plus retrySave(). Nothing secret ever reaches this module.
import { reactive, shallowRef } from 'vue'
import * as domain from '../domain/analysis'
import type { ClassificationOutcome } from '../domain/analysis'
import type { Analysis, AnalysisWorkingState } from '../domain/types'
import { STORAGE_KEYS, defaultPreferences } from '../domain/types'
import type { LoadResult, SaveResult } from '../adapters/storage/analysisStore'
import { getAnalysisDb } from '../adapters/storage/analysisDb'
import { getAppStorage } from '../adapters/storage/appStorage'

export const WORKING_SAVE_DELAY_MS = 500
export const CLASSIFICATION_SAVE_INTERVAL_MS = 1000

export type SaveKind = 'working' | 'classification' | 'immediate'
export type SaveStatus = 'idle' | 'pending' | 'saved' | 'failed'

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

/**
 * Where the last-opened id lives (Preferences.lastAnalysisId, §2.2). The
 * default reads and writes only that field of STORAGE_KEYS.preferences.
 * Task 4's usePreferences can take over with configureAnalysis({ lastOpened }).
 */
export interface LastOpenedHook {
  read(): string | null
  write(id: string | null): void
}

const preferencesKeyHook: LastOpenedHook = {
  read() {
    try {
      const raw = getAppStorage().getItem(STORAGE_KEYS.preferences)
      const id = raw ? (JSON.parse(raw) as { lastAnalysisId?: unknown }).lastAnalysisId : null
      return typeof id === 'string' ? id : null
    } catch {
      return null
    }
  },
  write(id) {
    const storage = getAppStorage()
    try {
      let existing: unknown = null
      try {
        existing = JSON.parse(storage.getItem(STORAGE_KEYS.preferences) ?? 'null')
      } catch {
        existing = null
      }
      const base = existing && typeof existing === 'object' ? existing : defaultPreferences()
      storage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ ...base, lastAnalysisId: id }))
    } catch {
      // Losing the last-opened id only means Home shows on reload; never block.
    }
  },
}

const globalScheduler: Scheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}

// ── Module-level singleton state ─────────────────────────────────────
// shallowRef: the analysis is replaced wholesale by the pure domain functions,
// so deep reactivity over thousands of rows is unnecessary.
const current = shallowRef<Analysis | null>(null)
const status = reactive<{
  save: SaveStatus
  failure: 'quota' | 'unavailable' | null
  openError: 'missing' | 'corrupt' | null
}>({ save: 'idle', failure: null, openError: null })

let scheduler: Scheduler = globalScheduler
let clock: () => string = () => new Date().toISOString()
let lastOpened: LastOpenedHook = preferencesKeyHook
let workingTimer: unknown = null
let classificationTimer: unknown = null
let dirty = false
/** Bumped by every change that needs saving: a save only clears `dirty` if it saw the latest one. */
let revision = 0
/** Bumped whenever a different analysis (or none) becomes current: stale results are not applied. */
let generation = 0
/** The last save this module started; settled() waits on it. */
let lastWrite: Promise<unknown> = Promise.resolve()
const persistedListeners = new Set<(result: SaveResult) => void>()

export interface AnalysisConfig {
  scheduler?: Scheduler
  clock?: () => string
  lastOpened?: LastOpenedHook
}

/** Dependency injection for timers, the clock and the last-opened hook. */
export function configureAnalysis(config: AnalysisConfig): void {
  if (config.scheduler) scheduler = config.scheduler
  if (config.clock) clock = config.clock
  if (config.lastOpened) lastOpened = config.lastOpened
}

function cancelTimers(): void {
  if (workingTimer !== null) scheduler.clearTimeout(workingTimer)
  if (classificationTimer !== null) scheduler.clearTimeout(classificationTimer)
  workingTimer = null
  classificationTimer = null
}

/** Snapshot the current analysis now and write it; the result arrives asynchronously. */
function persistNow(): Promise<SaveResult | null> {
  cancelTimers()
  const analysis = current.value
  if (!analysis) return Promise.resolve(null)
  const savedRevision = revision
  const savedGeneration = generation
  status.save = 'pending'
  const write = getAnalysisDb()
    .saveAnalysis(analysis)
    .then((result) => {
      if (savedGeneration === generation) {
        if (result.ok) {
          status.failure = null
          if (savedRevision === revision) {
            dirty = false
            status.save = 'saved'
          }
        } else {
          status.save = 'failed'
          status.failure = result.reason
        }
      }
      for (const listener of persistedListeners) listener(result)
      return result
    })
  lastWrite = write
  return write
}

/** Resolves once every save started so far (and anything they triggered) has finished. */
async function settled(): Promise<void> {
  let seen: Promise<unknown>
  do {
    seen = lastWrite
    await seen
  } while (seen !== lastWrite)
}

function schedule(kind: SaveKind): void {
  dirty = true
  revision++
  if (kind === 'immediate') {
    void persistNow()
    return
  }
  status.save = 'pending'
  if (kind === 'working') {
    if (workingTimer !== null) scheduler.clearTimeout(workingTimer)
    workingTimer = scheduler.setTimeout(persistNow, WORKING_SAVE_DELAY_MS)
  } else if (classificationTimer === null) {
    classificationTimer = scheduler.setTimeout(persistNow, CLASSIFICATION_SAVE_INTERVAL_MS)
  }
}

/** Apply a pure change to the current analysis and schedule its save. No-op when none is open. */
function update(change: (analysis: Analysis, now: string) => Analysis, kind: SaveKind = 'working'): void {
  if (!current.value) return
  current.value = change(current.value, clock())
  schedule(kind)
}

/** Make a freshly fetched or refreshed analysis current (synchronously) and save it immediately. */
function setCurrent(analysis: Analysis): Promise<SaveResult | null> {
  if (current.value && current.value.id !== analysis.id && dirty) void persistNow()
  cancelTimers()
  generation++
  current.value = analysis
  status.openError = null
  status.failure = null
  lastOpened.write(analysis.id)
  dirty = true
  revision++
  return persistNow()
}

async function open(id: string): Promise<LoadResult> {
  // Already current (e.g. RepoLoaderContainer's watcher re-opening the
  // analysis setCurrent() just finished loading, in the same tick): skip the
  // redundant storage reload and the second lastOpened.write it would cause.
  // That second write matters once usePreferences' reactive lastOpened hook
  // is wired in (App.vue, and now Home's ProviderOnboardingCard,
  // odd/tasks/home-provider-onboarding.md): its persist() writes the whole
  // in-memory Preferences snapshot, which would otherwise race a direct
  // storage writer such as useRepo's onboarding-checklist flag and clobber it.
  if (current.value?.id === id) {
    status.openError = null
    return { ok: true, analysis: current.value }
  }
  const requested = generation
  const result = await getAnalysisDb().loadAnalysis(id)
  // Something else became current meanwhile (setCurrent, another open, close): it wins.
  if (requested !== generation) return result
  if (!result.ok) {
    status.openError = result.reason
    return result
  }
  if (dirty) void persistNow()
  cancelTimers()
  generation++
  current.value = result.analysis
  dirty = false
  status.save = 'idle'
  status.failure = null
  status.openError = null
  lastOpened.write(id)
  return result
}

/** Reopen Preferences.lastAnalysisId after a reload. Resolves to whether one was opened. */
async function restoreLastOpened(): Promise<boolean> {
  const id = lastOpened.read()
  if (id === null) return false
  const result = await open(id)
  return result.ok && current.value?.id === id
}

/** Back to Home: pending changes are saved first. */
function close(): void {
  if (dirty) void persistNow()
  cancelTimers()
  generation++
  current.value = null
  dirty = false
  status.save = 'idle'
}

/** Drop the current analysis without saving (delete / clear all). */
function discard(options: { forget?: boolean } = {}): void {
  cancelTimers()
  generation++
  current.value = null
  dirty = false
  status.save = 'idle'
  status.failure = null
  if (options.forget) lastOpened.write(null)
}

function onPersisted(listener: (result: SaveResult) => void): () => void {
  persistedListeners.add(listener)
  return () => persistedListeners.delete(listener)
}

/** The injected clock, for callers that change a non-current analysis. */
export function analysisNow(): string {
  return clock()
}

export function useAnalysis() {
  return {
    current,
    status,
    setCurrent,
    open,
    restoreLastOpened,
    close,
    discard,
    update,
    /** Final save, e.g. at the end of a classification run. */
    flush: (): Promise<SaveResult | null> => (dirty ? persistNow() : Promise.resolve(null)),
    retrySave: persistNow,
    /** Waits for every save started so far (tests, and callers that must read after writing). */
    settled,
    onPersisted,
    applyResult: (issueNumber: number, result: ClassificationOutcome) =>
      update((a, now) => domain.applyClassification(a, issueNumber, result, now), 'classification'),
    updateWorking: (patch: Partial<AnalysisWorkingState>) => update((a, now) => domain.updateWorking(a, patch, now)),
    dismiss: (issueNumbers: number[]) => update((a, now) => domain.dismiss(a, issueNumbers, now)),
    restore: (issueNumbers: number[]) => update((a, now) => domain.restore(a, issueNumbers, now)),
    rename: (name: string) => update((a, now) => domain.rename(a, name, now)),
    removeMissing: () => update((a, now) => domain.removeMissing(a, now)),
  }
}
