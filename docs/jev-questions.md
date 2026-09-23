# The Jev questions

issue-criticity sends **one request per issue** to Jev, carrying the issue state and the same five
questions every time. Four questions drive the table; the fifth is a cheap extra. The questions live
in one file, `src/adapters/jev/questions.ts`, which is the single source of truth. This page explains
what each question asks and how its answer becomes a value in the app.

## At a glance

| Id | Type | Levels | Shown as | Counts toward min confidence |
|----|------|--------|----------|------------------------------|
| `complexity` | Score | 3 | Low / Medium / High | yes |
| `criticality` | Score | 3 | Low / Medium / High | yes |
| `effort` | Score | 3 | Low / Medium / High ("cost") | yes |
| `relevance` | Score | 5 | 0–100 ranking signal | yes |
| `kind` | Choice | 6 options | bug, feature, documentation, question, maintenance, other | no |

## The questions

### Complexity

*"How technically complex is the change needed to resolve `issue`, given `project`?"*
Focus: the difficulty of the problem and the solution, not the amount of typing.

| Level | Covers | Examples |
|-------|--------|----------|
| 0 Low | A straightforward change in one obvious place, with no design decisions | fix a typo in an error message; bump a dependency |
| 1 Medium | Needs understanding of several parts of the codebase, or a small design decision | a bug spanning two modules |
| 2 High | Deep knowledge, a non-trivial design, or concurrency, security, performance, data migration or public API compatibility | race condition in a scheduler; memory leak with unknown cause |

### Criticality

*"How critical is `issue` for the users of `project` if it is left unresolved?"*
Focus: impact on users, meaning breakage, data loss, security or blocked workflows.

| Level | Covers | Examples |
|-------|--------|----------|
| 0 Low | No functional impact: cosmetic, nice-to-have, question or idea | typo in docs; feature suggestion |
| 1 Medium | A feature is broken or degraded but a workaround exists, or few users are affected | option ignored on one platform |
| 2 High | Blocking, data loss, security vulnerability, crash, or broken core functionality with no workaround | install fails for everyone; crash on startup |

### Effort

*"How much work would it take a maintainer of `project` to resolve `issue`, including tests and
documentation?"* Focus: the amount of work, **not** how important the issue is.

| Level | Covers | Examples |
|-------|--------|----------|
| 0 Low | Small; a few hours at most | one-line fix with a test |
| 1 Medium | Moderate; roughly one to a few days | a small feature with tests |
| 2 High | Large; a week or more, several pull requests, or coordination with other people | major refactor; breaking change with a migration guide |

### Relevance

*"How relevant is `issue` to the purpose of `project` as described in its README, description and
topics?"* Focus: whether the issue is about what the project is for, **not** whether it is
important. Five plain-text levels, from "unrelated (spam, off-topic, a different product)" through
"tangential", "a minor or peripheral part", "a documented feature or common usage", to "the core
purpose or main functionality".

### Kind

*"What kind of request is `issue`?"* A Choice between `bug`, `feature`, `documentation`, `question`,
`maintenance` and `other`. It is speculative: it feeds a display column and a filter, and it is left
out of the minimum confidence.

## How answers become values

| Answer | Mapping |
|--------|---------|
| Complexity, Criticality, Effort | `['low','medium','high'][clamp(round(score), 0, 2)]`. The raw `score` is kept for finer sorting. |
| Relevance | `round(100 × score / 4)`, so the anchors are 0, 25, 50, 75 and 100. This is an **ordinal ranking signal, not a calibrated percentage**: the Jev docs call score levels "weak in numerical calibration". |
| Confidence | Stored per dimension when Jev returns it. The row's minimum confidence is the minimum over the four main dimensions; below the threshold (default 0.5) the row gets a "low confidence" badge. |

A response with a missing answer, a wrong answer type, a non-numeric score or the wrong number of
probabilities is rejected as a whole ("Unexpected Jev response"). Partial answers are never stored.

## Why the questions look like this

- **Score for the spectra.** Complexity, criticality and effort are ordered, so each is a Score whose
  levels run low → high (the array order is the level number).
- **Situations, not degrees.** Each level describes situations with examples instead of words like
  "moderately severe", as the Jev Score guide advises.
- **One dimension per question.** Effort and relevance say explicitly that they are not about
  importance, so the dimensions do not bleed into each other.
- **Backticked paths.** Instructions point at the state with `` `issue` `` and `` `project` ``.
- **Untrusted content.** Issue text may try to steer the answer. The criteria stay explicit, and the
  app only displays the results; it never acts on them.

## What the state contains

The questions are asked against a JSON state built by `src/domain/jevState.ts`:

- `project`: name, description, topics, package name and description, README excerpt (≤ 6 000 chars),
  CONTRIBUTING excerpt (≤ 1 500 chars) and up to 40 names from the top level of `docs/`.
- `issue`: number, title, state, labels, the author's role, **age and last activity as buckets**
  (for example "1 to 4 weeks"; raw dates are never sent), comment and reaction counts, the body
  (≤ 8 000 chars: first 6 000 + last 1 500), and selected comments.
- Comments: bots (`[bot]` logins) and bodies under 10 characters (such as "+1") are dropped, then the
  first 2 and last 6 are kept, each ≤ 1 000 chars. `comments_note` says what was left out.

**Size guard.** A state may use at most 12 000 estimated tokens (`ceil(chars / 3.5)`). Over budget,
it is trimmed in a fixed order: comments from the middle, then the body to 4 000 chars, then the
README to 3 000 chars. If it is still too large, the issue is marked "Issue too large even after
trimming" and is not sent.

## Cost

Each request costs its state tokens plus the question tokens (about 900). Jev charges only input
tokens, at $0.042 per million, so 200 typical issues cost roughly $0.03–0.06. The in-app estimate
uses `estimateRun()` from `src/domain/estimate.ts`.

## Priority

Priority is a single 0–100 **ranking aid**, computed on the fly by `src/domain/priority.ts`'s
`priorityOf(classification, weights)` from a row's four scores above and four user-adjustable
weights. It is never sent to or returned by Jev, and it is never stored: changing a weight never
touches a classification, only how the same stored scores are combined.

Each dimension is normalized to 0–1 first. Complexity and effort are **inverted** — a simpler,
lower-effort issue ranks higher — then the four are combined as a weighted mean:

| Dimension | Normalized as | Direction |
|---|---|---|
| Criticality | `score / 2` | higher score → higher priority |
| Relevance | `score / 4` | higher score → higher priority |
| Complexity | `1 − score / 2` | **inverted** — lower score → higher priority |
| Effort | `1 − score / 2` | **inverted** — lower score → higher priority |

```text
priority = round(100 × (wCrit·crit + wRel·rel + wCx·simp + wEf·ease) / (wCrit + wRel + wCx + wEf))
```

Weights default to 40 / 30 / 15 / 15 (Criticality / Relevance / Complexity / Effort;
`defaultPriorityWeights()`), run 0–100 in steps of 5 (`clampWeights` rounds to the nearest
multiple of 5 and clamps to that range), and are edited in the **Weights** popover next to the
table's Priority column header. Priority is `null` — shown as "—" — for an unclassified row, or
when every weight is 0: there is nothing to rank on.

Like relevance, priority inherits the ordinal nature of the Jev scores: it is a **ranking aid, not
a measurement**, and the UI caption next to the Weights popover says so.

## Changing a question

1. Edit the text in `src/adapters/jev/questions.ts`.
2. Bump `QUESTIONS_VERSION`. Every stored classification becomes stale.
3. Run `pnpm test`. The version guard fails and prints the new hash; add it under the new version in
   `questions.test.ts`, then update the snapshot with `pnpm vitest run -u`.
4. Update this page.
