import { createApp } from 'vue'
// Self-hosted fonts (OFL-1.1), bundled by Vite: no CDN, matching the CSP (SPEC §8, §10.3).
import '@fontsource-variable/inter'
import '@fontsource/silkscreen'
import App from './App.vue'
import { applyTheme, installTokenStylesheet } from './ui/theme'
import './ui/base.css'
import './style.css'

installTokenStylesheet(document)
// The theme preference is wired to Preferences in Task 4; until then follow the system.
applyTheme('system', { root: document.documentElement, matchMedia: (q) => window.matchMedia(q) })

createApp(App).mount('#app')
