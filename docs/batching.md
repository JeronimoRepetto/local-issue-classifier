# Batched classification

By default a Classify run puts every selected issue into **one Jev request** when the API limits allow it. Before this, the app sent one request per issue: 22 issues took 22 calls and about 11 s at concurrency 4. Batched mode ("batched") sends the project context once and a compact entry per issue, asks the five questions for each issue in that same request, and splits the answers back per issue. One request per issue ("per-issue") is still available as a fallback and as the baseline for comparisons.

## Quick path

1. Nothing to configure: `Preferences.classifyMode` defaults to `'batched'` and `Preferences.trimmingFloor` defaults to `'minimal'`.
2. The estimate before a run reports `requests` (usually 1), the trimming `profile` the fitter will use, and the tokens and cost.
3. To check how closely batched answers match per-issue answers on your own repository, run the agreement harness (see [Agreement harness](#agreement-harness)).

## How one request is built

| Part | Where | Notes |
|------|-------|-------|
| `project` | state, **once** | The same shape as the per-issue state (`toJevProject`). |
| `issues[i]` | state, one entry per issue | The per-issue shape (`toJevIssue`) with `id: "#123"` in place of `number`. |
| 5 questions per issue | `questions` | Ids `c_123`, `k_123`, `e_123`, `r_123`, `t_123` (complexity, criticality, effort, relevance, kind). |

- Each instruction points at its issue by path and id, e.g. ``How critical is `issues[3]` (the issue with id #123) for the users of `project` …``. This follows the Jev docs guidance to reference specific fields (`primitives.md`), the same pattern `items[i]` uses in `model-jaggedness/jev-1.13.md`.
- The ids follow the pattern of one namespaced question per item in one shared state (`same_as_record_{id}` in `primitives/noul.md`). `cookbooks/semantic_find.md` shows that Jev can address 218 sub-items inside one composite state.
- Issue text lives **only** in the state. Questions cannot read each other (`concepts/state.md`), so text copied into an instruction would be sent five times.
- The criteria are the per-issue criteria, unchanged (`src/adapters/jev/batchQuestions.ts` derives them from `QUESTIONS`). The `kind` Choice keeps its explicit `other` option.
- `QUESTIONS_VERSION` is now **2**, and the version guard also covers the batched template. The bump marks classifications from version 1 stale, so the next run re-sends those issues once.

## Limit math

`models.md` (jev-1.13.0), "Context length": **64k tokens per request** for the state plus all questions, and **32k tokens** for the state plus the longest question. Token counts here are estimates (`ceil(chars / 3.5)`), so the fitter keeps a **10% safety margin** on both:

| Budget | Documented | Used by the fitter |
|--------|-----------:|-------------------:|
| state + longest question | 32 000 | 28 800 |
| state + all questions | 64 000 | 57 600 |

The questions cost about **1 034 estimated tokens per issue**. The longest single question is about 266 tokens. Because of this per-issue cost, one request holds at most about 50 issues whatever the trimming: the question text alone uses 57 600 tokens at about 55 issues. Beyond that the run needs more than one request.

## The adaptive fitter

`planBatches` (`src/domain/jevBatchState.ts`) aims for the fewest requests:

1. Work out the minimum number of requests the floor profile needs (`Preferences.trimmingFloor`, default `minimal`).
2. Try the profiles from loosest to tightest and use the first one that reaches that minimum. For a typical repository the minimum is 1.
3. Pack the issues greedily and in order, so each request is filled to the limit.
4. An issue that does not fit a request alone, even at the floor profile, fails by itself with "Issue too large even after trimming" and is never sent.

| Profile | Body (est. tokens) | Comments kept | Comment chars | Docs index | README chars | CONTRIBUTING chars |
|---------|-------------------:|--------------:|--------------:|:----------:|-------------:|-------------------:|
| `standard` | per-issue rules (8 000 chars → 6 000 + 1 500) | preference (8) | 1 000 | yes | 6 000 | 1 500 |
| `compact` | 1 500 | 6 | 800 | no | 6 000 | 1 500 |
| `condensed` | 800 | 2 | 600 | no | 3 000 | 800 |
| `tight` | 400 | 0 | — | no | 1 500 | — |
| `minimal` | 200 | 0 | — | no | 800 | — |

A long body keeps its head (75%) and its tail (25%), with a marker in between. The run summary and the progress events carry `requests` and `profile`, so the UI can show "1 request, compact profile".

### Requests for the fixture repository

The table below comes from `tests/fakes/typicalIssues.ts`. The fixture has a README of about 6 000 chars and 30 docs entries, bodies from 300 to 9 000 chars, and 0 to 10 fetched comments per issue. The token figures are estimates.

| Issues | per-issue | `standard` | `compact` | `condensed` | `tight` | `minimal` | Default fitter |
|-------:|----------:|-----------:|----------:|------------:|--------:|----------:|----------------|
| 22 | 22 calls, 107 558 tok | 2 · 61 174 | 2 · 57 145 | **1 · 42 915** | 1 · 32 683 | 1 · 29 443 | 1 request, `condensed` |
| 50 | 50 calls | 3 · 132 707 | 3 · 123 318 | 2 · 95 365 | 2 · 73 665 | 2 · 66 680 | 2 requests, `condensed` |
| 100 | 100 calls | 7 · 280 360 | 6 · 257 218 | 4 · 193 536 | 3 · 147 234 | 3 · 132 962 | 3 requests, `tight` |
| 200 | 200 calls | 13 · 552 158 | 11 · 508 517 | 7 · 384 073 | 6 · 294 932 | 5 · 265 647 | 5 requests, `minimal` |

Cells show requests · estimated input tokens. The seconds estimate is `ceil(requests / concurrency) × 2 s`, so one request is estimated at one call (about 2 s). A large request may take longer than the 2 s measured per call, so treat this number as an approximation.

## Failures, retries and rate limits

- **One issue at a time.** A missing or malformed answer subset fails only its issue (`toBatchClassifications`). Only a failed HTTP call fails every issue of that request.
- **Retries** go through the same logic as per-issue requests: backoff with jitter, `retry-after`, the adaptive throttle and the auth abort (401, or 403 with `authentication_error`). Cancelling keeps completed results; issues in a request that was in flight stay unclassified.
- **Validation errors.** A 422 or 413 on a batch splits it in half and retries each half. The depth is bounded by log2 of the batch size, and a single issue that still fails reports the 422 detail.
- **Rate limits.** `models.md` gives the jev-1.13.0 account limits as **250 000 tokens/s** and **1 200 requests/min**. A pacer (`createRatePacer` in `pool.ts`) keeps every request under these limits minus 10%, including retries and validation splits. It waits before sending instead of discovering the limits through 429s. `models.md` warns that these limits can change, so the reactive 429 handling stays in place.

## Accuracy trade-off

`model-jaggedness/jev-1.13.md` (#5, "Large state full of irrelevant detail") warns that accuracy can fall as the state grows with content unrelated to a question. In a batch, the other issues are exactly that kind of content for each question. `cookbooks/parallel_questions.md` found that batching questions adds no noise, but that test used **one** document. Nothing measures a composite state of many issues yet, so measure it:

- Jev is not deterministic from run to run. Run the harness with `--noise` to see how much a per-issue run disagrees with itself, and read the batched rows against that level.
- Tighter profiles reduce the distractors but also remove evidence (comments, the end of long bodies). The harness shows which effect is larger on your data.
- Stored classifications are current for the same `issue.updatedAt` and `QUESTIONS_VERSION` (`isClassificationCurrent`). Unchanged issues are not re-sent under the default "unclassified" scope, so answers do not drift between runs. `updatedAt` also changes on label or comment edits, which can re-send an issue whose content did not change but never skips one whose content did. In batched mode, an issue's answer can also depend on which other issues share its request.

## Agreement harness

`scripts/compare-batching.mjs` classifies the same issues per-issue (the baseline) and batched under each profile, then prints a compact table.

1. **Export an analysis.** Open the app, open the analysis, and run this in the DevTools console:

   ```js
   copy(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('local-issue-classifier:analysis:v1:'))))
   ```

   Paste the result into `analysis.json`. If you have several analyses, list the keys with `Object.keys(localStorage)` and pick one. `local-issue-classifier:analyses:v1` holds the index with names. The harness accepts either the stored JSON or that JSON as a quoted string.
2. **Dry run (no key, no calls).** This prints requests and estimated tokens per mode:

   ```bash
   node scripts/compare-batching.mjs analysis.json --plan
   ```
3. **Compare.** Real calls with your key:

   ```bash
   JEV_API_KEY=... node scripts/compare-batching.mjs analysis.json --noise
   # options: --profiles compact,minimal  --limit 40  --concurrency 4  --model jev-latest
   # JEV_BASE_URL overrides https://api.typesafe.ai (for example a local provider)
   ```

The output looks like this:

```text
mode                calls  tokens  secs  cmplx       crit  effort  kind  rel±  conf±
------------------  -----  ------  ----  ----------  ----  ------  ----  ----  -----
per-issue           22     …       …     (baseline)
per-issue (repeat)  22     …       …     …           …     …       …     …     …
batched standard    2      …
batched condensed   1      …
```

- `cmplx` / `crit` / `effort` / `kind`: the share of issues with exactly the same level (or kind) as the baseline.
- `rel±`: the mean absolute difference of relevance on its 0..100 scale.
- `conf±`: the mean signed change in confidence.
- `calls` includes retries and validation splits. `tokens` is the usage the API reported.

Choose the tightest profile whose agreement is close to the `per-issue (repeat)` row, and set it as `Preferences.trimmingFloor`. The comparison logic is `src/domain/agreement.ts`, which has unit tests.

## Checklist

- [ ] `pnpm test` and `pnpm typecheck` pass.
- [ ] `node scripts/compare-batching.mjs analysis.json --plan` shows 1 request for a typical repository.
- [ ] A harness run on real data shows batched agreement within the per-issue noise for the chosen floor.

## Next step

Settings → Classifier (`ProviderSelector`'s Advanced disclosure, WIRE-2) shows `classifyMode` and `trimmingFloor`. Showing `estimate.profile` / `progress.profile` next to the request count in the Classify bar itself is not wired up yet.
