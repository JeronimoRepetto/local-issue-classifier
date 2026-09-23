import { describe, expect, it } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { REDUCED_MOTION_QUERY, resolveDurations, useReducedMotion } from './motion'

type Listener = (event: { matches: boolean }) => void

function fakeMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>()
  const mql = {
    matches: initial,
    media: REDUCED_MOTION_QUERY,
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  }
  const matchMedia = (query: string) => {
    expect(query).toBe(REDUCED_MOTION_QUERY)
    return mql as unknown as MediaQueryList
  }
  const emit = (matches: boolean) => {
    mql.matches = matches
    listeners.forEach((l) => l({ matches }))
  }
  return { matchMedia, emit, listeners }
}

describe('resolveDurations', () => {
  it('uses the token durations when motion is allowed', () => {
    expect(resolveDurations(false)).toEqual({
      fast: 120,
      base: 200,
      slow: 320,
      fadeBase: 200,
      fadeSlow: 320,
    })
  })

  it('sets every duration to 0 ms and caps fades at 80 ms under reduced motion', () => {
    expect(resolveDurations(true)).toEqual({ fast: 0, base: 0, slow: 0, fadeBase: 80, fadeSlow: 80 })
  })
})

describe('useReducedMotion', () => {
  it('resolves durations to 0 ms when the user prefers reduced motion', () => {
    const { matchMedia } = fakeMatchMedia(true)
    const { reduced, durations } = useReducedMotion(matchMedia)
    expect(reduced.value).toBe(true)
    expect(durations.value.fast).toBe(0)
    expect(durations.value.base).toBe(0)
    expect(durations.value.slow).toBe(0)
  })

  it('reacts to the media query changing and stops listening when its scope ends', async () => {
    const fake = fakeMatchMedia(false)
    const scope = effectScope()
    const motion = scope.run(() => useReducedMotion(fake.matchMedia))!
    expect(motion.durations.value.slow).toBe(320)

    fake.emit(true)
    await nextTick()
    expect(motion.reduced.value).toBe(true)
    expect(motion.durations.value.slow).toBe(0)

    scope.stop()
    expect(fake.listeners.size).toBe(0)
  })

  it('assumes motion is allowed when matchMedia is unavailable', () => {
    expect(useReducedMotion(undefined).reduced.value).toBe(false)
  })
})
