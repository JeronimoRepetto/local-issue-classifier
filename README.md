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

A token is optional. Without one, public repositories load at 60 requests/hour and comments are skipped by default. With one, the limit is 5 000 requests/hour.

1. On GitHub, open **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Name it (for example `issue-criticity`), pick a short **expiration**, and pick the **resource owner** that owns the repositories.
3. Under **Repository access**, choose **Public repositories** (read-only) or **Only select repositories** for the private repos you want to analyse.
4. Under **Permissions → Repository permissions**, set:
   - **Issues: Read-only**, for issues and their comments;
   - **Contents: Read-only**, for the README, CONTRIBUTING, `docs/` and the package manifest;
   - **Metadata: Read-only**, for repository info. Confirm it shows Read-only; GitHub normally adds it automatically.
5. Generate the token and paste it into Settings. It is kept in memory only, so you paste it again after every reload; keep it in your own password manager if you want.

Classic tokens also work, but private repos need the `repo` scope, which also grants write access. Prefer the fine-grained token.

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

issue-criticity uses two keys, both entered in **Settings**:

- **Jev API key** — required to classify issues. See
  [Getting a Jev API key](#getting-a-jev-api-key).
- **GitHub personal access token** — optional. It raises the GitHub rate limit from 60 to
  5 000 requests/hour and lets you fetch comments and private repositories. See
  [Getting a GitHub token](#getting-a-github-token).

Both are kept **in memory only**: they are never written to `localStorage`, `sessionStorage`,
cookies, or any other storage, and they vanish the moment the page reloads. Every page load
therefore starts from a "Keys required" state — you re-enter the keys, but your saved analyses
and preferences are still there and stay fully usable without them. **Clear keys** in Settings
wipes both immediately, and so does **Clear all local data**.

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
