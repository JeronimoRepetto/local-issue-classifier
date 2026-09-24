// @vitest-environment node
// One-click Kev launchers (docs/local-providers.md "One-click launcher"):
// scripts/start-kev.ps1 and scripts/start-kev.sh are served under /launchers/
// by the dev server and copied into the build, so the Home card can link to them.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { LAUNCHER_BASE, LAUNCHER_FILES, launcherAssets } from '../../server/launcherAssets'

const SCRIPTS = join(__dirname, '..', '..', 'scripts')

describe('launcherAssets', () => {
  it('names both launchers', () => {
    expect(LAUNCHER_BASE).toBe('launchers')
    expect(LAUNCHER_FILES).toEqual(['start-kev.ps1', 'start-kev.sh'])
  })

  it('copies both scripts into the build under launchers/, byte for byte', () => {
    const emitFile = vi.fn()
    ;(launcherAssets().generateBundle as unknown as (this: unknown) => void).call({ emitFile })
    expect(emitFile.mock.calls.map(([asset]) => asset.fileName)).toEqual(['launchers/start-kev.ps1', 'launchers/start-kev.sh'])
    for (const [asset] of emitFile.mock.calls) {
      const name = String(asset.fileName).split('/').pop()!
      expect(Buffer.from(asset.source).equals(readFileSync(join(SCRIPTS, name)))).toBe(true)
    }
  })

  it('serves them in dev as plain-text downloads, and passes everything else on', () => {
    let middleware!: (req: { url?: string }, res: unknown, next: () => void) => void
    ;(launcherAssets().configureServer as unknown as (server: unknown) => void)({
      middlewares: { use: (fn: typeof middleware) => (middleware = fn) },
    })
    const respond = (url: string) => {
      const headers: Record<string, string> = {}
      const res = Object.assign(new EventEmitter(), {
        statusCode: 0,
        setHeader: (k: string, v: string) => (headers[k.toLowerCase()] = v),
        end: vi.fn(),
      })
      const next = vi.fn()
      middleware({ url }, res, next)
      return { headers, res, next }
    }
    const ps1 = respond('/launchers/start-kev.ps1')
    expect(ps1.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(ps1.headers['content-disposition']).toBe('attachment; filename="start-kev.ps1"')
    expect(ps1.res.end).toHaveBeenCalled()
    expect(respond('/launchers/start-kev.sh?x=1').res.end).toHaveBeenCalled()
    expect(respond('/launchers/../package.json').next).toHaveBeenCalled()
    expect(respond('/src/main.ts').next).toHaveBeenCalled()
  })
})
