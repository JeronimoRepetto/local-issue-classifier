// The current analysis (SPEC.md §3.1, §4.8): a module singleton. Every change
// goes through a pure domain function, then a save is scheduled:
//   - working state (filter, sort, dismiss, export, weights): debounced 500 ms;
//   - classification results: coalesced to at most one save per second, plus
//     flush() when a run ends;
//   - fetch / refresh results (setCurrent): saved immediately.
// A failed save keeps the analysis in memory and exposes status.failure plus
// retrySave(). Nothing secret ever reaches this module.
import { reactive, shallowRef } from 'vue'
import * as domain from '../domain/analysis'
import type { ClassificationOutcome } from '../domain/analysis'
import type { Analysis, AnalysisWorkingState } from '../domain/types'
import { STORAGE_KEYS, defaultPreferences } from '../domain/types'
import { loadAnalysis, saveAnalysis } from '../adapters/storage/analysisStore'
import type { LoadResult, SaveResult } from '../adapters/storage/analysisStore'
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

function persistNow(): SaveResult | null {
  cancelTimers()
  const analysis = current.value
  if (!analysis) return null
  const result = saveAnalysis(getAppStorage(), analysis)
  if (result.ok) {
    dirty = false
    status.save = 'saved'
    status.failure = null
  } else {
    status.save = 'failed'
    status.failure = result.reason
  }
  for (const listener of persistedListeners) listener(result)
  return result
}

function schedule(kind: SaveKind): void {
  dirty = true
  if (kind === 'immediate') {
    persistNow()
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

/** Make a freshly fetched or refreshed analysis current and save it immediately. */
function setCurrent(analysis: Analysis): SaveResult | null {
  if (current.value && current.value.id !== analysis.id && dirty) persistNow()
  cancelTimers()
  current.value = analysis
  status.openError = null
  lastOpened.write(analysis.id)
  dirty = true
  return persistNow()
}

function open(id: string): LoadResult {
  const result = loadAnalysis(getAppStorage(), id)
  if (!result.ok) {
    status.openError = result.reason
    return result
  }
  if (dirty) persistNow()
  cancelTimers()
  current.value = result.analysis
  dirty = false
  status.save = 'idle'
  status.failure = null
  status.openError = null
  lastOpened.write(id)
  return result
}

/** Reopen Preferences.lastAnalysisId after a reload. Returns whether one was opened. */
function restoreLastOpened(): boolean {
  const id = lastOpened.read()
  return id !== null && open(id).ok
}

/** Back to Home: pending changes are saved first. */
function close(): void {
  if (dirty) persistNow()
  cancelTimers()
  current.value = null
  dirty = false
  status.save = 'idle'
}

/** Drop the current analysis without saving (delete / clear all). */
function discard(options: { forget?: boolean } = {}): void {
  cancelTimers()
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
    flush: () => (dirty ? persistNow() : null),
    retrySave: persistNow,
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
