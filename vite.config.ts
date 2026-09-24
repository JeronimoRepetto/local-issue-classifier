import { fileURLToPath, URL } from 'node:url'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { createJevProxy, jevLocalProxy, jevProxyGuard, jevProxyPrefix, JEV_UPSTREAM_DEFAULT } from './server/jevProxy'
import { ortAssets } from './server/ortAssets'
import { launcherAssets } from './server/launcherAssets'

// Fixed port so the preview tooling can find it (qr-tool=5173, design-studio=5180, steam-picker=5190).
const PORT = 5200

export default defineConfig(({ mode }) => {
  // '' prefix: also read the server-only JEV_UPSTREAM_URL (never bundled into the client).
  const env = loadEnv(mode, process.cwd(), '')
  const prefix = jevProxyPrefix(env.VITE_JEV_BASE_URL)
  // Jev proxy: the same allowlisted, header-stripping,
  // silent proxy serves `pnpm dev` and `pnpm preview`. Bound to localhost only.
  const jevProxy = createJevProxy({ target: env.JEV_UPSTREAM_URL || JEV_UPSTREAM_DEFAULT, prefix })
  // The shared policy (server/jevProxyPolicy.ts): only this server's own pages may call /jev,
  // rate limited per client IP by an in-memory bucket. Browsers also send Sec-Fetch-Site.
  const allowedOrigins = ['localhost', '127.0.0.1', '[::1]'].map((host) => `http://${host}:${PORT}`)

  return {
    // /jev-local (T16): forwards to a local Kev/JevK5 server named in x-local-target,
    // loopback or private LAN only. Local Vite server only; see docs/deployment.md.
    // ortAssets: ONNX Runtime Web's wasm + loader for the in-browser provider,
    // served from /ort/ instead of a CDN (docs/browser-inference.md).
    // launcherAssets: the one-click Kev launchers under /launchers/ (docs/local-providers.md).
    plugins: [vue(), jevProxyGuard({ prefix, allowedOrigins }), jevLocalProxy(), ortAssets(), launcherAssets()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: PORT,
      strictPort: true,
      proxy: jevProxy,
    },
    preview: {
      port: PORT,
      strictPort: true,
      proxy: jevProxy,
    },
    test: {
      environment: 'happy-dom',
      include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
      // A fresh in-memory IndexedDB per test (happy-dom has none), and no real network.
      setupFiles: ['tests/setup/indexedDb.ts', 'tests/setup/network.ts'],
    },
  }
})
