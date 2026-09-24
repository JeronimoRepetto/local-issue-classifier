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

Two third-party brand icons are bundled, as a deliberate, narrow exception to "no third-party
icons" above: the GitHub and LinkedIn app-bar links (`src/ui/GitHubMarkIcon.vue`,
`src/ui/LinkedInMarkIcon.vue`) render each service's own mark so the links are recognizable at
a glance. Neither mark is relicensed under this project's MIT license; both remain their
owners' trademarks, used only as described below.

| Icon | Source | License | Notes |
|---|---|---|---|
| GitHub mark | Simple Icons `simple-icons@16.32.0`, `icons/github.svg` (CC0 1.0). Simple Icons' own `source` field for this icon points to `https://github.com/logos`. | CC0 1.0 | Path data copied verbatim into `src/ui/GitHubMarkIcon.vue`. The mark itself remains GitHub, Inc.'s trademark; this notice does not grant any trademark rights, only records the CC0-licensed redistribution of the artwork. |
| LinkedIn `[in]` Logo | LinkedIn Corporation, via its own brand guidelines site `https://brand.linkedin.com/in-logo`. Path data copied verbatim from that page's own inline SVG symbol (`id="inbug-blue-28"`, viewBox `0 0 28 28`) — the same artwork that page uses for its own nav and footer logo, fetched directly, not scraped from a third party. | LinkedIn trademark; used strictly under the LinkedIn Brand and User Agreements, not MIT | Path data copied verbatim into `src/ui/LinkedInMarkIcon.vue`. Rendered **unaltered** in the two monochrome variants LinkedIn itself provides for download (`https://brand.linkedin.com/in-logo` → "Download the `[in]` Logo`", asset `in-logo.zip`): confirmed by pixel-inspecting that zip's `InBug-Black.png` and `InBug-White.png` (checked 2026-09-24), which are pure `#000000` and pure `#FFFFFF` respectively on a transparent background — the exact two values in `src/ui/tokens.ts`'s `brand-linkedin-mark` token. This notice does not grant any trademark rights, only records that the shape and colors are LinkedIn's own official, freely-downloadable artwork, used exactly as published. |

**Why the LinkedIn mark is allowed here.** LinkedIn's `[in]` Logo guidelines
(`https://brand.linkedin.com/in-logo`, "Acceptable use") explicitly permit any LinkedIn member
to use the `[in]` Logo "as a hyperlink to your LinkedIn profile, company page, and/or group
page" and "in a series of social media icons showing your participation in those sites" — both
exactly describe this app bar's "Author on LinkedIn" link. The same page's "Please Do Not"
section forbids modifying the mark's color or shape ("You may only use the approved color
variations provided for download") or combining it with other symbols/words, or implying
LinkedIn affiliation/endorsement — `LinkedInMarkIcon.vue` follows all three: the path is
verbatim, the fill is one of the three approved variants (black/white; blue is the third, not
used here), and the icon renders alone, with no added symbol or wordmark.

The full **LinkedIn Logo** (wordmark + bug together, a *different* page at
`https://brand.linkedin.com/linkedin-logo`) is a separate, license-gated asset ("LinkedIn does
not allow anyone to use the LinkedIn Logo, unless they already have an existing relationship
with LinkedIn and a Brand or Trademark License") and is not used anywhere in this project — only
the standalone, freely-usable `[in]` Logo bug is bundled.

**Superseded note, kept for history (originally 2026-09-24):** this project previously reused
the generic `IconExternalLink` for the LinkedIn link, believing (from Simple Icons' own
CC0-icon coverage and its public issue tracker's `won't add` / `permissions in review` responses
to "Request: LinkedIn" issues, e.g.
[simple-icons/simple-icons#15014](https://github.com/simple-icons/simple-icons/issues/15014))
that LinkedIn did not permit free redistribution of its mark at all. That conclusion was correct
about Simple Icons specifically (it still ships no LinkedIn icon, confirmed 404 on a
version-pinned fetch of `icons/linkedin.svg`) but not about LinkedIn's own guidelines, which
were not checked directly at the time. Checking `brand.linkedin.com` itself (this entry, same
day) found the standalone `[in]` Logo is in fact freely downloadable and usable for exactly this
purpose, so the generic icon was replaced with the real mark above.
