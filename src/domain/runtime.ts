// Bugfix (2026-09-24): see runtime.test.ts. `import.meta.env.DEV` alone is
// not "is this page reachable from the internet" — it is "did Vite's dev
// server start this process", which is false for a production build served
// locally (`vite preview`, or a static build opened from a `localhost`
// server). `isLocalRuntime` widens the check with the same loopback
// hostnames the CSP and the `/jev-local` proxy already treat as local (see
// docs/local-providers.md, "CORS and the /jev-local proxy").
//
// Pure: takes plain values, not `location`/`import.meta.env` themselves —
// useRuntime.ts reads those and passes them in.
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

export function isLocalRuntime({ dev, hostname }: { dev: boolean; hostname: string }): boolean {
  return dev || LOOPBACK_HOSTNAMES.has(hostname)
}
