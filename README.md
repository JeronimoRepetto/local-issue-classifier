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

The dev-only component kit page (`?kit`) lands in Task 2.

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

_Section pending (Task 2)._

## Credits

_Section pending (Task 2/15)._

## Limitations

_Section pending (Task 10)._

## License

_Section pending (Task 15)._
