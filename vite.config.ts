import { fileURLToPath, URL } from 'node:url'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { createJevProxy, jevLocalProxy, jevProxyGuard, jevProxyPrefix, JEV_UPSTREAM_DEFAULT } from './server/jevProxy'

// Fixed port so the preview tooling can find it (qr-tool=5173, design-studio=5180, steam-picker=5190).
const PORT = 5200

export default defineConfig(({ mode }) => {
  // '' prefix: also read the server-only JEV_UPSTREAM_URL (never bundled into the client).
  const env = loadEnv(mode, process.cwd(), '')
  const prefix = jevProxyPrefix(env.VITE_JEV_BASE_URL)
  // Jev proxy (SPEC §4.1, §9 mode a): the same allowlisted, header-stripping,
  // silent proxy serves `pnpm dev` and `pnpm preview`. Bound to localhost only.
  const jevProxy = createJevProxy({ target: env.JEV_UPSTREAM_URL || JEV_UPSTREAM_DEFAULT, prefix })

  return {
    // /jev-local (T16): forwards to a local Kev/JevK5 server named in x-local-target,
    // loopback or private LAN only. Local Vite server only; see docs/deployment.md.
    plugins: [vue(), jevProxyGuard({ prefix }), jevLocalProxy()],
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
    },
  }
})
