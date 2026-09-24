<script setup lang="ts">
// Visual check page, dev only: App.vue loads it through a dynamic
// import guarded by import.meta.env.DEV when the URL has `?kit`. It shows every
// component in both themes side by side, with a switch to force reduced motion.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import KitShowcase from './KitShowcase.vue'
import IconLogo from '../assets/icons/IconLogo.vue'
import { THEMES, reducedMotionBlock, tokens, tokensToCss } from './tokens'

const STYLE_ID = 'ic-kit-tokens'
const forceReduced = ref(false)

onMounted(() => {
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = [
    ...THEMES.map((theme) => tokensToCss(tokens, theme, `[data-kit-theme="${theme}"]`)),
    reducedMotionBlock(tokens, '[data-kit-motion="reduced"]'),
  ].join('\n\n')
  document.head.appendChild(style)
})

onBeforeUnmount(() => document.getElementById(STYLE_ID)?.remove())
</script>

<template>
  <div class="kit" :data-kit-motion="forceReduced ? 'reduced' : undefined">
    <header class="kit__header">
      <h1 class="kit__title">
        <IconLogo class="kit__logo" />
        <span class="kit__wordmark u-pixel-font">local-issue-classifier</span>
        <span class="kit__badge u-micro">UI kit</span>
      </h1>
      <label class="kit__toggle">
        <input v-model="forceReduced" type="checkbox" data-test="kit-reduced-motion" />
        Force reduced motion
      </label>
      <p class="kit__note">
        Hover, focus-visible and active states are live: use the pointer and Tab. The OS
        reduced-motion setting also applies.
      </p>
    </header>
    <div class="kit__columns">
      <main
        v-for="theme in THEMES"
        :key="theme"
        class="kit__panel"
        :data-kit-theme="theme"
        :aria-label="`${theme} theme`"
      >
        <KitShowcase :theme="theme" />
      </main>
    </div>
  </div>
</template>

<style scoped>
.kit__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2h) var(--space-4);
  min-height: calc(var(--size-large) + var(--space-3));
  padding: 0 var(--space-4);
  border-bottom: var(--line-thin) solid var(--color-border);
}

.kit__title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--text-body-size);
  line-height: var(--text-body-line);
  font-weight: var(--weight-regular);
}

.kit__logo {
  width: var(--icon-md);
  height: var(--icon-md);
  color: var(--color-accent);
}

.kit__badge {
  padding: 0 var(--space-2);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-round);
}

.kit__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-table-size);
}

.kit__note {
  margin: 0;
  color: var(--color-text-subtle);
  font-size: var(--text-caption-size);
}

.kit__columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(calc(var(--space-7) * 9), 1fr));
}

.kit__panel {
  min-width: 0;
  padding: var(--space-4) var(--space-5);
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
}
</style>
