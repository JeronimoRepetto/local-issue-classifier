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

1. Sign in to the TypeSafe console and open the API keys dashboard at
   <https://console.typesafe.ai/keys>.
2. Create a key.
3. Paste it into issue-criticity's Settings. It is kept in memory only: a reload or **Clear keys**
   forgets it, and it is never written to disk, `localStorage` or the export.

What the Jev docs do not cover: account sign-up, key scopes, key rotation, spending limits and
plans. For those, see <https://docs.typesafe.ai>. From the docs' Models page: Jev charges only input
tokens, at $0.042 per million (output is free), and the rate limits are 1 200 requests per minute
and 250 000 tokens per second, which TypeSafe says may change without notice. A typical run of 200
issues costs roughly $0.03–0.06.

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

v1 runs locally only (`pnpm dev` or `pnpm preview` on `localhost:5200`). The Jev API rejects
browser origins, so the browser calls `/jev/v1/...` and the Vite server forwards it to
`https://api.typesafe.ai`. The proxy forwards only `/v1/systemone` and `/v1/models`, strips
`origin`, `referer` and `cookie`, logs nothing and stores nothing; your key passes through in
transit only. GitHub is called directly from the browser.

A hosted mode (for example Firebase Hosting with a serverless proxy function) is a future option,
not implemented. Switching is configuration only (`VITE_JEV_BASE_URL`). See
[`docs/deployment.md`](docs/deployment.md) for the proxy contract and configuration.

## Design

_Section pending (Task 2)._

## Credits

_Section pending (Task 2/15)._

## Limitations

_Section pending (Task 10)._

## License

_Section pending (Task 15)._
