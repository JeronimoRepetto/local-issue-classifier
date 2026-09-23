import { createApp } from 'vue'
// Self-hosted fonts (OFL-1.1), bundled by Vite: no CDN, matching the CSP (SPEC §8, §10.3).
import '@fontsource-variable/inter'
import '@fontsource/silkscreen'
import App from './App.vue'
import { installTokenStylesheet } from './ui/theme'
import './ui/base.css'
import './style.css'

installTokenStylesheet(document)
// The theme preference (and the rest of the integration wiring) is applied by
// App.vue's setup, which runs usePreferences before the app ever paints.

createApp(App).mount('#app')
