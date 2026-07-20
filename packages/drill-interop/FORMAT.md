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

**Complete chunk inventory** (confirmed by walking the sample document; 23 tags).
Only the five marked ✅ are read; the rest are skipped by length. Several of the
skipped chunks carry real data we don't yet map — see §7.

| Tag    | Read? | Count | Meaning (✝ = inferred from bytes, not confirmed)                                                                                                            |
| ------ | ----- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `3DJV` | —     | 1     | File magic + header: `u16` version (`15`) then two Java millisecond timestamps (created/modified).✝                                                         |
| `PRP1` | —     | 1     | Explicit prop list — `u16 count` then prop records; empty (`count 0`) in the sample.                                                                        |
| `PRF3` | ✅\*  | 1     | Show metadata. Only the title is read; the tail (render tag `PYJAVA2`, font `SansSerif`, point sizes, text colors) is skipped.                              |
| `PTL1` | —     | 1     | 3-byte flag/config.✝                                                                                                                                        |
| `CVR1` | —     | 1     | Floor-cover selection (`u32`, `0` = none in the sample).                                                                                                    |
| `GRD1` | ✅    | 1     | Field / grid definition (§2.5).                                                                                                                             |
| `CST7` | ✅    | 1     | Cast list (§2.3).                                                                                                                                           |
| `COLR` | —     | 1     | **Color palette** — `u16 count` then N colors, each **three `u32`** (R,G,B, 0–255). Sample: 7 colors (blue/red/orange/green/purple/magenta/teal). See §2.7. |
| `PLS2` | —     | 1     | **Prop/backdrop image list** — `u16 count` then per entry a UTF-16BE file path + index. Sample: the 4 bundled images. See §2.7.                             |
| `TLL2` | —     | 1     | Timeline-track list — `u16 count` then named tracks (`"Main"` → `"N;-1;-1"`).✝                                                                              |
| `PTB7` | ✅    | 1     | Set list (§2.4).                                                                                                                                            |
| `PTU1` | —     | 1     | Custom performer note-column definitions (`"Note 1".."Note 5"`) + per-performer values.                                                                     |
| `PG15` | ✅    | 500   | Page frames — one per count (§2.6).                                                                                                                         |
| `PRP8` | ✅    | 18    | **On-field text boxes** + prop/marker objects, interleaved with the page frames (§2.9).                                                                     |
| `VsD1` | —     | 1     | Small visual-settings block; contains a color (`0xFFFC18`).✝                                                                                                |
| `TxD1` | —     | 1     | **Section/id grouping table** — `u16` ids in 1000-banded ranges (1000s … 8000s = sections). See §2.7.                                                       |
| `FAB1` | —     | 1     | Fabric/backdrop layer (empty in the sample).                                                                                                                |
| `SYNC` | ✅    | 1     | **Audio sync** — UTF-16BE path + per-count `f64` timestamps (§2.8).                                                                                         |
| `RMAP` | —     | 1     | Fixed-width id/reference map — 6-byte records `(u16,u16,u16)`, `0xFFFF` = unset. **Not** a tempo map (corrected). See §2.7.                                 |
| `COM2` | —     | 1     | **Continuity text** (~19 KB) — per-phrase move instructions (`"hold"`, `"Float"`) + marker-group mask + applied marker ids. See §2.7.                       |
| `CORD` | —     | 1     | Coordinate-sheet vocabulary — 13 strings (`"Side 1"`, `"Hash"`, `"In Front Of"`, `"Behind"`, `"Inside"`, `"yd ln"`…).                                       |
| `SEL2` | —     | 26    | Saved selection/tool state — marker mask + active tool (`"ArcTool"`) + coord block. Editor state.                                                           |
| `VIS2` | —     | 13    | View snapshots — `u16 count` then full 69-byte marker records (§2.6). Editor state.                                                                         |
| `END.` | —     | 1     | Body terminator.                                                                                                                                            |

\* `PRF3` is read for the title only. Page frames (`PG15`) are often interleaved
with `PRP8` / `SEL2` / `VIS2`, so the chunk loop keeps scanning until `END.` (or
an unreadable length) rather than stopping after the first post-page chunk.
Trailing metadata (`TxD1`, `FAB1`, `SYNC`, `RMAP`, `COM2`, `CORD`) is skipped by
length. Meanings marked ✝ are inferred from byte inspection of one sample; the
rest were decoded (§2.7).

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

Payload:

```
u16 version           // NOT a reliable layout key (see below)
u16 count             // number of set records that follow
```

then `count` records of:

```
u64 id
u16 cumulativeCount   // running count total reached at this set
skip bytes            // reserved (see "layout detection" below)
titleLen              // 1- or 2-byte prefix; may be 0 (set named only by its note)
titleLen bytes        // set name, e.g. "179-182", "234-END"
note1Len              // 1-, 2-, or 4-byte prefix
note1Len bytes        // move note (UTF-8)
[noteLen]             // further note slots; absent in some exports, else 1..4 of
[noteLen bytes]       //   them, all sharing one prefix width (UTF-8)
trailer bytes         // reserved
```

`note1` is the set's move note. The later slots are secondary staging
annotations and are usually empty — but there are **up to five notes per set**:
`PTU1` names them `Note 1`…`Note 5` (§2.7), and real exports do fill three
(`westoak2025-part1` set 0 carries a featured-performer note, a staging note,
and a color-group legend). The first slot's length prefix is commonly `u32`
while the later ones are `u16`, so the two widths are detected separately.

**Layout detection.** The record _shape_ drifts between Pyware exporter builds —
and occasionally between records _within one file_: the pre-title `skip`, the
width of the title/note length prefixes, how many note slots are present, and
the trailer size all vary, and the `version` byte does **not** identify which.
Rather than key off `version` or a fixed skip, the parser **detects the layout
by tiling**: it tries every shape in a small grid and keeps the one that reads
exactly `count` records while consuming the whole payload. When more than one
shape tiles (a wrong one can, because `skip` and `trailer` bytes are both
discarded and trade off against each other), ties are broken by a score that
rewards genuine set names and notes — so the shape that recovers the most real
text wins. The final record may be truncated (a note that runs to the payload
end with no trailer); it is read defensively.

Two corollaries are easy to get wrong:

- Among tilings that _don't_ finish the file, prefer the one that recovered the
  most text, not the one that read the most records — a misaligned small-record
  shape can always tile more records out of the same bytes.
- A "complete" tiling that recovered **no** text is normally a truncated payload
  being eaten as many empty records, so it loses to a partial tiling with real
  titles. The exception: some shows genuinely have no titles or notes at all, so
  _every_ shape scores zero. When nothing anywhere recovered text, that
  ambiguity is gone and the complete tiling is taken.

**Per-record shape variation.** When no single shape tiles the whole payload,
the parser replays the best uniform shape for as long as it works and then
_searches_ for a per-record shape assignment over the remainder, accepting only
an assignment that consumes the entire payload in exactly `count` records and
backtracking otherwise. This is required, not defensive: in
`eastside2026draft7_13` exactly one record (the first with a real measure-range
title, `"32-39"`) is framed differently from its neighbors — two reserved bytes
move from the record's tail to its head, leaving the record length unchanged —
and the records after it revert to the original shape. Choosing greedily per
record does not work, because a run of empty records admits many shapes whose
end offsets differ by only a byte or two and all score zero; the wrong choice
stays locally plausible (its successor's `cumulativeCount` still looks sane) and
only fails several records later.

Observed shapes across real exports:

| example                           | skip | titleLen | note1Len | later notes | trailer |
| --------------------------------- | ---- | -------- | -------- | ----------- | ------- |
| westside/jackbritt/part1/westoak  | 3    | u16      | u32      | 1 × u16     | 14      |
| eastside (draft 7 / 13)           | 1    | u16      | u32      | 1 × u16     | 16      |
| eastside draft 13, titled records | 3    | u16      | u32      | none        | 16      |
| westoak 2025 part 1               | 4    | u16      | u16      | 4 × u16     | 8       |

**Every record is a page**, including a leading record on count 0 — that is the
opening formation, and it becomes OpenMarch's first page. Exports of a show's
later parts name it after the formation carried in from the previous part
(`36A`, `8A`, `8`, `A`); others leave it blank. When a file has no count-0
record, an empty opening page is synthesized so the first real set keeps its
counts.

Nameless sets elsewhere in the list are always kept: some exports label every
set only by its note.

The trailer carries the source's **subset marker** the byte 5 positions before
each record's end: `1` when the _next_ set is a labeled subset (a hold like
`12A`), and `0` otherwise. Reading it from the record _end_ (rather than a fixed
trailer offset) makes it invariant to how the reserved bytes split between `skip`
and `trailer`. OpenMarch reads it directly, which catches labeled holds even when
the dots move within them (a geometry-only "same formation" test misses those).

The flag marks the record it sits on, not the following one. The on-field text
(§2.9) confirms it independently: in Jack Britt all five flagged records have a
text box on their own count, four reading `"HOLD"` and the fifth
`"Subset for tubas."`.

> An earlier revision of this document described `eastside2026draft7_13` as
> using an optional ~5-byte field containing the constant `0x0130` before the
> title on some records. That was a misread of the hex: `01 30` is simply a
> `u16` length of `1` followed by the title `"0"`. The real variation is the
> per-record reframing described above, and these files now parse fully.

Every record — including the last — carries a `cumulativeCount`, and it is that
record's **own** arrival: the formation stands on that count, and the label's
measure range names the counts spent getting there. Jack Britt is the proof —
every label's measure count times its counts-per-measure equals its own count
minus the previous record's, 3 counts/measure through the opening 3/4 section
and 4 thereafter, across all 18 sets. So the closing hold (`15A`, `"60-END"`) is
the last record itself, not an extra page inferred after it.

### 2.8 `SYNC` — audio sync

Payload:

```
u16 pathLen                 // UTF-16 code units
pathLen × u16               // UTF-16BE audio path (often a source-machine file: URL)
u16 count                   // number of timestamps that follow
count × f64 (big-endian)    // seconds into the audio when count i occurs
```

`timestamps[0]` is the lead-in (audio may start before count 0). Beat durations
are the deltas between consecutive timestamps. OpenMarch's `FIRST_BEAT` (count 0)
is a locked zero-duration anchor, so count 1 is the first beat with real timeline
presence; the importer applies `audioOffsetSeconds = -timestamps[1]` so timeline
t=0 aligns with count 1 and every count ≥1 (i.e. every set arrival) lands exactly
on its SYNC timestamp.

### 2.9 `PRP8` — on-field text boxes

Designers place blocks of text on the field beside the formation they describe
(`"HOLD"`, `"All face FRONT"`, `"Subset for tubas."`, a title card on the
opening page). These are real page notes and often the _only_ notes a file has —
Jack Britt writes nothing into `PTB7` and puts everything here.

Payload: `u16 count`, then that many objects, each led by a type byte:

```
u8 type
u64 id
f32 x1, y1, x2, y2      // bounding box
type 2 (text):  4 flag bytes, u16 textLen, textLen bytes (UTF-8)
type 1 (prop):  14 bytes  // fixed-width prop/marker record, skipped
```

**Binding text to a page.** A `PRP8` chunk carries no count of its own. The
chunks are interleaved with the page frames and each one appears in the stream
directly _after_ the frame it annotates, so the reader tracks how many `PG15`
frames it has consumed: the text belongs to the formation at that frame. Those
counts land exactly on set `cumulativeCount` values, and the result is
self-checking — in Jack Britt every `"HOLD"` lands on a subset page, and the box
reading `"Subset for tubas."` lands on `12A`.

Several boxes can annotate one formation; they are folded into that page's notes
after the set's own move note (§4).

### 2.5 `GRD1` — field / grid definition

Payload is a count-prefixed list of length-prefixed ASCII tokens describing the
grid. The tokens we read into `DrillGrid` (`readGrid` in `document.ts`):

| Token   | Example (sample)             | Meaning                                     |
| ------- | ---------------------------- | ------------------------------------------- |
| `BORD`  | `BORD -50 -26.25 50 26.25`   | Field rectangle (source units, §5).         |
| `GRID`  | `GRID 8 5 8 5 …`             | Steps per unit: `8/5 = 1.6` on each axis.   |
| `UNIT`  | `UNIT 0 0`                   | Measurement system (`0` = imperial).        |
| `HZMJ`  | `HZMJ -26.25` / `HZMJ 26.25` | Horizontal major line — a sideline (units). |
| `HZHS`  | `HZHS -8.75` / `HZHS 8.75`   | Hash line (units).                          |
| `VTMJ`  | `VTMJ -50.0` … `VTMJ 50.0`   | Vertical major line — a yard line (units).  |
| `CTITL` | `.../Layouts/default.grd`    | Grid template the drill was designed on.    |
| `SRFC`  | `.../…Football Surface.jpg`  | Field-surface image file.                   |

For the standard high-school sample: `BORD -50 -26.25 50 26.25`, `GRID 8 5 8 5`
(1.6 steps/unit), sidelines `HZMJ ±26.25`, hashes `HZHS ±8.75`. Multiplying by
1.6 steps/unit gives a field 84 steps deep with hashes 28/56 steps behind the
front sideline. `HZMN`/`VTMN` (minor lines) are present but not read.

The step ratio and landmarks are what let the importer place coordinates by true
step size and reconstruct the field, rather than guessing (see §5).

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

> **Reality check (measured against the sample export).** The layout above is the
> source tool's in-memory marker class. In the actual interchange export, most of
> those fields are **not populated** — a column-variance scan across all 500
> frames shows offsets 48 (facing angle), 51–68 (symbol, inline X/Y, selected,
> visibility, rotation) are constant defaults (angle stays `1`, rotation `0`,
> symbol `0x30`, marker type at 47 is `0` for every record). **Body facing and
> rotation are therefore not recoverable from this file** — do not plan features
> on them. The bytes that _do_ vary per marker are the id (0–7), the linkage-id
> fields (8–37, so follow/reference links are real), and two small fields at
> offset 41 (values 0–6) and 50 (a flag byte) whose exact meaning can't be pinned
> from a single file (offset 41 is not stably per-marker, so it is not a clean
> color index). Treat everything except id + linkage ids as unconfirmed for
> exported files.

### 2.7 Decoded formats for the unparsed chunks

Byte-level layouts recovered from the sample export. None of these are read by the
reader today; they are documented here so a future importer pass can pick them up
(see §7). All integers big-endian.

**`COLR` — color palette.** `u16 count`, then `count` colors, each **three `u32`**
(red, green, blue, each `0–255`). The sample's 7 colors:

```
0: (0,0,255)    blue        4: (153,0,204)  purple
1: (255,0,51)   red         5: (255,51,204) magenta
2: (255,153,0)  orange      6: (102,255,204) teal
3: (51,255,51)  green
```

This is the show's color set. How a performer maps to a palette index is **not**
settled from one file (the per-marker byte at offset 41 of the `PG15` record is
not stably per-marker; the likeliest scheme is per-section via `TxD1`).

**`TxD1` — section / id grouping.** `u8 count`, then a run of `u16` ids grouped in
1000-banded ranges: `1000–1999`, `2000–2999`, … `8000–8999`. Each band is a
section and the members are its performer ids in drill order. `RMAP` shares this
id space. Together with `CST7` labels and `COLR`, this is enough to reconstruct
section membership and, probably, section color.

**`RMAP` — id/reference map.** Fixed-width 6-byte records, read as three `u16`
`(a, b, c)`; `0xFFFF` marks an unset slot. `a` clusters around `1000/1001`, `b`
around `8000/8002`, `c` ranges widely (0, 4000s, 5000s, 7000s). It maps performer
ids to reference ids/values — **not** a tempo map (an earlier guess, now
corrected). The real audio alignment is in `SYNC`.

**`PLS2` — prop/backdrop image list.** `u16 count`, then per entry `u16 pathLen`
(UTF-16 code units), the **UTF-16BE** absolute path, and a small index/flag
trailer. The sample lists the four bundled images (`Light Gray.jpg`,
`curtain.jpeg`, `curatin 2.jpg`, `Pink Flag.png`).

**`COM2` — continuity text.** `u16 count` of performers, then per-phrase records:
a marker-group mask (a run of symbol chars like `XXXX…`/`ssss…`), a length-prefixed
move-instruction string (`"hold"`, `"Float"`, …), and the list of 6-byte marker
ids the instruction applies to. This is the human-readable drill continuity — the
count-by-count "what each performer does" text. OpenMarch has no continuity-text
home today, but this is the richest written-instruction data in the file.

**`SYNC` — audio sync.** See §2.8.

**`CORD` — coordinate-sheet vocabulary.** 13 length-prefixed ASCII strings
(`"Side 1"`, `"Side 2"`, `"Back"`, `"Front"`, `"steps"`, `"yd ln"`, `"side line"`,
`"In Front Of"`, `"Behind"`, `"Inside"`, `"Outside"`, `"Hash"`). The phrasing the
source uses when printing coordinate sheets; localization/config, not drill data.

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
- That count is the set's **own** arrival. A set's formation is the `PG15` frame
  at its own count, and its page runs from the previous record's count to it —
  so the page's duration is the difference between them, and the formation shows
  at the end of the page (which is also how OpenMarch renders a page).
- A set's note and measure-range label describe how the show _arrives_ at it
  ("Move 16" on a set spanning 16 counts), not how it leaves.
- The opening formation is count 0 with no duration. Most exports carry a record
  for it; when one does not, an empty page is synthesized in its place.
- The last record is the show's closing formation. It holds through the
  remaining frames to the end (the sample's records run to count ~260 while
  frames run to 500 — the tail is that hold), so no extra page is materialized
  after it.

Reading the record's count as the _next_ set's start instead — with a trailing
page bolted on to absorb the last one — produces the same page count and the
same page numbers, so it looks right at a glance. What gives it away is that
every label, note, and set of coordinates lands one page late.

This is implemented in `deriveSetStartCounts` / `buildSets` in `document.ts`.

### OpenMarch import mapping

OpenMarch stores each page's formation at **end of page**
(`timestamp + duration`). Page `0` is a permanent zero-count anchor on beat `0`,
and beat `0` (`FIRST_BEAT`) is locked at duration `0`.

- Beat grid: one beat per count after `FIRST_BEAT`. `createdBeats[i]` is count
  `i+1` and carries the count `(i+1)→(i+2)` interval (`durations[i+1]`). The
  dropped `durations[0]` (count `0→1`) is compensated by `audioOffsetSeconds`
  (§2.8), so the grid stays locked to SYNC.
- Set `0` → page `0` (beat `0`, `0` counts) — the opening formation at t=0.
- Set `i > 0` → page spanning [set `i-1` arrival, set `i` arrival]; its keyframe
  at page end = set `i`'s arrival = SYNC time. The first created page starts at
  count `1` (page `0` already owns count `0`).
- The final page has no successor to bound it, so `last_page_counts` is set
  explicitly to run to the end of the show: the last count the audio covers
  (`SYNC.length − 1`) when SYNC is present, else `totalCounts`, clamped to at
  least the last set's arrival and at most `totalCounts`. This fully includes a
  closing set/hold (e.g. an ending subset that marks the end of a hold). When the
  last set is a subset (flagged on the previous set), extending it holds the
  formation with no stretched movement; it holds exactly until the music ends.
- With `pageNumberOffset = 1`, names read `1` (anchor), `1A`, `2`, ….

## 5. Coordinate system & units

- Origin is the **center of the field**; coordinates are in field units (steps).
- **X**: positive toward the audience's right; the sample field spans ±50.
- **Y**: positive toward the **front** (audience) sideline; the sample spans
  ±26.25, so `maxY` (+26.25) is the **front** sideline and `minY` (−26.25) is the
  back. This is the **opposite** of OpenMarch — mixing the two flips the show
  front-to-back — so the importer treats the source's _largest_ sideline value as
  the front (`sourceFrontSidelineUnits`).

OpenMarch, by contrast, uses canvas pixels with a top-left origin and measures
steps from the _center-front_ point, with Y trending negative toward the back
(top of the canvas).

The importer converts by the source grid's **true step size**, anchored on the
shared physical reference both tools agree on — the center of the front sideline
(the source's `maxY`):

- `xSteps = point.x * grid.stepsPerUnitX`
- `stepsFromCenterFront = (point.y - frontSidelineUnits) * grid.stepsPerUnitY`
  where `frontSidelineUnits = max(sidelinesY)`

See `apps/desktop/src/components/import/drillTransform.ts`. A marcher therefore
keeps its real step distance from the front sideline and the 50, so hashes land
exactly on their step counts and the back sideline falls at its true depth — it
is **not** stretched to match a differently-sized field template. (An affine
rectangle fit was tried first; it smeared coordinates by 1–3 steps whenever the
source and OpenMarch modeled the same field with slightly different numbers, e.g.
an 84-step-deep source grid onto OpenMarch's 85.33-step HS template.)

To close the loop, the importer also picks the field itself:
`resolveDrillField` (`apps/desktop/src/components/import/resolveField.ts`)
fingerprints the grid (depth, hashes, half-width in steps) against OpenMarch's
built-in templates and switches to the best match; when nothing matches (custom
or indoor grids) it reconstructs a custom `FieldProperties` from the grid's own
`HZMJ`/`HZHS`/`VTMJ` landmarks and `GRID` step ratio. The resolved field is
saved as the show's field during import.

## 6. Reader entry points

- `parseDrillPackage(buffer)` — unzip, locate the document + audio + surface, parse.
- `parseDrillDocument(bytes)` — walk the chunk stream into the normalized model.
- `readGrid(payload)` (in `document.ts`) — parse the `GRD1` tokens into `DrillGrid`.
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

2. **Per-marker linkage ids → nothing (unparsed, but narrower than hoped).**
   Every `PG15` frame carries a 69-byte record per marker (layout in §2.6) that
   the reader skips wholesale (`reader.skip(count * PAGE_RECORD_BYTES)` in
   `readPageFrame`). A column-variance scan across all 500 frames shows the
   export **strips most of that record** — facing angle, rotation, symbol, marker
   type, inline X/Y, selected, and visibility are all constant defaults, so
   **body facing/rotation are not recoverable** (an earlier version of this doc
   claimed they were "right there"; that was wrong for exported files). What does
   vary and is worth reading:
   - **Linkage ids 0/1/2 + sub-ids** (offsets 8–37) — the follow/leader/link
     relationships between markers. This is the structured source of the same
     motion that item #1 reconstructs geometrically; parsing it would make
     follow-the-leader and gate turns exact instead of inferred.
   - A small enum at offset 41 (values 0–6) and a flag byte at offset 50 — not
     stably per-marker, meaning unconfirmed from a single file.

   Authoritative marker classification (prop vs. reference vs. performer), which
   we currently re-derive heuristically from the coordinate block (`src/props.ts`),
   is therefore **not** available from this record in the export — the type byte
   is zeroed. The `COM2` continuity text (item #7) is a better source of movement
   intent than this table.

3. **Stable source ids → re-import / merge (needs a schema change).** The source
   gives each performer a stable `u64` id and each set an id (`CST7`/`PTB7`),
   both currently used only as join keys and then dropped. OpenMarch marchers
   have no place to store an external id, so every import is a destructive full
   replace. Adding an optional `external_id` (source id) column to `marchers` (and
   likely `pages`) would let a re-import **merge** — update moved coordinates and
   add/remove marchers instead of wiping user edits. This is the foundation for
   robust multi-format interop, not just one-shot import.

4. **Show title has nowhere to go.** `PRF3` yields the show title, but the
   importer only uses it for the success toast (`importDrillPackage`) — it is
   never stored as the show's name. Anything in the `PRF3` payload after the
   title (possible subtitle/author/organization) is also unparsed (see §2.2).

5. **Set names/labels have nowhere to go.** Source sets are named as measure
   ranges (`"179-182"`, `"234-END"`). OpenMarch `pages` have no name/label column
   (pages are numbered positionally), so the label is currently dropped — only the
   director note is carried. Options: add a `pages.name`/`label` column, or fold
   the label into `pages.notes`.

6. **Marker classification uses ids, not just coordinates.** Each page frame
   mixes cast performers, props, and reference geometry. Cast comes from `CST7`.
   Non-cast markers are classified by **symbol** (`s` vs `X`), **movement**
   across set-boundary frames, and interior position for static props. The
   position tests (on a sideline/endline, in the yard-number band near a
   sideline, near field center, interior prop) are expressed in real steps
   against the grid's own landmarks via the coordinate subsystem (`src/coords.ts`,
   shared with the importer) rather than hardcoded source-unit constants, so they
   hold for any field size, unit, or grid. Reference ticks can share coordinates
   with real markers on a single frame; they are dropped by stable id + static
   position even when overlapping. `PRP8` also carries explicit prop/marker
   objects alongside the text boxes we now read (§2.9); those are still skipped.
   Front ensemble / pit performers that the author listed in `CST7` import with
   their drill labels; performers only present in page frames (`s`, not cast) import
   as **Other** with generated labels until a label source is found.

7. **Visual / appearance data → nothing (unparsed chunks).** The source is a 3D
   product: it renders figurines wearing a uniform and carrying an instrument,
   over a field surface, floor cover, and fabric/backdrop. That appearance layer
   lives in chunks the reader never touches (see the §2.1 inventory):
   - **`COLR` — color palette (decoded, §2.7).** 7 colors, each three `u32` RGB.
     This is the show's color set. OpenMarch marchers _do_ have a color concept,
     so the palette is mappable today. The open question is the per-performer →
     palette-index mapping: it is **not** in the `PG15` record (offset 41 is not
     stably per-marker), so the likely route is per-section via `TxD1` (§2.7).
   - **`COM2` — continuity text (decoded, §2.7).** Per-phrase written movement
     instructions (`"hold"`, `"Float"`, …) with the marker group each applies to.
     This is the richest human-readable data in the file. OpenMarch has no
     continuity-text home yet, but it could seed page/marcher notes.
   - **`FAB1` (fabric), `CVR1` (floor cover), `PRP1` (props), `VsD1`,
     `PLS2` (prop image list).** The appearance/figurine layers from
     `package.ini`'s `[Include]` (`figurines`, `fabric`, `floorCover`, `ground`).
     In the sample the figurine/fabric _files_ are empty, so per-performer
     appearance (uniform style, instrument, body) is defined by these chunks +
     the palette, not by standalone images. The actual 3D figurine/instrument
     **meshes are built into the source app**, not shipped in the package — the
     file carries only the _selection_ (which uniform/instrument/color), never the
     geometry. So a full 3D uniform/instrument recreation is out of scope; the
     realistic wins are the color palette and section grouping.
   - **`PTU1` / `TxD1` / `TLL2`.** Custom performer note-columns, section/id
     grouping, and timeline tracks (§2.7).

   Note: the 69-byte `PG15` record does **not** carry usable per-marker visual
   state in the export — facing/symbol/type/visibility are zeroed (see item #2).

8. **Bundled asset images.** The package also ships raster images: the field
   surface (`SRFC`), plus props and backdrops (in the sample: `Light Gray.jpg`,
   `curtain.jpeg`, `curatin 2.jpg`, `Pink Flag.png`). The surface image is now
   extracted onto `DrillShow.surface`, but the importer does not yet write it to
   `field_properties.image` / toggle `showFieldImage`; the prop/backdrop images
   have no OpenMarch home. The `package.ini` manifest is not parsed — assets are
   located by extension — so its `[Include]`/`[Attachment]`/`[Files]` metadata
   (which names each asset and its layer) is unused.

9. **Musical timing is under-mapped.** The importer synthesizes 120 bpm beats and
   no measures. The document does carry a `SYNC` chunk (audio sync — the audio
   file path plus alignment data), so the count timeline _can_ be aligned to the
   audio. Note the correction from earlier drafts: `RMAP` is **not** a tempo/measure
   map — decoding it (§2.7) shows a fixed-width performer-id → reference-id table,
   not per-measure tempo. No explicit tempo or measure map was found in the sample;
   `SYNC` is the lever for audio alignment, and measures would still have to be
   inferred from it. This remains lower-priority than #1.

Summary: nothing above blocks a working one-shot import. Curved-path
reconstruction (#1) is the biggest quality win and needs no schema change;
parsing the linkage ids in the 69-byte marker table (#2) would make
follow-the-leader exact (but facing/rotation are stripped from the export, so
scope that down); `external_id` (#3) is the one schema change worth making for
durable interop. On the visual side, `COLR` (#7, decoded) is the cleanest win —
7 RGB colors already sitting in plain bytes — and `COM2` continuity text (#7) is
the richest human-readable data if a notes home exists for it.
