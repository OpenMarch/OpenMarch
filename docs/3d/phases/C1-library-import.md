---
phase: C1
title: Customization, Library and import
status: not-started
owner: none
branch: none
pr: none
depends_on: [5]
updated: 2026-10-11
---

# C1: Customization, Library and import

<!-- cspell:words meshopt dedup CMYK -->

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

> Draft for the owner's approval (2026-10-11). The customization track, C1 to C5, slices the 3D customization design (props, equipment, uniforms and artwork). It is a separate track beside the numbered phases, with its own `C` prefix, because `docs/3d/fidelity.md` already plans Phases 6 to 8 (owner, ticket 26 review item 24). The early Phase 6 draft's two packages are folded in as C4.10 and C4.11. No package here can be claimed until C1.1 is done.

## Goal

The approvals and outside gates the whole customization effort waits on, then the parts that don't need the timeline: real units and the size catalog, `sharp`, the local Library, the model and Artwork import pipelines, the import review, Artwork templates and the Starter kit. The show-side Library tables follow once the timeline is merged.

## Track order and gates (C1 to C5)

```text
C1.1 approval ─┬─ P8 Library and import (no timeline needed)
C1.2 legal ────┼──────────────────── gates C1.13 ship, C5.8, om-pose clips in a release
C1.3 timeline ─┴─ C1.11 show tables
ADR 0004 step 2 (C3.1) ─── C2.1 PR 1013 rebuilt ── P9 items on the timeline
ADR 0004 steps 3, 8 (C3.2-3) ─── P10 Carry, Silk, Uniform cues; Items tab
ADR 0004 step 4 (C4.1) ─── C4.5 props and platforms in 3D
C4.10 Band/Guard defaults, C4.11 swing flags (early, no C1.1 needed)
ADR 0004 step 6 built (C4.2) ─── C4.3 aLook + C4.4 silk wave, on step 6's branch
C4.2 + C4.3 + C4.4 + C4.9 test Garment ─── C4.7 one integrated-GPU run (human)
C4.7 ─── C4.8 step 6 merged, then C4.3, C4.4 ─── C4.6 held items
C4.7 + C4.3 merged ─── P12 Artwork and uniforms
```

## Read first

- [../props-spec.md](../props-spec.md): the design spec. Ticket numbers on each package are the ones it cites; read those sections.
- [ADR 0002](../../adr/0002-3d-view.md), amendment of 2026-10-11 (D-9 to D-22)
- `CONTEXT.md` at the repo root: **Library**, **Library item**, **Version**, **Artwork**, **Artwork template**, **Starter kit**, **Credits**
- Findings: `research/gltf-import`, `research/ktx2-wasm-sharp`, `task/ktx2-sharp-spike`, `research/size-standards`, `research/ip-licensing` (branch, file `research/<name>.md`)

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### C1.1: Approve the amendments and open customization work

- Owner: human
- Status: done
- PR: none
- Parallel: no
- Depends on: —

**Goal:** the owner approves the ADR 0002 amendment (D-9 to D-22), the ADR 0004 amendment draft, and these phase files, or asks for changes.

**Scope:** answer or defer what is left in `DRAFT-NOTES.md` (the review answers of 2026-10-11 are applied); lift [../WORKER.md](../WORKER.md)'s "Scope is the MVP" policy for the customization track, C1 to C5 (it forbids imports today); add the track to [../plan.md](../plan.md) section 3; make the worker docs accept `C<track>.<n>` IDs (below); move the ADR 0004 amendment draft onto the cue branch.

**Tickets:** 26.

**Worker docs for `C` IDs.** Nothing parses phase IDs as numbers in code: `scripts/3d/run-worker.sh` passes the ID through and its `VIEW3D-STATUS` regex (`[A-Za-z0-9.]+`) accepts `C1.2`; `scripts/3d/coord.sh` doesn't read IDs; the `3d-work` skill and `3d-worker` agent only name `P<phase>.<n>` in their descriptions and defer to `WORKER.md`. The prose and one grep assume the `P` form and need these edits:

- `docs/3d/README.md`: the status grep `^### P[0-9]+\.[0-9]+` becomes `^### [PC][0-9]+\.[0-9]+`; the ID convention reads "`P<phase>.<n>`, or `C<track>.<n>` for the customization track"; code branches for the track are `3d/c<track>-<short-name>`.
- `docs/3d/WORKER.md`: the same ID and branch forms in steps 1, 3 and 4; step 2's "Prefer lower phases, then lower IDs" says how `P` and `C` packages order against each other; "Cross-phase note from P<n>" also allows `C<n>`.
- `.claude/skills/3d-work/SKILL.md` and `.claude/agents/3d-worker.md`: the descriptions and argument hint name both forms.

**Done when:** the amendment's status line reads approved, WORKER.md's policy names the C track and the ID changes below are in, the ADR 0004 text has a home on the cue branch, and `DRAFT-NOTES.md` is deleted.

**Checks:** none (a human verdict).

### C1.2: Legal gate for built-ins and the Starter kit

- Owner: human
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

**Goal:** counsel answers lawyer questions Q1 (CC0 art beside AGPL code; whether the CLA covers relicensing contributed assets), Q3 (om-pose clips derived from Cadets 2019 footage), Q4 (GPL vs AGPL `LICENSE` text) and Q5 (Terms §9.1's reach), from `research/ip-licensing.md` §7.

**Scope:** blocks shipping built-ins (C5.8), the Starter kit (C1.13) and any release that ships the om-pose clips (Q3; ADR 0002 D-7 correction), not building them. The Starter kit's reference bodies and v4 skeleton also wait for om-pose to adopt a license upstream. The `LICENSE` and Terms §9.1 fix ships as its own change outside this effort once Q4 and Q5 are answered.

**Tickets:** 14, 16, 26.6.

**Done when:** the answers are recorded in `docs/3d/findings.md` and the owner says built-ins may ship.

**Checks:** none (a human verdict).

### C1.3: Timeline merged into the 3D line

- Owner: human
- Status: done
- PR: [#129](https://github.com/AlexDumo/OpenMarch-timeline/pull/129)
- Parallel: yes
- Depends on: —

**Goal:** a tracker for the merge every schema package waits on: `main`, with `timeline/timeline-try-2` landed in it, merged with the 3D line in one commit that renumbers the 3D migrations after the timeline's (`docs/3d/performer-behavior.md` section 10, on the cue branches).

**Scope:** none here; the lead marks it done when the merge lands.

**Tickets:** 23, 24.

**Done when:** `main` contains the timeline tables and the 3D View, and its migrations open page-mode and converted files.

**Checks:** the lead records the merge commit in the progress log. Done: PR #129 merged the 3D View into `main` as `dc38f1a1` (the venue migration is now 0019), and `main` was deleted. C track code branches now base on `main`.

### C1.4: Real units and the size catalog

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C1.1

**Goal:** one platform-free module that every later package uses for sizes.

**Scope:** meters in storage, never rounded on write; exact feet input (`4'6"`, `4.5 ft`, `54 in`, 0.3048 m/ft); display rounding to ⅛ in or 1 cm per setting, with a value typed in feet re-displayed as typed; the size standards catalog (poles, silk Cuts, rifles, sabres, floors, flat props) stored from its source units; per-kind plausible model size ranges; soft "WGI" warnings (equipment under 24 in, floors over 78 × 106 ft); the size preset shape the local Library saves.

**Tickets:** 03, 05, 08.

**Done when:** catalog sizes round-trip without drift (a 36 × 54 in silk stays exact) and every catalog entry names its source.

**Checks:** unit tests for parsing, rounding and the catalog; type-check, lint, format, spellcheck.

### C1.5: `sharp` in the packaged app

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C1.1

**Goal:** `sharp` runs in main in packaged builds on every release platform.

**Scope:** add `sharp` to `apps/desktop`; `asarUnpack` for `sharp` and `@img`; a `files` filter; macOS dylib signing and notarization; the Linux glib check; Windows. Reuse the spike in `task/ktx2-sharp-spike` (`spike/ktx2-sharp/`, `app-hooks.patch`). Use `pnpm exec electron-builder`, not `npx`.

**Tickets:** 11, 12, 20.

**Done when:** a packaged, signed and notarized macOS build, a Windows build and a Linux build each resize a 2048² image to 512² in main; the app-size delta per platform is in `docs/3d/findings.md`.

**Checks:** the three packaged runs, recorded; type-check, lint, format.

### C1.6: Local Library store

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C1.1

**Goal:** the user's Library on disk, shaped like a future cloud cache.

**Scope:** `userData/library/`: content-addressed `blobs/sha256/ab/<hash>`, one manifest JSON per item listing its Versions, an index rebuilt from manifests; items with a stable UUID, kind (Model, Artwork, Uniform), name, tags, timestamps, original filename, `derivedFrom`; license metadata (`license` as SPDX or `LicenseRef-Proprietary` / `LicenseRef-Unknown`, `author`, `sourceUrl`, `attribution`, `modified`) outside the Version hash; built-ins read-only with fixed UUIDs, editing one makes a copy with `modified` set; identical bytes reuse the existing item; original source files kept outside the hash; never pruned automatically; size presets. Main process only.

**Tickets:** 06, 08, 11, 16.

**Done when:** the store round-trips items and Versions, the index rebuilds from manifests alone, and editing a built-in yields a copy that inherits its license fields.

**Checks:** unit tests over a temp directory; type-check, lint, format, spellcheck.

### C1.7: Model import pipeline

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C1.4, C1.5, C1.6

**Goal:** a GLB or glTF in, a normalized GLB plus sidecar and an import report out, in Node.

**Scope:** `gltf-validator` (errors block); reject `extensionsRequired` outside the allow-list; decode Draco and meshopt; measure bounds, triangles, textures and joints; read `OM_grip_R`, `OM_grip_L`, other `OM_*` nodes and `extras.openmarch` (`artworkSlot`, `stretch`, `itemId`, `kind`, `kitVersion`) from raw JSON; pre-selected unit conversion and Z-up rotate (Equipment, Garments, non-flat Props); per-kind triangle caps with simplify and the 4× rejection; texture downsizing to per-kind caps; Garments only on the exact v4 joints and rest pose with ≤4 influences, no quantization and `_PART` paint, with median fit required; dedup, prune, weld; the report grouped as Can't import, Needs your choice, Fixed for you, saved as Import notes in the sidecar. No UI.

**Tickets:** 01, 04, 08, 09, 11, 18.

**Done when:** fixture files cover every row of the report and every rejection, and normalized output loads in bare `GLTFLoader` with no decoders.

**Checks:** fixture tests; type-check, lint, format, spellcheck.

### C1.8: Artwork import pipeline

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C1.4, C1.5, C1.6

**Goal:** PNG, JPG, SVG and PDF in, an Artwork Version (original plus display texture) out.

**Scope:** physical size from template, trustworthy metadata (PDF/SVG page size; PNG pHYs other than 72/96 DPI) or the user; native DPI stored, "vector" for vector originals; a page picker for multi-page SVG and PDF (one Artwork per page); display texture rasterized or converted to sRGB by `sharp` at the kind's cap, with the "converted from CMYK for display" note; one size question per distinct aspect in multi-select.

**Tickets:** 03, 08, 11, 18.

**Done when:** fixtures for each format, a CMYK JPEG and a two-page PDF produce the right Versions and notes.

**Checks:** fixture tests; type-check, lint, format, spellcheck.

### C1.9: Import and Library IPC contract

- Owner: human
- Status: open
- PR: none
- Parallel: no
- Depends on: C1.1

**Goal:** the channel list for picking files, running imports and reading and writing the local Library, recorded in ADR 0002 D-13 before code (no ticket or review answer names it).

**Design:** [proposals/C1.9-import-ipc.md](../proposals/C1.9-import-ipc.md), approved by the owner on 2026-10-12 (Q45–Q58), recorded in ADR 0002 D-12, D-13, D-15 and D-22 and props-spec.md section 2.

**Follow-ups:** C1.7 adds an optional `onStage(stage)` progress callback to `importModel` and fixes the `textures/./` URI normalization bug; C1.8 adds `renderArtworkPreview(file, page, maxPx)` at 256 and 1024 px and closes the PDF renderer's hidden windows on editor close and quit. Q55's `.gltf` containment fix is done (C1.7, `d3cd28e7`).

**Scope:** decided by the owner or the lead with the owner; follows D-4's rules (hard-coded names, main validates, the editor is the only writer).

**Tickets:** 11.

**Done when:** D-13 lists the channels and their payloads.

**Checks:** none (a decision).

### C1.10: Import review modal

- Owner: none
- Status: open
- PR: none
- Parallel: no
- Depends on: C1.7, C1.8, C1.9

**Goal:** the one-screen import review.

**Scope:** Library Import… and an Import… inside each picker (pre-fills kind, slot and size); `dialog.showOpenDialog` in main with the "3D model", "Artwork" and "All Files" filters; every import lands in the local Library (opened from the Library side panel in Visuals mode) and the show embeds a copy; the review in Visuals mode (owner, 2026-10-12, Q60–Q64; prototype `prototype/import-review` layout B): the Library side panel becomes the import panel and the Visuals mode stage becomes a code-split three.js preview built from `view3d/core/` builders; one screen, no stepper; PDF pages grouped by aspect beside their size question; Add reads "Add new version" for a re-import and "Add N to Library" for batches; the report in the panel with pre-selected choices; manual grip and slot setting when `extras` are missing, with the "re-export with the OpenMarch preset" hint; kind asked unless the kit stamp pre-selects it; the Artwork size step (template chips, locked-aspect fields, "From file", live effective DPI); optional, collapsed author, license and source fields pre-filled from file metadata, with "Only import artwork and models you have the rights to use"; re-import matching (kit `itemId`, else filename); rejections on the same screen with a pointer to the Starter kit, never an `AlertModal`. The 3D window stays read-only.

**Tickets:** 08, 11, 16, 26.16.

**Done when:** a clean kit export imports in one click, and each "Needs your choice" item shows pre-selected.

**Checks:** component tests; a focused e2e for one clean import and one rejection; screenshots; type-check, lint, format, spellcheck.

### C1.11: Show embedding and `library_blobs`

- Owner: trevor (3d/c1-show-embedding)
- Status: in-review
- PR: #148
- Parallel: yes
- Depends on: C1.3, C1.6

**Goal:** a show carries copies of everything it uses.

**Scope:** a migration (after the timeline's) for `library_blobs` (hash key, bytes, deduped) and the show Library item table (item id, kind, name, Version hash, metadata snapshot, sidecar JSON), both outside undo history; built-ins embedded too; prune on save (Library items nothing references, then orphan blobs; a Library item a cue or Item table names is never pruned); the table loaded at open, blobs read lazily by hash with a small cache, never originals for rendering; "update available" per Library item, never silent, including metadata-only updates; "Add to my Library"; opening a show never writes to the Library.

**Tickets:** 06, 11, 16.

**Done when:** a show opened on a machine with an empty Library renders from its embedded copies, and save leaves no orphan blobs.

**Narrowed (owner, 2026-10-13):** nothing renders Library items or names them before C2 and C4, so C1.11 is done when a show's own file rebuilds every embedded Version with a matching hash (with an empty Library) and the prune plan leaves no orphan blobs in tests. Prune is built but not wired; see the handoff notes.

**Checks:** schema and migration tests (page-mode and converted files); history tests showing both tables outside history; type-check, lint, format, spellcheck.

### C1.12: Artwork template downloads

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C1.4

**Goal:** people can author Artwork that fits.

**Scope:** per surface kind (each silk Cut, Base floor, Floor prop, prop top/front/back, Uniform part front/back): physical size, safe area, shape mask for arc, teardrop and swing cuts, minimum and recommended DPI, orientation marker, and bleed (⅛ in flags, ½ in sublimation) in the download only; PNG, SVG and PDF at size; Uniform part templates sized to the median v4u body, with the note that art wraps poorly onto sides and sleeves.

**Tickets:** 03, 08, 09.

**Done when:** every catalog surface has a template in all three formats, sized exactly.

**Checks:** unit tests on generated sizes; type-check, lint, format, spellcheck.

### C1.13: Starter kit

- Owner: trevor (3d/c1-starter-kit)
- Status: in-review
- PR: #155
- Parallel: yes
- Depends on: C1.7, C1.12

**Goal:** the official Blender kit, bundled in the app.

**Scope:** template `.blend` files per kind; Artwork templates (the same files as C1.12); clean examples; a one-page guide; a glTF export preset; the "OpenMarch Tools" add-on (GPL-3.0-or-later): set kind, mark `OM_grip_*` and other `OM_*` points, declare artwork slots with real sizes, set stretch zones, stamp `itemId`, `kind`, `kitVersion` and the export license ("All rights reserved" pre-selected), pre-flight checks, and "Export for OpenMarch" (GLB, Y-up, custom properties on, modifiers applied, no quantization on skinned meshes, no Draco); Help ‣ Get the Blender starter kit saves a zip; `LICENSE` files (CC0 for templates, GPL for the add-on). The reference scene and uniform section (seven v4u bodies, v4 rig, `_PART` palette) are derived from upstream om-pose and wait for C1.2 and om-pose's license.

**Tickets:** 11, 16.

**Done when:** each template exported with the add-on imports through C1.7 with no "Needs your choice" items. Shipping waits for C1.2.

**Checks:** round-trip tests on committed exports; the minimum Blender version confirmed upstream; type-check, lint, format, spellcheck.

## Exit gate

- [ ] C1.1 and C1.3 done; C1.2 answered or still open with shipping held.
- [ ] Import fixtures pass for models and Artwork; packaged `sharp` runs on macOS, Windows and Linux.
- [ ] A show with embedded items opens with an empty local Library.
- [ ] Type-check, lint, format and spellcheck pass on `main`.

## Handoff notes

- **Prune isn't wired yet (owner, 2026-10-13).** `pruneShowLibraryInTransaction`
  is built and tested, but nothing calls it. Nothing names a Library item
  before C2's Item tables and C3's cues, and embedding writes no undo row, so
  the keep set would be empty and pruning on close would drop every import.
  C2.1 hooks it to show close and before Save Copy, passing the Item tables'
  references as `keep`; C3 adds the cue references.
- **No UI yet for "update available" or "Add to my Library".**
  `findLibraryUpdates` and `buildAddFromShowRequest` are built and tested;
  their UI belongs in the Assets area's This show section (Q78–Q82).
- **No built-ins exist yet**, so none are embedded. The embed path takes any
  Version, so built-ins go through it when C5.8 adds them.

## Progress log

- 2026-10-11, C1.1 done: the owner approved the ADR 0002 amendment, the ADR
  0004 amendment draft, props-spec.md and the C track. WORKER.md's policy now
  names the C track; README, WORKER.md, plan.md, the 3d-work skill and the
  3d-worker agent accept `C<track>.<n>` IDs and `3d/c<track>-<name>`
  branches. The ADR 0004 amendment draft stays here until the cue work lands
  ADR 0004 on 3d-async, then merges into it (C3's tracker packages). The one
  remaining open point, the import IPC channels, is package C1.9.

### 2026-10-11 · 3d worker (3d/c1-model-import) · C1.7

- **Done:** the pipeline in `apps/desktop/electron/main/model-import/`
  (commit e48d022e, plus the follow-up recording these decisions). Owner
  decisions of 2026-10-11, now the rule in code and comments, not
  provisional:
  - Q36 (adopted): a Garment mesh marks its fit with
    `extras.openmarch.fit: "<body type>"` on the mesh node or its mesh (the
    node's wins, with a note when they differ); an untagged mesh is the median
    fit. Names are checked against `GARMENT_BODY_TYPES` (kept equal to
    `BODY_TYPES` by a test). An unknown name, or a value that isn't a string,
    is **Can't import** (`garmentUnknownFit`), like every other Garment rule
    break; it isn't a Needs-your-choice row because there's no safe
    pre-selection (guessing the median could hide a second median). A body
    type on more than one mesh node is a quiet note (`duplicateFits`), since
    several objects per fit are legal. The sidecar's `garment.fits` and
    `garment.meshesByFit` record the fits in body-type order, typed as body
    types.
  - Q37 (confirmed as built): Floor prop triangle cap 5k; Garment texture cap
    1024; default grip a quarter along the longest side when `OM_grip_R` is
    missing; the Z-up heuristic (Z largest and over 1.25 × Y; floors get the
    rotation offered but unchecked); grips stored in the sidecar, never
    re-centering; a Garment with any mesh lacking a skin is rejected; the v4
    skeleton numbers in `v4-skeleton.ts` fall under the om-pose license gate
    (C1.2), noted at the top of that file.
- **Checks:** see the commit; type-check, focused vitest for model-import,
  and desktop-scoped format, lint and spellcheck.
- **Next:** C1.9 decides the IPC channels and whether the pipeline runs in
  main or a `utilityProcess`. Draco's WASM decoder inside the packaged asar
  is unverified; check it on a packaged build.
- **Blockers:** none for C1.7's code; the two items above stay open.
- **Resume from:** open a PR from `3d/c1-model-import` into `3d-async` when
  the lead asks; nothing pushed yet.

### 2026-10-11 · Cross-phase note from C1.7 for C1.13

- The "OpenMarch Tools" add-on must write each Garment fit as exactly
  `extras.openmarch.fit: "<body type>"` (a custom property `openmarch` with
  key `fit`) on the mesh object, using one of the seven body-type names in
  `GARMENT_BODY_TYPES` (`apps/desktop/electron/main/model-import/rules.ts`),
  and may leave the median fit (`neutral-average`) untagged. C1.7 rejects any
  other name (owner decision Q36, 2026-10-11).

### 2026-10-12 · 3d worker (3d/c1-model-import) · C1.7

- 2026-10-12, C1.7 security fix: a `.gltf`'s buffer and image URIs are
  percent-decoded and refused when they leave the picked file's folder (`..`,
  absolute, Windows drive or UNC paths, backslashes, or a symlink whose real
  path is outside the folder's real path), as the new Can't import code
  `resourceOutsideFolder` naming the URI; any scheme, `file:` included, stays
  `externalUri`. Refused files are never read, so their bytes can't reach the
  stored source. Tests in `model-import/__test__/container.test.ts`.

- 2026-10-12, C1.8 (branch `3d/c1-artwork-import`, not yet in review):
  owner decisions of 2026-10-11. Q33: PDFs are read by pdf.js
  (`pdfjs-dist` 6.3.289, Apache-2.0, its legacy build) in a hidden
  BrowserWindow with the sandbox on, owned by main. Built as
  `createElectronPdfRenderer` in `electron/main/artwork-import`: no
  preload and no IPC; the window loads a private origin served only inside
  its own in-memory session (allow-listed pdf.js files read from the asar,
  the page script, the one PDF), and main calls it with
  `executeJavaScript`. pdfjs-dist's optional `@napi-rs/canvas` is ignored
  in `pnpm-workspace.yaml`, so no native module comes with it. Q34: Uniform
  part Artwork is a `uniformPart` surface, 1024 on the long edge, 150/300
  DPI. Q35 confirmed as built (sidecar third part, PNG-only resolution
  metadata, single-page SVG, floor DPI for Floor props, all pages
  pre-selected, aspect mismatch refused, 1.5-gigapixel input limit).
  Checked in dev Electron 40.8.5 on macOS arm64 (open, transparent render,
  corrupt PDF, full `importArtwork`), and with pdf.js served from a
  packaged `--dir` build's `app.asar`. Remaining: C1.9 wires the renderer
  into the import IPC (nothing calls it in the app yet), then a PDF import
  in a signed packaged app on macOS, Windows and Linux.
  Resume from: C1.9's channel list; then pass `createElectronPdfRenderer()`
  as `pdfRenderer` and run the packaged checks.

- 2026-10-12, C1.7 follow-ups for C1.9: `importModel` and `importModelFile`
  take an optional `onStage` callback, called once as each stage starts, in
  order: `reading`, `validating`, `decoding`, `checking`, `converting`,
  `writing` (type `ModelImportStage`). A rejection stops after the stage that
  found it; `needs-kind` stops after `decoding`; whatever the callback throws
  or rejects with is ignored. C1.9's `ImportStage` lacks `checking`: add it
  there or map it to `converting`. The module has no `electron` import and no
  top-level side effects beyond constants (the NodeIO and `sharp` load on
  first use); it loads and imports a fixture in plain Node, so it can run in
  a `utilityProcess` as is. Bug fix: a resource URI not in normal form
  (`textures/./logo.png`, `./model.bin`) was read but then failed the
  validator, which looks resources up by normalized path; after the
  containment check, resources are also keyed by their normalized path.

- 2026-10-11, C1.12 in progress (branch `3d/c1-artwork-templates`): the
  owner set the missing template values, now `DEFAULT_TEMPLATE_POLICY` in
  `view3d/core/artworkTemplates/policy.ts`. Q29 safe area: 1 in on silks,
  props and uniform panels, 6 in on floors and Floor props. Q30 bleed: 2 in
  on floors and Floor props, ½ in on prop panels; silks keep ⅛ in and
  uniform panels keep the spec's ½ in sublimation bleed. Q31 PNG: silks,
  props and uniform panels at their minimum print DPI; floors and Floor props
  capped at 8192 px on the long edge, with a note in the template and in the
  PNG's `tEXt` comment that the PDF or SVG is the print master. Q32 confirmed
  as built: uniform panels from the median body, Floor props on the floor DPI
  guide (30/60), silk pole side on the left (fly wide × header tall), uniform
  front/back split at z = 0 in rest pose. Remaining: Q28 cut outlines for
  arc, teardrop and swing (templates show the full rectangle, marked
  "outline pending"), and the download menu, which waits on C1.9's IPC.
  Resume from: wire Q28's outlines into `DEFAULT_TEMPLATE_POLICY.cutOutline`
  once researched.
- 2026-10-12, C1.12 in progress (branch `3d/c1-artwork-templates`): the cut
  outlines (Q28) are in, from `research/silk-cuts.md`, with the owner's
  decisions of 2026-10-12. Outlines are a typed module,
  `view3d/core/sizes/silkCuts.ts` (lines and cubic Bezier curves, exact bounds, a
  polygon sampler), with polygon helpers in `sizes/cutGeometry.ts`
  (inside test, safe-area inset, `boxOutsideCut` for "content outside cut").
  Templates draw each shaped Cut's own outline as the mask and replace the
  "cut outline pending" note. Q38: a safe area that doesn't fit shrinks to
  ¼ of the shorter side, with a quiet note; the "safe area is empty" error is
  gone. Q39: silks have a `depth` (omitted, it equals the header; presets
  accept `depth` and `sag`, with depth at least the header); the oversized
  swing is 42 header × 56 fly × 84 deep, the super swing 44 × 68 × 84, the
  regular arc 45 × 78⅝ × 96; ids keep the vendor figures. Silk templates are
  fly wide by overall depth, with the header named and the pole marker
  halfway down it. Q40: pole silks are true rectangles; `sag` is a per-silk
  field, default 0, with `recommendedSilkSag` (a quarter of the header) as a
  preset. Q41: the swing has a flat bottom; the sagging bottom is the
  `sagging-bottom` alternative. Q42: the traced outlines are the starting
  set, and the swing and the three arcs carry "Shape from vendor photo" on
  their templates. Q43: a dashed sleeve guide 3 in from the pole edge, with a
  note. Q44: vendor names are only `aliases` on catalog silks (searchable
  through `catalogEntryMatches`), never labels. Worker's own calls: the
  teardrop (79⅝), narrow arc (56) and super arc (87) also get a depth from
  the trace so every outline fits its box; traced figures round to ⅛ in so
  they re-display without drift (teardrop tip 79.6 to 79⅝, arc fly 78.6 to
  78⅝); each traced outline is stretched by under 0.1 % so its widest point
  lands exactly on the fly; a shaped Cut's safe area is its outline inset by
  1 in, drawn as a dashed ring; the trim line is capped at half the bleed so
  it never covers the bleed band. The C4 file has a cross-phase note: the
  silk renderer must adopt these outlines and the depth field (C1.12 did not
  change its mesh). Remaining: the download menu, which waits on C1.9's IPC;
  custom-size presets carry no Cut shape yet (they draw as rectangles).
  Resume from: wire the download menu once C1.9 lands its channels.

- 2026-10-12, C1.8 follow-ups for C1.9's Q51 and Q56 and its cancel design:
  `renderArtworkPreview(file, page, maxPx)` renders one page as an sRGB PNG
  with its pixel size (longest edge at `maxPx`, shape kept, rasters never
  enlarged; sharp for PNG, JPEG and SVG, the PDF renderer for PDF).
  `inspectArtwork` and `importArtwork` take an optional `signal`, checked
  before the file, after opening and before each page (aborting also closes
  an open PDF document, destroying its window), rejecting with
  `ArtworkImportCancelled` (`code: "cancelled"`, plus the partial report of
  what stayed stored), and an optional `onProgress(done, total)` per page.
  The PDF renderer tracks every hidden window: `closeAllPdfRenderers()`
  destroys them at once, and calls in flight on a destroyed window reject.
  The module itself destroys them on `before-quit` and whenever a window
  closes leaving only hidden renderer windows, so `index.ts`'s
  `window-all-closed` handler fires as before and needs no change. C1.9
  still cancels its sessions and calls `closeAllPdfRenderers()` on the
  editor's `closed` (this also covers macOS, where the app stays open), and
  `open-win`'s `getAllWindows()` loop must skip hidden windows if it stays.

- 2026-10-12, C1.9 design approved: the owner approved every recommendation
  in [proposals/C1.9-import-ipc.md](../proposals/C1.9-import-ipc.md),
  Q45–Q58. ADR 0002 D-13 lists the 19 `library:` channels and the
  utility-process rule; D-12 adds the thumbnail cache and the embedding path;
  D-15 records `blob:` URLs and no custom scheme; D-22 covers import IPC
  errors. props-spec.md section 2 gains the size limits. Q55 was already done
  in C1.7 (`d3cd28e7`). Follow-ups: C1.7 `onStage` progress and the
  `textures/./` URI bug; C1.8 `renderArtworkPreview` and PDF window close
  handling.

### 2026-10-12 · 3d worker (3d/c1-import-ipc) · C1.9

- **Done:** the import and Library IPC from the approved C1.9 design, on the
  integration branch `3d/c1-import-ipc` (C1.4 to C1.8 and C1.12 merged).
  `src/view3d/library/protocol.ts` (channels, payload types, zod schemas,
  `Result`), `electron/main/library-ipc/` (session token map, dialogs,
  handlers, thumbnail cache, worker client, Electron bindings),
  `electron/main/import-worker/` (the `utilityProcess` for models and
  templates, a Vite entry beside main), `window.electron.library` in the
  editor preload only, and `src/view3d/library/importClient.ts`.
- **Decisions inside the design:** `ImportStage` includes C1.7's `checking`;
  a mixed or two-model pick answers `invalid-request` with a
  `mixed-selection:` message (no dedicated code in the approved list); size
  preset writes don't push `library:changed`; `add-from-show` refuses
  Uniforms until a Uniform sidecar schema exists; a cancel also stops a model
  job that hasn't reached the worker yet; `activate` skips hidden PDF
  windows (`open-win` has no `getAllWindows()` loop).
- **Checks:** type-check; focused vitest; desktop format, lint and
  spellcheck; `OPENMARCH_LIBRARY_IPC_SELF_TEST` in dev Electron and in an
  unsigned packaged `--mac --dir` build (worker, Draco WASM, `sharp` in the
  utility process and pdf.js all from the asar).
- **Next:** C1.10 builds the review on `importClient`; record the channel
  table in D-13; signed packaged runs on macOS, Windows and Linux.
- **Resume from:** nothing pushed; local commits on `3d/c1-import-ipc`.

### 2026-10-12 · 3d worker (3d/c1-import-ipc) · C1.9

- **Done:** Q59 (owner, 2026-10-12): `LibraryIpcError` has a
  `mixed-selection` code. `library:import-pick` returns it, instead of
  `invalid-request` with a `mixed-selection:` message prefix, when a pick
  mixes models and artwork or holds two models. The client documents it on
  `pick`; the handler test checks the code and message.
- **Also:** `library:template-save` now resolves `surfaceId` against
  `TEMPLATE_DOWNLOADS` (`view3d/core/artworkTemplates/downloads.ts`), a
  superset of `TEMPLATE_SURFACES` with the C1.12 menu's variants. The payload
  is unchanged; for the lead to confirm against D-13's wording.
- **Checks:** type-check; focused vitest (library-ipc, import-worker,
  `src/view3d`); desktop format, lint and spellcheck.

- 2026-10-12, lead (C1.10, C1.12): the owner chose prototype layout B for
  the import review (Q60): Visuals mode, with the Library side panel as the
  import panel and the stage as the preview. No stepper (Q61); PDF pages
  grouped by aspect (Q62); the stage is the preview (Q63); Add reads "Add new
  version" or "Add N to Library" (Q64). The template download menu stays in
  the File tab until the Library panel exists, then moves there (Q65).
  `library:template-save` accepts `TEMPLATE_DOWNLOADS` (Q66). Visuals mode
  itself arrives with ADR 0004's cue steps, so C1.10 builds the panel and
  stage as self-contained components in a temporary host.

### 2026-10-12 · 3d worker (3d/c1-import-ipc) · C1.12

- **Done:** the template download menu, `components/library/ArtworkTemplatesMenu.tsx`,
  behind an "Artwork templates" button in the editor's File tab (beside
  Export). The docs don't place it (the Library side panel, its likely home,
  doesn't exist yet), so it's self-contained and moves with one import. Five
  submenus (Silk Cuts, Base floors, Floor props, Prop panels, Uniform panels);
  each row shows the template's size in its own unit and PNG, SVG and PDF
  items, one file per click (Q53), through `importClient.saveTemplate` and
  `library:template-save`. Toasts on save and on failure.
- **Menu catalog:** `TEMPLATE_DOWNLOADS` adds to the fixed-size surfaces each
  curve-family Cut at the recommended sag (a quarter of the header, Q40), the
  swing's sagging bottom (Q41), and a Floor prop and a prop top at the default
  4 × 8 ft sheet, since neither has a catalog size.
- **Checks:** unit tests for the download list (unique ids, schema-safe,
  every format for every entry); component tests (groups, labels, one save
  per click with the right `surfaceId` and format); type-check; desktop
  format, lint and spellcheck. Screenshots from a built app driven by
  Playwright (not committed).
- **Next:** custom sizes for Floor props and prop panels (needs a size in the
  request, an IPC change); move the menu into the Library side panel when it
  lands; surface names come from the English catalog names.
- **Resume from:** nothing pushed; local commits on `3d/c1-import-ipc`.

### 2026-10-12 · 3d worker (3d/c1-import-ipc) · C1.10

- **Done:** the import review, layout B (Q60–Q64), in
  `apps/desktop/src/components/library/import/`. `ImportPanel` (the Library
  side panel's import state): files, "New version of …" / Update or Add as
  new, the kind picker, the report (Can't import with the starter kit
  pointer, Needs your choice pre-selected, Fixed for you collapsed, Notes),
  one artwork size step per aspect with its pages beside it (Q62), template
  chips, "From file", locked-aspect ft/in fields, a "Prints on" surface row
  and live effective DPI with "not print-ready", then name, tags and the
  collapsed author, license and source with the rights line; Cancel and Add
  pinned. Add reads "Add new version" or "Add N to Library" (Q64).
  `ImportPreviewStage` (the Visuals mode stage): a code-split
  (`import()`) React Three Fiber canvas built from `createEnvironment` and
  `createEnvironmentMap` with a 1.8 m reference figure, showing the
  reviewed GLB from a `blob:` URL; front, side and top views; before/after
  for simplify; click-to-set grip when `OM_grip_R` is missing; artwork shows
  the 1024 px `renderArtworkPreview` page. `importReview.ts` is one zustand
  store driving the C1.9 client: it re-inspects on every choice (the client
  drops stale replies; preview bytes from a superseded inspect are dropped
  too), captures a 256 px model thumbnail at commit (Q50), and shows IPC
  errors inline with Try again / Choose files again; progress has Cancel.
- **TODO(Visuals mode):** Visuals mode doesn't exist yet, so "Import to
  Library…" in the File tab (`ImportToLibraryButton`) opens a temporary
  full-window host (`ImportReviewHost`) laying the panel and stage out as
  layout B. Moving them: mount `ImportPanel` in the Library side panel and
  `ImportPreviewStage` in the stage, both given the same
  `createImportReview` store, then delete the host and the button.
- **Decisions (for the lead):** the artwork surface (display cap and DPI
  thresholds) is asked per aspect group as a "Prints on" chip row, defaulting
  to the picker's surface, else the chosen chip's kind (silk Cut → Silk,
  floor → Base floor, flat prop → Prop), else Prop; a size with no file
  metadata pre-selects the first matching template chip; a filename match
  pre-selects Update, like a kit match; a batch of files keeps each file's
  name (one name field only for a single file); `asset.copyright`
  pre-fills Author; a picked kind resets the choices to the pipeline's
  pre-selection.
- **Not built:** manual artwork slot setting (picking a material and giving
  it a size) — the report has no material list and the preview GLB's
  material indices differ from the source's that `slots` takes, so it needs
  an IPC/report addition; the Import… inside pickers (no pickers yet; the
  store takes `purpose` and `context`); the committed focused e2e spec (the
  run below is a scratch Playwright script).
- **Checks:** type-check; vitest `src/components/library`, `src/view3d`,
  `electron/main/library-ipc`, `electron/main/import-worker` (1077 passed,
  12 skipped); prettier on tracked desktop files; eslint (no warnings in the
  new files); desktop spellcheck. End to end in a `vite build` driven by
  Playwright `_electron` with its own user data dir and
  `dialog.showOpenDialog` stubbed: a GLB needing kind, units, rotate,
  simplify and grip; a re-import ("Add new version"); a rejection; a mixed
  pick; a PNG under print DPI; a 2-page PDF with two aspects. Screenshots
  not committed.
- **Resume from:** nothing pushed; local commits on `3d/c1-import-ipc`.

- 2026-10-12, lead (C1.9, C1.10): the owner approved two follow-ups. Q67:
  the model import report lists the model's materials, so the review can
  offer "pick the artwork surface" when a file marks no slots; this adds a
  field to the C1.9 report payload. Q68: "Prints on" defaults to the kind of
  the matched template, the end-to-end run becomes a committed e2e spec, and
  the dark theme gets screenshots.

### 2026-10-12 · 3d worker (3d/c1-import-ipc) · C1.9

- **Done:** Q67 (owner, 2026-10-12): `ModelImportReport.materials` lists the
  source file's materials (`MaterialInfo`: source `index`, `name`,
  `outputIndex` in the normalized GLB, `sizeM` and `areaM2` of the geometry
  it's on, `hasUVs`, and `fileSlot` when the file already declares an
  `artworkSlot` on it or its mesh). Measured at decode (file units), again
  in output meters after converting; `outputIndex` is filled once the GLB
  is written. It rides the existing worker message and `import-inspect` /
  `import-commit` replies (re-exported as `MaterialInfo` from
  `protocol.ts`); requests are unchanged, since `choices.slots` already took
  a source material index. Output bytes are unchanged, so no pipeline
  version bump.
- **Checks:** pipeline tests (listing, output meters, needs-kind, a picked
  slot lands on its output index, unread file lists none); worker clone
  test; service test (inspect lists, a bad slot id is `invalid-request`, the
  committed sidecar holds the slot); protocol schema test.

### 2026-10-12 · 3d worker (3d/c1-import-ipc) · C1.10

- **Done:** Q67: when the kind is known, the file marks no slot and it isn't
  a Garment, Needs your choice adds "Artwork surface": None (default) or
  each drawn material with "About W × H" (and "no UVs" where artwork can't
  map). Hovering lights it in the preview, else the picked one stays lit;
  the stage tags it "Artwork surface: …". Picking writes `choices.slots`
  (id `artwork`, sized from the two larger sides of its bounds: upright
  width × height, lying flat x × z). The preview finds the material by
  `outputIndex` through `GLTFLoader`'s `parser.associations`
  (`previewMaterials.ts`), so no `extras` go into the GLB.
- **Done:** Q68 (a): "Prints on" defaults to the kind of the catalog
  template a "From file" size equals (sides within 0.2 %; 36 × 54 in →
  Silk), at first inspect and when "From file" is picked again; the
  picker's surface still wins; else as before. (b) the committed e2e spec
  `apps/desktop/e2e/tests/library-import.spec.mts` (fixtures made at test
  time, `dialog.showOpenDialog` stubbed in main, own user data dir):
  model choices, clicked grip and Add; re-import as a new version; the
  artwork surface pick; a rejection; a mixed pick then Choose files again;
  a PNG under print DPI; a two-aspect PDF on Silk. (c) with
  `IMPORT_REVIEW_SCREENSHOTS=<dir>` the spec saves dark-theme screenshots
  of each state (not committed).
- **Checks:** type-check; vitest `src/components/library`, `src/view3d`,
  `electron/main/library-ipc`, `electron/main/import-worker`,
  `electron/main/model-import` (1200 passed, 12 skipped); the one e2e spec
  against a `vite build`; desktop format, lint and spellcheck.
- **Still not built:** the Import… inside pickers (no pickers yet); editing
  a picked slot's size by hand; clicking a surface in the preview to pick
  it.
- **Resume from:** nothing pushed; local commits on `3d/c1-import-ipc`.

- 2026-10-12, lead (C1.3 done): PR #129 merged the 3D View into `main` as
  `dc38f1a1`, after the timeline landed there; the venue migration is now
  number 0019. `3d-async` was deleted, so `main` is the coordination and
  integration branch: README, WORKER.md, `scripts/3d/coord.sh`,
  `scripts/3d/run-worker.sh` and the C phase files now name `main`. The C1
  code (C1.4 to C1.10, C1.12) is rebuilt as a stack of PRs on `main`, docs
  first; C1 adds no migrations.

- 2026-10-12, lead (C1.10, C1.12): the File-tab entries ("Artwork
  templates" and "Import to Library…") are temporary. The owner expects the
  3D work to get its own home, likely a 3D tab in the left sidebar; where
  exactly is not decided. Both entries are single components, so moving them
  is a small change. Q73: no cue target (band, section, tag or set) reaches
  items. Q74: `coord.sh` targets `main`, pending Alex's agreement in review.

- 2026-10-12, owner testing (C1.9, C1.10): Library Import… opened with the
  models filter selected, so macOS greyed out every image; the dialog now
  selects a combined "Models and artwork" filter first. Q75: no print
  readiness; the DPI line and the "not print-ready" badge are gone. Q76:
  the File-tab entries move to a new **Assets** area in the left sidebar,
  with a Library browser that opens after each import. Q77: artwork starts
  as Silk (or Base floor when its aspect matches a floor) at that surface's
  catalog default size, fitted to the image's aspect.

- 2026-10-12, owner (Q78–Q82): all assets are managed in the Assets area,
  with contextual upload links into the same import review; the show's Base
  floor becomes the field image, mirrored into `field_properties.image`
  for 2D; Assets gets This show and Library sections. Planned as follow-up
  PRs after the C1 stack, starting with C1.11; details in props-spec.md
  "Base floor". Needs an ADR 0002 amendment.
- 2026-10-15, owner: ADR 0002 D-23 accepted with changes. The floor is named
  by reference only (`floor: { itemId, versionHash }`) and there is no 2D
  copy: 2D, exports and the 3D tarp read the floor, and
  `field_properties.image` is legacy, read only by convert on open and then
  cleared. Convert on open is quiet. The change bumps the file format, so
  older builds refuse the file. Mobile sync and export must produce the field
  image from the floor; that is part of the mobile sync work.

### 2026-10-13 · trevor (3d/c1-starter-kit) · C1.13

- **Built:** the kit in `apps/desktop/starter-kit/`, bundled through
  electron-builder `files`.
  - The "OpenMarch Tools" add-on (`addons/openmarch_tools/`,
    GPL-3.0-or-later). It installs as a 4.2 extension (`blender_manifest.toml`)
    or as a legacy add-on (`bl_info`). Its sidebar tab sets the kind, adds
    `OM_grip_R`, `OM_grip_L` and `OM_<name>` empties, declares artwork slots
    with real sizes and sets stretch zones. A pre-flight check predicts the
    import review's groups, and "Export for OpenMarch" stamps `itemId` (a
    new UUID on first export, kept after that), `kind`, `kitVersion` and
    `license` ("All rights reserved", `LicenseRef-Proprietary`, pre-selected
    in preferences) into the scene's `extras.openmarch`, then exports a GLB
    (Y-up, custom properties on, modifiers applied, no Draco, no
    animations, cameras, lights or morph targets). The add-on stores nothing
    but the `openmarch` custom properties: its properties use getters and
    setters, so the export carries no stray extras. Stretch zones are edited
    on Blender's axes and stored on the exported Y-up axes. The pre-flight's
    numbers are in `rules.json`, which a test keeps equal to `rules.ts` and
    `sizes/checks.ts`.
  - `templates/` (equipment flag pole, prop flat, floor prop panel, at real
    size; no item id, so each model made from one gets its own),
    `examples/` (the templates exported by the add-on, stamped CC0-1.0 with
    fixed item ids) and the glTF export preset. All are CC0, with a
    `LICENSE` in each folder.
  - `README.md`: the one-page guide.
  - `pnpm --filter @openmarch/desktop run kit:build` runs
    `scripts/starter-kit/build_kit.py` and `preflight_cases.py` in headless
    Blender. Each template must pass its pre-flight with no rows at all. The
    cases script exports seven broken models (no kind, centimeters, lying
    down, no grip, dense, rigged, standing floor prop) with the add-on's
    predictions to `electron/main/starter-kit/__test__/fixtures/`. The
    `.blend` files and the flag pole's finial vertex data aren't
    byte-reproducible between runs; their contents are.
  - Help ‣ Get the Blender starter kit… (`application-menu.ts`, loading
    `electron/main/starter-kit/save.ts` lazily) saves
    `OpenMarch-Blender-Starter-Kit-<version>.zip` through a save dialog,
    built by `kit.ts`. The zip holds the kit folder, an installable
    `openmarch_tools-<version>.zip`, and the C1.12 Artwork templates as SVG
    and PDF, made by the same code as the template menu. Uniform panels are
    left out, since they're sized from the om-pose median body.
- **Not built:** the reference scene and the uniform section (v4u bodies, v4
  rig, `_PART` palette, Garment `fit` tagging), which wait on C1.2 and
  om-pose's license. The add-on offers no Garment kind. Also not built: a
  Base floor template, the website mirror, extensions.blender.org, and the
  importer's "outdated `kitVersion`" note.
- **Decisions for the owner:**
  - The license goes in as `extras.openmarch.license` (an SPDX id) beside
    the kit stamp, and the author as glTF `asset.copyright`.
  - Examples are stamped CC0-1.0, not the user default.
  - Templates carry no `itemId`.
  - The front faces Blender's −Y (Front view).
  - A grip's −Y axis runs along the pole, because Blender's Y-up export maps
    it to the importer's +Z.
  - Slot ids `front`, `back` and `top`.
  - The kit's root works as a Blender script directory (`addons/`,
    `presets/`).
- **Checks:** `npx tsc --noEmit -p .` in `apps/desktop` (pass); vitest
  `electron/main/starter-kit` and `electron/main/model-import` (131
  passed), and `electron/main/__test__/mainBundle.test.ts` (pass); eslint
  and prettier on the changed files; cspell on the changed files. In
  Blender 4.2.3 LTS on macOS arm64: `kit:build`, the manifest checked with
  `blender --command extension validate`, and install from the add-on zip
  as an extension and as a legacy add-on. A headless run of the operators
  (slot size from geometry, new item id, check, export, disable and
  re-enable) also passed. Not run: the panel's drawing in a UI session, a
  packaged build's menu item, Windows and Linux.
- **Minimum Blender:** 4.2 LTS (4.2.3 tested). Older versions are untested,
  and the manifest and `bl_info` both say 4.2.0. The spec's "the LTS om-pose
  exports with" isn't confirmed upstream yet.
- **Next:** C1.7 and C1.10 can read `extras.openmarch.license` to pre-fill
  the license field (the importer ignores it today). Shipping waits for
  C1.2.
- **Resume from:** nothing pushed; local commits on `3d/c1-starter-kit`.

### 2026-10-13 · 3d worker (3d/c1-show-embedding) · C1.11

- **Done:** migration 0021 (`library_blobs`, `library_items`, both outside
  undo history); embed with a hash check; the prune plan (keeps what the
  show's tables, pins and undo or redo rows name); a lazy, byte-bounded blob
  cache that never reads originals for rendering; update detection and
  add-from-show requests that never write to the Library; `read-parts`
  serves an Artwork's original. Rebased onto the Assets tab (#146): the
  import review's `onImported` reaches `AssetsHost`, which embeds each
  import in the open show even after the Assets panel closes.
- **Checks:** type-check; desktop vitest (4999 passed, 27 skipped); history
  and timeline-history runs of the showLibrary and migration tests (118
  passed each); desktop lint (0 errors), format and spellcheck.
- **Not done (owner, 2026-10-13):** prune wiring moves to C2.1; the update
  and Add to my Library UI moves to the Assets This show section. See the
  handoff notes.

- 2026-10-13, 3d worker (3d/assets-this-show): the Assets panel's **This
  show** section (Q81), built ahead of the floor-as-field-image change since
  it adds no stored data: Assets gets This show and Library tabs; This show
  lists the embedded items grouped like the Library, offers "Add to my
  Library" for items the Library lacks (from the show's own bytes, through
  `library:add-from-show`), and notes a newer Version or changed details in
  the Library without applying them. Credits (C5.7) moved into it. Not built:
  applying an update (no references to swap until C2), thumbnails for items
  the Library lacks, and the floor-as-field-image change (ADR 0002 amendment
  first).
