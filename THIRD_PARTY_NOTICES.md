# Third-party notices

The issue-criticity source code is MIT-licensed. The third-party assets below are bundled with
the app and keep their own licenses; they are **not** relicensed under MIT.

## Fonts

Both fonts are installed from npm and bundled by Vite. They are self-hosted: no font CDN is
contacted at runtime.

| Font | Package | License | Copyright |
|---|---|---|---|
| Inter (variable) | `@fontsource-variable/inter` 5.3.0 | SIL Open Font License 1.1 (`OFL-1.1`) | Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter) |
| Silkscreen | `@fontsource/silkscreen` 5.3.0 | SIL Open Font License 1.1 (`OFL-1.1`) | Copyright 2001 The Silkscreen Project Authors (https://github.com/googlefonts/silkscreen) |

The license text ships in each package (`node_modules/<package>/LICENSE`) and is available at
https://openfontlicense.org. The `license` field in both packages' npm metadata reads `OFL-1.1`
(checked 2026-09-23).

## Icons

**No third-party icons are bundled.** Every icon, the logo and the empty-state illustration are
custom pixel art authored in this repository under `design/icons/custom/`, covered by the
project's MIT license.

The Streamline "Pixel" set (CC BY 4.0) was the planned primary source. It was not used because,
on 2026-09-23, its SVG files could not be downloaded without a Streamline account and the set
page's structured data linked the proprietary Streamline Free License alongside the CC BY 4.0
text (see `docs/design.md`, "Icon source decision").

If a Streamline Pixel icon is added later, it must live under `design/icons/streamline-pixel/`
and this section must then carry the attribution:

> Pixel icons by Streamline (https://www.streamlinehq.com), from the "Pixel" set, licensed
> under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Changes: recolored to
> `currentColor` and optimized.
