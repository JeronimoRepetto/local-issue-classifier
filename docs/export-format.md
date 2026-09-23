# Export format

The **Export…** dialog (SPEC.md §2.6) builds a plain-text report with a pure formatter,
`src/domain/exportText.ts`'s `formatExport(analysis, options, now)`, and saves it through the
anchor-based download helper (`src/adapters/download.ts`) as
`{owner}-{repo}-issues-{YYYYMMDD-HHmm}.txt` (the stem comes from `exportFilenameStem`).

The formatter is pure and deterministic: given the same analysis, options and clock, it always
produces the same bytes. The only line that varies run to run is `Generated`, since it carries the
injected clock.

## Format rules

- Fixed-width layout: every header label is padded to 11 characters before its colon; the row index
  is padded to at least 2 characters.
- Two-space indentation units: detail lines under a row are indented 4 spaces (two units).
- LF line endings only, UTF-8 without a BOM, exactly one trailing newline.
- Titles are forced onto one line: `\r\n`, `\r`, `\n` and `\t` all become a single space.
- Omitted optional parts leave no empty placeholder — no confidence, no `Include URLs` line, no
  empty section header for a section with nothing in it.
- Levels are upper-cased (`HIGH`/`MEDIUM`/`LOW`). Confidence is always 2 decimals.
- Dates are `YYYY-MM-DD`. The `Generated` line uses the local time zone (the injected clock's own
  `getHours`/`getMinutes`, no timezone conversion).
- The export never contains a secret: it is built only from `Issue`, `Classification` and the
  analysis's own working state — never from `Secrets`.
- Ties are broken by issue number ascending, same as the table (`sortRowsBy`'s final tie-break).

## Sections

1. **Header** — one label per line (see below).
2. **Main section** — a divider (`===...`, 72 `=` characters), then every issue that is classified,
   not dismissed, and in scope, in the export order (`options.order`).
3. **Unclassified (N)** — only when `options.includeUnclassified` is true and at least one row has
   no classification. These rows bypass the working filter entirely: "Include unclassified" is a
   blanket toggle, not another filter dimension, so a narrowed filter (say, a relevance floor no
   unclassified row can satisfy) never empties this section.
4. **Dismissed (N)** — only when `options.includeDismissed` is true and at least one row is
   dismissed. Dismissed rows never appear anywhere else, classified or not.

Sections are separated by a blank line; entries within the main section are separated by a blank
line too.

## Header lines

| Label | Content |
|---|---|
| `Repository` | `{owner}/{repo} ({stateFilter} issues)`, plus ` — "{name}"` when the analysis was renamed away from its default name. |
| `Generated` | `YYYY-MM-DD HH:mm (local time)`, from the injected clock. |
| `Model` | `{model} · questions v{questionsVersion}` from the first classified row found; omitted when nothing is classified yet. |
| `Order` | The export order, e.g. `Priority (high→low), Effort (low→high)`. Date keys read `newest→oldest` / `oldest→newest` instead. |
| `Weights` | `Criticality N · Relevance N · Complexity N (inverted) · Effort N (inverted)`, the analysis's `priorityWeights`, always shown even if every weight is 0. |
| `Scope` | `{filtered view|all issues} — {main count} of {total issues}`, plus ` (filters: …)` for an active, non-default filter when `scope` is `'filtered'`. |
| `Note` | A fixed sentence about the ordinal, model-based nature of levels/relevance/priority. |

## Main-section entry

```text
 1. #812  Crash when rendering empty list
    Priority   : 83/100
    Criticality: HIGH (conf 0.91) · Complexity: MEDIUM (conf 0.74) · Effort: LOW (conf 0.82)
    Relevance  : 88/100 (0.77) · Kind: bug · Labels: bug, regression
    Opened 2026-09-02 by @jdoe · updated 2026-09-20 · 3 comments
    https://github.com/acme/widgets/issues/812
```

- `Priority` shows `—` when every priority weight is 0 (`priorityOf`/its export-side equivalent
  returns `null`; see the note on Task 14 below).
- Confidence parentheticals (`(conf 0.91)` for a level, `(0.77)` for relevance) are omitted
  entirely when `includeConfidence` is false, or when that particular dimension's confidence is
  absent (the Jev response did not include one) — never rendered as an empty placeholder.
- `Labels` shows `—` when the issue has none.
- The URL line is omitted entirely when `includeUrls` is false.
- `comment`/`comments` is pluralized on the comment count.

## Compact entry (Unclassified / Dismissed)

```text
 -  #815  Add Svelte adapter (not classified: Rate limited — retried 3×)
```

The `(not classified: …)` suffix only appears for a row with `status: 'error'` and a stored error
message; otherwise it is omitted.

## Worked example

Golden fixture (byte-for-byte, apart from the `Generated` line): `tests/fixtures/export/basic-report.txt`.

```text
issue-criticity report
Repository : acme/widgets (open issues)
Generated  : 2026-09-23 14:05 (local time)
Model      : jev-1.13.0 · questions v1
Order      : Priority (high→low), Effort (low→high)
Weights    : Criticality 40 · Relevance 30 · Complexity 15 (inverted) · Effort 15 (inverted)
Scope      : filtered view — 1 of 3 issues (filters: Relevance ≥ 50)
Note       : Levels, relevance and priority are model-based estimates; relevance and priority are ordinal 0–100 signals.

========================================================================
 1. #812  Crash when rendering empty list
    Priority   : 83/100
    Criticality: HIGH (conf 0.91) · Complexity: MEDIUM (conf 0.74) · Effort: LOW (conf 0.82)
    Relevance  : 88/100 (0.77) · Kind: bug · Labels: bug, regression
    Opened 2026-09-02 by @jdoe · updated 2026-09-20 · 3 comments
    https://github.com/acme/widgets/issues/812

========================================================================
Unclassified (1)
 -  #815  Add Svelte adapter (not classified: Rate limited — retried 3×)

========================================================================
Dismissed (1)
 -  #999  Old debug helper
```

## Edge cases

- **Nothing in scope.** When no row would appear in any section, Download is disabled and the
  dialog shows "Nothing to export." (`exportScopeCount`, used by `useExport().scopeCount`).
- **Empty main section, non-empty other sections.** The main section's divider still appears with
  no entries under it; the Unclassified and/or Dismissed sections still render if they have rows.

## API surface

| Export | From | Purpose |
|---|---|---|
| `formatExport(analysis, options, now)` | `src/domain/exportText.ts` | Builds the full report text. Pure. |
| `exportScopeCount(analysis, options)` | `src/domain/exportText.ts` | Total rows that would appear in any section — backs the "Nothing to export" gate. |
| `exportFilenameStem(analysis, now)` | `src/domain/exportText.ts` | `{owner}-{repo}-issues-{YYYYMMDD-HHmm}`, without the `.txt` extension. |
| `sortRowsBy(rows, rules, weights?)` | `src/domain/sort.ts` | The stable multi-key sort used for the main section, and by the table itself. |
| `downloadText(text, filename)` | `src/adapters/download.ts` | Anchor-based download: Blob URL → `<a download>` click → revoke on the next tick. |
| `useExport()` | `src/composables/useExport.ts` | `options`, `setOptions`, `setOrder`, `useCurrentTableSort`, `previewText`, `scopeCount`, `download`. |

## Priority (Task 14)

`exportText.ts` imports `priorityOf` from `domain/priority.ts` (SPEC.md §4.9) directly; the golden
fixture stayed byte-identical after the swap, since the formula was already the exact one used
here. The table's own `priority` sort key (`sort.ts`) uses the same `priorityOf`, so the export
order and the table order agree: `null` (unclassified, or every weight 0) always sorts last in
both directions, with the final tie-break by issue number.
