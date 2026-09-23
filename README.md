# issue-criticity

## What it is

issue-criticity is a local-only tool that helps a maintainer or contributor triage a GitHub issue
backlog quickly. It fetches issues directly from the GitHub API, asks Jev four narrow, calibrated
questions per issue, and turns the answers into complexity, criticality, cost and relevance
scores you can sort, filter and export. All deterministic work — fetching, trimming, sorting,
filtering and exporting — stays in code; Jev only makes the four judgments (see `SPEC.md` §1).

## Screenshots

_Section pending (Task 15)._

## Requirements

- Node.js 20 or newer
- pnpm 11
- A Jev API key (required)
- A GitHub personal access token (optional — raises the GitHub API rate limit)

## Install

```bash
pnpm install
```

pnpm 11 ignores the `pnpm` field in `package.json` for build approvals and overrides; this repo
declares both instead in `pnpm-workspace.yaml` (`allowBuilds` as a YAML map, e.g.
`allowBuilds: { esbuild: true }`), which is what actually grants esbuild's native postinstall step.

## Getting a Jev API key

_Section pending (Task 10)._

## Getting a GitHub token

_Section pending (Task 6)._

## Run

```bash
pnpm dev
```

Serves the app at http://localhost:5200 (fixed port, `strictPort: true`).

## Development

```bash
pnpm test        # vitest run
pnpm test:watch  # vitest watch mode
pnpm typecheck   # vue-tsc -p tsconfig.json && tsc -p tsconfig.node.json
```

`pnpm icons` regenerates the icon components from `design/icons/`. The dev-only component kit
is at http://localhost:5200/?kit.

## How classification works

_Section pending (Task 9)._

## Keys

_Section pending (Task 4)._

## Local data and privacy

_Section pending (Task 8)._

## Using saved analyses

_Section pending (Task 8)._

## Priority

_Section pending (Task 14)._

## Export format

_Section pending (Task 13)._

## Deployment modes

_Section pending (Task 10)._

## Design

A modern, friendly interface with pixel art as its identity: the logo, icons, level glyphs and
empty states are pixel art, while all reading text (body, tables, numbers) uses Inter. The
design system lives in `src/ui/`:

- typed design tokens (`tokens.ts`) turned into CSS variables for the light and dark themes;
  the theme follows your system unless you pick one;
- WCAG 2.2 AA contrast, enforced by a test over every color pair in both themes;
- an 8 px spacing grid, square pixel frames and three elevation levels;
- short, purposeful motion that turns off under `prefers-reduced-motion`;
- a component kit (buttons, inputs, secret input, selects, slider, dialog, popover, tooltip,
  toasts, level and confidence badges, score bars, chips and empty states).

Run `pnpm dev` and open http://localhost:5200/?kit to see every component in both themes (the
kit page exists only in development). Tokens, components, motion rules and the icon pipeline
(`pnpm icons`) are documented in [`docs/design.md`](docs/design.md).

## Credits

- **Fonts:** [Inter](https://github.com/rsms/inter) and
  [Silkscreen](https://github.com/googlefonts/silkscreen), both under the SIL Open Font License
  1.1, bundled from `@fontsource` packages (no font CDN).
- **Icons:** all icons, the logo and illustrations are original pixel art made for this project
  (MIT). No Streamline icons are bundled; see [`docs/design.md`](docs/design.md#icon-source-decision-2026-09-23).

Full notices: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Limitations

_Section pending (Task 10)._

## License

_Section pending (Task 15)._
