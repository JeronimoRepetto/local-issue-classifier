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

issue-criticity is local-only: everything below lives in this browser profile, under
`localStorage` keys prefixed with `issue-criticity:`. Nothing is ever sent anywhere except
GitHub (`api.github.com`, for the repository you analyse) and, when you classify issues, the
local Jev proxy.

**What is stored, and where.** All of it is non-secret and lives in `localStorage`:

- **Preferences**: the last repository you entered, the last analysis you had open, and your
  defaults (max issues to load, max comments per issue, theme, and so on).
- **Saved analyses**, one entry per analysis: the repository's metadata and project context
  (README/CONTRIBUTING excerpts, manifest, `docs/` names), issue titles, trimmed bodies and a
  selection of comments, labels, authors and dates, any classifications, and your working state
  (filters, sort, dismissed issues).

**What is never stored.** Your Jev API key and GitHub token live only in memory for the current
tab. They are never written to `localStorage`, `sessionStorage`, cookies, IndexedDB, a URL, or
the export file — a reload or **Clear keys** in Settings loses them, by design (see "Keys" above).

**Deleting your data.**

- **Delete** on an analysis card (Home) removes just that one analysis and its entry in the list,
  after a confirmation.
- **Clear all local data**, at the bottom of Home, removes every `issue-criticity:*` key —
  every saved analysis and your preferences — after you type "delete" to confirm. It also clears
  your keys from memory. This cannot be undone.
- You can also wipe everything at once from your browser's own settings, under site data for
  `localhost:5200`.
- If saving ever fails because the browser's storage is full, the analysis stays open for that
  session and a notice offers **Retry save** — delete older analyses, or lower "Max issues to
  load" in preferences, then retry.

**Private repositories.** If you analyse a private repository, its issue text and README
excerpts are stored **in plain text, unencrypted**, in this browser profile until you delete
them. Anyone with access to your OS account or browser profile — or a browser extension allowed
on `localhost` — can read them. The New-analysis flow shows this note the first time you load a
private repository in a session; Settings repeats it permanently. Encryption at rest is out of
scope for v1 (see "Limitations").

## Using saved analyses

_Section pending (Task 8)._

## Priority

Priority is an optional 0–100 ranking score, shown as its own table column and usable as a table
sort key and an export order key. It combines a row's four classification scores with four
adjustable weights — Criticality, Relevance, Complexity and Effort — into a single number; lower
complexity and lower effort push priority up, since an easy, low-effort fix is more attractive to
act on first.

Open the **Weights** popover next to the Priority column header to adjust the four sliders
(0–100, steps of 5, each with a numeric input beside it). Changes preview live: the Priority
column and the row order update as you move a slider. **Reset to defaults** restores 40 / 30 / 15
/ 15, and if every weight is set to 0 the column shows "—" and the popover says so — there is
nothing to rank on. Weights are saved per analysis and survive a reload.

Priority is a ranking aid, not a measurement: like relevance, it is built from the same ordinal
Jev scores (see [`docs/jev-questions.md`](docs/jev-questions.md#priority)).

## Export format

**Export…** opens a dialog to build a plain-text report of the current analysis (or a saved copy of
its filtered view). You choose:

- **Scope** — the current filtered view (default) or every issue in the analysis. Dismissed issues
  are always excluded unless you check **Include dismissed**.
- **Include unclassified issues**, **Include dismissed**, **Include confidence** and
  **Include URLs**.
- **Order** — an ordered list of sort keys and directions, edited the same way as the table's Sort
  popover (add, remove, reorder with Alt+↑/↓). **Use current table sort** copies the table's own
  order into the export in one click.

The order and options are saved per analysis. **Download** saves the previewed text as
`{owner}-{repo}-issues-{YYYYMMDD-HHmm}.txt` through an anchor-based download (no server involved).
With nothing in scope, Download is disabled and the dialog says "Nothing to export."

The full format — every header line, the row layout, the Unclassified/Dismissed sections and a
worked example — is specified in [`docs/export-format.md`](docs/export-format.md).

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
