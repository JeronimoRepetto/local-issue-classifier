// Reads the two globals domain/runtime.ts's isLocalRuntime needs, with both
// overridable so ProviderOnboardingCard.vue can force either one from a test
// prop (see its `isDev`/`hostname` props and this bugfix's report: the old
// `isDev`-only check showed the "hosted page" hint even on a local
// `vite preview`/static build).
import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { isLocalRuntime } from '../domain/runtime'

export interface Runtime {
  dev: boolean
  hostname: string
  isLocal: ComputedRef<boolean>
}

export function useRuntime(overrides: { dev?: boolean; hostname?: string } = {}): Runtime {
  const dev = overrides.dev ?? import.meta.env.DEV
  const hostname = overrides.hostname ?? location.hostname
  return { dev, hostname, isLocal: computed(() => isLocalRuntime({ dev, hostname })) }
}
