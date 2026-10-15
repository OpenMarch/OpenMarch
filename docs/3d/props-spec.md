# 3D props, equipment, uniforms and artwork: design spec

<!-- cspell:words meshopt dedup unitard Headwear aussie pHYs CMYK Pantone rasterizing bptc BPTC ultralite playhead's MPFB -->

- Status: approved by the owner on 2026-10-11, with the ADR amendments
- Date: 2026-10-11
- Decisions: [ADR 0002](../adr/0002-3d-view.md) amendment of 2026-10-11
  (D-9 to D-22) and the [ADR 0004](../adr/0004-performer-cues.md) amendment of 2026-10-11
- Work: the customization track (C1 to C5) in [phases/](phases/)

This spec compiles the 25 resolved tickets of the 3D customization map and the
owner's review answers of 2026-10-11 into one document workers can read. The
tickets live in `.scratch/3d-customization/issues/` on `3d/architecture-props`,
which `/3d-work` workers can't read; this file replaces them for that purpose.
Bracketed numbers cite a ticket, such as [07]; [26.n] cites item n of the
owner's review notes on ticket 26. Where a later decision superseded an
earlier ticket, this spec states the later one. Words follow the root
`CONTEXT.md` glossary. Two words to keep apart: an **Item** is a Prop, or
Equipment with its own identity in the show (section 4); a **Library item**
is a Model, Artwork or Uniform in the Library (section 2). An Item may
reference a Library item. The work is sliced into the customization track,
C1 to C5 (`docs/3d/phases/C*.md`), a separate track beside the numbered
phases [26.24].

## 1. Scope and foundations

- Props, equipment, uniforms and Artwork in the 3D View, all in real-world
  units, with standard-size catalogs as defaults and custom as the escape
  hatch. Anything that doesn't fit is flagged or converted, never silently
  stretched (map).
- Time is counts. Every change is keyed by `beat_id` and happens at the start
  of its beat, building on ADR 0001 (timeline motion model,
  `timeline/timeline-try-2`) and ADR 0004 (performer cues) [07 revision, 21].
  Follow vs hang is moot: cues are absolute counts [21].
- Props and items ship with the timeline, **timeline mode only**, with no
  page-mode path [24].
- Editing what performers carry, silks, uniforms and Placement happens in
  **Visuals mode**, not the 2D editor [22].

## 2. Library and import

### Identity and Versions [06]

- A **Library item** is a Model, an Artwork or a Uniform, named by a stable
  UUID for its whole life. Each **Version** is the sha256 of its stored bytes
  (normalized GLB plus sidecar, or original image plus display texture) and
  never changes.
- A show references `(item id, version hash)`. Editing always makes a new
  Version. A show keeps its embedded Version and offers "update available"
  per Library item, never applied silently. Re-importing identical bytes
  reuses the existing Library item ("already in your Library").
- Built-ins are read-only with fixed UUIDs that ship with the app. Editing one
  makes a user copy with a new UUID and `derivedFrom {itemId, version}`;
  built-in updates never flow into copies.
- Metadata: name, kind, tags, created and updated, original filename,
  `derivedFrom`, plus the license fields in section 10.

### In the show [06, 26.10, 26.15]

- Following `audio_files` and `field_properties.image` (SQLite, not a package
  format): `library_blobs` (hash primary key plus bytes, deduped across items)
  and a show Library item table (item id, kind, name, version hash, metadata, sidecar
  JSON). **Both stay out of undo history.**
- Built-ins are embedded too, so app updates never change old shows.
- Artwork embeds the original as imported plus the display texture. The print
  master is rendered from the original at export time, never stored.
- Save prunes Library items nothing references (cues, Item tables, uniforms,
  other Library items, undo and redo history), then blobs no Version points
  at. The app autosaves, so prune runs when the show closes and before Save
  Copy. History counts because it lives in the show file: undoing an old edit
  after reopening must find the item it used. While a cue uses a
  Library item, the show's copy can't be deleted; deleting it offers "Replace with…" and lists
  the uses [26.10].
- The item table loads at open; blobs are read lazily by hash for the current
  or a nearby moment, with a small in-memory cache. Rendering never reads
  originals.

### Local Library [06, 08, 11]

- `userData/library/`: `blobs/sha256/ab/<hash>` (immutable,
  content-addressed), one manifest JSON per item listing its Versions (the
  records a future cloud would sync), and an index rebuilt from the
  manifests. Never pruned automatically; deleting an item there doesn't
  affect shows.
- Every import lands in the local Library, and the show embeds a copy [11].
- A show is self-contained. **Opening a show never writes to the Library.**
  "Add to my Library" imports an item; if the id already exists locally, the
  show's Version is added to it [06].
- Custom sizes can be saved as personal **size presets** beside the built-in
  catalog [08].

### Import pipeline [01, 08, 11]

- Import runs **once, in Node** (main or a utility process, outside the
  renderer's CSP) and stores a plain normalized GLB plus an OpenMarch
  sidecar. The 3D View keeps loading with bare `GLTFLoader` (three 0.186.1,
  no decoders).
- Steps: `gltf-validator` (errors block); reject `extensionsRequired` outside
  the allow-list (r186 `GLTFLoader` only warns); decode Draco and meshopt;
  measure bounds, triangles, texture sizes and joints; read `OM_*` nodes and
  `extras.openmarch`; convert or flag; dedup, prune and weld; write the GLB
  and sidecar [01].
- **Convention** [01, 11]:
  - `OM_grip_R`: the instrument-frame origin, +Z along the pole or bell (as in
    `core/instruments/model.ts`); `OM_grip_L`: the left grip.
  - Artwork slots: materials or meshes with
    `extras.openmarch.artworkSlot {id, widthM, heightM}`, UV0 spanning the
    printable area.
  - Stretch: a 3D 9-slice, `extras.openmarch.stretch {x:[a,b],...}`. The slab
    scales and the outside translates rigidly. Axes without a zone are
    flagged, never stretched.
  - Starter kit stamps: `itemId`, `kind`, `kitVersion`.
  - Names use only `[A-Za-z0-9_]` and are read from the raw JSON, not
    `Object3D.name`.
- **Rigged Garments** join om-pose's bake with no extra bake rows only on the
  exact 23 v4 `root`/`DEF-*` joints (remapped by name), inverse bind matrices
  within tolerance, at most 4 influences per vertex, transforms applied, no
  position quantization, and `_PART` paint (without it the garment renders as
  skin). Any other rig is rejected, never given its own bake [01, 04, 11].
- **Where import starts:** a Library **Import…**, plus an Import… inside each
  picker (artwork slot, Equipment, Prop) that pre-fills kind, target slot and
  size. Files come through `dialog.showOpenDialog` in main with filters
  "Models and artwork" (selected), "3D model (glb, gltf)", "Artwork (png,
  jpg, svg, pdf)" and "All Files".
  Drag-and-drop comes later [11].
- **Kind** (Prop, Equipment, Garment, Floor prop, Base floor): a picker sets
  it; a plain Library import asks for it as a required choice, pre-selected
  only from the Starter kit stamp, never from a guess. Size range, caps and
  required nodes are checked after the kind is set [11].
- **The review: one screen** in Visuals mode (owner, 2026-10-12, Q60–Q64):
  the Library side panel becomes the import panel and the Visuals mode stage
  shows a code-split three.js preview, built from the same `core/` builders as the 3D View (the
  in-editor preview `docs/3d/ui.md` reserved). The 3D window stays read-only.
  Preview on the left; the report on the right grouped as **Can't import**
  (validator errors, disallowed required extension, over 4× the triangle cap,
  non-v4 rig), **Needs your choice** (pre-selected: unit conversion, Z-up
  rotate, simplify, missing grip) and **Fixed for you** (collapsed: textures
  downsized, Draco or meshopt decoded, extras stripped, influences
  renormalized); then name, tags, the license fields and Add. A clean file is
  one click. The report is saved in the sidecar as **Import notes**; lasting
  states become badges (scaled, simplified, no stretch zones). Rejections show on the same screen with the reason and a
  pointer to the Starter kit, never an `AlertModal` [11].
- **Fallbacks** with no `OM_*` nodes or `extras.openmarch`: set the grip by
  clicking a point (+Z snapped to the longest extent); set artwork slots by
  picking a material and giving it a size, pre-filled from its UV aspect and
  the catalog. The importer says "Looks like custom properties were off:
  re-export with the OpenMarch preset". No hand-drawn stretch zones: the model
  keeps its modeled size or takes a uniform scale, with a "no stretch zones"
  note. Z-up gets a pre-selected "rotate to Y-up", checked only for
  Equipment, Garments and non-flat Props [11].
- **Re-imports:** a kit `itemId` pre-selects "New version of _Riser_";
  without one, the original filename offers Update or Add as new. A file
  stamped with a built-in's id becomes a user copy. The original source file
  stays in the local Library only, outside the Version hash and never
  embedded, so a later pipeline can re-normalize it [11].
- **Updates that break slots:** an update that drops or renames a slot or
  grip a show uses lists the breakage in the "update available" offer, with a
  remap to a remaining slot of the same size. Unmapped assignments stay
  stored but dormant, with a quiet note, so reverting restores them. A
  missing grip that changes holding gets a note too [11].
- **Artwork images** [08, 11]:
  - Standalone size step: chips of templates whose aspect matches ("Silk
    36 × 54 in", "Floor prop 4 × 8 ft") above locked-aspect ft/in fields, plus
    "From file: …" when metadata can be trusted. Multi-select asks once per
    distinct aspect.
  - Defaults on first pick (owner, 2026-10-12, Q77): the surface starts as
    Silk, or Base floor when the image's aspect matches a floor in the
    catalog. The size starts as that surface's catalog default, fitted to the
    image's aspect: the default's long side is kept and the other side comes
    from the image, so nothing stretches, with a note when the shape differs
    from the standard. Changing the surface moves the size to the new
    surface's default unless the user chose a size. A trustworthy size from
    the file still wins.
  - No print-readiness check: the review shows no DPI and stores no "not
    print-ready" badge (owner, 2026-10-12, Q75).
  - SVG and PDF: a page picker for more than one page, one Artwork per page.
    The original stays vector. The
    display texture is rasterized by `sharp` at the kind's cap; PDF pages
    are rendered by pdf.js in a hidden window owned by main (no native
    dependency) [owner, 2026-10-11, Q33].
  - CMYK or ICC-tagged images: original kept; display texture converted to
    sRGB by `sharp`, noted "converted from CMYK for display; colors may
    differ". Pantone references are an optional Artwork field, not asked at
    import.
- **Import IPC:** the editor asks main to pick files, run the pipeline and
  read and write the local Library over 19 `library:` channels, recorded in
  ADR 0002 D-13 and designed in
  [proposals/C1.9-import-ipc.md](proposals/C1.9-import-ipc.md); they follow
  D-4's rules. The model pipeline and template generation run in a utility
  process; artwork, pdf.js, the store and dialogs stay in main. Paths never
  come from the renderer; main commits exactly the bytes it reviewed
  [owner, 2026-10-12, Q45–Q47].
- **Size limits**, checked before reading and again on the bytes: 200 MB per
  model with its resources; 300 MB per artwork file, plus the 1.5-gigapixel
  limit; 50 files per pick; 64 MB per renderer-supplied payload; 1 MB per
  thumbnail. An over-limit file shows as Can't import, not an error. One
  model file per import; artwork can be many, but not mixed with models
  [owner, 2026-10-12, Q48, Q52].

### Packaging and CSP [01, 12, 18, 20]

- `sharp` in main for resizing, rasterizing and color conversion; it is
  already a transitive dependency of `@gltf-transform/functions`. Packaging:
  `asarUnpack` for `sharp` and `@img`, no Vite change, a `files` filter, macOS
  dylib signing, a Linux glib check; use `pnpm exec electron-builder`. Measured
  on an unsigned arm64 build: about 3 MB net (the app already ships sharp
  through `@openmarch/ui`); real signing untried.
- The renderer's CSP does not change; no `'wasm-unsafe-eval'`. v1 controls
  texture memory with per-kind caps, stored as PNG, JPEG or WebP.
- BC7 KTX2 loads under today's CSP with no WASM, but is **not in v1**; it is
  adopted only if the integrated-GPU run shows memory pressure, behind a
  `bptcSupported` check with an RGBA8 fallback (without BPTC it draws black).

### Starter kit [11, 16]

- Template `.blend` files per kind; a reference scene (median v4u body,
  catalog stand-ins, WGI 60 × 90 ft area); Artwork templates (the same files
  the app downloads); clean examples; a one-page guide; a glTF export preset.
- The **OpenMarch Tools** Blender add-on: set the kind; mark `OM_grip_*` and
  other `OM_*` points; declare artwork slots with real sizes; set stretch
  zones; stamp `itemId`, `kind`, `kitVersion` and the export license ("All
  rights reserved" pre-selected, asked once in preferences); pre-flight
  checks; "Export for OpenMarch" (GLB, Y-up, custom properties on, modifiers
  applied, no quantization on skinned meshes, no Draco).
- The uniform section (seven v4u bodies, v4 rig, `_PART` palette, an example
  garment with all seven fits) derives from upstream om-pose and waits for the
  legal gate (section 10).
- Bundled in the app (Help ‣ Get the Blender starter kit saves a zip) and
  mirrored on the website; extensions.blender.org later. The importer notes an
  outdated `kitVersion`. The minimum Blender is the LTS om-pose exports with
  (confirm upstream).

## 3. Sizing and fit

### Units [05]

- Meters in storage, full-precision floats, never rounded on write. Feet
  input accepts `4'6"`, `4.5 ft`, `54 in`, converted exactly at 0.3048 m/ft.
  Display rounds only: ft-in to the nearest ⅛ in, or meters to the nearest
  cm, per a show or user setting. A value typed in feet re-displays as typed.
  Catalog sizes are stored from their source unit, so a 36 × 54 in silk
  doesn't drift.

### Catalog [03, 08]

The size standards catalog is the default for every kind; custom is the
escape hatch. Silks are written header (along the pole) × fly.

Silks that hang below the pole's end also have a depth (overall height); it
defaults to the header. Standard pole silks are true rectangles by default,
with an optional per-silk sag of the top and bottom edges toward the fly.
The 44 × 66 swing has a flat bottom. Vendor names are kept as searchable
aliases, never shown as labels [owner, 2026-10-12, Q39–Q41, Q44].

- **Poles:** 5, 5.5, 6, 6.5, 7 ft (8 ft special), 1 in diameter; default 6 ft
  (1.829 m). Swing ultralite 24, 30, 36, 42, 48, 52 in, ½ in diameter;
  default 36 in. T-poles 48/68/84 in uprights with 30 to 48 in crossbars.
- **Silk Cuts:** pole pairings 5 ft 30 × 46, 5.5 ft 33 × 50, 6 ft 36 × 54,
  7 ft 42 × 60 in. Also standard 36 × 56, oversized 42 × 67, teardrop
  44 × 74, swing 44 × 66, curved or super swing 44 × 84, oversized swing
  56 × 84, arcs 45 × 96, 44 × 94, 54 × 100 in (vendor names). Hanging cuts
  are stored as header × fly × depth: super swing 44 × 68 × 84, oversized
  swing 42 × 56 × 84, regular arc 45 × 78⅝ × 96 [Q39]. A double swing is two swing
  flags, not a Cut. Single-sided prints show the mirror image on the back.
- **Rifles:** 36, 37.5, 39 in; default 36 in. **Sabres:** 32, 36, 39 in;
  default 36 in.
- **Floors:** WGI competition area 60 × 90 ft minimum to 78 × 106 ft maximum;
  default Base floor tarp 60 × 90 ft (or the field template's footprint).
- **Flat props:** default 4 × 8 ft sheets (unverified). Floor props: any size.
- Soft warnings tagged "WGI": equipment under 24 in, floors over
  78 × 106 ft. Never blocks. The double-door rule for props stays out until
  sourced.
- The real swing silk (44 × 66 in) replaces the repo's 1.2 × 0.9 m [03, 10].

### Artwork size and templates [08]

- Every Artwork has a physical width × height: from its template, from
  trustworthy metadata (PDF or SVG page size; PNG pHYs other than 72/96 DPI,
  which count as unknown), or from the user. Imported into a slot with no
  trustworthy size, it takes the slot's size.
- **Artwork templates** per surface kind (silk Cut, Base floor, Floor prop,
  prop top/front/back, Uniform part front/back): physical size, safe area,
  shape mask for arc, teardrop and swing cuts, a PNG resolution,
  orientation marker (header or pole side; audience side for floors), and
  bleed (⅛ in flags, ½ in sublimation) in the download only. PNG, SVG and PDF
  at size. Values set by the owner on 2026-10-11 [Q29–Q32]:
  - Safe area: 1 in for flags and props; 6 in for floors and Floor props.
  - Bleed: 2 in for floors and Floor props; ½ in for prop panels.
  - PNG resolution: flags, props and Uniform parts at 150 DPI; floors capped at 8,192 px on the long edge, noting that the PDF or
    SVG is the print master.
  - Silk templates put the pole side on the left (fly wide × header tall).
    Uniform panels split front from back at z = 0 in the rest pose and are
    sized from the median body. Floor props use the floor resolution.
  - Cut outlines come from traced vendor silhouettes (research
    `research/silk-cuts`); low-confidence shapes carry a "shape from vendor
    photo" note. Templates mark the pole sleeve strip (about 3 in) with a
    dashed guide line. When a fixed safe-area inset doesn't fit a small
    item, it shrinks to a quarter of the shorter side, with a quiet note
    [owner, 2026-10-12, Q28, Q38, Q42, Q43]. Content outside a shape mask is clipped in 3D and flagged "content
    outside cut".

### Fit [08]

- Same aspect: scaled automatically with a lasting "scaled N%" badge.
- Different aspect: **fill** (default; crop centered, can pan) or **fit**
  (pad with transparent where the surface allows, else the base color).
  Never non-uniform, no zoom inside fill in v1. Mode, pan and pad color live
  on the slot assignment, so one Artwork can sit differently on two slots.
- **No print readiness** (owner, 2026-10-12, Q75; replaces the earlier
  effective-DPI warning): the Version still records its native DPI as
  metadata, but nothing warns on it. Color: store sRGB plus an optional
  Pantone reference [03].

### Models [08, 11, 18]

- Each kind has a plausible size range (for example equipment 0.3 to 3 m).
  Outside it, the importer pre-selects the conversion (×0.01 cm, ×0.0254 in,
  ×0.3048 ft) that lands in range, confirmed in one click; if none fits, it's
  flagged. Never converted silently.
- Resizing only along declared stretch zones, or by an explicit uniform scale
  with a badge. A pole with a stretch zone along it fits every catalog length.
- Triangles over the per-kind cap: flagged with one-click simplify and a
  before/after preview. Over 4× the cap: rejected. Provisional caps:
  Equipment 2k, Garment 3k per body type, Prop 20k, Base floor 5k, Floor
  prop 5k. Garment textures cap at 1024; Uniform part artwork caps at 1024
  on the long edge [owner, 2026-10-11, Q34, Q37].
- A missing `OM_grip_R` pre-selects a grip a quarter of the way along the
  longest side; grips live in the sidecar, never re-centering the model. A
  model is guessed Z-up when Z is its largest side and over 1.25× Y (floors
  get the rotation offered but unchecked). A Garment with any unrigged mesh
  is rejected [Q37].

## 4. Items and Placement

### Items [05, 07, 24, 26.14]

- An **Item** is a Prop, or a piece of Equipment with its own identity in
  the show, so it has its own drill and Placement. Every prop is an Item.
  Equipment a performer carries by default becomes an Item only when it is
  put down, handed off, or is an extra, and stays one after that (`CONTEXT.md`).
- Props and row-backed equipment are `marchers` rows (`type = "prop"` or
  `"equipment"`): positions come from the timeline resolver; motion and undo
  are inherited.
- One table, **`items`** (PR 1013's `props`, renamed), `kind` = `prop` |
  `equipment`. `surface_type` applies to props only. `props.image` is dropped
  for Artwork slots; `image_opacity` becomes a 2D display preference. An
  optional Library model reference per item; a different model is a
  different item.
- **Equipment is implicit until it needs an identity.** A performer carries
  what the Carry channel says, with no row; it becomes an Item (a row) the
  first time it is put down, handed off or added as an extra, and never folds
  back. One
  per hand: a swing-flag pair is one two-handed item; a drum with sticks is
  one item [07].
- Making an item from a performer's implicit flag writes a Carry `none` cue
  for that performer at the item's first count, linked to the item so undo
  and delete remove both [26.14].
- **New items:** home where created, on field from that count. Before it, a
  created prop is Off field and an item that came from a flag is held by its
  original performer [24].
- Every all-marchers loop filters by `type`: drill order, ripple orders,
  coordinate sheets, mobile export, drill numbers, Visuals mode's Who list.
  Props may fill formation slots; band and section cue targets never reach
  items [24].
- **Hidden** is a per-user view preference (`UiSettingsStore.hiddenPropIds`),
  never show data [05].

### PR 1013 [05, 23, 24, 26.8, 26.20, 26.22]

PR 1013 is the owner's and can change freely. A C2 worker rebuilds it on
`main` with the timeline: keep the 2D Outline UI, `marchers.type`,
`surface_type`, real units and the changes in this spec (`items`, depth plus
height, artwork slots); drop `prop_page_geometry` and every `marcher_pages`
write; add a timeline create path and the geometry table; one squashed
migration numbered after the timeline's and the cue migration. Upstream PR
1013 is closed with a link to the rebuild, and the work goes upstream later
with the rest of the 3D work.

### Placement [07, 21, 26.12, 26.15, 26.19]

A sparse table keyed by `beat_id`: the value on a count is the latest change
at or before it; a change happens at the start of its beat; deleting the beat
deletes the change. It joins undo history and repair like the cue tables.

- **Held** by one or more performers, each with a hand (left, right, both;
  hands needed come from the model's `OM_grip_*`, else both). Holding is a
  relation between an item and performers; a held item renders as ADR 0004's
  prop bone (hand × grip offset).
- **Placed** at the item's own position and rotation, with an optional
  **Crew**. Big props are crewed, not held: the prop keeps its own pathway and
  the crew's dots stay their own.
- **Off field:** not drawn in 2D, 3D or video export. Items are on field by
  default. On and off field change instantly at their count; a prop seen
  entering is placed off the edge earlier and moved on [21].
- **Item ripples:** one row per item at staggered counts sharing a group id,
  so they edit, move and delete together; the Items tab treats the group like
  a cue ripple with the same orders (drill, left→right, right→left, down the
  form) [21].
- A visible trade of equipment between performers is a Placement change; the
  cue channels themselves are hard cuts [26.12].
- **Hand conflicts are allowed.** The newest Placement takes over at its
  count and is drawn; the displaced item isn't drawn while the conflict
  lasts; a quiet note names it ("Flag not put down, count 9 of page 5"). No
  data changes automatically [07, 21].
- A placed prop may move with no crew (people outside the show). Show
  setting "Warn when a prop moves without a crew", default off, stored in the
  show file [07, 26.19]. A crew-distance note always applies when a crew is
  assigned.
- **Put down:** at release the app writes the item a move ending at the
  holder's position (the midpoint of the holders' hands for several). If the
  holder's drill later changes, a quiet note "put down away from its holder"
  offers one-click "Snap to holder". A timeline "follows marcher" span stays a
  possible later upgrade [24].

### Artwork slot assignments [05, 07, 08, 11, 26.1]

- A beat-keyed table: item, slot, beat → Artwork Version, with fill or fit,
  pan and pad color on the assignment; in history and repair.
- A no-model prop has a top slot, plus front and back when it has height; a
  model prop has the slots its model declares.
- The item slot picker writes a row here at the current count: the whole
  show while the slot has no changes, otherwise from the current count on.
  The scope is always on the button and can be switched [11, 26.1].

## 5. Geometry and platforms

### Outline geometry [05, 21, 24, 26.7]

- A beat-keyed table beside Placement, not a cue: item, beat, width, depth,
  height, rotation, outline type, custom outline, transition length. Latest
  wins, eases in over the transition, beat delete cascades; in history and
  repair.
- A footprint is **width** and **depth**; vertical size is **height**.
- Independent of moves: a resize never needs a move, and dragging a move
  doesn't carry its resizes.
- Edited on Visuals mode's Items tab. A drag of an Outline in the 2D editor
  writes a geometry change at the playhead's count, the same data [26.7].
- **Floor props** get a **rolls out** flag: as the Outline grows over a
  transition, the Artwork is revealed from a chosen leading edge instead of
  stretched, and rolls back up when it shrinks. No fade or rise entrances in
  v1 [21].

### Surface types [05]

- floor: flat, marched over, Artwork on top (a Floor prop);
- platform: has height, performers whose dot is inside stand on top;
- obstacle: has height, not stood on.

### Base floor [03, 11, 18, 26.18]

The Base floor is an import kind with Artwork (2048 on the long edge). The
show's floor is its field image (ADR 0002 D-23), so it is D-5's tarp image
too.

**Planned change (owner, 2026-10-12, Q78–Q82; ADR 0002 D-23, accepted
2026-10-15):**

- All assets are managed in one place, the Assets area. Contextual links
  ("Upload floor…", "Upload flag…", …) still start an import where the user
  is, through the same import review, pre-filled with surface and size, next
  to a pick from the Library (Q78, Q82).
- One floor per show: the show's Base floor is the field image, used by the
  2D canvas, exports, mobile and the 3D tarp. Fill or fit and opacity stay in
  Field settings (Q79).
- The floor is an embedded Version like any other, named by reference in
  `field_properties.json_data` as `floor: { itemId, versionHash }`. The bytes
  live once in the show's Library tables, outside history; setting or
  clearing the floor undoes with the small JSON change. There is no 2D copy:
  2D, exports and the 3D tarp read the floor, and `field_properties.image` is
  legacy (D-23).
- Opening an existing show quietly converts its field image into the show's
  floor, outside undo history and without writing to the Library, then
  clears `field_properties.image` (Q80). The change bumps the file format, so
  older builds refuse the file.
- Mobile sync and export must produce the field image from the floor,
  flattened at sync or export time; that is part of the mobile sync work
  (D-23).
- Assets has two sections: **This show** (everything the show embeds,
  including its floor; travels with the file) and **Library** (this
  computer). Embedded items missing from the Library offer "Add to Library"
  (Q81).
- Field settings → Image gets "Upload floor…" (surface Base floor, size from
  the field) in place of its current upload (Q82).
- Order: C1.11 (embedded Library tables), then the floor as the field image
  with convert-on-open, then the Field settings link and the This show
  section, each its own PR after the C1 stack (Q82).

### Platforms and obstacles [25]

- A performer stands at the height of the **tallest platform under their
  dot**, stepping up or down over about half a count when the dot crosses an
  edge, in step, with no cue. Exact foot placement on the edge is not in v1.
- Heights: presets 8, 16, 24 and 32 in, or any custom height. A step of more
  than 16 in with nothing between gets a quiet note ("P12 steps up 24 in at
  count 33").
- No ramps or stairs in v1: stacking platforms makes steps.
- A performer inside an obstacle clips through in 3D, with a quiet note ("T4
  inside Wall A, counts 49–56").
- Riders on a moving platform aren't attached; a note fires when a dot leaves
  a platform while it moves.
- A prop or placed item sits at the tallest platform under its footprint
  center; a held item follows its holder; Floor props stay on the Base floor
  and lift nothing.
- No new marks in 2D or Visuals mode: the Outline shows in 2D, height in 3D.

## 6. Cue channels: Carry, Silk and Uniform

What a performer carries, their silk and their uniform are **state cues** on
three new ADR 0004 channels, with its targets (band, section, tag,
hand-picked set), `beat_id` keys, latest-wins rule and ripples. The appearance
cascade and its `equipment_name` column are not used [07 revision].

- **States only:** phrases are rejected on all three [07 revision].
- **Hard cuts:** all three change at the start of the cue's beat;
  `transition_length` is ignored on them. Visible trades use Placement
  [10, 26.12].
- **Ripples** are allowed; a change with no ripple hits the whole group at
  once [10].
- **Values** name Library items as `library:<uuid>@<version hash>`; Carry
  also takes `none` [26.10, 26.14].
- **Items are never targets** [24].
- **Storage:** the `cues.channel` CHECK widens in ADR 0004's migration if it
  hasn't shipped, otherwise in a new one after it; the items migration
  follows the cue migration [26.20].

### Carry [07 revision, 26.2, 26.4]

- Says **what** is held: flag, rifle, sabre, horn, none. ADR 0004's
  Horn/Equipment says **how**. A rifle line can switch to sabres without
  touching its equipment work.
- Default: the section's usual equipment, with `carryForSection`
  (`view3d/core/instruments/catalog.ts`) as the fallback. Existing shows
  carry exactly what they carry today.
- **Carry decides what is held.** A Horn/Equipment state that doesn't match
  what Carry gives a performer is ignored for that performer, with a quiet
  note; it never changes what is held (ADR 0004 section 2.3 rule 7, amended)
  [26.2].
- Equipment pose is the Horn/Equipment channel. The dormant
  `equipment_state` appearance column is dropped [26.4].

### Silk [08, 10, 26.11, 26.13]

- Changes a flag's Artwork only, never its Cut. A different Cut is a
  different flag: a Carry change.
- Applies only to performers carrying a flag; others are skipped silently. A
  flag of another Cut gets the Artwork fitted per the sizing contract
  (section 3), with a note when the aspect differs.
- Default with no Silk cue: a built-in plain silk in the section's 2D color.
- The silk picker writes a Silk cue (count-keyed), never an appearance row
  [26.1].

### Uniform [09]

- One uniform reference per performer from a count on, never per-part
  overrides. A per-performer override is a hand-picked set. Hats off is
  "Trumpets → _Band, hats off_ from count N".
- Default: Band default, or Guard default when `isGuard`. Nothing is stored.

### Exports [21, 26.5]

Page-grained exports (coordinate sheets, mobile and performer exports) can
optionally list each **Carry, Silk, Uniform and Placement** change under its
page with its count ("from count 9: red silk; holding Flag · F1"), never
rounded to the page. Printing behavior cues stays out of scope.

## 7. Silks

### Motion [02, 10]

- A **stateless vertex-shader wave** driven by the show clock (`uCount`), a
  per-instance phase seed, and the marcher's ground speed and turn rate, with
  analytic normals, inserted before `skinning_vertex` in the existing
  `onBeforeCompile` chain. Deterministic, so scrubbing and seeking stay exact.
  No cloth simulation (WebGL2 has no GPU cloth path; CPU simulation is
  stateful and breaks seeking). Baked caches (VAT) only later, for named flag
  work such as tosses and spins [02].
- Motion variant: **B, hang and billow**, from the silk prototype
  (`prototype/silk-look`, `a7c7974f`): the silk hangs at rest and billows when
  the performer moves [10].
- **Global defaults, not editable in the UI** [10]:
  - Motion: amplitude 0.055 m, wavelength 0.9 m, wave speed 0.2 m/s, speed
    coupling 0.25, turn coupling 0.05, droop at rest 0.5.
  - Look: sheen 0, back-side print 1 (a single-sided silk shows the mirrored
    print at full strength), grid 24 × 16, swing silk at real size
    44 × 66 in.
  - Silk swap: cut on the downbeat, 1 count, stagger 0 (the whole group
    changes at once; ripples remain available through cues). Under cues, a
    swap is a Silk cue at the start of its beat: a **hard cut**.
- Grid 12 × 8 at `low` [18].

### Rendering [02, 15, 18]

- Silks get their **own instanced mesh** with a cloth material (metalness 0,
  double-sided) and UVs, instead of the instruments' metal material: at most
  +2 draw calls (near and far tier). Measured on an M1 Pro: 40 wave silks in
  one 24 × 16 mesh cost +1 call, +31 k triangles, +0.17 ms at 1× [15].
- All silk Artworks in use are layers of **one texture array**, sampled by a
  per-instance layer index; a swap writes one number. Layers are 1024 × 1536
  at `high` and 512 × 768 at `low`; no 2048 in v1 (2048 × 3072 layers hitch
  about 300 ms on upload) [15, 18].
- The back mirrors the front via `gl_FrontFacing` [02].
- A silk keeps its previous Artwork until the new layer is ready, never blank
  [18].
- Silks cast no shadows at any quality until they are skinned to the hand
  [18].

## 8. Uniforms

### Contents [09]

- Six **Uniform parts**: Top (jacket and sleeves), Bottoms, Headwear (none,
  shako or aussie, with plume and visor), Footwear, Gloves, Overlay (cape now;
  sash or skirt later).
- Not in a uniform: the performer's body (skin tone, body type, height) and
  Equipment. The renderer's "look" (uniform × carry × hold) stays a
  render-only grouping.
- **Colors:** one shared palette of roles per uniform (primary, secondary,
  accent, trim, …). The pattern (classic, sash, plastron, military, split,
  fade) belongs to the Top; the seam stripe to Bottoms. The data also accepts
  a literal color per part; the v1 editor exposes only the palette.
- **Artwork:** Top, Bottoms and Overlay take front/back Artwork slots,
  projected in rest-pose meters inside the uniform shader, with no UVs, on all
  seven body types and the block bodies. Templates are sized to the median
  v4u body and graded proportionally; an Artwork's size means "as worn by the
  reference body". Art wraps poorly onto sides and sleeves, and the template
  says so [08, 09].
- **Garments:** a custom rigged model that replaces the parts it declares (a
  unitard replaces Top and Bottoms) and can bring its own slots. The median
  fit is required, the other six body-type fits optional. A mesh names its
  fit with `extras.openmarch.fit: "<body type>"`; an untagged mesh is the
  median fit [owner, 2026-10-11, Q36]. A body type with no
  fit wears the median fit with a quiet note ("no fit for _broad_, may
  clip"). Headwear, Footwear and Gloves take colors only unless a Garment
  replaces them.
- **Variants:** every variation is its own uniform (hats off, soloist, drum
  major), made with "Duplicate as variant".

### Library and show [06, 09, 16, 26.17]

- A Uniform is a composite Library item that pins exact `(item, Version)`
  pairs for its Garments and Artwork. Accepting an update to one makes a new
  uniform Version, which shows see as their own "update available". Never
  silent.
- Uniforms made in a show stay in the show, with a "Save to Library" action
  [26.17].
- A Uniform's license covers only what it adds; each Artwork or Garment keeps
  its own [16].

### Defaults [09]

- The 2D fill color no longer sets uniforms: remove the
  `sectionUniform(section, fill)` link in `core/marchers/looks.ts`.
- **Band default:** today's navy `#2d4f9e` jacket and shako, white and gold
  trim, navy pants. **Guard default:** all black and plain (no pattern, trim
  or stripe), black jazz shoes, no headwear, no gloves, no cape. Chosen by
  `isGuard`; nothing stored.

### Rendering [04, 09, 15, 18, 26.3]

- A per-look `DataTexture` (palette, pattern and part visibility) indexed by
  a per-instance `aLook`, with parts hidden per instance, is a v1 work
  package. With it, color and artwork uniforms cost 0 extra draws and 0 bake
  rows, so there is no cap; the new cost, skinning hidden-part triangles, is
  measured in the integrated-GPU run. It is built in the repo's own renderer
  (ADR 0004 step 6), not upstream in om-pose [26.3].
- Today each extra look costs about 6 draws (+7 / +30 / +60 / +101 calls for
  1 / 4 / 8 / 16 looks on an M1 Pro) [15].
- Garments cost +1 draw per fitted body type × primitives, and cast no
  shadows [04, 09].

## 9. Budgets

All numbers are provisional until the integrated-GPU run [18].

- **What counts:** what is on screen and resident at the worst moment of the
  show (draw calls, display-texture memory), not show totals. Notes speak in
  counts ("from count 412: 26 silk artworks at once"), figures behind a
  "Why?".
- **No hard caps.** Display textures drop to their `low` size when resident
  memory passes the threshold, beside design.md's `low` switch below 30 fps,
  and the 3D View always says so ("showing reduced textures here"). Originals
  are untouched. The only hard limit is the 4× triangle rejection.
- **Display sizes:** silks 1024 × 1536 (`low` 512 × 768); Base floor and Floor
  props 2048 on the long edge; prop Artwork slots and Equipment textures 1024.
  Print always uses the original.
- **Notes:** resident texture memory above 256 MiB at `high` (about 24 silk
  layers plus a floor); estimated draw calls above 270 (computed at edit time
  from body types in use, Garments, models × materials × tiers, and silks); a
  quiet note past about 8 distinct Garments [09]; show file above 500 MB,
  naming the largest items. Worst moment named with a hint ("share silks
  across sections").
- **Custom models:** no count cap; each feeds the draw estimate.
- **Loading:** the current moment ± about 2 pages, at most one texture upload
  per frame while playing, a short preload on a jump.
- **Video export** is exempt: full display sizes at `high`, waits for every
  texture, never reduces.
- **No live cost in pickers** in v1.
- **The integrated-GPU run** [18, 26.23]: Intel Iris Xe on Windows and a base
  M1; `hs` and `pro`; press box and a field-level camera; 24 silk layers,
  Garments and the hidden-part skinning cost, with the `task/gpu-benchmark`
  harness. One combined run also answers ADR 0004 section 8.5 (300 performers
  in `pro` at 1080p, the compose pass's GPU time); ADR 0004 step 6 waits to
  merge until the per-look texture and the silk wave are built on it.
  Required before Artwork and uniforms ship; thresholds change if it says so.

## 10. Licensing

Research basis [14]; policy [16]. Not legal advice.

- **OpenMarch-made content:** built-in Library items, Artwork templates and
  Starter kit templates and reference meshes are **CC0 1.0**, separate from
  the code, with no OpenMarch logo or name in CC0 artwork. The "OpenMarch
  Tools" add-on is **GPL-3.0-or-later**; its `.blend` files and templates are
  CC0 in a separate folder.
- Declared twice: a `LICENSE` in each asset folder (built-ins, templates,
  Starter kit, om-pose assets) and the per-item `license` field. `SOURCE.json`
  and the om-pose vendor README stop saying "the app's license".
- **om-pose assets** (correction to ADR 0002 D-7) [16, 26.6]: they don't ship
  under the app's license. The clips, derived from 2019 Cadets footage, are in
  the counsel gate: no release that ships them goes out before counsel
  answers lawyer Q3. The reference bodies and v4 skeleton become CC0 once Q3
  is answered and om-pose adopts a license upstream (meshes only); `body-v5`
  (MPFB) sits under the same gate.
- **Third-party built-ins:** CC0, or CC-BY 4.0 with a complete attribution
  record. Not BY-SA, NC, ND or store licenses. Each has a manifest entry (SPDX
  license, author, source URL, attribution text, retrieval date) checked in
  CI against the allow-list.
- **Item metadata:** `license` (SPDX id, else `LicenseRef-Proprietary` or
  `LicenseRef-Unknown`, plus free text), `author`, `sourceUrl`,
  `attribution`, `modified`. "Can be shared" is derived, not stored. Empty
  means Unknown, never free. Outside the Version hash; snapshotted into the
  show on embed; a Library correction reaches a show only through "update
  available" as a metadata-only update. `modified` is set automatically on
  any `derivedFrom` copy and can't be cleared (slot cropping and recoloring
  don't set it). Copies inherit license, author, source and attribution.
- **Surfaces:**
  - Import review: optional, collapsed author, license and source fields,
    pre-filled from file metadata (glTF `asset.copyright`, XMP, PDF/SVG/PNG
    metadata, the kit stamp), with "Only import artwork and models you have
    the rights to use".
  - **Credits** in Show settings and the Library side panel's show tab: CC-BY
    and Unknown items as "Name — Author — License — Source (modified)",
    grouped by license; CC0 and built-ins collapse to one count line.
  - Exports (PDF, video): an optional credits page or end card, on by default
    when CC-BY material is used in the export's range.
  - **Share note:** a badge on Credits and one quiet line in the export
    dialog, for Unknown items only, worded "may not have the right to share",
    never "infringing".
  - "Add to my Library" from another show shows a read-only license line with
    the source link.
- **Legal gate:** nothing built-in ships until counsel answers lawyer Q1 (CC0
  art beside AGPL code; whether the CLA covers relicensing contributed
  assets), Q3 (om-pose clips), Q4 (GPL vs AGPL `LICENSE` text) and Q5 (Terms
  §9.1's reach). The `LICENSE` mismatch and a Terms §9.1 carve-out ship as
  their own small change, outside this effort, once Q4 and Q5 are answered.

## 11. Notes

Checks are **quiet notes**: shown on the thing and in the show's notes list,
never a modal, never a block (owner, 2026-10-11) [07, 08, 18, 21, 25].

- Producers: hand conflicts, crew distance, crew-less moves (when the setting
  is on), put-down drift, fit flags ("content outside cut", "scaled N%"), dormant slots, missing grips, missing Garment
  fits, more than about 8 Garments, budget notes, file size, platform steps,
  performers inside obstacles, dots leaving a moving platform, mismatched
  Horn/Equipment states [26.2], Silk aspect fits [26.13], outdated
  `kitVersion`.
- Notes name counts ("Flag not put down, count 9 of page 5").
- The notes list lives in Visuals mode; the 3D View shows a small note count
  [26.16].
- Import rejections are the one refusal, shown on the review screen, never in
  an `AlertModal` [11].

## 12. Visuals mode surfaces

Visuals mode is ADR 0004's workspace beside Editor and Light Designer (tabs per
channel, Who list, an editing lane under the timeline, result row, why
readout) [22].

- **Carry, Silk and Uniform tabs** [07 revision].
- **Items tab:** Placement, Outline geometry (with transitions and roll-out),
  Artwork slot assignments and item ripple groups [21, 24].
- **Uniform editor:** in the inspector on the Uniform tab; palette only in v1
  [09, 26.16].
- **Library side panel**, with Import… and Credits on its show tab [16,
  26.16]. Until Visuals mode exists, the Library lives in an **Assets** area
  in the editor's left sidebar: a browser of every Library item by kind with
  search, Import… and Artwork templates. A finished import closes the review
  and shows the new items highlighted there (owner, 2026-10-12, Q76).
- **Notes list** [26.16].
- Pickers carry an Import… that pre-fills kind, slot and size [11], and write
  count-keyed data with the scope on the button [26.1].
- The 2D editor gains only PR 1013's prop Outlines (drag writes a geometry
  change at the playhead's count); no marks on dots, no legend [22, 26.7].
- The 3D View stays read-only; it shows a small note count and the
  reduced-textures label [18, 26.16].

## 13. Changes to existing shows in 3D

- Sections lose their fill-colored uniforms and wear Band default or Guard
  default [09].
- Flags with no Silk cue show a built-in plain silk in the section's 2D color
  [26.11].
- Swing flags grow to the real 44 × 66 in Cut [03, 10].
- Silks stop shading like chrome, hang at rest and billow on the move, and
  drop from a 56 × 36 to a 24 × 16 grid [02, 10].
- What performers carry is unchanged [07].
- A Base floor Artwork, once set, replaces the background-image tarp [26.18].
  The show's floor is the field image (ADR 0002 D-23).
- Props appear only in timeline-mode shows [24].

## 14. Out of scope

The marketplace; the cloud library and sync; flowing fabric on Garments;
per-performer artwork such as names and numbers; the `LICENSE` and Terms §9.1
fix (its own change); the crew-minimum estimate (moved to an app-wide Helpers
effort, with ticket 17's decisions carried there); printing behavior cues;
drag-and-drop import [map, 11, 17, 26.5].

## 15. Open points

- **Where Carry, Silk and Uniform defaults are computed:** in `compileCues`
  (its input then carries each section's usual equipment and 2D color and
  each marcher's `isGuard`, a public package API change under ADR 0004 D-6)
  or in the 3D View. Needed before C3.5.
