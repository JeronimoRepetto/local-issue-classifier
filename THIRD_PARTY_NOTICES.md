# Third-party notices

The local-issue-classifier source code is MIT-licensed. The third-party assets below are bundled with
the app and keep their own licenses; they are **not** relicensed under MIT.

## Runtime dependencies

| Package | Version | License | Notes |
|---|---|---|---|
| `vue` | 3.5.43 | MIT | UI framework. |
| `@tanstack/vue-virtual` | 3.13.39 | MIT | Row virtualization for the issues table above 200 rows. |

Both are MIT, the same license as this project, so no separate notice is required beyond this
table; their own `LICENSE` files ship in `node_modules/<package>/`.

## Fonts

All fonts are installed from npm and bundled by Vite. They are self-hosted: no font CDN is
contacted at runtime.

| Font | Package | License | Copyright |
|---|---|---|---|
| Geist (variable) | `@fontsource-variable/geist` 5.3.0 | SIL Open Font License 1.1 (`OFL-1.1`) | Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font) |
| Geist Mono (variable) | `@fontsource-variable/geist-mono` 5.3.0 | SIL Open Font License 1.1 (`OFL-1.1`) | Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font) |
| Geist Pixel | `@fontsource/geist-pixel` 5.3.0 | SIL Open Font License 1.1 (`OFL-1.1`) | Copyright 2026 The Geist Project Authors (https://github.com/vercel/geist-font) |

The license text ships in each package (`node_modules/<package>/LICENSE`) and is available at
https://openfontlicense.org. The `license` field in each package's npm metadata reads `OFL-1.1`
(checked 2026-09-23).

## Icons

Every UI icon is an original 24-grid line icon under `design/icons/stroke/`, and the logo and the
empty-state illustration are original pixel art under `design/icons/pixel/`. All are covered by the
project's MIT license.

The Streamline "Pixel" set (CC BY 4.0) was the planned primary source. It was not used because,
on 2026-09-23, its SVG files could not be downloaded without a Streamline account and the set
page's structured data linked the proprietary Streamline Free License alongside the CC BY 4.0
text (see `docs/design.md`, "Icon source decision").

The v2 design (2026-09-23) replaced the pixel UI icons with line icons, so no icon set is planned.

### Brand icons (app-bar links, 2026-09-24)

One third-party brand icon is bundled, as a deliberate, narrow exception to "no third-party icons"
above: the GitHub app-bar link (`src/ui/GitHubMarkIcon.vue`) renders GitHub's own mark so the link is
recognizable at a glance.

| Icon | Source | License | Notes |
|---|---|---|---|
| GitHub mark | Simple Icons `simple-icons@16.32.0`, `icons/github.svg` (CC0 1.0). Simple Icons' own `source` field for this icon points to `https://github.com/logos`. | CC0 1.0 | Path data copied verbatim into `src/ui/GitHubMarkIcon.vue`. The mark itself remains GitHub, Inc.'s trademark; this notice does not grant any trademark rights, only records the CC0-licensed redistribution of the artwork. |

**LinkedIn has no bundled brand mark, on purpose.** The task that requested this link assumed Simple
Icons also offers a free LinkedIn mark; it does not. Verified 2026-09-24:

- `simple-icons@16.32.0`'s own icon data (`data/simple-icons.json`, 3,461 icons) has zero entries for
  LinkedIn — the flat `icons/linkedin.svg` some CDNs serve under a stale cache is not part of the
  current, real package tree (confirmed 404 on a version-pinned fetch of that exact path).
- Simple Icons' public issue tracker shows repeated "Request: LinkedIn" issues (e.g.
  [simple-icons/simple-icons#15014](https://github.com/simple-icons/simple-icons/issues/15014)),
  all closed `not_planned` and labeled `won't add` / `permissions in review` — i.e. LinkedIn's own
  brand/ToS terms are understood to not permit free redistribution the way GitHub's do.

So the LinkedIn app-bar link (`src/App.vue`) reuses the project's own generic
`IconExternalLink` (an original stroke icon, MIT, already covered above) instead of a redrawn
LinkedIn logo. This mirrors this project's existing convention of not redrawing a brand mark it
cannot freely license (see `docs/design.md`, "Icons" — GitHub's mark was previously avoided
the same way, before this exception).
