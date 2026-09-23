// Task 4 — SPEC.md §2.1 "Reload during a run": the browser's native
// beforeunload prompt is registered only while a run (loading or
// classifying) is active. Task 11's classification runner calls
// setRunActive(); Task 8's loader can too.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isRunActive, setRunActive } from './useRunGuard'

afterEach(() => {
  setRunActive(false)
  vi.restoreAllMocks()
})

describe('useRunGuard', () => {
  it('starts idle, with no listener registered', () => {
    expect(isRunActive()).toBe(false)
  })

  it('registers window beforeunload only when a run becomes active', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    setRunActive(true)
    expect(isRunActive()).toBe(true)
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })

  it('removes the listener once the run goes idle again', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    setRunActive(true)
    setRunActive(false)
    expect(isRunActive()).toBe(false)
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })

  it('is idempotent: repeating the same value does not re-register', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    setRunActive(true)
    setRunActive(true)
    expect(addSpy).toHaveBeenCalledTimes(1)
  })

  it('the registered handler prevents the default unload so the browser prompts', () => {
    let handler: ((event: Event) => void) | undefined
    vi.spyOn(window, 'addEventListener').mockImplementation((_type, fn) => {
      handler = fn as (event: Event) => void
    })
    setRunActive(true)
    const event = new Event('beforeunload', { cancelable: true })
    Object.assign(event, { returnValue: '' })
    handler?.(event)
    expect(event.defaultPrevented).toBe(true)
  })
})
