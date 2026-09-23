# Redesign brief: design system v2

Status: **approved 2026-09-23 with option B.** Hiding secondary table columns is approved, with a
persisted "Columns" menu. Product name: **local-issue-classifier**.

Screenshots (all under `docs/redesign/`):

| File | What it shows |
|---|---|
| `reference-home-dark.png`, `reference-home-light.png` | canirun.ai home ("Best picks") in both themes |
| `reference-models-dark.png` | canirun.ai `/models`: grade meter, filter bar, dense list |
| `current-home-dark.png`, `current-home-light.png` | Our Home, empty state, both themes |
| `current-kit.png` | Our `?kit` page (light and dark side by side, top half) |

**How the reference was captured.** `www.canirun.ai` sits behind a Cloudflare bot challenge, so
WebFetch returns 403 and headless browsers get the challenge page. The reference screenshots
come from the public repository (`midudev/canirun.ai`, `main`, cloned on 2026-09-23) running
locally with `astro dev`. The styling matches the live site's source. Hardware detection in a
headless browser reports "Microsoft Basic Render Driver", so the numbers in those screenshots
mean nothing.

**License.** The repository has no license (the GitHub API returns `"license": null`), so all
rights are reserved. We take inspiration from the look only. We do not copy its CSS, markup,
SVG icons, logo, fonts from its repo, or text. Every value below is ours, and it was checked
against our own contrast test rather than lifted. Colors and general layout ideas cannot be
protected. Code, icon files and copy can.

---

## 1. Reference analysis (measured)

Sources: `src/styles/global.css` (the `@theme` block and the light overrides),
`src/layouts/Layout.astro`, `astro.config.mjs` (fonts), `src/components/ModelListContent.astro`
(cards, filter bar, grade meter) and `src/icons/*.svg`.

### Tokens as measured

| Group | Dark (default) | Light (`html.light`) |
|---|---|---|
| Page `surface` | `#000000` | `#ffffff` |
| `surface-raised` | `#0a0a0a` | `#f8f8fa` |
| `surface-card` | `#111111` | `#f0f0f3` |
| `surface-hover` | `#181818` | `#e6e6ea` |
| `edge` / `edge-subtle` (borders) | `#222222` / `#1a1a1a` | `#d1d1d6` / `#e0e0e4` |
| Text `primary` / `secondary` / `muted` | `#ededef` / `#8a8a97` / `#6e6e78` | `#18181b` / `#52525b` / `#a1a1aa` |
| Accent (one hue: green) | `#22c55e` (dim `#16a34a`) | `#16a34a` (dim `#15803d`) |
| Status | warning `#f59e0b`, danger `#ef4444`, info `#3b82f6` | `#d97706`, `#dc2626`, `#2563eb` |
| Grades S/A/B/C/D/F | `#22c55e` `#4ade80` `#a3e635` `#f59e0b` `#f97316` `#ef4444` | `#15803d` `#16a34a` `#4d7c0f` `#b45309` `#c2410c` `#b91c1c` |
| Easing | `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, 160 ms on color, border and background | same |

- **Fonts** (self-hosted woff2, all from Vercel's Geist family, OFL-1.1): Geist Sans 300–700,
  Geist Mono 400/500, and **Geist Pixel Square**. Pixel is used for the page H1 ("Can I run AI
  locally?"), model names on cards and the wordmark. Mono is used for every number, label,
  pill, select, kicker and nav link. Sans is used for prose and list titles.
- **Type scale.** Sizes are small and exact: 10 px (uppercase spec labels, `letter-spacing
  0.08em`), 11 px (kickers at `0.16em`, grade chips), 12–13 px (mono pills, selects, values),
  15 px (summary line), 1.05 rem (lede), and `clamp(1.85rem, 4.6vw, 2.75rem)` for the pixel H1
  at `line-height 1.05` and `letter-spacing -0.02em`. Numbers use `tabular-nums`.
- **Radius.** 4 px on tiny badges, 6 px on selects and code, 8 px on inputs, buttons, tooltips
  and cards (`rounded-lg`), 10–12 px on menus, and 999 px on pills and segmented tabs.
- **Borders over shadows.** 1 px borders at low contrast (`#222` on `#000`), often at 60%
  opacity (`border-edge/60`). Shadows appear only on floating layers (tooltip
  `0 4px 16px rgb(0 0 0 / .25)`, menus `0 8px 30px`). Cards have no shadow.
- **Card and row anatomy.** `p-4 pb-3`, a 20 px logo and a pixel-font name, tiny 20 px icon
  badges (`border color/20`, `bg color/5`, 12 px icon), and a footer with an uppercase mono
  status label and a muted score. In list mode, rows are about 47 px tall, divided by hairlines,
  with columns for name, type, a VRAM bar (3 px), tok/s, and a colored `69/100` score.
- **Grades.** A grade is a single colored **letter** or number in mono, never a filled block.
  Summary: "32 of 104 models fit comfortably", a 3 px segmented meter, and a row of colored
  counts ("A 12 · B 20 · …").
- **Filters.** A 36 px (`2.25rem`) search field with a `/` kbd hint, then selects of the same
  height in mono 13 px, 8 px radius, `surface-card` background and 1 px `edge` border.
  Sort sits on the right.
- **Composition.** A 55 px top bar with the wordmark and mono nav links, no background band,
  just a hairline under it. A centered hero (pixel H1, lede, mono pills). The detection panel
  is a borderless grid of label/value pairs. Then a segmented control ("Best picks / Browse
  all"), then the content in a max ~1100 px column. There is a very faint radial accent glow
  (10% accent) behind the hero.
- **Icons.** 24-unit viewBox, `stroke="currentColor"`, **stroke-width 1.5** (a few at 2),
  round caps and joins, and shown small (12–16 px). The logo alone is pixel blocks (4-unit
  squares in two greens).
- **Motion.** Only color, border and opacity change, over 160–250 ms, with a fade-in for
  results (`translateY(4px)`, 250 ms). Presses scale to 0.97. Everything is disabled under
  `prefers-reduced-motion`.
- **Themes.** Dark by default, `color-scheme` set, light via a class, following the system when
  nothing is stored.

### Why it reads as refined

1. **Near-monochrome surfaces.** Four grays about 3–7% apart, with color kept for meaning
   (grades, accent). Nothing large is tinted.
2. **Hairline structure.** Low-contrast 1 px borders and dividers do the layout work instead of
   filled bands, shadows or boxes.
3. **Mono for data.** Numbers, labels and controls in Geist Mono at 11–13 px give a precise,
   instrument-like texture, while prose stays in sans.
4. **Small, consistent control heights** (32–36 px) and **small type** (13 px UI), set on
   generous page whitespace.
5. **The pixel font appears where it counts:** the H1, the wordmark and model names. Geist
   Pixel is a fine-grained, mixed-case pixel face that matches Geist's metrics, so it feels
   typographic rather than retro.
6. **Color as text, not fill.** Grades and scores are colored glyphs. Badges are 5–10% tints.

**What not to copy, even aside from the license.** Its `muted` text fails AA: `#6e6e78` on
`#111111` is 3.74:1, and light `#a1a1aa` on white is 2.56:1. We keep our AA contract.

---

## 2. Gap analysis: top 10 reasons ours feels coarse

1. **Silkscreen display type.** Silkscreen is an all-caps, wide, 8-bit face, used at h1/h3 size
   for the wordmark, the Home H1 ("ANALYSES") and empty-state titles. It is the loudest element
   on every screen and reads as retro, not refined. Files: `src/App.vue` (`u-pixel-font`
   wordmark), `HomeContainer.vue` (`.home__title`), `EmptyState.vue`, and `base.css`
   (`.u-pixel-font` with `-webkit-font-smoothing: none`).
2. **Chunky filled pixel icons everywhere.** The 16×16 filled glyphs with `crispEdges` (the
   gear in the top bar, button icons, the repo prefix in inputs, level signal bars) are heavy
   next to 14 px Inter, and their weight varies between sizes. See `design/icons/custom/*` (27
   files), `src/assets/icons/*` and the kit's icon grid in `current-kit.png`.
3. **Saturated lavender accent used as fill.** In dark mode the primary button is `#9A9AF2`
   with `#111318` text: a big, pastel, low-tension block (see `current-home-dark.png`).
   `scale-*` is five shades of that same violet (`tokens.ts`).
4. **Banded chrome.** The top bar sits on `surface-2` and the keys banner is a full-width boxed
   `surface-2` slab with its own border (`App.vue` `.app-shell__top-bar`,
   `KeysRequiredBanner.vue`). That makes three stacked bands before any content.
5. **Bluish dark surfaces with little range.** `#111318` / `#1A1D24` / `#232733` are navy-tinted.
   Next to the violet accent, the whole UI goes purple-gray. There is no true neutral.
6. **Heavy control borders.** Inputs, selects, chips and secondary buttons all use
   `border-strong` (`#7E8494` / `#6B7186`, 3.5–3.7:1) at rest (`base.css` `.ui-control`,
   `FilterChip.vue`, `UiButton.vue` secondary). Every control reads as outlined in gray pencil.
   The reference uses a quiet border at rest and a stronger one on hover and focus.
7. **Mixed radii and oversized controls.** 40 px default controls with a 4 px radius
   (`.ui-control`, `FilterChip`, `LevelBadge`) sit next to 8 px buttons and cards. The empty-state
   frame is 0 px (`radius-pixel`). Filters and table toolbars feel bulky at 40 px.
8. **No mono and no numeric typography layer.** IDs (`#123`), scores, dates, counts and sizes are
   Inter at the same size and color as prose (`IssueRow.vue`, `AnalysisCard.vue` meta and
   counts). The one mono token (`--font-mono`) is a system stack and unused in the UI.
9. **Filled badges that cost width and add noise.** `LevelBadge` is a 24 px filled block, a
   12 px semibold label and a signal glyph, repeated in 3 columns × N rows (`IssueRow.vue`,
   `LevelBadge.vue`). With 14 columns (`IssueTable.vue` `COLUMNS`) the table becomes a wall of
   colored rectangles. `ScoreBar` adds an 8 px violet bar with square ends.
10. **Weak hierarchy and rhythm on Home and in cards.** The Home H1 is the only large element.
    `AnalysisCard` prints three caption lines of `·`-joined metadata with no key/value
    structure, and the Rename/Refresh/Delete buttons are always visible
    (`AnalysisCard.vue`). The empty state is a 160 px gray box holding a lavender pixel
    drawing (`EmptyState.vue`, 128 px art at 4×). The footer's storage meter floats far from
    its context (`HomeContainer.vue` `.home__footer`).

Also worth noting: the theme toggle is missing from the top bar (the settings gear is the only
chrome), and `docs/design.md` mandates Silkscreen and pixel icons. That document becomes v2 in
phase 2.

---

## 3. Design system v2

### 3.1 Principles

1. Neutral surfaces, one accent, and color reserved for meaning.
2. Structure from hairlines and space, not boxes and shadows.
3. Three type roles: **Sans** for prose, **Mono** for data and controls, and **Pixel** only for
   the wordmark and page H1 (option B).
4. Compact and exact: 32 px controls, 13 px UI text, a 4 px grid.
5. AA stays a hard gate. `tokens.test.ts` stays the authority.

### 3.2 Color tokens

All pairs below were computed with the WCAG formula and **pass** the existing
`CONTRAST_PAIRS` rules (4.5:1 text, 3:1 UI), plus the new pairs marked ★. The ratios quoted are
the tightest pair for each role.

| Role | Light | Dark | Notes |
|---|---|---|---|
| `bg` | `#FFFFFF` | `#09090B` | Page. Dark is near-black neutral (zinc), not navy. |
| `surface` | `#FAFAFA` | `#111113` | Cards, table, inputs. |
| `surface-2` | `#F4F4F5` | `#18181B` | Hover, header row, segmented track. |
| `border` | `#E4E4E7` | `#26262B` | Decorative hairlines (1.2:1, outside the pairs as today). |
| `border-strong` | `#8A8A93` | `#6A6A74` | Control boundary on hover and focus, checkboxes. 3.11 / 3.31 on `surface-2`. |
| `text` | `#18181B` | `#EDEDEF` | |
| `text-muted` | `#52525B` | `#94949E` | Secondary prose. 7.0 / 5.9 on `surface-2`. |
| `text-subtle` ★ | `#67676F` | `#81818B` | Kickers, column headers, placeholders. 5.1 / 4.59 on `surface-2`. This is the AA-safe version of the reference's `muted`. |
| `accent` | `#4F46E5` | `#8B93FF` | Indigo. Kept as our identity hue, deliberately not the reference's green: green is our `low` level. 5.7 / 6.5. |
| `accent-hover` | `#4338CA` | `#A5ABFF` | |
| `accent-soft` | `#EEF0FF` | `#1C1D33` | Active chip, selected row. |
| `on-accent` | `#FFFFFF` | `#09090B` | |
| `success` / `warning` / `danger` / `info` | `#15803D` / `#A15C07` / `#B91C1C` / `#1D4ED8` | `#4ADE80` / `#FBBF24` / `#F87171` / `#60A5FA` | |
| `danger-hover`, `on-danger` | `#991B1B`, `#FFFFFF` | `#FCA5A5`, `#09090B` | |
| `inverse-surface` / `on-inverse` | `#18181B` / `#FAFAFA` | `#EDEDEF` / `#09090B` | Tooltip, **and the primary button** (see recipes). |
| `level-high-fg/bg` | `#B91C1C` / `#FEF2F2` | `#F87171` / `#2A1414` | 5–10% tints. |
| `level-medium-fg/bg` | `#A15C07` / `#FFFBEB` | `#FBBF24` / `#2A2110` | |
| `level-low-fg/bg` | `#15803D` / `#F0FDF4` | `#4ADE80` / `#10261A` | |
| `scale-1..5` | `#67676F` `#2563EB` `#975A06` `#C2410C` `#B91C1C` | `#8A8A94` `#60A5FA` `#FACC15` `#FB923C` `#F87171` | **Heat ramp** for priority and relevance, from cool to hot. Now used as **text** (colored score numbers), so ★ it gains text pairs on every surface, not just the current 3:1 UI pair. |
| `overlay` | `rgba(9, 9, 11, 0.4)` | `rgba(0, 0, 0, 0.7)` | |

Test impact: `COLOR_ROLES` gains `text-subtle`. `CONTRAST_PAIRS` gains `text-subtle` on
`bg`/`surface`/`surface-2`, the `scale-*` roles as `text` on the three surfaces, and
`inverse-surface` as the primary button (`on-inverse` on it already exists). The suite gets
stricter, not weaker.

### 3.3 Typography

| Candidate | Verdict |
|---|---|
| **Geist Sans + Geist Mono (+ Geist Pixel)** (Vercel, OFL-1.1; `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`, `@fontsource/geist-pixel`, all OFL-1.1 per the npm registry) | **Recommended.** One family with matched metrics across sans, mono and pixel, so the pixel accent feels typographic. The mono is excellent for tabular data. This is the texture the user is pointing at. |
| Inter (installed today) | Excellent sans, but it has no matching mono or pixel sibling, and it is the "default SaaS" look. Pairing it with JetBrains Mono works, but the metrics don't match. |
| IBM Plex Sans + Mono | A coherent pair, but heavier and more corporate. Its wide mono costs table width. |
| Space Grotesk (+ Space Mono) | Characterful display face, but quirky at 13 px UI sizes. Space Mono is too stylized for data columns. |

We self-host through `@fontsource`, which Vite bundles (no CDN, CSP-safe). We **remove**
`@fontsource-variable/inter` and `@fontsource/silkscreen`, and update
`THIRD_PARTY_NOTICES.md`.

Roles:
`--font-sans: 'Geist Variable', system-ui, …`
`--font-mono: 'Geist Mono Variable', ui-monospace, 'Cascadia Mono', …`
`--font-pixel: 'Geist Pixel Square', var(--font-mono)` (option B only)

| Step | Size / line | Font | Use |
|---|---|---|---|
| `micro` ★ | 11 / 16, `+0.08em`, uppercase | mono | Kickers, table headers, spec labels |
| `caption` | 12 / 16 | sans or mono | Hints, meta |
| `ui` ★ (replaces `table`) | 13 / 20 | sans. Mono for data | Controls, table cells, badges |
| `body` | 15 / 24 | sans | Prose, dialogs (down from 16) |
| `h3` | 17 / 24, weight 500 | sans | Card titles, section heads |
| `h2` | 22 / 28, weight 500, `-0.01em` | sans | Dialog titles, Analysis title |
| `h1` | 36 / 40, `-0.02em` | pixel (B) or sans 600 (A) | One per page |

Weights are 400, 500 and 600, with no bold. All numbers use `tabular-nums`, and IDs, counts,
dates, sizes and scores are **mono**.

### 3.4 Space, size, radius, line, elevation

- **Space:** a 4 px grid, `space-1..8` = 4, 8, 12, 16, 24, 32, 48, 64. This inserts 12 so that
  compact padding stops jumping from 8 to 16. `space-3` changes meaning, and callers get
  migrated.
- **Control sizes:** `compact` 28, `default` **32**, `large` 40, `row` **44** (table rows keep a
  44 px touch-friendly target but look lighter).
- **Radius:** `xs` 4 (badges, kbd), `sm` 6 (checkbox, small chips), `md` 8 (inputs, buttons,
  cards, table frame), `lg` 12 (dialogs, popovers, drawer), and `round` 999 (pills, segmented,
  score pills). **`pixel` 0 is removed** from UI use.
- **Lines:** `thin` 1, `thick` 2 (focus ring only).
- **Elevation:** cards are flat (border only). `elev-1` is gone from cards. `elev-2` is for
  popovers, menus and toasts (light `0 4px 16px rgb(9 9 11 / .08)`, dark `0 4px 16px rgb(0 0 0
  / .4)` plus a 1 px border). `elev-3` is for dialogs and the drawer.
- **Focus:** a 2 px `accent` ring at 2 px offset, instant. We keep the current rule.

### 3.5 Motion

- Durations: `fast` 120, `base` **160** (hover and state), `slow` 240 (dialog, drawer, toast).
- Easing: `ease-out` becomes an expo-like out curve (we choose our own:
  `cubic-bezier(0.2, 0.9, 0.3, 1)`). `ease-pixel` stays only for the spinner sprite if option B
  keeps it.
- Enter: opacity plus `translateY(4px)`, no scale. Press: `scale(0.98)` on buttons and pills.
- We keep the reduced-motion contract (`reducedMotionCss`) unchanged.

### 3.6 Component recipes

All controls default to 32 px, 13 px, and `radius-md`. At rest the border is `border`, and on
hover it moves to `border-strong`. Focus shows the ring.

| Component | Recipe |
|---|---|
| **Button primary** | `inverse-surface` background with `on-inverse` text (black-on-white or white-on-black), weight 500, 12 px padding. On hover, 90% background via a precomputed `inverse-hover` token. The accent is **not** a button fill. |
| **Button secondary** | `surface` background, `border`. On hover, `surface-2` and `border-strong`. |
| **Button ghost** | Transparent, `text-muted`. On hover, `surface-2` and `text`. |
| **Button danger** | `danger` text on a `level-high-bg` tint with a `danger`-at-30% border. Solid `danger` only inside the confirm dialog. |
| **Icon button** | 32×32 ghost, 16 px stroke icon, `aria-label` required (existing warning). |
| **Input / select** | `surface` background, `border`, mono placeholder in `text-subtle`, 16 px prefix icon in `text-subtle`, an optional right-side `kbd` hint (`/`). Error: a `danger` border plus a 12 px message. |
| **Secret input** | Same field in mono with masked dots. Reveal and clear are 28 px ghost icon buttons inside the field. The status is a dot plus a mono word ("untested / checking / ok / invalid") on the right of the label row. "Kept in memory only" is a `micro` hint with a lock icon. |
| **Multi-select** | The trigger looks like a select and shows "3 selected" in mono. Chips are shown below, not inside. |
| **Level chip** | 20 px tall, `radius-xs`, `level-*-bg` tint, `level-*-fg` text, 12 px mono lowercase label ("high"), and a **6 px dot** in place of the pixel signal glyph. The text label remains, so color is never the only signal. Stale: dashed 1 px border and `text-subtle`. |
| **Score pill** (priority, relevance) | Mono tabular number colored with `scale-N`, then `/100` in `text-subtle`, with an optional 3 px bar (48 px track, `radius-round`) below or beside it in rows. Example: `82/100`. This replaces the `ScoreBar` 8 px violet slab. |
| **Confidence** | Hidden when high. Medium or low shows a mono `72%` in `warning` with a `?` tooltip. No box. |
| **Filter chip** | 28 px pill (`radius-round`), mono 12 px, `surface` background, `border`. Active: `accent-soft` background, `accent` text and border. Summary chip: "+3 filters", dashed. |
| **Segmented control** ★ | 32 px pill track in `surface-2` with a `surface` thumb. Used for "open / closed / all" and view toggles. |
| **Table row** | 44 px. Cells are 13 px. `#number`, dates and counts in mono `text-muted`. Title in sans `text` with 11 px label chips (`radius-xs`, `border`, no fill). Hairline `border` divider. Hover `surface-2`. Selected: `accent-soft` with a 2 px accent inset on the left edge. The header row is `micro` uppercase mono in `text-subtle`, not a filled band. |
| **Card** (analysis) | `surface`, `border`, `radius-md`, 16 px padding, **no shadow**. Title in h3 sans. Metadata as a key/value grid in mono (`micro` key, `ui` value). Actions are ghost icon buttons that appear on hover or focus-within; they stay reachable by keyboard and always show on touch. Whole-card hover: `border-strong`. |
| **Dialog** | `radius-lg`, `surface`, `elev-3`, 24 px padding, h2 title. Footer right-aligned with secondary and primary buttons, separated by a hairline. The scrim is `overlay`. |
| **Popover / menu** | `radius-lg`, `surface`, `border`, `elev-2`, 4 px inner padding. Items are 32 px with a 6 px radius. |
| **Tooltip** | `inverse-surface`, 12 px sans, `radius-sm`, 6×10 padding, max 280. |
| **Toast** | Bottom-right, `surface` with `border` and `elev-2`, and a 3 px left edge or a leading dot in the status color. The message is 13 px. The dismiss button is ghost. |
| **Banner** (keys) | Inline, not full-bleed: a `radius-md` box inside the content column with an `info` dot, 13 px text and a ghost dismiss. |
| **Empty state** | No frame. A 48 px mark (option A: stroke icon; B: small monochrome pixel mark in `text-subtle`), h3 title in sans (A) or pixel at 20 px (B), one line in `text-muted`, one secondary action. |
| **Progress** | A 3 px `radius-round` track in `surface-2` with an `accent` fill, a mono `42 / 120` counter on the right, and a `micro` phase label on the left. The spinner is a 16 px stroke arc (A) or the existing stepped sprite (B). |
| **Summary meter** ★ | Reference-inspired "N of M issues classified" line plus a 3 px segmented meter by level, and mono counts colored per level. |

### 3.7 Icons

A new set of about 27 icons redrawn as **our own** 24-unit SVGs: 1.5 stroke, round caps and
joins, `currentColor`, no fills, and shown at 16 px (UI) or 20 px (empty states). MIT, drawn in
`design/icons/stroke/`. We don't copy canirun's or anyone else's paths. They are plain
geometric primitives, like Feather-style shapes drawn from scratch. The generator
(`scripts/build-icons.mjs`) needs a stroke mode: keep `stroke`/`stroke-width`, set
`fill="none"`, and emit `shape-rendering="geometricPrecision"` instead of `crispEdges`.
`tests/icons.test.ts` changes to match.

### 3.8 Page compositions

**Shell.** A 56 px top bar on `bg` (no band) with a hairline under it. On the left: logo mark
plus wordmark. On the right: a mono nav (`analyses`, `settings`) and a theme toggle (sun/moon)
icon button. The content column is at most 1120 px (Analysis) or 880 px (Home, Settings), with
24 px gutters and 16 px on mobile.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ▪ issue-criticity                          analyses  settings   ☾    │
├──────────────────────────────────────────────────────────────────────┤  hairline
│                         Triage issues locally.                        │  pixel H1 (B)
│        Score criticality, effort and relevance with calibrated Jev.   │  lede, muted
│                                                                       │
│   ○ keys   ○ repository   ○ classify                (micro, mono)     │  onboarding
│ ┌─────────────────────────────────────┐ ┌──────────┐ ┌─────────────┐  │
│ │ ⌕ owner/repo or github URL        / │ │ open  ▾  │ │ New analysis│  │  32 px row
│ └─────────────────────────────────────┘ └──────────┘ └─────────────┘  │
│  SAVED ANALYSES                                         0.4 / 5.0 MB  │  micro + meter
│ ┌──────────────────────────────┐ ┌──────────────────────────────┐    │
│ │ vuejs/core            ⟳ ✎ 🗑 │ │ vitejs/vite                  │    │  cards 2-up
│ │ ISSUES 412  CLASSIFIED 380   │ │ ISSUES 1 204  CLASSIFIED 0   │    │
│ │ STATE open  FETCHED 2d ago   │ │ STATE all   FETCHED 5m ago   │    │
│ └──────────────────────────────┘ └──────────────────────────────┘    │
│                                        Clear all local data (ghost)   │
└──────────────────────────────────────────────────────────────────────┘
```

**Home.** The hero is centered but compact (not a landing page): the H1, a one-line lede, then
the repository loader as the primary action, the onboarding steps as a mono inline stepper,
saved analyses as a 2-up card grid (1-up under 720 px), and the storage meter next to the
section kicker. Empty state: the hero plus the loader plus a quiet empty block (no framed box).

**Analysis.**

```
┌──────────────────────────────────────────────────────────────────────┐
│ ← analyses / vuejs/core                    ⟳ Refresh   ⇩ Export      │  breadcrumb + actions
│ vuejs/core                     412 issues · open · fetched 2d ago     │  h2 + mono meta
│ 380 of 412 classified ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░   │  summary meter
│ high 41 · medium 170 · low 169                                        │
│ ┌───────────────────────────────────────────────────────────────┐     │
│ │ Classify 32 unclassified   ≈ 32 calls      [ Classify ]        │     │  classify bar
│ └───────────────────────────────────────────────────────────────┘     │
│ ⌕ Search issues…                 /  (kind) (criticality) (+2)  sort ▾ │  filter bar 32 px
│ ────────────────────────────────────────────────────────────────────  │
│ ☐  #     TITLE                    PRIORITY  CRIT   EFFORT  REL  UPD   │  micro header
│ ☐  4312  Hydration mismatch…      82/100    ●high  ●med    71   2d    │  44 px rows
│ ☐  4290  Docs typo in…            12/100    ●low   ●low    20   9d    │
└──────────────────────────────────────────────────────────────────────┘
```

The table reduces visual columns. Complexity, confidence, comments and status collapse into
the drawer or a "columns" popover by default. The data and sort keys stay, and only
presentation changes. **This is a product decision to confirm in phase 2.** If rejected, all
14 columns stay but get the lighter cell recipes.

**Drawer (issue detail).** Right side, 440 px, `surface`, `border-left`, `elev-3`. Header:
`#4312` in mono plus the title in h3, and a close button. Sections separated by hairlines with
`micro` kickers: Scores (key/value grid of level chips and score pills), Rationale (prose 15
px), Labels, and Metadata (mono). On mobile it becomes a full-screen sheet.

**Settings.** One 640 px column. Sections are separated by hairlines, each with a `micro`
kicker, and there are no cards: Keys (secret inputs), Preferences (theme segmented control,
weights), and Data (storage meter, danger zone as a bordered `danger` tint row).

**Export dialog.**

```
┌──────────────── Export issues ────────────────┐
│ FORMAT   ( csv | json | markdown )  segmented  │
│ INCLUDE  ☑ dismissed  ☐ stale  ☑ rationale     │
│ ORDER    1 priority ↓   2 updated ↓   + rule   │
│ ┌ preview (mono 12, surface-2, 8 rows) ─────┐  │
│ │ number,title,priority,…                   │  │
│ └───────────────────────────────────────────┘  │
│ ─────────────────────────────────────────────  │
│                      Cancel     Download ⇩     │
└────────────────────────────────────────────────┘
```

**Kit page.** The same side-by-side light and dark columns, restyled: sections as hairline
blocks rather than cards, a token table with swatch plus mono hex plus measured ratio, the type
specimen per role (sans, mono, pixel), every recipe above in all states, and a "density"
specimen that shows one table row plus a card at real size. It stays the visual test for
phase 2.

---

## 4. Identity decision

A key finding changes the premise. **canirun.ai is itself a "pixel accent" design.** Its logo
is pixel blocks, and its H1s and model names use Geist Pixel. Pixel art is not what makes ours
coarse. The *choice of pixel face* is (Silkscreen: all-caps, wide, 8-bit), and so is its reach
(icons, badge glyphs, frames, sprites all over the reading surface).

| | **A: Clean technical, no pixel** | **B: Refined base, pixel as a tiny accent** (recommended) |
|---|---|---|
| Wordmark | Geist Sans 600 + stroke logo mark | Pixel logo mark (redrawn, 2 tones) + Geist Pixel wordmark in mixed case |
| H1 | Geist Sans 600, 36 px | **Geist Pixel Square**, 36 px, one per page |
| Icons | 1.5 px stroke set (ours, MIT) | Same 1.5 px stroke set. **No pixel icons in the UI.** |
| Badges | Dot plus label | Dot plus label (same) |
| Empty state | 48 px stroke icon | One small monochrome pixel illustration (at most 64 px, `text-subtle`) |
| Spinner | Stroke arc | Stroke arc (the sprite goes) |
| Deps | Geist, Geist Mono | + Geist Pixel (about 20 KB woff2) |
| Risk | Generic, "another Vercel-style tool" | Pixel misused again. Mitigated by a rule: pixel only in the logo, H1 and empty-state art, and enforced by a test (see phase 2). |

**Recommendation: B.** The user asked for a pixel-art identity first and canirun.ai's
refinement second, and canirun shows the two coexist. Its refinement comes from neutral
surfaces, hairlines, mono data and small controls, while a fine-grained pixel face is kept to
headlines. Option A would be the most restrained and reads as refined, but it throws away the
one memorable trait we have for no gain in readability, because the reading surface is sans
and mono in both options. B keeps the identity at a size and grain where it signals craft
instead of retro. The main caveat: B only works if the pixel reach is strictly limited, so
phase 2 adds a guard test.

---

## 5. Phase 2 implementation plan

The ODD task file `odd/tasks/redesign-v2.md` and its Engram mirror are created at the start of
phase 2. Branch: `lane/redesign`. Strict TDD: each token and recipe change starts from a
failing test where behavior is testable (contrast pairs, roles, pixel guard, icon pipeline).
Pure visuals are verified on the kit page with screenshots.

| # | Step | Files | Tests that change | ~Lines |
|---|---|---|---|---|
| 1 | Fonts: add Geist, Geist Mono and Geist Pixel, remove Inter and Silkscreen, update notices | `package.json`, `src/main.ts`, `THIRD_PARTY_NOTICES.md` | none (build) | 30 |
| 2 | Tokens v2: palette, `text-subtle`, heat `scale-*`, type roles, `space` 4 px grid, sizes, radii, elevation, motion | `src/ui/tokens.ts` | `tokens.test.ts`: new roles and pairs (RED first). **Snapshot** `__snapshots__/tokens.test.ts.snap` regenerated. `motion.test.ts` if durations change. | 200 |
| 3 | Base CSS: body 15 px, the `.ui-control` recipe (quiet border, 32 px), `.u-mono`, `.u-micro`; drop `.u-pixel-border`, and `.u-pixel-font` keeps only the H1 and wordmark role | `src/ui/base.css`, `src/style.css` | `tokens-only.test.ts` unchanged (it must stay green) | 150 |
| 4 | Stroke icon set plus generator stroke mode | `design/icons/stroke/*`, `scripts/build-icons.mjs`, `src/assets/icons/*` | `tests/icons.test.ts` (stroke normalizer cases, `geometricPrecision`, committed output equals a fresh build) | 350 (about half generated) |
| 5 | Kit components: UiButton, inputs, UiSelect, UiMultiSelect, UiSlider, FilterChip, LevelBadge (dot), ScoreBar becomes the score pill, ConfidenceBadge, EmptyState, UiDialog, UiPopover, UiTooltip, UiToast, UiSpinner, plus a new UiSegmented | `src/ui/*.vue` | `UiButton.test.ts` (variants), `badges.test.ts` (glyph becomes dot; label and aria kept), `controls.test.ts`, `UiToast.test.ts` if markup changes | 600 |
| 6 | Kit page restyle as the visual test; screenshots `docs/redesign/v2-kit-*.png` | `KitPage.vue`, `KitShowcase.vue` | `KitPage.test.ts` (section list) | 300 |
| 7 | Pixel guard: a test that fails if `.u-pixel-font` or `--font-pixel` is used outside the allowlist (App wordmark, page H1s, EmptyState art) | `tests/pixel-usage.test.ts` | new | 40 |
| 8 | Shell and Home: top bar, nav, theme toggle, hero, loader, card grid, AnalysisCard key/value grid, banner inline | `App.vue`, `HomeContainer.vue`, `AnalysisCard.vue`, `AnalysisList`, `KeysRequiredBanner.vue`, `OnboardingChecklist.vue`, `StorageMeter.vue`, `RepoInput.vue` | `App.test.ts` (wordmark, toggle), card tests | 350 |
| 9 | Analysis: header, summary meter, classify bar, filter bar, table and row recipes, drawer | `AnalysisViewContainer.vue`, `AnalysisHeader.vue`, `ClassifyContainer.vue` and children, `IssuesContainer.vue`, `FilterBar.vue`, `IssueTable.vue`, `IssueRow.vue`, `IssueDetailDrawer.vue`, `RunSummary.vue` | row/table tests on classes and cells | 500 |
| 10 | Settings and Export dialog | `SettingsContainer.vue`, `PreferencesForm.vue`, `WeightEditor.vue`, `ExportContainer.vue`, `SortRuleList.vue` | the related tests | 300 |
| 11 | `docs/design.md` rewritten as v2; before and after screenshots | `docs/design.md`, `docs/redesign/*` | none | 200 |

**Total: about 3,000 authored changed lines** (excluding regenerated icons and snapshots). Per
the 400-line delivery budget, this needs a chained PR plan (for example: PR1 = steps 1–4, PR2 =
5–7, PR3 = 8, PR4 = 9, PR5 = 10–11). The chain strategy (`stacked-to-main` or
`feature-branch-chain`) is the user's choice at the start of phase 2.

**Rules kept.** `tests/architecture.test.ts` import rules (`src/ui` imports only Vue and
`src/assets/icons`), kit-only controls (containers compose kit components, and there are no ad
hoc controls in containers), `tokens-only.test.ts` (no hex, px or ms outside `tokens.ts`), no
CDN (fonts through `@fontsource`), no `v-html`, the dev-only kit route, and the reduced-motion
contract.

**Risks.**

- **Space-scale renumbering** (inserting 12 px) touches all 192 `var(--space-N)` uses in 57
  files (counted on `e3891b6`). We mitigate by mapping mechanically in one commit, or by adding `space-2h` instead to
  avoid renumbering. The decision is made in step 2.
- **Heat colors as text** add about 30 new contrast pairs. The tightest new text pairs are dark
  `text-subtle` at 4.59:1 and light `scale-3` at 5.05:1, both on `surface-2`. There is little
  headroom, so tune by the test, not by eye.
- **The primary button changing from accent to inverse** is a strong visual change. We validate
  it on the kit page first.
- **Hiding table columns by default** is a product change and needs explicit approval (step 9).
- **Geist Pixel at small sizes** is illegible, so the guard test keeps it at 20 px or larger.
- **Icon redraw quality** is the step most likely to look amateur. Each icon must be reviewed
  at 16 px in both themes on the kit page.

---

## What could not be verified

- The live `www.canirun.ai` (a Cloudflare challenge blocks both WebFetch and headless
  browsers). The reference was verified from its public source running locally, which may lag
  the live deploy by the time between the last push and the clone.
- The reference's real detection panel, "Browse all" grid-card view, model detail pages and
  playground were not captured. Headless hardware detection is fake, and only the home and
  `/models` list views were captured.
- The Analysis, Settings and Export screens of our app were not screenshotted, because they
  need a saved analysis and keys. The audit of those screens is from source.
