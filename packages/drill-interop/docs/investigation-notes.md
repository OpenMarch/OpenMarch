# Drill package investigation notes

Research log for reverse-engineering `.3dz` / `.3dj` set-list and page formats.
Canonical format reference remains [`../FORMAT.md`](../FORMAT.md); this file is
the **working notes** — what we tried, what each real file did, and what is
still open.

Last updated: 2026-07-20. `PTB7` is **done**: all 50 `PTB7` files on this
machine parse their full declared set count. Remaining work is `PTB6` (Open
case B) only.

---

## Goals

1. Import every real Pyware export we care about with the correct page list
   (including subsets / trailing holds).
2. Prefer matching the source’s own pages over heuristics (“same formation”).
3. Keep the parser adaptive — exporter builds drift; hard-coding one layout
   regresses the next file.

---

## Architecture of the current `PTB7` parser

Code: `src/document.ts` → `readSetList`.

### Record shape (conceptual)

```
u16 version          // NOT a reliable layout key
u16 count
then count ×:
  u64 id
  u16 cumulativeCount
  skip bytes         // reserved; width varies
  titleLen           // 1- or 2-byte prefix
  title
  note1Len           // 1-, 2-, or 4-byte prefix
  note1              // move note (UTF-8)
  [note2Len + note2] // optional second note
  trailer bytes      // reserved; carries subset marker
```

Notes are **up to five slots** (`PTU1` names them `Note 1`…`Note 5`), not two:
`note1` has its own prefix width, then `1 + extraNotes` further slots share a
width. Most sets fill only the first slot or two.

### Detection (two-stage)

1. **Uniform tiling** — try a grid of shapes
   (`skip` 0–10, `title` 1|2, `note1` 1|2|4, `note2` 0|1|2|4, `extraNotes` 0–3,
   `trailer` 8–20). Keep the best by `rank()`.
2. **Resume + search** — if the best shape dies mid-file, replay it for the head,
   then _search_ for a per-record shape assignment over the rest, using “consumes
   the whole payload in exactly `count` records” as the acceptance test and
   backtracking when a prefix leads nowhere. Memoized on `(index, pos, lastCum)`.

**Greedy per-record selection does not work** — see Open case A. Consecutive
empty records admit many shapes whose end offsets differ by a byte or two, all
scoring zero; picking wrong only becomes visible several records later, so the
choice has to be validated globally, not locally.

### Subset marker

- Byte **5 from the end of each record** (`trailer[end - 5] === 1`).
- Means: the **next** set is a labeled subset (e.g. `12A`).
- Reading from the record end is invariant to skip/trailer splits (those bytes
  trade off against each other in equally-valid tilings).
- Trailing closing holds: last set’s `cumulativeCount` can mark one more page
  with no record of its own; we materialize it. Subset-ness follows the same
  previous-set flag rule. Product requirement: match the source pages.

### Ranking pitfalls (learned the hard way)

- `skip` and `trailer` are both discarded → many wrong shapes still “tile”.
- Tie-break with a **text score** (titles weighted ×10, notes ×1).
- A **zero-score “complete”** tiling (e.g. `trailer=0` eating a truncated
  payload as many empty records) must not beat a high-score partial with real
  titles. `rank()` only gives the complete mega-bonus when `score > 0`.
- …but some shows genuinely have **no titles and no notes at all**, so every
  tiling scores zero and the guard above has nothing to prefer. When _no_ tiling
  anywhere recovered text, that ambiguity is absent — take the complete tiling.
  (Fixed westoak part3, hartsville part2, batesburg v2/v3, westsidehs2026 …)
- Among **partial** tilings, rank by recovered text _before_ record count. A
  misaligned small-record shape can always tile more records out of the same
  bytes; only the right one reads set names back out of them. Ranking records
  first is what red-lit the synthetic Jack Britt head.
- Minimum trailer in the grid is **8** to cut fake layouts.

### Placeholder vs nameless sets

- The **first** record with `cumulativeCount === 0` is the page-0 anchor: drop
  it, merging its note into the set that takes its place.
- Judge it by position + count, never by nameless-ness — later-part exports name
  the anchor after the carried-in formation (`36A`, `8A`, `8`, `A`).
- Keep nameless sets everywhere else (westoak / some eastside drafts label by note).

### Careful: the notes are forward-looking

A set's note describes the move **leaving** it (`"Move 16"` on set N = the
16-count move from N to N+1), and a set's formation sits at the _previous_
record's cumulative count. So a note's stated count matches the **next** page's
duration, not its own. Comparing note counts to their own page's duration makes
the mapping look off by one when it is correct — a trap that cost real time
here. `15A` being the source's last official set (20 records → 19 sets + the
materialized trailing hold) is the check that the current mapping is right.

---

## Observed `PTB7` layouts (uniform files)

| Family                 | Example files                                                                           | skip | titleLen | note1 | note2 | trailer |
| ---------------------- | --------------------------------------------------------------------------------------- | ---- | -------- | ----- | ----- | ------- |
| Classic two-note       | westside `sample.3dz`, Jack Britt, Part 1, westoak, eastside2025 part3, hartsville 2026 | 3    | u16      | u32   | u16   | 14      |
| Eastside draft-7 style | `eastside2026Draft7_7-TS.3dz`, eastside2025 part2 (similar)                             | 1    | u16      | u32   | u16   | 16      |

`version` in the header does **not** select among these (seen `1`, `9`, `25`, `32` with overlapping shapes).

---

## File-by-file results

Paths are wherever they lived when tested (Downloads / iCloud Bright Designs folder).

| File                                                                                                                      | Era / tags                   | Set parse status                      | Notes                                                       |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------- | ----------------------------------------------------------- |
| `sample.3dz` (fixture, westside part4)                                                                                    | `PTB7` + `PG15`              | ✅ 25 sets (24 named + trailing hold) | Committed test guardrail                                    |
| Jack Britt Act 1                                                                                                          | `PTB7`                       | ✅ ~19 sets, subsets flagged          | Subset flag discovery source (`12A`); trailing hold (`15A`) |
| Part 1                                                                                                                    | `PTB7`                       | ✅ ~13 sets                           | Broke older single-note walk (uses note2)                   |
| westoak2025-part 2                                                                                                        | `PTB7`                       | ✅ ~29 sets                           | Nameless; labeled by notes; `version` 9-ish                 |
| eastside2026 Draft7_7-TS                                                                                                  | `PTB7`                       | ✅ 11 sets                            | Layout `skip=1, t=u16, n1=u32, n2=u16, tr=16`               |
| eastside2026 draft7_13-MS                                                                                                 | `PTB7`                       | ✅ 23 sets                            | Was 20/23 — per-record shape variation, see Open case A     |
| Eastside2025-part2-081625                                                                                                 | `PTB7`                       | ✅ 11 sets                            | Nameless + notes                                            |
| eastside2025-part3                                                                                                        | `PTB7`                       | ✅ 23 sets                            | Real titles e.g. `150-151`                                  |
| hartsville 2026 - part 1                                                                                                  | `PTB7`                       | ✅ 14 sets                            |                                                             |
| The Wedge / Creative Groupings                                                                                            | promo stubs                  | ✅ 0 useful sets                      | No real drill content                                       |
| westoak2025-part1, west oak hs part 1                                                                                     | `PTB7`                       | ✅ 13 sets                            | Was 1/13 — **five note slots**, see Closed case C           |
| westoak2025-part3, hartsville2025-part2, batesburg2025 v2/v3, westside2025part4-old, westsidehs2026-part1, lhs2025 insert | `PTB7`                       | ✅ full                               | Was 0–2 — **text-free set lists**, see Closed case C        |
| Swansea HS 2021 - Mvt 1                                                                                                   | **`PTB6` + `PAGE` + `CST6`** | ❌ not supported                      | Older generation — see below                                |
| Dreher HS 2019 Mvt. I                                                                                                     | **`PTB6` + `PAGE` + `CST6`** | ❌ not supported                      | Same generation as Swansea                                  |

---

## Open case A — `eastside2026draft7_13-MS.3dz`

### Why it looked “totally different”

Early hex suggested a variable optional field (`0x0130`) before the title. That
was a **misread**: under the eastside7 layout those bytes are:

```
skip(1)=00, titleLen(u16)=0001, title="0", note1Len=0, note2Len=…, note2="Pre Show…"
```

So draft 7 and draft 13 share the **same head layout** and even the same early
set ids. Draft 13 simply has more sets.

### What’s actually broken

Uniform layout `skip=1, title=u16, note1=u32, note2=u16, trailer=16` parses
records **0–18** cleanly, then dies at record **19**.

Record 19 bytes (at failure):

```
id(8) cum=0x00a8 (168)
00 00 00 00 05 "32-39" 00 00 00 12 "built up to WW Ft." + 16-byte trailer
```

Under the head layout that becomes `titleLen=0` then absurd `note1Len`.
The intended read for the **tail** is one of:

| skip | titleLen | note1 | note2 | trailer | leftover after full walk    |
| ---- | -------- | ----- | ----- | ------- | --------------------------- |
| 3    | u16      | u32   | 0     | 16      | 0                           |
| 3    | u16      | u32   | u16   | 14      | 0 (equiv. when note2 empty) |
| 4    | u8       | u32   | 0     | 16      | 0                           |
| 4    | u8       | u32   | u16   | 14      | 0                           |

### RESOLVED (2026-07-20) — and it is **not** a mid-file switch

The “switches shape mid-file” reading was wrong, and acting on it (a one-time
forced switch) would have failed. Record 19 is the _only_ record with the
alternate framing; records 20–22 go straight back to the head shape. So the
variation is **per-record**, correlated with the record having a real title:
two reserved bytes move from the record's tail to its head (`skip 1` + trailing
`note2` ⇄ `skip 3` + no `note2` — the record length is identical either way).

**Why the resume stopped at record 20** (the actual bug): at body offset 763
the greedy picker enumerated candidates and took the _first_ one that passed
`peekCum`, since all consecutive-empty candidates score zero and
`r > bestRank` keeps the first:

```
skip=0 t=u16 n1=u32 n2=u16 tr=16 → end=797 nextCum=768   ← chosen (wrong, off by one)
skip=0 t=u16 n1=u32 n2=u16 tr=17 → end=798 nextCum=204   ← correct
```

`nextCum=768` is monotonic and under the 10 000 sanity bound, so the local
checks could not reject it; record 21 then misaligned and the walk died. The
fix is the backtracking search described above — the wrong branch simply fails
to reach a full-payload consumption and is unwound.

Result: **23/23 sets**, and the same change fixed `Part 2v2.3dz` (17→19).

---

## Verified end-to-end — Jack Britt

`npx tsx scripts/diag-pages.mts "Jack Britt Act 1.3dz"` → 20 pages, 278 counts,
147 performers. This is the file the subset rules were derived from, so it is
the best end-to-end check that the page list still matches the source:

```
page 1    src="1-8"     start=   0  counts=  0
page 1A   src="9-16"    start=  24  counts= 24  SUBSET
page 2    src="17-18"   start=  48  counts= 24
…
page 12   src="50-51"   start= 180  counts=  8
page 12A  src="52-53"   start= 188  counts=  8  SUBSET   ← the documented subset
…
page 15   src="60-END"  start= 220  counts= 16
page 15A  src=""        start= 244  counts= 24  SUBSET   ← materialized trailing hold
```

Both landmarks from the product discussion are present: the `12A` subset comes
from the source's own marker (not geometry), and `15A` is materialized from the
final record's `cumulativeCount` despite having no record of its own.

---

## Closed case C — five note slots (`PTU1`)

Found by sweeping every `.3dz` on the machine rather than only the files in the
table above: ten files recovered 0–2 sets, a failure class the notes had never
recorded. Two distinct causes, both now fixed.

**(1) More than two notes per record.** `westoak2025-part1.3dz` record 0:

```
skip(4) titleLen(u16)=0 note1(u16)=78 "NG1 is featured performer, …"
                        note2(u16)=114 "Adjust set as needed, …"
                        note3(u16)=112 "Groups are sorted by color. Blue = Group 1, …"
                        note4=0 note5=0 trailer
```

The grid only ever modeled two, so the record could not tile. Hence the
`extraNotes` dimension. Note the first slot's prefix is often u32 while later
slots are u16 — hence separate `note1` / `note2` widths.

**(2) Set lists with no text at all** (`westoak2025-part3.3dz`: 12 records,
35 bytes each, every title and note empty). Covered under Ranking pitfalls.

---

## Open case B — older generation (`PTB6` / `PAGE`)

Swansea 2021 and Dreher 2019 are **not** a `PTB7` variant. Chunk inventory:

| Modern (`PTB7` era)       | Older (2019–2021 samples)                |
| ------------------------- | ---------------------------------------- |
| `PRF3`                    | `PRF2` (+ `PRPT`, `PREF`)                |
| `CST7`                    | `CST6`                                   |
| `PTB7`                    | **`PTB6`** (+ **`PTBT`**)                |
| `GRD1`                    | `GRID`                                   |
| `PG15` (per-count frames) | **`PAGE`** (many; not the same encoding) |
| `PRP8` / `SEL2` / `VIS2`  | `PRP7` / `PRPM` / `SEL1` / `VIS1`        |

### `PTB6` crumbs (Swansea)

```
u16 version=1
u16 count=10
then records appear to use **u32 ids** (not u64), with set names like "0",
"1-8", "9-12" and long notes. Exact field widths not locked.
```

`PTBT` payload: `u16 count` then `count` bytes of `0x3b` (`';`) — likely a
parallel type/flag table (one byte per set). Dreher: count=23, twenty-three
`;` bytes.

### `PAGE` crumbs

- Hundreds of `PAGE` chunks (Swansea ~300, Dreher ~500) instead of `PG15`.
- Coordinates look **unencrypted / different record layout** from the
  AES-style `PG15` block (see `FORMAT.md` page frames + `crypto.ts`).
- Full older-generation support means: `PTB6` set list **and** `PAGE`
  coordinate decode **and** `CST6` cast — a separate workstream from `PTB7`
  layout detection.

### `CST6` (Swansea)

```
u16 count
then: u16? id, u8 labelLen, label, padding…  (F1, F2, TS1, …)
```

Dreher’s `CST6` was empty (`len=2`, count 0) in the sample we had — may be a
stripped export.

---

## Other chunks seen on modern eastside files

Useful when comparing drafts; not all are parsed today.

| Tag                    | Observation                                                            |
| ---------------------- | ---------------------------------------------------------------------- |
| `PTU1`                 | Note-slot names (`Note 1`…`Note 5`) + list of set ids with a flag byte |
| `TLL2`                 | Timeline / track label (`Main`, `N;-1;-1`, …)                          |
| `PTL1`                 | Tiny (3 bytes) in samples                                              |
| `PLS2`                 | Playlist (skipped)                                                     |
| `RMAP`, `COM2`, `CORD` | Trailing metadata (skipped)                                            |

---

## Subset / trailing-page product decisions

Confirmed with product:

- Prefer the **source’s own subset flag** over geometry (`formationsMatch`).
- **Must** materialize trailing pages implied by the last set’s
  `cumulativeCount` (e.g. Jack Britt `15A`), even when that page has no
  `PTB7` row of its own.
- Subset vs plain for that trailing page = same rule as any other page (flag
  on the previous/final named set).

---

## How to repro diagnostics locally

`scripts/diag-setlist.mts` does this — it walks chunks the same way
`parseDrillDocument` does, then reports what `readSetList` recovers:

```bash
cd packages/drill-interop
npx tsx scripts/diag-setlist.mts <file.3dz>...        # chunk inventory + sets
npx tsx scripts/diag-setlist.mts --raw <file.3dz>     # + hex/ASCII of the payload
```

The whole-corpus sweep that found Closed case C — run this before and after any
detection change, and diff the two outputs:

```bash
find ~/Library/Mobile\ Documents ~/Downloads -iname "*.3dz" -not -path "*/.Trash/*" -print0 |
  xargs -0 npx tsx scripts/diag-setlist.mts |
  awk '/^=== /{f=substr($0,5)} /parsed [0-9]+ sets of/{print f" -> "$3"/"$6}'
```

~20 s for 55 files. A file is healthy when parsed equals the declared count, or
is one below it (the dropped page-0 placeholder).

### ⚠️ The desktop app runs `dist/`, not `src/`

`apps/desktop` depends on `@openmarch/drill-interop` as a workspace package, so
it loads **`dist/index.js`** — the diag scripts and vitest import `src/`
directly. A parser fix is therefore invisible to the app until you rebuild:

```bash
cd packages/drill-interop && pnpm build     # or `pnpm dev` to watch
```

Then re-import the file (import is a destructive full replace; existing pages
are not migrated). This cost us a false alarm: Jack Britt showed no `12A` and
ended at page `16` in the app while `src/` produced the correct `12A`/`15A` —
the `dist/` build was two days stale.

Committed tests:

```bash
cd packages/drill-interop
npx vitest run src/__test__/setList.test.ts src/__test__/parseDrillPackage.test.ts
```

`parseDrillPackage` needs local `src/__test__/fixtures/sample.3dz` (licensed;
gitignored / not always present).

---

## Resume checklist

- [x] Finish eastside13 — 23/23 via backtracking search (not a one-shot switch).
- [x] Re-green `setList.test.ts` synthetic Jack Britt head (28/28 tests pass).
      It was already red at the pause; the partial-tiling rank order fixed it.
- [x] Sweep all 50 `PTB7` files — every one parses its full declared count.
- [ ] Update `FORMAT.md` §2.4 (remove outdated `0x0130` “unsupported” note;
      document per-record shape variation + the five note slots).
- [ ] Optionally add local (gitignored) fixture tests for eastside13 / westoak
      part1 (5 slots) / westoak part3 (text-free) / Swansea.
- [ ] New workstream: `PTB6` + `PTBT` + `PAGE` + `CST6` for 2019–2021 exports.
- [x] Leading page-0 anchor — fixed. Identified by position + `cumulativeCount
=== 0`, not by looking nameless; its note is merged into the surviving
      first set. 10 files no longer import a duplicate zero-count page. See
      `FORMAT.md` §2.4.

---

## Key code / doc pointers

| Path                                     | Role                                                      |
| ---------------------------------------- | --------------------------------------------------------- |
| `src/document.ts`                        | `readSetList`, tiling, resume, `buildSets`, trailing page |
| `src/binaryReader.ts`                    | BE cursor                                                 |
| `src/crypto.ts`                          | `PG15` coordinate block decrypt                           |
| `FORMAT.md`                              | Spec-style format doc (may lag this notes file)           |
| `src/__test__/setList.test.ts`           | Synthetic `PTB7` head + subset flag                       |
| `src/__test__/parseDrillPackage.test.ts` | Full pipeline on `sample.3dz`                             |
| `scripts/diag-setlist.mts`               | Per-file / whole-corpus set-list diagnostics              |
| `scripts/diag-setlist.mts`               | Per-file / whole-corpus set-list diagnostics              |
