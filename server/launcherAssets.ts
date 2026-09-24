// One-click Kev launchers (docs/local-providers.md "One-click launcher").
//
// scripts/start-kev.ps1 (Windows) and scripts/start-kev.sh (macOS/Linux) are
// the single source; this plugin serves them under /launchers/ in dev and
// copies them into dist/launchers/ at build, so the Home card's "Download
// launcher" links work in both and the scripts can never drift from a second
// copy under public/. They are sent as plain-text attachments: the browser
// saves them, it never runs them.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

export const LAUNCHER_BASE = 'launchers'
export const LAUNCHER_FILES = ['start-kev.ps1', 'start-kev.sh'] as const

function scriptsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts')
}

export function launcherAssets(): Plugin {
  const dir = scriptsDir()
  return {
    name: 'local-issue-classifier:launcher-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]
        const file = LAUNCHER_FILES.find((f) => path === `/${LAUNCHER_BASE}/${f}`)
        if (!file) return next()
        res.statusCode = 200
        res.setHeader('content-type', 'text/plain; charset=utf-8')
        res.setHeader('content-disposition', `attachment; filename="${file}"`)
        res.end(readFileSync(join(dir, file)))
      })
    },
    generateBundle() {
      for (const file of LAUNCHER_FILES) {
        this.emitFile({ type: 'asset', fileName: `${LAUNCHER_BASE}/${file}`, source: readFileSync(join(dir, file)) })
      }
    },
  }
}
