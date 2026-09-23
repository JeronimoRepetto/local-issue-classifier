# Design system

The design system lives in `src/ui/` and implements SPEC §10. It imports only Vue and
`src/assets/icons/`; it never imports composables, adapters or domain code (enforced by
`tests/architecture.test.ts`).

**Direction.** Modern, friendly and professional. Pixel art is the identity — logo, icons,
badge glyphs, empty states and small details — never the reading surface: body, table and
number text is Inter.

To see everything, run `pnpm dev` and open http://localhost:5200/?kit.

## Tokens

`src/ui/tokens.ts` is the single source of truth and the only file allowed to hold raw colors,
pixel sizes and durations (`tests/tokens-only.test.ts` fails on a hex, `px` or `ms` literal in
`src/ui`, `src/components`, `App.vue` or `style.css`).

- `tokensToCss(tokens, theme, selector?)` emits CSS custom properties for one theme, scoped to
  `:root[data-theme="light|dark"]` by default.
- `reducedMotionCss(tokens)` emits the `prefers-reduced-motion` override.
- `buildStylesheet(tokens)` combines both themes and the override; `installTokenStylesheet()`
  in `theme.ts` injects it once at startup.

| Group | Variables | Notes |
|---|---|---|
| Color | `--color-<role>` | Semantic roles; see below. |
| Spacing | `--space-1..7` = 4, 8, 16, 24, 32, 48, 64 px | 8 px grid; `space-1` only for icon-to-label gaps. |
| Sizes | `--size-compact/default/large` = 32/40/48, `--size-row` = 40 | Control heights. |
| Icons | `--icon-sm/md/lg` = 16/24/32 | Integer multiples of the 16 px pixel grid. |
| Radii | `--radius-pixel/sm/md/lg` = 0/4/8/12, `--radius-round` | `pixel` is the square frame for pixel art. |
| Lines | `--line-thin/thick` = 1/2 px | Borders and the focus ring. |
| Elevation | `--elev-1/2/3` | Cards / popovers, toasts / dialogs; softer in dark mode. |
| Type | `--text-<step>-size/line`, `--weight-*`, `--font-sans/pixel/mono` | See Typography. |
| Motion | `--dur-*`, `--dur-fade-*`, `--ease-*`, `--motion-shift/scale` | See Motion. |
| Layers | `--z-popover/toast/dialog` | |

### Color roles and contrast

The palette starts from SPEC §10.2. `src/ui/tokens.test.ts` checks every pair in
`CONTRAST_PAIRS` in both themes: at least 4.5:1 for text, and 3:1 for control borders, the
focus ring and scale bars. **The test is the authority.** It forced these changes to the
starting values:

| Token | SPEC start (light / dark) | Now (light / dark) | Why |
|---|---|---|---|
| `scale-1..5` | `#E6E6FA…#4B4BC8` / `#2A2A4A…#9A9AF2` | `#8B8BDB #6F6FD2 #5A5ACB #4B4BC8 #3B3BA8` / `#5E5EB8 #7070CC #8A8AE4 #9A9AF2 #B4B4F7` | The lighter steps were 1.2–2.6:1 on `surface`; every bar now reaches 3:1. |
| `border-strong` (new) | — | `#7E8494` / `#6B7186` | `border` is 1.4:1. Control boundaries (inputs, chips, secondary buttons) use `border-strong`. `border` stays for decorative dividers and card outlines, which WCAG 1.4.11 does not cover. |

Added roles: `accent-hover`, `accent-soft` (selected and active chips), `danger-hover`,
`on-danger`, `inverse-surface` / `on-inverse` (tooltips), `border-strong` and `overlay` (the
dialog scrim, an alpha color outside the contrast pairs).

Level colors are one intensity scale for every dimension (high = hot). Color is never the only
signal: `LevelBadge` always shows a text label and a pixel signal glyph (3/2/1 bars), and
`ScoreBar` always shows its number.

### Themes

`theme.ts` resolves the `'system' | 'light' | 'dark'` preference onto `<html data-theme>`.
`applyTheme('system', …)` keeps following `prefers-color-scheme` until its cleanup runs.
`nextThemePreference()` gives the top-bar toggle order (system → light → dark). Until Task 4
persists the preference, `main.ts` follows the system.

## Typography

- **Inter Variable** (`@fontsource-variable/inter`) for body, UI, tables and numbers. Tables and
  numbers use `font-variant-numeric: tabular-nums` (`.u-tabular`).
- **Silkscreen** (`@fontsource/silkscreen`) through `.u-pixel-font` only for the logo wordmark,
  the Home H1, empty-state headlines and the priority "P" glyph. Always at least 16 px.
- Scale (size / line height): caption 12/16, table 14/20, body 16/24, h3 20/28, h2 24/32,
  h1 32/40. Weights 400, 500 and 600.

Both fonts are imported in `main.ts` and bundled by Vite (no CDN, CSP-safe). Licenses are in
`THIRD_PARTY_NOTICES.md`.

## Components

Every component takes props and emits events; none uses a store.

| Component | File | Notes |
|---|---|---|
| `UiButton` | `UiButton.vue` | primary / secondary / ghost / danger; compact / default / large; `loading` keeps the label for width and shows `UiSpinner`; `iconOnly` warns in dev without `aria-label`. |
| `UiInput` | `UiInput.vue` | Label, hint, error (`aria-invalid`, `aria-describedby`), `prefix` slot, clearable. |
| `UiSecretInput` | `UiSecretInput.vue` | Masked by default; reveal toggle with `aria-pressed`; clear; "Kept in memory only" hint; "Where do I get this?" `help` slot; status untested / checking / ok / invalid; optional Test button. `autocomplete="off"`, no spell-check. |
| `UiSelect` | `UiSelect.vue` | Native `<select>`, so keyboard type-ahead and platform accessibility come free. |
| `UiMultiSelect` | `UiMultiSelect.vue` | Selected values as removable chips; listbox with `aria-multiselectable`, arrows, Home/End, Enter/Space, Esc and type-ahead. |
| `UiSlider` | `UiSlider.vue` | Range plus paired number input, step 5, clamped and snapped, `aria-valuetext`. |
| `UiDialog` | `UiDialog.vue` | Focus trap, Esc, focus return, labelled title, destructive variant with a typed phrase (`confirmPhrase`). |
| `UiPopover` | `UiPopover.vue` | Click-toggled, focus trap, Esc and outside click; the trigger slot receives `attrs` (`aria-expanded`, `aria-controls`). |
| `UiTooltip` | `UiTooltip.vue` | Hover and focus, 300 ms delay, Esc hides; the slot receives `describedBy`. Text only. |
| `UiToast`, `UiToastStack` | `UiToast.vue`, `UiToastStack.vue` | success / info / warning / error; 5 s auto-dismiss (not errors); pauses on hover and focus; `role="status"` or `role="alert"`; at most 3 stacked. |
| `LevelBadge` | `LevelBadge.vue` | high / medium / low; signal glyph; `aria-label` like "Criticality: high"; stale variant (dashed). |
| `ConfidenceBadge` | `ConfidenceBadge.vue` | high ≥ 0.8 (`hideHigh`), medium, low with "?" glyph and warning color; probabilities tooltip. |
| `ScoreBar` | `ScoreBar.vue` | 0–100 text plus a `scale-1..5` bar (bands of 20); "Priority 82 of 100". |
| `EmptyState` | `EmptyState.vue` | 32×32 illustration at 4× in a square pixel frame, pixel-font title, one sentence, one `action`. |
| `FilterChip` | `FilterChip.vue` | inactive / active (`aria-pressed`) / removable (×) / summary ("N filters", `aria-haspopup`) / `labelOnly`. |

Shared pieces: `base.css` (body, the focus ring, `.ui-field` and `.ui-control` field anatomy,
`.u-*` utilities including the Home-card `.u-pixel-border`), `focusTrap.ts` and `levels.ts`
(pure level, confidence and scale mapping).

**Kit page.** `KitPage.vue` + `KitShowcase.vue`, loaded only when `import.meta.env.DEV` and the
URL has `?kit`. It renders both themes side by side (theme tokens scoped to
`[data-kit-theme]`) and has a "Force reduced motion" switch. A production build contains no kit
code.

## Motion

- Durations: `dur-fast` 120 ms (hover, press), `dur-base` 200 ms (popovers, row state),
  `dur-slow` 320 ms (dialogs, toasts), `dur-sprite` 800 ms (one loop of a stepped sprite).
- Easings: `ease-out` to enter, `ease-in` to leave, `ease-standard`, and `ease-pixel`
  (`steps(4, end)`) for sprites only.
- Only opacity, transform and colors animate. The focus ring appears instantly. Scores, sorting
  and filtering never animate.
- **Reduced motion.** The CSS override sets every `--dur-*` to 0 ms, caps `--dur-fade-*` at
  80 ms, sets `--motion-shift` to 0 and `--motion-scale` to 1, so sprites stop stepping.
  `useReducedMotion()` gives JS timings the same answer (`resolveDurations(true)` → 0 ms).

## Icons

### Icon source decision (2026-09-23)

The Streamline "Pixel" page (https://www.streamlinehq.com/icons/pixel) still says "Licensed
under the Creative Commons - CC BY 4.0". However:

- its schema.org metadata links `https://home.streamlinehq.com/license-free` (the proprietary
  Streamline Free License) as the license;
- the page serves only PNG previews; the SVG files need a Streamline account to download.

Given that ambiguity and no account-free source, the project applied the SPEC §10.5
**custom-only fallback**: every icon is original 16×16 pixel art under `design/icons/custom/`
(MIT). `design/icons/streamline-pixel/` stays empty, and `THIRD_PARTY_NOTICES.md` records the
attribution to use if that ever changes. GitHub's mark is not redrawn (trademark); the
repository icon is `repo`.

### Pipeline

`scripts/build-icons.mjs` (`pnpm icons`) reads `design/icons/{streamline-pixel,custom}/*.svg`
and, per file:

1. drops the XML prolog, comments, `<script>`, `<style>`, `<metadata>`, `<title>`, `<desc>`;
2. enforces a `viewBox` (derived from `width`/`height` if missing);
3. removes `id`, `class`, `style`, `on*`, `href` and `data-*` attributes and unwraps links;
4. drops child fills (they inherit `fill="currentColor"`) and recolors strokes; `fill-opacity`
   survives, which gives the signal glyphs their dim bars;
5. writes `src/assets/icons/Icon<Name>.vue` with `shape-rendering="crispEdges"`,
   `aria-hidden="true"`, `focusable="false"` and a default size equal to the grid.

`src/assets/icons/index.ts` re-exports each icon by name. Import only what you use, so the
rest is tree-shaken; there is no global registry. `tests/icons.test.ts` checks the normalizer,
that the committed output matches a fresh build, and that every icon has `currentColor`, a
`viewBox`, and nothing executable.

### How to add an icon

1. Draw it on a 16×16 grid (32×32 for illustrations) with whole-pixel rectangles or paths, one
   color (`#000` is fine; it is recolored). Use `fill-opacity` for a second tone.
2. Save it as `design/icons/custom/<kebab-name>.svg`. A Streamline Pixel icon goes in
   `design/icons/streamline-pixel/` instead, with the attribution in `THIRD_PARTY_NOTICES.md`.
3. Run `pnpm icons` and commit the SVG plus the generated `Icon<Name>.vue` and `index.ts`.
4. Use it at 16, 24 or 32 px only. Decorative icons stay `aria-hidden`; an icon-only button
   needs an `aria-label`.
