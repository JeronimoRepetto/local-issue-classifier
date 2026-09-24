#!/usr/bin/env node
// One-off smoke check of the in-browser provider (docs/browser-inference.md §Smoke check).
//
// Opens scripts/browser-smoke/index.html ONCE in a headless Chromium browser
// (Edge or Chrome), waits until the page reports `window.__smoke.done`, prints
// the result as JSON, then kills exactly the browser process it started (by
// PID, with its child processes). Not a benchmark: one page load, one issue.
//
// Needs the dev server first:  pnpm exec vite --port 5220
// Then:                        node scripts/browser-smoke.mjs [--browser <exe>] [--profile <dir>]
//
// The browser profile (and with it the downloaded model in the Cache API)
// lives in --profile, by default a folder under the OS temp directory, never
// in the repository.
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce((pairs, arg, i, all) => (arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
)

const URL_DEFAULT = 'http://localhost:5220/scripts/browser-smoke/index.html'
const CANDIDATES = [
  process.env.BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

const browser = args.browser ?? CANDIDATES.find((path) => existsSync(path))
const profile = args.profile ?? join(tmpdir(), 'lic-browser-smoke-profile')
const url = args.url ?? URL_DEFAULT
const port = Number(args.port ?? 9333)
const timeoutMs = Number(args.timeout ?? 20 * 60_000)

if (!browser) {
  console.error('No Chromium browser found; pass --browser <path to msedge/chrome>.')
  process.exit(2)
}
mkdirSync(profile, { recursive: true })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function killTree(pid) {
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(-pid, 'SIGKILL')
  } catch {
    // Already gone.
  }
}

async function pageSocket() {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = targets.find((t) => t.type === 'page' && t.url.startsWith(url.split('?')[0]))
      if (page) return page.webSocketDebuggerUrl
    } catch {
      // Not listening yet.
    }
    await sleep(500)
  }
  throw new Error('The browser never exposed the smoke page over DevTools')
}

function evaluator(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    pending.get(message.id)?.(message)
    pending.delete(message.id)
  })
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  return {
    async evaluate(expression) {
      await opened
      const call = ++id
      const answer = new Promise((resolve) => pending.set(call, resolve))
      ws.send(JSON.stringify({ id: call, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }))
      const message = await answer
      return message.result?.result?.value
    },
    close: () => ws.close(),
  }
}

const child = spawn(
  browser,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--enable-unsafe-webgpu',
    url,
  ],
  { stdio: 'ignore', detached: process.platform !== 'win32' },
)
console.error(`browser pid ${child.pid}: ${url}`)

let exitCode = 1
try {
  const page = evaluator(await pageSocket())
  const started = Date.now()
  let result = null
  while (Date.now() - started < timeoutMs) {
    await sleep(3_000)
    const raw = await page.evaluate('JSON.stringify(window.__smoke ?? null)')
    result = raw ? JSON.parse(raw) : null
    if (result?.done) break
  }
  page.close()
  console.log(JSON.stringify(result, null, 2))
  exitCode = result?.done && !result.error ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
} finally {
  killTree(child.pid)
}
process.exit(exitCode)
