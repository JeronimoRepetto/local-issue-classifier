// Test helpers over fake-indexeddb (a devDependency, Apache-2.0, never bundled).
// They talk to the database directly, bypassing the adapter, so a test can plant
// corrupt records or scan every stored value (e.g. for secrets).
import { IDBFactory } from 'fake-indexeddb'
import { ANALYSIS_DB_NAME, ANALYSIS_DB_VERSION, ANALYSIS_STORES } from '../../src/adapters/storage/analysisDb'

export { IDBFactory }

function openRaw(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(ANALYSIS_DB_NAME, ANALYSIS_DB_VERSION)
    request.onupgradeneeded = () => {
      for (const name of Object.values(ANALYSIS_STORES)) request.result.createObjectStore(name)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/** Write a value straight into one store (e.g. garbage, or a record with no summary). */
export async function rawPut(factory: IDBFactory, store: string, key: string, value: unknown): Promise<void> {
  const db = await openRaw(factory)
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).put(value, key)
  await completed(tx)
  db.close()
}

/** Every key and value in every store, for "nothing secret is stored" scans. */
export async function rawDump(factory: IDBFactory): Promise<{ store: string; key: string; value: unknown }[]> {
  const db = await openRaw(factory)
  const out: { store: string; key: string; value: unknown }[] = []
  for (const store of Array.from(db.objectStoreNames)) {
    const tx = db.transaction(store, 'readonly')
    const keysRequest = tx.objectStore(store).getAllKeys()
    const valuesRequest = tx.objectStore(store).getAll()
    await completed(tx)
    keysRequest.result.forEach((key, i) => out.push({ store, key: String(key), value: valuesRequest.result[i] }))
  }
  db.close()
  return out
}

/** The per-test fake database the setup file installed on the global (tests/setup/indexedDb.ts). */
export function globalFactory(): IDBFactory {
  return (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB
}
