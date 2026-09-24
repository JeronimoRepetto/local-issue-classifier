# local-issue-classifier

Local-first web app that pulls a GitHub repo's issues and README, then asks Jev (TypeSafe AI's
decision model) to rate each issue by complexity, criticality, effort and relevance. Filter,
dismiss, sort by weighted priority and export as plain text. Keys stay in memory; results stay in
your browser.

## How it works

1. Paste a GitHub repository URL (or `owner/repo`) and pick a state: Open, Closed or All.
2. The app fetches the repository's issues, README and project metadata directly from the GitHub
   API, and saves them as a new **analysis** in this browser.
3. **Classify** sends the issue and a trimmed project summary to Jev. By default it batches every
   selected issue into as few requests as fit (one request when the limits allow it); "One request
   per issue" is available under Settings → Classifier → Advanced. Jev answers four narrow
   questions — Complexity, Criticality, Effort and Relevance — plus a fifth, speculative Kind
   (bug / feature / documentation / question / maintenance / other). See
   [`docs/batching.md`](docs/batching.md) for how batching fits issues into a request.
4. The table shows every issue with its scores. Filter, sort (including by a weighted
   **Priority** score), dismiss what you don't care about, and **Export** the current view as a
   plain-text report.

All deterministic work — fetching, trimming, sorting, filtering and exporting — stays in code;
Jev only makes the four judgments. See [`docs/jev-questions.md`](docs/jev-questions.md) for what
each question asks and how its answer becomes a value.

## Screenshots

![Home screen, dark theme: the saved-analyses list with a storage meter and flat analysis cards](docs/redesign/after-home-dark.png)

![Analysis screen, dark theme: the issues table with filters, classify bar and priority column](docs/redesign/after-analysis-dark.png)

## Requirements

- Node.js 20 or newer
- pnpm 11
- A Jev API key (required to classify issues)
- A GitHub personal access token (optional — raises the GitHub API rate limit)

## Install

```bash
pnpm install
```

pnpm 11 ignores the `pnpm` field in `package.json` for build approvals and overrides; this repo
declares both instead in `pnpm-workspace.yaml` (`allowBuilds` as a YAML map, e.g.
`allowBuilds: { esbuild: true }`), which is what actually grants esbuild's native postinstall step.

## Run

```bash
pnpm dev
```

Serves the app at http://localhost:5200 (fixed port, `strictPort: true`). For a production-style
build:

```bash
pnpm build     # vue-tsc --noEmit && vite build
pnpm preview   # serves the build at http://localhost:5200
```

## First run

A new analysis needs, in order: **1 Keys → 2 Repository → 3 Classify**. A small checklist on
Home tracks this the first time and disappears once each step has happened once:

1. Open **Settings** and paste your Jev API key (and, optionally, a GitHub token).
2. On Home, click **New analysis** and paste a repository URL.
3. Open the analysis and click **Classify unclassified**.

## Getting a Jev API key

1. Sign in to the TypeSafe console and open the API keys dashboard at
   <https://console.typesafe.ai/keys>.
2. Create a key.
3. Paste it into local-issue-classifier's Settings. It is kept in memory only: a reload or
   **Clear keys** forgets it, and it is never written to disk, `localStorage` or the export.

What the Jev docs do not cover: account sign-up, key scopes, key rotation, spending limits and
plans. For those, see <https://docs.typesafe.ai>. From the docs' Models page: Jev charges only input
tokens, at $0.042 per million (output is free), and the rate limits are 1 200 requests per minute
and 250 000 tokens per second, which TypeSafe says may change without notice. A typical run of 200
issues costs roughly $0.03–0.06.

## Getting a GitHub token

A token is optional. Without one, public repositories load at 60 requests/hour and comments are skipped by default. With one, the limit is 5 000 requests/hour.

1. On GitHub, open **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Name it (for example `local-issue-classifier`), pick a short **expiration**, and pick the **resource owner** that owns the repositories.
3. Under **Repository access**, choose **Public repositories** (read-only) or **Only select repositories** for the private repos you want to analyse.
4. Under **Permissions → Repository permissions**, set:
   - **Issues: Read-only**, for issues and their comments;
   - **Contents: Read-only**, for the README, CONTRIBUTING, `docs/` and the package manifest;
   - **Metadata: Read-only**, for repository info. Confirm it shows Read-only; GitHub normally adds it automatically.
5. Generate the token and paste it into Settings. It is kept in memory only, so you paste it again after every reload; keep it in your own password manager if you want.

Classic tokens also work, but private repos need the `repo` scope, which also grants write access. Prefer the fine-grained token.

## Development

```bash
pnpm test        # vitest run
pnpm test:watch  # vitest watch mode
pnpm typecheck   # vue-tsc -p tsconfig.json && tsc -p tsconfig.node.json
pnpm hygiene     # public-repo hygiene checks (secrets, personal data, stray assets)
```

`pnpm icons` regenerates the icon components from `design/icons/`. The dev-only component kit
is at http://localhost:5200/?kit — it shows every component in both themes side by side, with a
switch to force reduced motion.

This project is developed with **strict TDD**: a test is written first and confirmed to fail for
the expected reason (RED), then the minimum implementation is added (GREEN), then refactored.
See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full convention and the architecture rules.

## Keys

local-issue-classifier uses two keys, both entered in **Settings**:

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

local-issue-classifier is local-only: everything below lives in this browser profile, under
`localStorage` keys prefixed with `local-issue-classifier:`. Nothing is ever sent anywhere except
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
- **Clear all local data**, at the bottom of Home, removes every `local-issue-classifier:*` key —
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
scope for v1 (see "Known limitations").

## Using saved analyses

**Home** lists every saved analysis as a card: its name, repository and state, when it was last
fetched, and its counts (total / classified / stale / dismissed) and approximate storage size.
Each card supports:

- **Open** (click the card) — reopens the analysis with its issues, classifications and working
  state (filters, sort, dismissed issues) exactly as you left them.
- **Rename** — an inline edit of the analysis name.
- **Refresh** — re-fetches the repository and merges the result:
  - new issues are added as unclassified;
  - changed issues (a different `updatedAt`) get their data replaced, and any existing
    classification is kept but marked **stale**;
  - unchanged issues are untouched;
  - issues no longer returned by GitHub (closed, transferred, deleted, or beyond the load cap)
    are kept with a **"No longer in source"** badge rather than deleted silently — you can
    restore them individually or remove them all at once with **Remove missing**;
  - your filters, sort, dismissed issues and export options are never touched by a refresh.
- **Delete** — removes that one analysis and its entry in the list, after a confirmation.

An **unreadable** entry (corrupt storage) can only be deleted.

Within an open analysis, **Dismiss** hides a row from the working table (with an undo toast); a
**Show dismissed** toggle brings dismissed rows back into view, and each still offers **Restore**.
**Clear all local data** on Home removes every saved analysis and your preferences at once (see
"Local data and privacy" above).

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

## Local providers

By default the app classifies with **Jev on the TypeSafe cloud**, which needs a Jev API key. In
Settings → **Classifier**, choose **Local server** for a copy-pasteable, step-by-step guide to
running Kev (`jaredpalmer/kev`) or JevK5 (`allebee/jevk5`) — or just run `pnpm local:kev` from this
repo, which clones, installs and starts Kev for you. A local server costs nothing per token, keeps
issue text on your machine or LAN, and needs no key by default. See
[`docs/local-providers.md`](docs/local-providers.md) for the exact commands, the CORS/proxy
fallback and troubleshooting.

## Hardware fit

Settings → **Hardware** answers "can this machine run a local model, and which size?" by reading
what the browser already exposes (WebGL/WebGPU renderer strings, device memory, CPU threads) —
nothing is benchmarked and nothing is sent anywhere. It gives a Fits/Tight/Won't fit verdict per
local model tier, a recommendation, and a manual GPU/VRAM override for when detection can't tell
(Firefox, Safari, or an unusual GPU). "Use Kev locally" applies the Kev preset to the provider
config in one click. See [`docs/hardware-fit.md`](docs/hardware-fit.md) for what is read, the GPU
table and the tier thresholds.

## Deployment modes

v1 runs locally only (`pnpm dev` or `pnpm preview` on `localhost:5200`). The Jev API rejects
browser origins, so the browser calls `/jev/v1/...` and the Vite server forwards it to
`https://api.typesafe.ai` (configurable through the server-only `JEV_UPSTREAM_URL`). The proxy
forwards only `/v1/systemone` and `/v1/models`, strips `origin`, `referer` and `cookie`, logs
nothing and stores nothing; your key passes through in transit only. GitHub is called directly
from the browser.

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

## Roadmap / backlog

Not implemented in v1; tracked as future work:

- **Pin-to-top** for individual issues, independent of sort.
- **Responsive filter collapse** below 1280 px — the filter bar does not yet collapse into a
  compact form at narrower widths (the table itself already scrolls within its container at
  1024 px, per the design-quality checklist).
- **Hosted deployment mode** (§9 mode b): a serverless proxy function for a public deployment,
  with its own review of abuse and rate limiting.

## Known limitations

- **Classification latency varies by mode.** Measured on 2026-09-24 with the TypeSafe cloud API:
  22 issues were classified in about 3.2 s in a single batched request (≈44k input tokens);
  per-issue mode took about 11 s for the same set. Accuracy of batched vs per-issue mode has not
  been measured yet (see [`docs/batching.md`](docs/batching.md) and [`scripts/compare-batching.mjs`](scripts/compare-batching.mjs)).
- **Browser CORS forces the local proxy.** The Jev API rejects browser origins outright, so every
  mode needs a proxy (`server/jevProxy.ts` in v1); there is no way to call Jev directly from the
  browser.
- **Local storage only, unencrypted.** There is no encryption at rest; see "Local data and
  privacy" above.
- **No automated cross-browser check.** Development and testing target current Chromium-based
  browsers; no manual Firefox or Safari pass has been recorded for this release.
- **v1 is local-only.** There is no hosted deployment yet (see "Roadmap / backlog").

## Credits

- **Fonts:** Geist Sans, Geist Mono and Geist Pixel, under the SIL Open Font License 1.1, bundled
  from `@fontsource` packages (no font CDN).
- **Icons:** all icons, the logo and illustrations are original pixel art made for this project
  (MIT). No Streamline icons are bundled; see [`docs/design.md`](docs/design.md#icon-source-decision-2026-09-23).

Full notices: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## License

MIT — see [`LICENSE`](LICENSE). Third-party fonts and icons keep their own licenses; see
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Acknowledgements

- **midudev / [canirun.ai](https://github.com/midudev/canirun.ai)** — the visual direction and the
  browser-side hardware detection approach used by this app's "Hardware fit" panel were inspired
  by canirun.ai. No code or assets were copied: canirun.ai's repository carries no license
  (checked 2026-09-24 via the GitHub API), so the equivalent behavior here was reimplemented from
  scratch.
- **TypeSafe AI** — makers of Jev, the decision model this app sends issues to for classification.
  See ["Getting a Jev API key"](#getting-a-jev-api-key).
- **[jaredpalmer/kev](https://github.com/jaredpalmer/kev)** and
  **[allebee/jevk5](https://github.com/allebee/jevk5)** — authors of the local, Jev-compatible
  servers this app can point to instead of the TypeSafe cloud. See ["Local providers"](#local-providers).
- **Vercel** — designers of the Geist typeface family (Geist Sans, Geist Mono, Geist Pixel) under
  the SIL Open Font License 1.1; see "Credits" above for the exact license text and how the fonts
  are bundled.

**Built with**

<a href="https://github.com/Gentleman-Programming/gentle-ai">
  <img width="220" src="https://raw.githubusercontent.com/Gentleman-Programming/gentle-ai/main/docs/assets/brand/built-with-gentle-ai.png" alt="Built with Gentle-AI" />
</a>
