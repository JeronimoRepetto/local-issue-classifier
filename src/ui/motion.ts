// Motion helpers. CSS already zeroes the `--dur-*` variables under
// `prefers-reduced-motion`; this composable gives JS-driven timings (toast
// timers, sprite steps, FLIP) the same answer.
import { computed, getCurrentScope, onScopeDispose, readonly, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { tokens } from './tokens'

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export interface MotionDurations {
  fast: number
  base: number
  slow: number
  /** Opacity-only fades, which survive reduced motion capped at 80 ms. */
  fadeBase: number
  fadeSlow: number
}

export function resolveDurations(reduced: boolean): MotionDurations {
  const { fast, base, slow } = tokens.duration
  if (!reduced) return { fast, base, slow, fadeBase: base, fadeSlow: slow }
  const cap = tokens.reducedFadeCap
  return { fast: 0, base: 0, slow: 0, fadeBase: Math.min(cap, base), fadeSlow: Math.min(cap, slow) }
}

type MatchMedia = (query: string) => MediaQueryList

const defaultMatchMedia: MatchMedia | undefined =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? (query) => window.matchMedia(query)
    : undefined

export function useReducedMotion(matchMedia: MatchMedia | undefined = defaultMatchMedia): {
  reduced: Readonly<Ref<boolean>>
  durations: ComputedRef<MotionDurations>
} {
  const reduced = ref(false)
  if (matchMedia) {
    const mql = matchMedia(REDUCED_MOTION_QUERY)
    reduced.value = mql.matches
    const onChange = (event: { matches: boolean }) => {
      reduced.value = event.matches
    }
    mql.addEventListener('change', onChange)
    if (getCurrentScope()) onScopeDispose(() => mql.removeEventListener('change', onChange))
  }
  return { reduced: readonly(reduced), durations: computed(() => resolveDurations(reduced.value)) }
}
