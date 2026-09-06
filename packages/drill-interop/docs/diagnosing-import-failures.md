# Diagnosing `.3dz` import failures

A checklist for triaging "the import failed / looks wrong" reports. It is
deliberately broader than any one bug — start here whenever a `.3dz` import
throws, silently drops data, or renders something wrong in OpenMarch, and use
the specific investigations below (label dedup, `PTB7` layout, etc.) as worked
examples of the method, not an exhaustive list of causes.

Related reading: [`../FORMAT.md`](../FORMAT.md) (format spec), and
[`investigation-notes.md`](./investigation-notes.md) (the `PTB7` set-list
reverse-engineering log — the fullest worked example of the process below).

## 1. Find out which of the two pipelines is actually failing

An import has two independent halves, and "import failed" could mean either:

1. **Parsing** (`packages/drill-interop/src`) — turns the `.3dz` bytes into a
   normalized `DrillShow` (performers, sets, coordinates, grid, audio sync).
   Pure, synchronous-ish TS with no Electron/DB dependency. Entry point:
   `parseDrillPackage()` in `src/package.ts`.
2. **Import into the DB** (`apps/desktop/src/components/import/DrillImport.ts`
   and `apps/desktop/src/db-functions/*`) — takes the `DrillShow` and writes
   marchers, pages, beats, and coordinates inside one
   `transactionWithHistory`. Runs only in the Electron renderer, against
   `better-sqlite3`.

These fail very differently:

- A **parser** bug throws inside `parseDrillPackage`/`parseDrillDocument`, or
  silently produces a wrong/incomplete `DrillShow` (missing sets, wrong
  coordinates, wrong labels) with no error at all — you only notice from the
  rendered result.
- A **DB-layer** bug throws a SQLite error (commonly a `unique()` constraint —
  see §4) from deep inside the transaction. Because the whole import runs in
  one `transactionWithHistory`, _any_ row failing anywhere rolls back the
  entire show — every marcher, every page — and the user sees one generic
  "import failed" toast (`drill.importFailed` via `conToastError`) regardless
  of which single row caused it.

**First move: isolate which half is in play** by running the parser alone,
outside Electron:

```bash
cd packages/drill-interop
npx tsx -e '
import { parseDrillPackage } from "./src/package.ts";
import { readFileSync } from "node:fs";
(async () => {
  const show = await parseDrillPackage(readFileSync(process.argv[1]));
  console.log({
    title: show.title,
    performers: show.performers.length,
    props: show.props.length,
    sets: show.sets.length,
    totalCounts: show.totalCounts,
  });
})();
' -- "/path/to/file.3dz"
```

(`npx tsx -e` needs the `async` IIFE wrapper above — bare top-level `await`
fails under `-e` specifically, unlike in a real `.mts` file in `scripts/`.)

If this throws or the counts look wrong, the bug is in `drill-interop`. If it
completes cleanly with sane numbers, the bug is downstream — in the transform
(`drillTransform.ts`), the field resolution (`resolveField.ts`), or the DB
insert (`DrillImport.ts` / `db-functions`). Section §3 has a template for
digging further into the parsed `DrillShow` without touching the DB at all.

## 2. Parser-side triage — reuse the existing diagnostic scripts

`packages/drill-interop/scripts/*.mts` are not part of the build or test
suite; they're throwaway (but committed) tools for exactly this. Reach for
one instead of writing a one-off from scratch — they already know how to walk
chunks the same way `parseDrillDocument` does:

| Script                       | What it shows                                                                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diag-chunk.mts <file>`      | Inventory of every top-level chunk (tag, size); `<file> <TAG>` hex-dumps one; `--strings <TAG>` prints just the printable strings in it. Start here for "a chunk I don't recognize" or "the file looks truncated".                                                              |
| `diag-setlist.mts <file>...` | What `readSetList` recovers from `PTB7` — parsed count vs. declared count. `--dump` adds a hex/ASCII view around a parse failure. Also the tool for the whole-corpus regression sweep (see its header comment and `investigation-notes.md` "How to repro diagnostics locally"). |
| `diag-pages.mts <file>...`   | Full parse → the page list as OpenMarch will show it (source set name, counts, subset flag, generated page name). Good for "the pages are right but numbered/labeled wrong".                                                                                                    |
| `diag-counts.mts <file>...`  | Cross-checks each set's duration against the counts the choreographer wrote into their own notes ("Move 16", "Hold 12"). Good for "the timing is off by N counts" reports.                                                                                                      |
| `diag-text.mts <file>`       | On-field text boxes (`PRP8`) and which count they land on. Good for "a note/HOLD box is on the wrong page".                                                                                                                                                                     |
| `analyze-markers.mts`        | Marker classification (cast vs. prop vs. reference) against the bundled sample fixture — start here if you're extending marker classification rather than diagnosing one file.                                                                                                  |

None of these need Electron, a DB, or a build step — they import `../src/*.ts`
directly via `tsx`, so they see your in-progress edits immediately (unlike the
desktop app — see §5).

If none of the existing scripts covers the chunk you're chasing, write a new
one in the same style rather than a scratch script elsewhere: same header
comment format (what it does + one example invocation), same
`unzipSync`/`BinaryReader` walk as `diag-chunk.mts`. That keeps the toolbox
useful for the next investigation instead of one-off and discarded.

### Reading the format spec before guessing

`FORMAT.md` documents every chunk's byte layout, including ones the reader
doesn't act on yet (§2.7, §7 "known mapping gaps"). Before assuming a chunk is
garbage or the format has drifted, check whether it's already decoded there —
several chunks (`COLR`, `TxD1`, `RMAP`, `COM2`, `PLS2`, `CORD`) are understood
but intentionally unread. If a new export breaks a layout assumption FORMAT.md
states as settled (e.g. a `PTB7` record shape, or the 69-byte `PG15` record
offsets), that's a real regression — the format only drifts between exporter
_builds_, not within a build, so a shape that stops tiling usually means a
genuinely new exporter version, not a corrupt file.

### Layout detection is often adaptive, not fixed — don't hardcode

`readSetList`'s "tile every candidate shape, rank by what tiles + recovers
real text" approach (FORMAT.md §2.4) exists because the record shape drifts
across exporter builds _and occasionally within one file_. If a new failing
file needs "just add this one shape to the list", check first whether it's a
layout the tiling search should already find — a hardcoded special case is a
sign the detection logic itself needs to widen, not that the file is
exceptional. `investigation-notes.md` is the log of this exact reasoning
playing out across ~50 real files; skim its "Ranking pitfalls" section before
tweaking `rank()` or `layoutCandidates()`.

## 3. Inspecting the parsed `DrillShow` for downstream (non-crash) bugs

Some of the worst bugs never throw — they produce a structurally valid
`DrillShow` that is wrong in a way only visible once you look at the data, or
only surfaces later as a DB constraint violation. When you suspect this,
write a short ad hoc script (delete it when done, or promote it to
`scripts/` if it'll be needed again) that calls `parseDrillPackage` and
asserts an invariant. Two invariants worth checking on every new failing file:

**No two performers/props share a `(drill_prefix, drill_order)` pair** — this
_is_ enforced by the DB (`unique()` on `marchers`, see §4) but is much easier
to see and fix here, before it becomes an opaque SQLite error three layers
down:

```ts
const groups = new Map<string, number>();
for (const p of [...show.performers, ...show.props, ...show.supplemental]) {
  const key = `${p.drill_prefix}|${p.drill_order}`;
  groups.set(key, (groups.get(key) ?? 0) + 1);
}
console.log([...groups.entries()].filter(([, n]) => n > 1));
```

**Every performer's rendered drill number matches its source label** — the
documented contract is `drill_prefix + drill_order === label`
(`apps/desktop/src/global/drillLabel.ts`'s `deriveMarcherFromDrillLabel` doc
comment; `Marcher.ts`'s `drillNumber` getter is what actually renders this in
the UI). A parser bug that silently reformats a label (wrong prefix split,
wrong numeric parse) shows up here without needing to open the app:

```ts
for (const p of show.performers) {
  const rendered = `${p.drill_prefix}${p.drill_order}`;
  if (rendered !== p.label) console.log({ label: p.label, rendered });
}
```

(Deliberate exceptions to this contract need a documented escape hatch, not a
silent mismatch — e.g. `drill_prefix: "-"` marks "source had no real prefix",
and the `"N-"` counter prefix marks "source label collided with N-1 others";
see `label.ts`/`document.ts`'s `dedupeBareNumericLabels`.)

Other things worth eyeballing directly on the `DrillShow`, since they have no
DB constraint to catch them: `show.sets.length` and each set's `.counts`
against the file's stated set list; `show.grid` fingerprint against what
`resolveDrillField` picks (see §4); `show.audioSync?.timestamps.length`
against `show.totalCounts`.

## 4. DB-layer triage — the transaction rolled back, now what

`_importDrillShow` (`DrillImport.ts`) does everything in one
`transactionWithHistory`, so a constraint violation anywhere aborts the whole
show. The unique constraints most likely to be hit by bad importer output
live in `apps/desktop/electron/database/migrations/schema.ts`:

| Table.columns                         | What it means for import                                                                                                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `marchers(drill_prefix, drill_order)` | Two performers/props ended up with the same rendered drill number — see §3's dedup check. This is the one that bit the Carolina `.3dz` files (bare-numeric labels colliding). |
| `pages(start_beat)`                   | Two sets resolved to the same beat — usually a `cumulativeCount`/page-mapping bug in `buildSets`/`deriveSetStartCounts`, not the DB layer itself.                             |
| `marcher_pages(marcher_id, page_id)`  | A performer got pushed into the same page's coordinates twice — check for duplicate ids in `show.sets[i].coordinates` or a double call into `pushCoords`.                     |

When you hit one of these, don't stop at "SQLite threw" — reproduce with the
parser-only script from §1/§3 first, find _which_ rows collide, and only then
decide whether the fix belongs in `drill-interop` (don't produce the
collision) or in the desktop layer (tolerate/dedup it on the way in, as
`readCast`'s `dedupeBareNumericLabels` does). Prefer fixing it as far upstream
as the data allows — a downstream workaround that fixes symptoms in
`DrillImport.ts` without touching the parser tends to reappear the next time
something else reads `show.performers` directly.

`transactionWithHistory` re-throws past `_importDrillShow`, so the real
SQLite error is visible if you catch it directly (e.g. temporarily change
`conToastError` to `console.error(error)`, or run the import from a Node
script against a throwaway DB file instead of through the UI) rather than
relying on the generic toast.

## 5. Don't chase a ghost: `dist/` vs `src/`

The desktop app depends on `@openmarch/drill-interop` as a workspace package
and imports **`dist/index.js`** — not `src/`. Diagnostic scripts, vitest, and
`npx tsx` all import `src/*.ts` directly. This means:

- A parser fix is **invisible in the running app** until you rebuild:
  `cd packages/drill-interop && pnpm build` (or `pnpm dev` to watch).
- If a fix "isn't working" when you re-import in the app but the diag script
  shows it fixed, rebuild before doing anything else. This produced a real
  false alarm once (see `investigation-notes.md`'s "⚠️ The desktop app runs
  `dist/`, not `src/`" section) — a two-day-stale `dist/` made a correct fix
  look broken.
- Import is a **destructive full replace** (`_importDrillShow` deletes all
  existing marchers/pages/beats/measures before inserting the new ones) —
  re-importing does not migrate or merge with whatever was already open. Use
  a scratch/throwaway show when iterating, not one with real user edits.

## 6. Writing a regression test once you've found the bug

- Parser bugs: add a case in the relevant `packages/drill-interop/src/__test__/*.test.ts`
  (`label.test.ts`, `cast.test.ts`, `setList.test.ts`, `props.test.ts`, …).
  Most existing tests build a synthetic payload byte-for-byte with a local
  helper (see `cast.test.ts`'s `buildCastPayload`) rather than requiring a
  real fixture file — prefer that: it documents the exact byte layout being
  tested and doesn't depend on a licensed sample file being present.
- Full-pipeline bugs: `parseDrillPackage.test.ts` needs
  `src/__test__/fixtures/sample.3dz`, which is licensed and not always present
  (gitignored) — don't block a fix on adding to it; a synthetic unit test at
  the right layer is almost always reachable instead.
- DB-layer bugs: add/extend a test near the existing import tests
  (`apps/desktop/src/components/import/__test__/drillTransform.test.ts` and
  neighbors) rather than only relying on a manual import.

## 7. Verifying an actual fix end-to-end

1. `cd packages/drill-interop && npx vitest run src/__test__/*.test.ts` (or
   the specific files you touched).
2. Re-run the parser-only script from §1/§3 against the real failing file(s)
   and re-check the invariants in §3.
3. `pnpm build` in `packages/drill-interop` (§5 — the app won't see the fix
   otherwise).
4. If feasible, run the actual desktop import (`/run` skill or manual) on the
   real file and confirm the result on screen, not just that it didn't throw.
