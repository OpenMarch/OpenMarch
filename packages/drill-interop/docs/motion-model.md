# How the source encodes motion, and what that means for our model

Scope: the interchange export (`.3dz`/`.3dj`) only. This is a bake of the source
tool's authoring state, not its native model. Everything here is measured from
`sample.3dz` unless marked otherwise. Full byte layouts in `FORMAT.md`.

## 1. Motion is sampled per count, not authored

One `PG15` chunk per count. Sample: 500 chunks for 500 counts. Each is a full
snapshot of every marker.

Positions live only in the chunk's trailing ASCII block — Base64 over
AES-128-CBC, fixed key/IV shipped in the tool (`src/crypto.ts`), so obfuscation,
not secrecy. Older docs may be plaintext; the reader falls back. Decrypted
plaintext is fixed-width 39-char records:

```
[0]       1  symbol / type ('X', 's')
[1..19)  18  performer id, zero-padded decimal — joins to CST7
[19..29) 10  X, signed decimal, field units
[29..39) 10  Y, signed decimal, field units
```

Consequence: **there is no curve in the file.** A 32-count arc is 32 points. A
follow-the-leader is N marchers whose sampled points trace the same polyline at
staggered phase. Curvature, easing, and per-marcher timing exist in the data but
only as sampling density — nothing is labeled.

We currently read these frames only at set boundaries and let straight-line
interpolation fill the gap. All intra-page motion is discarded today.

## 2. The one piece of authored structure that survives

Each `PG15` frame also carries a `count * 69`-byte binary table, one record per
marker. We skip it wholesale: `src/document.ts:222`
(`reader.skip(count * PAGE_RECORD_BYTES)`).

A column-variance scan across all 500 frames shows the export strips most of it.
Constant defaults in every record: marker type (47), facing angle (48),
symbol (52), inline X/Y (53, 57), selected (61), visibility (63–66),
rotation (67).

**Body facing and rotation are not recoverable from an export.** An earlier
revision of `FORMAT.md` claimed otherwise; that was wrong. Do not plan features
on them.

What varies:

| Offset | Size | Field                   | Status                         |
| ------ | ---- | ----------------------- | ------------------------------ |
| 0      | 8    | u64 marker/performer id | confirmed, joins to CST7       |
| 8      | 8    | u64 linkage id 0        | varies per marker              |
| 16     | 2    | u16 linkage sub-id 0    | varies per marker              |
| 18     | 8    | u64 linkage id 1        | varies per marker              |
| 26     | 2    | u16 linkage sub-id 1    | varies per marker              |
| 28     | 8    | u64 linkage id 2        | varies per marker              |
| 36     | 2    | u16 linkage sub-id 2    | varies per marker              |
| 41     | 1    | u8 enum, values 0–6     | not stably per-marker; unknown |
| 50     | 1    | u8 flag                 | unknown                        |

The three linkage slots are the follow/leader/link graph — the structured source
of the same motion §1 encodes geometrically. Parsing them would make
follow-the-leader and gate turns exact rather than curve-fit.

**Unverified.** Three slots plus sub-ids is richer than "follows marker X" and
may be reference-geometry attachment instead. This rests on one file. Before
designing against it we need a second export built with a deliberately
constructed follow-the-leader and known leader/follower ids.

Also note: authoritative marker classification (performer vs. prop vs. reference)
is **not** available here — the type byte at 47 is zeroed. We keep re-deriving it
heuristically in `src/props.ts`.

## 3. Our model is the inverse, and mostly in a good way

`pathways.path_data` (`schema.ts:154`) plus `marcher_pages.path_data_id`,
`path_start_position`, `path_end_position` (`schema.ts:185–197`, both clamped
0–1 by `marcher_pages_path_data_position_check`).

Declarative: one curve, referenced, parameterized per marcher. Follow-the-leader
is natively _one_ pathway with N marchers at staggered offsets — which the source
can only express as N redundant sampled polylines. If the linkage ids parse out
as we expect, they map onto "same `path_data_id`, different start/end offsets"
almost directly.

### The gap

`path_start_position`/`path_end_position` says _where along the curve_. It does
not say _at what rate_. That is fine for staggered follow-the-leader if
parameterization is arc-length-uniform in time. It cannot express:

- accelerating into a gate turn
- hold-then-dash within a single page
- any marcher whose timing differs from its set (early/late arrival)

The source expresses all three trivially, because it samples per count. This is
a real decision, not an oversight to route around: either declare non-uniform
rate out of scope, or add an easing/rate field to `marcher_pages`. Worth settling
before the import curve-fitter is written, since the fitter's error metric
depends on what it is allowed to emit.

## 4. Work items, in dependency order

1. **Curve fitting on import.** Pure importer work, no schema change. For each
   marcher and each set-to-set span, compare the real per-count trajectory
   against the straight-line default; where deviation exceeds threshold, fit and
   emit a pathway. Largest fidelity win available. Blocked on the §3 rate
   decision only for how it handles timing deviation.
2. **Second sample export** with known follow-the-leader, to confirm or kill the
   linkage-id reading in §2. Cheap; unblocks exact rather than inferred links.
3. **Parse linkage ids** (contingent on 2). Replaces geometric inference with
   the source's own relationship graph.
4. **`external_id` on `marchers`** (and probably `pages`). The source gives every
   performer a stable u64 and every set an id; we use them as join keys and drop
   them. Without storage, every re-import is a destructive full replace. With it,
   re-import merges — updates moved coordinates, adds/removes marchers, preserves
   user edits. This is the foundation for interop generally, not just this format.

Numbered gaps 4–7 in `FORMAT.md` §7 (show title, set labels, marker
classification, appearance/color) are unrelated to motion and tracked there.
