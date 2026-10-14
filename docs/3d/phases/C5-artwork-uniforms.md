---
phase: C5
title: Customization, Artwork and uniforms
status: not-started
owner: none
branch: none
pr: none
depends_on: [C4]
updated: 2026-10-11
---

# C5: Customization, Artwork and uniforms

<!-- cspell:words Headwear unitard -->

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

> Draft for the owner's approval (2026-10-11). **Gates:** no package here starts before the integrated-GPU run (C4.7) and the per-look uniform texture (C4.3, merged after ADR 0004 step 6 in C4.8). Built-ins ship only after the legal gate (C1.2).

## Goal

Ship Artwork and uniforms: the uniform model and its editor, artwork on uniform parts, Garments, silk Artwork and swaps, Artwork on props and floors with roll-outs, the budget notes and announced texture reduction, Credits, and the built-in catalog.

## Read first

- [../props-spec.md](../props-spec.md): the design spec, sections on uniforms, silks, sizing and fit, budgets and licensing. Ticket numbers on each package are the ones it cites.
- [ADR 0002](../../adr/0002-3d-view.md) D-12, D-16 to D-19 and D-21 (amendment of 2026-10-11)
- `CONTEXT.md`: **Uniform**, **Uniform part**, **Garment**, **Artwork**, **Artwork slot**, **Base floor**, **Floor prop**, **Roll-out**, **Credits**, **Share note**
- `docs/3d/findings.md`: the C4.7 run

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### C5.1: Uniforms in the show and the Library

- Owner: none
- Status: open
- PR: none
- Parallel: no
- Depends on: C4.8, C4.7, C1.11, C3.5, C3.6

**Goal:** a show can have many uniforms.

**Scope:** a Uniform as a composite Library item pinning `(item, Version)` pairs; six parts (Top, Bottoms, Headwear with none, shako or aussie, Footwear, Gloves, Overlay); one palette of roles, with literal per-part colors accepted in data but only the palette in the v1 editor; pattern on the Top, seam stripe on Bottoms; "Duplicate as variant"; uniforms made in a show stay in the show, with a "Save to Library" action; Band default and Guard default as built-in Library uniforms; update offers that make a new uniform Version, never silent; a Uniform's license covers only what it adds. The palette-only uniform editor lives in Visuals mode, in the inspector on the Uniform tab.

**Tickets:** 06, 09, 16, 26.16, 26.17.

**Done when:** "Trumpets → Band, hats off from count N" works end to end through a Uniform cue.

**Checks:** unit and history tests; screenshots; type-check, lint, format, spellcheck.

### C5.2: Artwork on uniform parts

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C5.1, C1.8

**Goal:** front and back Artwork on Top, Bottoms and Overlay.

**Scope:** projection in rest-pose meters inside the uniform shader, no UVs, on all seven body types and the block bodies; Artwork sized as worn by the median body and graded proportionally; Artwork layers in a texture array indexed per look.

**Tickets:** 04, 08, 09.

**Done when:** a 10 in chest logo measures 10 in on the median body and scales with each body type.

**Checks:** pixel tests; screenshots on every body type; type-check, lint, format, spellcheck.

### C5.3: Garments

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C5.1, C1.7

**Goal:** custom rigged models that replace Uniform parts.

**Scope:** a Garment declares the parts it replaces; median fit required, other six optional; a body type with no fit wears the median fit with the quiet note "no fit for _broad_, may clip"; skinned from the shared bake with no extra bake rows; one draw per fitted body type × primitives; a quiet note past about 8 distinct Garments; no shadows.

**Tickets:** 01, 04, 09, 11.

**Done when:** a unitard fixture replacing Top and Bottoms renders on every body type, with notes where fits are missing.

**Checks:** unit tests; screenshots; draw counts from the harness; type-check, lint, format, spellcheck.

### C5.4: Silk Artwork and swaps

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C4.4, C3.5, C1.8, C4.7

**Goal:** silks carry Artwork and change it on cue.

**Scope:** all silk Artworks in use as layers of one texture array (1024 × 1536 at `high`, 512 × 768 at `low`), picked by a per-instance layer index; a swap at the Silk cue's instant as a hard cut, rippled only when the cue ripples; a flag of another Cut gets the Artwork fitted per the sizing contract, with a note when the aspect differs; a new layer uploads before it is needed and a silk keeps its previous Artwork until then; content outside the Cut clipped and flagged; Artwork in a different aspect filled or fitted, never stretched.

**Tickets:** 02, 08, 10, 18, 26.13.

**Done when:** a 40-flag guard swaps silks on a count with no blank frame.

**Checks:** unit tests; a recording of a swap; the harness's upload timings; type-check, lint, format, spellcheck.

### C5.5: Artwork on props, Floor props and roll-outs

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C4.5, C2.4, C1.8, C4.7

**Goal:** prop slots and Floor props show their Artwork at real size.

**Scope:** slot Artwork from the assignment table with fill or fit and pan; prop slot textures 1024, Floor props 2048 on the long edge; the Floor prop roll-out reveal from its leading edge, rolling back up when the Outline shrinks; Base floor Artwork (2048 on the long edge), which, when set, replaces ADR 0002 D-5's tarp image, with the field background image as the fallback.

**Tickets:** 08, 18, 21, 26.18.

**Done when:** a Floor prop rolling out over 8 counts reveals its Artwork without stretching.

**Checks:** unit tests; a recording; type-check, lint, format, spellcheck.

### C5.6: Budget notes and announced texture reduction

- Owner: none
- Status: open
- PR: none
- Parallel: no
- Depends on: C5.4, C5.5, C2.6

**Goal:** heavy shows warn quietly and keep playing.

**Scope:** worst-moment estimates of resident display-texture memory and draw calls (body types, Garments, models × materials × tiers, silks), computed at edit time; notes above 256 MiB and about 270 draws, worded in counts with a "Why?" and a hint; display textures drop to `low` above the memory threshold and the 3D View says "showing reduced textures here"; loading the current moment ± about 2 pages with at most one upload per frame while playing; video export exempt; a note when the show file passes 500 MB. Thresholds as C4.7 left them.

**Tickets:** 15, 18.

**Done when:** a show built to pass both thresholds shows both notes, names the worst moment, and plays with the reduced-texture label.

**Checks:** unit tests on the estimate; screenshots; type-check, lint, format, spellcheck.

### C5.7: Credits and the Share note

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C1.11, C1.10

**Goal:** attribution travels with the show.

**Scope:** Credits in Show settings and the Library side panel's show tab (the panel lives in Visuals mode), listing CC-BY and Unknown items as "Name — Author — License — Source (modified)" grouped by license, with CC0 and built-ins collapsed to one count line; an optional credits page or end card in PDF and video exports, on by default when CC-BY material is used in the export's range; the Share note (a badge on Credits and one quiet line in the export dialog) for Unknown items only, worded "may not have the right to share"; a read-only license line on "Add to my Library".

**Tickets:** 14, 16, 26.16.

**Done when:** a show with one CC-BY and one Unknown item lists both, counts the rest, and shows the Share note.

**Checks:** unit and component tests; type-check, lint, format, spellcheck.

### C5.8: Built-in catalog content

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C1.6, C1.2

**Goal:** the built-in Library, licensed to ship.

**Scope:** OpenMarch-made built-ins under CC0 1.0 with no OpenMarch logo or name in the art; third-party built-ins CC0 or CC-BY 4.0 only, each with a manifest entry (SPDX license, author, source URL, attribution text, retrieval date) checked in CI against the allow-list; a `LICENSE` in each asset folder (built-ins, templates, Starter kit, om-pose assets); `SOURCE.json` and the om-pose vendor README corrected (ADR 0002 D-7 correction); catalog sizes from C1.4.

**Tickets:** 03, 16, 26.6.

**Done when:** CI fails on a manifest entry outside the allow-list, and every built-in carries its license fields.

**Checks:** the CI manifest check; type-check, lint, format, spellcheck.

## Exit gate

- [ ] C4.7 and C4.3 done before any package here merged; C1.2 done before built-ins shipped.
- [ ] Uniforms, uniform Artwork, Garments, silk swaps and Floor prop roll-outs recorded for the owner.
- [ ] Budget notes and reduced-texture label shown on a heavy show.
- [ ] Type-check, lint, format and spellcheck pass on `main`.

## Handoff notes

Nothing yet.

## Progress log
