# Drill interchange package format

Reverse-engineered notes for the third-party **drill interchange package** that
this package reads. Written so the reader can be maintained without re-deriving
the layout. All offsets and field sizes below were confirmed against real files
and against the source application's own (de-obfuscated) reader/writer logic.

> Naming: we never use the originating vendor's or product's name anywhere. The
> outer archive is a "drill interchange package" (`.3dz`); the inner binary is a
> "drill document" (`.3dj`).

## 1. Container (`.3dz`)

The package is a plain **ZIP archive**. Notable entries:

| Entry             | Purpose                                                      |
| ----------------- | ------------------------------------------------------------ |
| `*.3dj`           | The binary drill document (positions, cast, sets). Required. |
| `package.ini`     | Manifest listing which assets are bundled.                   |
| `*.ogg` / audio   | Show audio (also `.wav`, `.mp3`, `.m4a`, `.aac`, `.flac`).   |
| `*.jpg` / `*.png` | Field surface, prop, and figurine images (not imported).     |

`package.ini` is an INI file with `[Include]`, `[Attachment]`, and `[Files]`
sections. The `[Files]` section names the concrete asset files, e.g.
`surface=...jpg`, `props=a.jpg;b.jpeg`, `audio=show.ogg`. We locate the drill
document and audio by extension rather than by parsing the manifest, which keeps
the reader resilient to naming differences.

## 2. Drill document (`.3dj`)

### 2.1 General structure

- A flat sequence of **chunks**, read start to finish.
- Every multi-byte integer is **big-endian** (matches Java `DataInputStream`).
- The file begins with the ASCII magic **`3DJV`**.
- Most chunks are `tag(4 ASCII) + i32 length + payload[length]`.
- Two chunk families are exceptions to the length rule (see below): the page
  frames (`PG15`) and a couple of skippable selection/visibility chunks.
- A trailing `END.` tag terminates the body.

Chunk tags observed: `PRF3`, `CST7`, `PTB7`, `GRD1`, `PG15`, `SEL2`, `VIS2`,
plus prop/color/playlist chunks we don't need. Only the chunks below carry data
we import; everything else is skipped by length.

### 2.2 `PRF3` — show metadata (title)

Payload: `u16 titleLen, title[titleLen ASCII], ...`. Only the title is used.

### 2.3 `CST7` — cast list (performers)

Payload: `u16 count`, then `count` records of:

```
u64 id            // stable performer id (see §3, join key)
i32 labelLen
labelLen bytes    // drill label, ASCII, e.g. "T3", "G10"
8 bytes           // reserved / unused
```

The `u64 id` is read as a decimal string to avoid float precision loss; it joins
to the 18-digit id embedded in each coordinate record.

### 2.4 `PTB7` — set list (named formations)

Payload: a 4-byte header, then repeated records of:

```
u64 id
u16 cumulativeCount   // running count total reached at this set
3 bytes               // reserved
u16 titleLen
titleLen bytes        // set name, e.g. "179-182", "234-END"
i32 noteLen
noteLen bytes         // optional director note
16 bytes              // reserved / trailer
```

`cumulativeCount` is the key to timing: it is the count index (from the start of
the show) at which the set is reached. See §4 for how sets map to page frames.

### 2.5 `GRD1` — field / grid definition

Payload is a count-prefixed list of length-prefixed ASCII tokens describing the
grid. We only extract the field boundary token:

```
BORD <minX> <minY> <maxX> <maxY>
```

For a standard high-school football field the sample yields
`BORD -50 -26.25 50 26.25`. These bounds are in the source tool's field units
(see §5) and define the rectangle that coordinates are measured against.

### 2.6 `PG15` — page frames (per-count positions)

There is **one `PG15` chunk per count** in the show (the sample has 500). Each
frame is a snapshot of every marker's position at that single count. Layout:

```
i32 declaredLength    // UNRELIABLE — overcounts the trailing block by 2 bytes
u16 stride            // per-record byte stride in the binary table (69)
u16 count             // number of records in this frame
count * 69 bytes      // binary record table (positions are NOT stored here)
u16 blockLen
blockLen bytes        // ASCII coordinate block (Base64 ciphertext, see §3)
```

**Do not trust `declaredLength`** — it is off by two relative to the real
content. The reader advances strictly by the bytes it consumes (`stride`,
`count`, the 69-byte table, then the length-prefixed block) and ignores the
declared length. The 69-byte records hold per-marker flags/metadata; the actual
X/Y values live only in the encrypted ASCII block.

**69-byte record layout** (from the source tool's marker class, `ac.aa`):

| Offset | Size | Field                                                      |
| ------ | ---- | ---------------------------------------------------------- |
| 0      | 8    | u64 marker / performer id                                  |
| 8      | 8    | u64 linkage id 0                                           |
| 16     | 2    | u16 linkage sub-id 0                                       |
| 18     | 8    | u64 linkage id 1                                           |
| 26     | 2    | u16 linkage sub-id 1                                       |
| 28     | 8    | u64 linkage id 2                                           |
| 36     | 2    | u16 linkage sub-id 2                                       |
| 38     | 8    | u64 reserved / session id                                  |
| 46     | 1    | u8 (unknown)                                               |
| 47     | 1    | u8 marker type (1 = performer, 2/3 = reference variants)   |
| 48     | 2    | u16 body-facing angle (`angle / 128 * π` radians)          |
| 50     | 1    | u8 flags                                                   |
| 51     | 1    | u8 flags                                                   |
| 52     | 1    | char symbol (e.g. `'X'`)                                   |
| 53     | 4    | f32 inline X (often unused in `PG15`; coords come from §3) |
| 57     | 4    | f32 inline Y                                               |
| 61     | 1    | bool selected                                              |
| 62     | 1    | u8 sub-type / bitmask                                      |
| 63–66  | 4    | bool visibility flags                                      |
| 67     | 1    | u8 rotation (`byte / 128 * π` radians; no Z component)     |

There is no elevation / Z in this record. The parser currently skips the binary
table and reads positions only from the encrypted block.

## 3. Coordinate block encryption & record layout

Each `PG15` block is a **Base64-encoded AES-128-CBC ciphertext**. The scheme is
obfuscation, not per-file secrecy: the tool ships a single fixed key/IV pair,
reproduced in `src/crypto.ts`:

- Key (Base64): `pPc2H/OrnOmTW7LOCnSkBQ==`
- IV (Base64): `GHdnz7UQwnmCMM5Qy0Gu0w==`
- Cipher: `AES-128-CBC`, PKCS#5/7 padding.

Older documents may store the record string in plaintext; the reader tries to
decrypt and falls back to the raw string when the input isn't valid ciphertext.

The decrypted plaintext is a concatenation of fixed-width **39-character**
records, one per marker:

```
[0]      1 char    symbol / type marker (e.g. 'X')
[1..19)  18 chars  performer id (zero-padded decimal; parseInt to join to CST7)
[19..29) 10 chars  X coordinate (signed decimal, field units)
[29..39) 10 chars  Y coordinate (signed decimal, field units)
```

The block contains records for real performers **and** phantom reference markers
(e.g. the sample has 81 records but only 49 cast members). Cast members are
joined by id from `CST7`. Non-cast `X` records that are not reference geometry
are treated as **props** (see `src/props.ts`); the rest are dropped.

## 4. Timing: mapping sets to page frames

- `PG15` frames are indexed by count: frame `k` = positions at count `k`.
- `PTB7` gives each named set a `cumulativeCount`.
- Set start counts are derived so the first set is at count `0`, and each later
  set starts at the **previous** set's cumulative count. The formation for a set
  is the `PG15` frame at that start count.
- The final named set holds its formation through the remaining frames to the end
  of the show (the sample's named sets run to count ~260 while frames run to
  500 — the tail is the closing hold).

This is implemented in `deriveSetStartCounts` / `buildSets` in `document.ts`.

## 5. Coordinate system & units

- Origin is the **center of the field**; coordinates are in field units (steps).
- **X**: positive toward the audience's right; the sample field spans ±50.
- **Y**: positive toward the **back** of the field; the sample spans ±26.25, so
  `minY` (−26.25) is the **front** sideline and `maxY` (+26.25) is the back.

OpenMarch, by contrast, uses canvas pixels with a top-left origin and measures
steps from the _center-front_ point, with Y trending positive toward the front
(bottom of the canvas). Y checkpoints store unsigned distance from the front
sideline, but canvas coordinates use signed steps (negative toward the back /
top of the canvas). The importer converts between the two with an affine fit of
the source field rectangle onto OpenMarch's field geometry — see
`apps/desktop/src/components/import/drillTransform.ts`. Because it fits
rectangles rather than assuming a fixed unit, it stays correct regardless of the
source tool's unit choice.

## 6. Reader entry points

- `parseDrillPackage(buffer)` — unzip, locate the document + audio, parse.
- `parseDrillDocument(bytes)` — walk the chunk stream into the normalized model.
- `src/crypto.ts` — the fixed-key AES-CBC coordinate-block decoder (Web Crypto,
  so it runs in both Node and the Electron renderer).

The normalized output model (`DrillShow`) is defined in `src/types.ts`.

## 7. Known mapping gaps & future work

The parser preserves the source data faithfully; these are limitations in how we
currently map it into OpenMarch. Listed roughly by value.

1. **Continuous per-count motion → curved paths.** The source stores a position
   for every count (~500 frames), but the importer only samples formations at set
   boundaries and relies on OpenMarch's straight-line interpolation between pages.
   All non-linear movement is lost: curves, arcs, follow-the-leader, gate turns,
   and any marcher whose timing differs from the set (early/late/hold). No schema
   change is needed to fix this — OpenMarch already models curves via `pathways`
   (`marcher_pages.path_data_id` + `path_start_position`/`path_end_position`). An
   importer pass could compare each marcher's real per-count trajectory between two
   sets against the straight-line default and emit a pathway when it deviates. This
   is the single biggest fidelity improvement and is pure importer work.

2. **Stable source ids → re-import / merge (needs a schema change).** The source
   gives each performer a stable `u64` id and each set an id. OpenMarch marchers
   have no place to store an external id, so every import is a destructive full
   replace. Adding an optional `external_id` (source id) column to `marchers` (and
   likely `pages`) would let a re-import **merge** — update moved coordinates and
   add/remove marchers instead of wiping user edits. This is the foundation for
   robust multi-format interop, not just one-shot import.

3. **Set names/labels have nowhere to go.** Source sets are named as measure
   ranges (`"179-182"`, `"234-END"`). OpenMarch `pages` have no name/label column
   (pages are numbered positionally), so the label is currently dropped — only the
   director note is carried. Options: add a `pages.name`/`label` column, or fold
   the label into `pages.notes`.

4. **Marker classification uses ids, not just coordinates.** Each page frame
   mixes cast performers, props, and reference geometry. Cast comes from `CST7`.
   Non-cast markers are classified by **symbol** (`s` vs `X`), **movement**
   across set-boundary frames, and interior position for static props. Reference
   ticks can share coordinates with real markers on a single frame; they are
   dropped by stable id + static position even when overlapping. Explicit props
   may also appear in a `PRP8` chunk after the coordinate block (not parsed yet).
   Front ensemble / pit performers that the author listed in `CST7` import with
   their drill labels; performers only present in page frames (`s`, not cast) import
   as **Other** with generated labels until a label source is found.

5. **Bundled assets.** The package includes a field-surface image, floor cover,
   props, and figurine images. The surface image is importable into
   `field_properties.image` with a little work; the rest have no OpenMarch home.

6. **Musical timing is a placeholder.** The source is count-based with no tempo,
   so the importer synthesizes 120 bpm beats and no measures. Count positions are
   preserved but the timeline is not musically aligned to the audio. If a tempo or
   measure map ever becomes available it would map to `measures`.

Summary: nothing above blocks a working one-shot import. Curved-path
reconstruction (#1) is the biggest quality win and needs no schema change;
`external_id` (#2) is the one change worth making for durable interop.
