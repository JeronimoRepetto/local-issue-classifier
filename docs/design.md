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
| `warning-soft` / `danger-soft` / `info-soft` | `#F6F2EF` / `#F9F0EF` / `#EEF2F9` | `#1A1816` / `#1B1617` / `#15171C` | `UiCallout` tint backgrounds — a 5% `color-mix(in oklab, …)` of the matching tone into `surface` (`src/ui/colorMix.ts`; see `UiCallout` above). 5%, not the usual 8–10%, because `warning` on `surface` is already near the 4.5:1 AA floor in the light theme, and a bigger tint pulls the background toward `warning`'s low luminance below AA. |
| `scale-1..5` | `#67676F` `#2563EB` `#975A06` `#C2410C` `#B91C1C` | `#8A8A94` `#60A5FA` `#FACC15` `#FB923C` `#F87171` | Heat ramp (cool to hot) for priority and relevance numbers |
| `icon-social` | `#000000` | `#FFFFFF` | GitHub and LinkedIn app-bar links — both marks now use black/white per theme |
| `brand-linkedin-mark` | `#000000` | `#FFFFFF` | LinkedIn app-bar link — the official [in] Logo, unaltered (see "Icons" below); not `icon-social`, since brand guidelines fix its color |

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

The app-bar social icons now use black (`#000000`) in the light theme and white (`#FFFFFF`) in
the dark theme — matching the LinkedIn mark for visual consistency (icons, not text, so WCAG 1.4.11's
3:1 non-text-contrast minimum applies): `#000000` on `#FFFFFF` is 21:1 in light, and `#FFFFFF` on
`#09090B` is 21:1 in dark, both `>= 3:1`. This superseded the earlier `#7F7F81` (grey) decision
from 2026-09-24 to align both marks. `icon-social` is checked by the same `CONTRAST_PAIRS` suite as
every other role (`{ fg: 'icon-social', bg: 'bg', kind: 'ui' }`), so a future palette change cannot
silently regress it below 3:1.

`brand-linkedin-mark` (`#000000` light / `#FFFFFF` dark) is deliberately *not* in
`CONTRAST_PAIRS`. WCAG 1.4.11's own scope note excludes logotypes from the non-text-contrast
requirement, and LinkedIn's `[in]` Logo guidelines fix the mark to one of exactly three
approved colors (blue, black, white) regardless of what sits behind it — there is no
palette-driven ratio to check, unlike `icon-social`, which this project is free to retune.

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
| `UiCallout` | Prominent, tone-colored critical information (`tone: 'info' \| 'warning' \| 'danger'`, optional `title`, a slot for the body). A leading icon (`IconInfo` for info, `IconWarning` for both warning and danger — there is no separate danger glyph), border and text all use the tone token (`--color-info/warning/danger`); the background is `color-mix(in oklab, var(--color-<tone>) 5%, var(--color-surface))`. **Tone rule**: `danger` is something that will actively fail (wrong Python version, a missing required tool) and gets the assertive `role="alert"`; `info` and `warning` are read-along cautions (prerequisites, an optional-but-slower path, a reminder) and get the passive `role="note"` so they never interrupt. Used by `LocalSetupGuide` and `ProviderOnboardingCard` for exactly four notes: prerequisites (warning), the GPU-optional caveat (warning), the CUDA/`--no-sync` reminder (warning), and what plainly will not work (danger). |
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
third-party icons are bundled here, and elsewhere in the kit GitHub's mark is still not redrawn
(the repository icon, e.g. in RepoInput, is a generic book) — with one narrow, documented
exception: the app-bar GitHub link (below).

`scripts/build-icons.mjs` (`pnpm icons`) reads both directories and, per file, strips anything
unsafe (scripts, handlers, links, ids, styles), enforces a `viewBox` and recolors to
`currentColor`. It then writes `src/assets/icons/Icon<Name>.vue`:

- **stroke** mode renders at 16 px with `fill="none"`, `stroke-width="1.5"`, round caps and
  joins, and `shape-rendering="geometricPrecision"`;
- **pixel** mode renders at its grid size with `fill="currentColor"` and `crispEdges`.

`tests/icons.test.ts` checks the normalizer, both render modes, that the committed output
matches a fresh build, and that only the logo and the empty-state box are pixel art.

### App-bar brand icons (2026-09-24, LinkedIn mark added 2026-09-24, Ko-fi link added 2026-09-24)

The app bar's "Source code on GitHub" / "Author on LinkedIn" links (`src/App.vue`, 20 px) are
the one deliberate exception to "no third-party icons": each renders its own service's real
mark, so the link is recognizable at a glance. Both are hand-inlined (`src/ui/GitHubMarkIcon.vue`,
`src/ui/LinkedInMarkIcon.vue`), not generated by `scripts/build-icons.mjs` — that pipeline's two
paint modes (`stroke`'s `fill="none"` outline, `pixel`'s blocky `crispEdges`) both distort a
smooth filled brand glyph, so neither fits. Both files are kept out of `src/assets/icons/` for
the same reason: `tests/icons.test.ts`'s "regenerates exactly the committed icons" check only
knows about generator output, and a hand-written file in that directory would break it.

- **GitHub** uses `--color-icon-social` (the shared app-bar grey, `currentColor`): GitHub's
  license (Simple Icons, CC0 1.0) puts no color constraint on the mark.
- **LinkedIn** uses its own fixed `--color-brand-linkedin-mark` token instead — `#000000` in
  light, `#FFFFFF` in dark — because LinkedIn's `[in]` Logo brand guidelines
  (https://brand.linkedin.com/in-logo, "Please Do Not: Modify the color or the shape of the
  `[in]` Logo. You may only use the approved color variations provided for download") forbid
  recoloring the mark at all, including to match `icon-social`. `LinkedInMarkIcon.vue` reproduces
  the shape unaltered — path data taken verbatim from that same guidelines page's own inline
  `inbug-blue-28` SVG symbol (its own nav/footer logo, so first-party LinkedIn artwork, not a
  third-party redraw) — in exactly the two color variants LinkedIn's own `in-logo.zip` download
  ships as pure black/white PNGs. See `THIRD_PARTY_NOTICES.md` ("Brand icons") for the full
  sourcing note, the guideline URLs, and why this supersedes the 2026-09-24 decision below to
  use the generic `IconExternalLink` instead.
- **Ko-fi** ("Support the author on Ko-fi") is the one link of the three that does *not* render
  Ko-fi's own logo: `src/ui/KofiMarkIcon.vue` renders an **original** coffee-mug icon
  (`design/icons/stroke/coffee.svg`, MIT), generated through the normal
  `scripts/build-icons.mjs` stroke pipeline — unlike the two hand-inlined marks above — and
  colored with the shared `--color-icon-social` token, same as GitHub. Ko-fi's own brand-assets
  page offers no monochrome variant to recolor, and its Terms broadly restrict trademark use
  and forbid modifying downloaded assets, unlike LinkedIn's guidelines; a Streamline coffee-mug
  icon considered earlier was rejected for the same licensing reason the Streamline Pixel set
  was (see "Icon source decision" below). See `THIRD_PARTY_NOTICES.md` ("Ko-fi support link")
  for the full sourcing note and evidence.

Earlier note, kept for history: **as of 2026-09-24, LinkedIn had no bundled brand mark.**
Simple Icons — the CC0 source used for the GitHub mark — does not offer one: its own icon data
had zero LinkedIn entries, and its public issue tracker showed repeated LinkedIn icon requests
closed `won't add` / `permissions in review`. That was a reasonable read of Simple Icons
specifically, not of LinkedIn's own guidelines (which Simple Icons never claimed to reproduce
anyway); once LinkedIn's own guidelines site was checked directly (same day), it turned out to
freely permit exactly this use ("As a hyperlink to your LinkedIn profile, company page, and/or
group page") and to ship the mark itself as inline SVG on its own page — hence the mark above.

### How to add an icon

1. Draw it on a 24×24 grid with plain paths, circles or rects and no fills or stroke
   attributes. The pipeline adds the 1.5 stroke.
2. Save it as `design/icons/stroke/<kebab-name>.svg`.
3. Run `pnpm icons` and commit the SVG plus the generated `Icon<Name>.vue` and `index.ts`.
4. Use it at 16 px (UI) or 20 px (headers). Decorative icons stay `aria-hidden`, and an
   icon-only button needs an `aria-label`.

New pixel art is out of scope unless it replaces the logo or the empty-state illustration.
