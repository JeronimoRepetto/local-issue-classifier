// The one place that resolves the browser's localStorage for the non-secret
// stores. Composables call getAppStorage(); tests inject a fake with setAppStorage().
import type { StorageLike } from './analysisStore'

/** Used when localStorage is blocked: reads are empty and writes fail as 'unavailable'. */
const unavailableStorage: StorageLike = {
  length: 0,
  key: () => null,
  getItem: () => null,
  setItem: () => {
    throw new Error('localStorage is unavailable')
  },
  removeItem: () => {},
}

let override: StorageLike | null = null

export function getAppStorage(): StorageLike {
  if (override) return override
  try {
    return globalThis.localStorage ?? unavailableStorage
  } catch {
    // Accessing localStorage throws when site data is blocked.
    return unavailableStorage
  }
}

/** Test / DI hook. Pass null to go back to the browser's localStorage. */
export function setAppStorage(storage: StorageLike | null): void {
  override = storage
}
