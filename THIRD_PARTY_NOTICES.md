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

**No third-party icons are bundled.** Every UI icon is an original 24-grid line icon under
`design/icons/stroke/`, and the logo and the empty-state illustration are original pixel art under
`design/icons/pixel/`. All are covered by the project's MIT license.

The Streamline "Pixel" set (CC BY 4.0) was the planned primary source. It was not used because,
on 2026-09-23, its SVG files could not be downloaded without a Streamline account and the set
page's structured data linked the proprietary Streamline Free License alongside the CC BY 4.0
text (see `docs/design.md`, "Icon source decision").

The v2 design (2026-09-23) replaced the pixel UI icons with line icons, so no icon set is planned.
