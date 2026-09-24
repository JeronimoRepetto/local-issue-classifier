// Shared, module-scope cache for passive hardware detection (docs/hardware-fit.md).
// Extracted from HardwareFitPanel.vue (PoC odd/tasks/home-provider-onboarding.md) so
// both HardwareFitPanel (Settings) and ProviderOnboardingCard (Home) read the same
// report without either re-running detection when the other has already mounted:
// detection runs at most once per page load, regardless of mount order. A hard page
// reload clears this module (and the cache) from scratch. Nothing here benchmarks
// anything — it only remembers the result of whatever `detect` function is passed in.
import { ref } from 'vue'
import { unknownHardwareReport } from '../domain/hardware'
import type { HardwareReport } from '../domain/hardware'

const cachedReport = ref<HardwareReport | null>(null)
let cachedDetection: Promise<HardwareReport> | null = null

export interface HardwareDetection {
  /** The cached report; null before the first detection resolves. */
  report: typeof cachedReport
  /** True once a detection has already been started (running or finished) this page load. */
  hasStarted(): boolean
  /** Runs `detect`, caching the result; call only when `hasStarted()` is false. */
  run(detect: () => Promise<HardwareReport>): Promise<HardwareReport>
}

export function useHardwareDetection(): HardwareDetection {
  return {
    report: cachedReport,
    hasStarted: () => cachedDetection !== null,
    async run(detect) {
      const promise = detect().catch(() => unknownHardwareReport())
      cachedDetection = promise
      const result = await promise
      cachedReport.value = result
      return result
    },
  }
}
