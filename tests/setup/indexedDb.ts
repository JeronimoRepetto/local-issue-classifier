// Vitest setup (vite.config.ts `test.setupFiles`): happy-dom has no IndexedDB,
// so every test gets a fresh in-memory one from fake-indexeddb (devDependency
// only, never bundled). It lives on the global, like the browser's, so the app's
// default resolver (analysisDb.getAnalysisDb) finds it, and it survives
// vi.resetModules() within a test, which is how the tests simulate a reload.
import { beforeEach } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true })
  Object.defineProperty(globalThis, 'IDBKeyRange', { value: IDBKeyRange, configurable: true, writable: true })
})
