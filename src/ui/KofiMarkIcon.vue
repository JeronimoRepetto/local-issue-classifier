<script setup lang="ts">
// Ko-fi "Support the author" app-bar icon (2026-09-24). Icon policy (see
// THIRD_PARTY_NOTICES.md "Ko-fi support link" and docs/design.md "Icons" for
// the full sourcing note and evidence):
//
// Ko-fi's own brand-assets page (https://more.ko-fi.com/brand-assets, "Use
// these logos, buttons, and cups to help spread the word about your page")
// offers no monochrome (black/white) variant of its logo/cup to recolor to
// `--color-icon-social`, and Ko-fi's Terms of Use (https://more.ko-fi.com/terms)
// broadly restrict trademark use ("Our trademarks and trade dress may not be
// used in connection with any good or service without our prior written
// consent") and forbid altering downloaded materials ("You may not modify ...
// digital copies ... in any way"). That is unlike LinkedIn's `[in]` Logo
// guidelines (see LinkedInMarkIcon.vue), which explicitly authorize approved
// black/white downloads for exactly this hyperlink use — so there is no
// equivalent authorized monochrome Ko-fi asset to reuse here. The Streamline
// "Core Remix" coffee mug pasted earlier in this task was rejected for the
// same reason `docs/design.md`'s "Icon source decision" rejected the
// Streamline Pixel set: its Free License requires attribution and forbids
// redistributing the SVG as a standalone asset in a public repo.
//
// So, unlike GitHubMarkIcon.vue and LinkedInMarkIcon.vue (both hand-inlined
// because they reproduce a third party's actual trademarked glyph), this
// renders an **original** coffee-mug icon drawn for this project
// (design/icons/stroke/coffee.svg), MIT-licensed like the rest of the icon
// set, through the normal scripts/build-icons.mjs stroke pipeline — the
// generated component picks up the shared `--color-icon-social` token via
// `currentColor` exactly like GitHubMarkIcon.vue does.
import IconCoffee from '../assets/icons/IconCoffee.vue'
</script>

<template>
  <IconCoffee />
</template>
