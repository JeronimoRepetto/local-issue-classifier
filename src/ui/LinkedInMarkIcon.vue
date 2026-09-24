<script setup lang="ts">
// LinkedIn's official [in] Logo brand mark (user decision 2026-09-24, replacing
// the earlier IconExternalLink stand-in — see THIRD_PARTY_NOTICES.md "Brand
// icons" and docs/design.md "Icons" for the full history).
//
// Path data verbatim from https://brand.linkedin.com/in-logo's own inline SVG
// symbol (`inbug-blue-28`, viewBox 0 0 28 28) — that guidelines page's own
// nav/footer logo, so it is LinkedIn's first-party artwork, not a third-party
// redraw. LinkedIn's official in-logo.zip download (same page) ships this exact
// shape as PNG only, confirmed pixel-pure pure-black (InBug-Black.png) and
// pure-white (InBug-White.png) on a transparent background — the two color
// values in tokens.ts below (kept out of this file: see tests/tokens-only.test.ts).
//
// Hand-inlined like GitHubMarkIcon.vue, for the same reason: this is a smooth
// filled brand glyph, and scripts/build-icons.mjs's two paint modes (`stroke`'s
// outline, `pixel`'s crispEdges) both distort it.
//
// Per LinkedIn's [in] Logo guidelines ("Please Do Not: Modify the color or the
// shape of the [in] Logo. You may only use the approved color variations
// provided for download"), this component renders the mark completely
// unaltered: the approved black variant in the light theme, the approved white
// variant in the dark theme, via the dedicated `--color-brand-linkedin-mark`
// token (src/ui/tokens.ts) — never `currentColor`/`--color-icon-social`, which
// would recolor it to the app's grey and violate that rule.
const IN_LOGO_PATH =
  'm25.9 0h-23.8c-1.2 0-2.1 0.9-2.1 2v24c0 1.1 0.9 2 2.1 2h23.9c1.1 0 2.1-0.9 2.1-2v-24c-0.1-1.1-1-2-2.2-2zm-17.6 23.9h-4.1v-13.4h4.2v13.4zm-2.1-15.2c-1.3 0-2.4-1.1-2.4-2.4s1.1-2.4 2.4-2.4 2.4 1.1 2.4 2.4-1 2.4-2.4 2.4zm17.7 15.2h-4.1v-6.5c0-1.5 0-3.5-2.2-3.5s-2.5 1.7-2.5 3.4v6.6h-4.1v-13.4h4v1.8h0.1c0.6-1 1.9-2.2 3.9-2.2 4.2 0 5 2.8 5 6.4v7.4z'
</script>

<template>
  <svg class="linkedin-mark" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
    <path :d="IN_LOGO_PATH" />
  </svg>
</template>

<style scoped>
.linkedin-mark {
  fill: var(--color-brand-linkedin-mark);
}
</style>
