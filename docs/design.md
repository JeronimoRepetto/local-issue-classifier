# Design system (v2)

The design system lives in `src/ui/` and implements the v2 design direction. It imports only Vue and `src/assets/icons/`. It never
imports composables, adapters or domain code, and `tests/architecture.test.ts` enforces that.

To see everything, run `pnpm dev` and open http://localhost:5200/?kit. The kit page is the
visual test for this document.

## Direction

The look is a clean technical one, inspired by canirun.ai but not copied from it:

- **Neutral surfaces, one accent.** Zinc grays with an indigo accent. Color is reserved for
  meaning: levels, the heat scale, status.
- **Hairlines, not boxes.** 1 px borders and dividers carry the layout. Cards are flat.
  Shadows appear only on floating layers.
- **Three type voices.** Geist Sans for prose, titles and controls. Geist Mono for data: IDs,
  counts, dates, sizes, scores, kickers and chips. Geist Pixel is the identity accent only.
- **Compact and exact.** Controls are 32 px, UI text is 13 px, and spacing sits on a 4 px grid.

### Pixel accent (option B)

Pixel art is the product's identity, kept small. It appears in exactly three places:

- the logo mark and the `local-issue-classifier` wordmark in the top bar;
- one page heading, the Home H1, in Geist Pixel;
- the empty-state illustration (`IconEmptyBox`).

`tests/pixel-usage.test.ts` fails when `.u-pixel-font`, `--font-pixel` or a pixel-art icon
appears anywhere else. The kit page is exempt because it shows the specimens.

## Tokens

`src/ui/tokens.ts` is the single source of truth. It is the only file allowed to hold raw
colors, pixel sizes and durations: `tests/tokens-only.test.ts` fails on a hex, `px` or `ms`
literal in `src/ui`, `src/components`, `App.vue` or `style.css`.

- `tokensToCss(tokens, theme, selector?)` emits CSS custom properties for one theme, scoped to
  `:root[data-theme="light|dark"]` by default.
- `reducedMotionCss(tokens)` emits the `prefers-reduced-motion` override.
- `buildStylesheet(tokens)` combines both themes and the override. `installTokenStylesheet()`
  in `theme.ts` injects it once at startup.

| Group | Variables | Values |
|---|---|---|
| Spacing | `--space-1, 2, 2h, 3, 4, 5, 6, 7` | 4, 8, 12, 16, 24, 32, 48, 64 px. `2h` is the compact padding step. |
| Sizes | `--size-compact/default/large`, `--size-row` | 28 / 32 / 40, row 44 px |
| Icons | `--icon-sm/md/lg` | 16 / 20 / 32 px |
| Radii | `--radius-xs/sm/md/lg/round` | 4 (badges, kbd), 6 (small chips), 8 (inputs, buttons, cards), 12 (dialogs, popovers), 999 (pills) |
| Lines | `--line-thin/thick` | 1 px borders, 2 px focus ring |
| Elevation | `--elev-1/2/3` | Hairline-soft. `2` is for popovers and toasts, `3` for dialogs and the drawer. Cards use none. |
| Type | `--text-<step>-size/line`, `--tracking-micro/tight`, `--weight-*`, `--font-sans/mono/pixel` | See Typography. |
| Motion | `--dur-fast/base/slow/spin`, `--dur-fade-*`, `--ease-out/in/standard`, `--motion-shift/scale` | See Motion. |
| Measures | `--measure-tooltip/popover/toast/dialog/drawer/narrow/page/wide` | 280 / 360 / 400 / 520 / 440 / 640 / 880 / 1120 px |
| Layers | `--z-popover/toast/dialog` | 20 / 30 / 40 |

### Color roles and contrast

| Role | Light | Dark | Use |
|---|---|---|---|
| `bg` / `surface` / `surface-2` | `#FFFFFF` / `#FAFAFA` / `#F4F4F5` | `#09090B` / `#111113` / `#18181B` | Page, cards and inputs, hover and tracks |
| `border` / `border-strong` | `#E4E4E7` / `#8A8A93` | `#26262B` / `#6A6A74` | Decorative hairlines / text-field and checkbox boundaries |
| `text` / `text-muted` / `text-subtle` | `#18181B` / `#52525B` / `#67676F` | `#EDEDEF` / `#94949E` / `#81818B` | Primary, secondary, and kickers, headers and placeholders |
| `accent`, `accent-hover`, `accent-soft` | `#4F46E5`, `#4338CA`, `#EEF0FF` | `#8B93FF`, `#A5ABFF`, `#1C1D33` | Links, focus, active chips, selected rows |
| `inverse-surface`, `inverse-hover`, `on-inverse` | `#18181B`, `#3F3F46`, `#FAFAFA` | `#EDEDEF`, `#D4D4D8`, `#09090B` | Primary button, tooltip |
| `success` / `warning` / `danger` / `info` | `#15803D` / `#A15C07` / `#B91C1C` / `#1D4ED8` | `#4ADE80` / `#FBBF24` / `#F87171` / `#60A5FA` | Status text and icons |
| `level-*-fg/bg` | 5–10% tints of the status colors | darker tints | Level chips |
| `scale-1..5` | `#67676F` `#2563EB` `#975A06` `#C2410C` `#B91C1C` | `#8A8A94` `#60A5FA` `#FACC15` `#FB923C` `#F87171` | Heat ramp (cool to hot) for priority and relevance numbers |

`src/ui/tokens.test.ts` checks every pair in `CONTRAST_PAIRS` in both themes: at least 4.5:1
for text, and 3:1 for control boundaries and the focus ring. **The test is the authority.**
v2 made the suite stricter:

- `text-subtle` is checked as text on all three surfaces (tightest pair: 4.59:1 in dark on
  `surface-2`). It replaces the reference site's failing 3.7:1 gray.
- The heat scale `scale-1..5` renders as text, so it is checked as text on every surface, not
  only as a 3:1 bar.
- The primary button pairs (`on-inverse` on `inverse-surface` and `inverse-hover`) and the
  danger button (`danger` on `level-high-bg`) are checked.

Text fields keep a 3:1 `border-strong` boundary (WCAG 1.4.11), because an empty input is
identified only by its outline. Buttons and chips carry text, so they use the quiet `border`.
Color is never the only signal: level chips show a text label and a three-bar meter, score
pills show their number, and status labels show a word.

### Themes

`theme.ts` resolves the `'system' | 'light' | 'dark'` preference onto `<html data-theme>`.
The top-bar toggle cycles system, light and dark (`nextThemePreference()`) and saves the
preference. Settings offers the same choice as a segmented control.

## Typography

Geist, Geist Mono and Geist Pixel are self-hosted from `@fontsource-variable/geist`,
`@fontsource-variable/geist-mono` and `@fontsource/geist-pixel` (OFL-1.1). They are imported in
`main.ts` and bundled by Vite, with no CDN. Licenses are in `THIRD_PARTY_NOTICES.md`.

| Step | Size / line | Voice | Use |
|---|---|---|---|
| `micro` | 11 / 16, `+0.08em`, uppercase | mono (`.u-micro`) | Kickers, table headers, key names |
| `caption` | 12 / 16 | sans or mono | Hints, meta lines, chips |
| `table` | 13 / 20 | sans, mono for data | Controls, table cells |
| `body` | 15 / 24 | sans | Prose, ledes |
| `h3` | 17 / 24, 500 | sans | Card and section titles, dialogs |
| `h2` | 22 / 28, 500, `-0.02em` | sans | Analysis and Settings titles |
| `h1` | 36 / 40 | pixel | The Home heading only |

Use weights 400, 500 and 600 only, with no bold. Numbers use `tabular-nums` (`.u-tabular`,
`.u-mono`).

## Components

Every component takes props and emits events. None uses a store.

| Component | Recipe |
|---|---|
| `UiButton` | 32 px, 13 px medium, 8 px radius. **Primary** is the inverse surface (near-black on light, near-white on dark), not the accent. **Secondary** is a surface with a hairline that strengthens on hover. **Ghost** is muted text. **Danger** is danger text on a red tint. Press scales to 0.98. `loading` keeps the label for width and shows the `UiSpinner` arc. |
| `UiInput`, `UiSecretInput`, `UiSelect`, `UiSlider` | Shared `.ui-field` / `.ui-control` anatomy in `base.css`: caption label, 32 px control, subtle placeholder, 12 px hint. The secret input is mono with inline reveal and clear, and a mono status word. |
| `UiMultiSelect` | Looks like a select ("2 selected"). Removable chips sit inside, and the listbox is a 12 px-radius popover. |
| `UiSegmented` | A pill track radio group (`role="radiogroup"`, roving tabindex, arrow keys wrap). Used for theme and export scope. |
| `LevelBadge` | A 20 px tinted chip with a lowercase mono label and a CSS three-bar meter (`data-bars`). The stale variant is dashed. |
| `ScoreBar` | Score pill: a mono number in the heat color, a subtle `/100`, and an optional 3 px bar (`bar=false` for dense cells). |
| `ConfidenceBadge` | Mono percent with a `?` icon. Owns its own visibility (user decision 2026-09-24): renders only at confidence ≤ 0.50, so callers never pass `hideHigh`. Color is a continuous `color-mix` gradient from warning (0.50) to danger (0.01). The tooltip and `aria-label` state the confidence, the per-level probability breakdown when given, and suggest reviewing the issue. |
| `FilterChip` | A 28 px mono pill. Active is accent-soft with an accent border. |
| `UiDialog`, `UiPopover`, `UiTooltip`, `UiToast` | 12 px radius, hairline border, `elev-2`/`elev-3`. The dialog footer sits on a surface band under a hairline. The tooltip is the inverse surface. |
| `EmptyState` | No frame: 64 px monochrome pixel art in `text-subtle`, a sans title, one sentence, at most one action. |
| `UiSpinner` | A 16 px stroke arc that turns once per `--dur-spin`, static under reduced motion. |

`base.css` also holds `.ui-table` (micro mono headers, 44 px rows, hairline dividers, mono
`--mono` cells and a `--title` cell), `.u-mono`, `.u-micro`, `.ui-kbd` and the focus ring.
`IssueTable` and the kit's density specimen both use `.ui-table`.

**Kit page.** `KitPage.vue` + `KitShowcase.vue` load only when `import.meta.env.DEV` and the URL
has `?kit`. They render both themes side by side (theme tokens scoped to `[data-kit-theme]`),
have a "Force reduced motion" switch, and include a real-size density table built from kit
parts. A production build contains no kit code.

## Screens

- **Shell.** A 56 px hairline top bar on `bg` holds the pixel logo, the wordmark, a mono nav
  (`analyses`, `settings`, with `aria-current`) and the theme toggle.
- **Home.** The pixel H1 and a lede, a mono stepper, the repository loader, a "Saved analyses"
  kicker with the storage meter, and flat cards with a mono key/value list. Card actions appear
  on hover or focus and are always visible on touch.
- **Analysis.** A breadcrumb, then the title with a mono meta line, Refresh and Export. Below
  them sits the classify bar as one panel, then the filters (search row, facet grid, folded
  ranges) and the table. The table hides Complexity, Confidence and Comments by default.
  The **Columns** menu re-enables them, and the choice is saved per analysis in its working
  state (`visibleColumns`, normalized by `src/domain/columns.ts`). The detail drawer is a
  440 px right sheet with micro section kickers.
- **Settings.** A heading with mono key-status pills, then two-column hairline sections (Keys,
  Classifier, Hardware, Preferences, Local data, About). Classifier mounts `ProviderSelector`
  (TypeSafe cloud or a local Kev/JevK5 server, plus the batching mode/trimming floor under
  Advanced); Hardware mounts `HardwareFitPanel` with a "Use Kev locally" action (WIRE-2).
- **Export dialog.** Labelled rows for Scope (segmented, with a count), Include, Order and a mono
  Preview.

## Motion

- Durations: `dur-fast` 120 ms (press, row hover), `dur-base` 160 ms (hover, state, popovers),
  `dur-slow` 240 ms (dialogs, toasts), `dur-spin` 800 ms (one spinner turn).
- Easings: `ease-out` (`cubic-bezier(0.2, 0.9, 0.3, 1)`) to enter, `ease-in` to leave, and
  `ease-standard`.
- Only opacity, transform and colors animate. The focus ring appears instantly. Scores, sorting
  and filtering never animate.
- **Reduced motion.** The CSS override sets every `--dur-*` to 0 ms, caps `--dur-fade-*` at
  80 ms, sets `--motion-shift` to 0 and `--motion-scale` to 1. `useReducedMotion()` gives JS
  timings the same answer.

## Icons

Every UI icon is an original 24-grid line icon under `design/icons/stroke/`. The logo and the
empty-state box are original pixel art under `design/icons/pixel/`. Both sets are MIT. No
third-party icons are bundled, and GitHub's mark is not redrawn (the repository icon is a
generic book).

`scripts/build-icons.mjs` (`pnpm icons`) reads both directories and, per file, strips anything
unsafe (scripts, handlers, links, ids, styles), enforces a `viewBox` and recolors to
`currentColor`. It then writes `src/assets/icons/Icon<Name>.vue`:

- **stroke** mode renders at 16 px with `fill="none"`, `stroke-width="1.5"`, round caps and
  joins, and `shape-rendering="geometricPrecision"`;
- **pixel** mode renders at its grid size with `fill="currentColor"` and `crispEdges`.

`tests/icons.test.ts` checks the normalizer, both render modes, that the committed output
matches a fresh build, and that only the logo and the empty-state box are pixel art.

### How to add an icon

1. Draw it on a 24×24 grid with plain paths, circles or rects and no fills or stroke
   attributes. The pipeline adds the 1.5 stroke.
2. Save it as `design/icons/stroke/<kebab-name>.svg`.
3. Run `pnpm icons` and commit the SVG plus the generated `Icon<Name>.vue` and `index.ts`.
4. Use it at 16 px (UI) or 20 px (headers). Decorative icons stay `aria-hidden`, and an
   icon-only button needs an `aria-label`.

New pixel art is out of scope unless it replaces the logo or the empty-state illustration.
