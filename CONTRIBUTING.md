# Contributing

Thanks for your interest in local-issue-classifier. This is a small local-first tool; the bar for
a change is that it is well-tested, keeps the architecture rules, and does one thing per commit.

## Setup

```bash
pnpm install
pnpm dev      # http://localhost:5200
```

Node 22.13+ and pnpm 11 are required (pnpm 11 does not run on Node 20). pnpm 11 ignores the `pnpm` field in `package.json` for build
approvals; this repo grants esbuild's native postinstall step through `allowBuilds` in
`pnpm-workspace.yaml` instead.

A Jev API key is needed to exercise classification manually (see the README's "Getting a Jev API
key"); everything else, including the full test suite, runs without one.

## Strict TDD

This project is developed test-first. For any behavior change:

1. Write the test first, and confirm it fails (RED) for the reason you expect.
2. Write the minimum implementation to make it pass (GREEN).
3. Refactor with the tests green.

Run the suite with:

```bash
pnpm test        # vitest run
pnpm test:watch  # vitest watch mode
pnpm typecheck   # vue-tsc + tsc, no emit
```

A pull request that adds behavior without a test that would have caught its absence will be asked
to add one. A real regression fix should come with a regression test.

## Architecture rules

The dependency direction (`components → composables → adapters → domain`), the folder layout and
the storage/secrets policy are documented in [`docs/architecture.md`](docs/architecture.md).
`tests/architecture.test.ts` enforces the import rules mechanically — if it goes red, the change
crosses a layer boundary it should not.

Other rules worth knowing before you touch code:

- `src/domain/**` is pure TypeScript: no Vue, no `fetch`, no storage, no browser APIs.
- `src/ui/**` (the design system) only imports Vue and `src/assets/icons/`.
- No hard-coded colors, pixel sizes or durations outside `src/ui/tokens.ts`
  (`tests/tokens-only.test.ts`).
- Never persist a secret (the Jev API key or the GitHub token). They live only in
  `useSecrets()`'s in-memory state; `tests/secretsNeverPersisted.test.ts` scans every persisted
  key for both values.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `refactor:`,
`docs:`, `test:`, `chore:`, …) with an imperative, outcome-oriented subject. One logical change
per commit. Do not add `Co-Authored-By` or any AI-attribution trailer to commit messages.

## Pull requests

- Keep a PR to one coherent change; split unrelated work.
- `pnpm test`, `pnpm typecheck` and `pnpm hygiene` must be green.
- Update the affected README section and `docs/*.md` alongside the code, in the same PR.
- Never commit secrets, a real e-mail address, a local machine path, or real personal data. Test
  fixtures use synthetic data only (`acme/widgets`, `@jdoe`, and similar).
- Describe what changed and why; link the issue it resolves, if any.
