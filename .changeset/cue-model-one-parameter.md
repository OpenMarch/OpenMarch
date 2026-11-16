---
"@openmarch/core": minor
---

The cue module follows ADR 0015: one parameter per cue type. Its public types
change (the module is not in a released version yet).

- `CueChannel` and `CUE_CHANNELS` become `CueType` and `CUE_TYPES`:
  `equipment`, `position`, `silk`, `look`, `facing` and `posture`. The `feet`,
  `horn_equipment`, `body`, `carry` and `uniform` channels are gone.
- A `CueInput` names its performers (`marcherIds`) and is lasting (`length`
  null) or momentary (`length` in counts), with an optional `transition`.
  Targets, precedence, ripples, phrases, `ShowPhraseAsset`, `CueLibraryItem`
  and take-overs leave the input and output. `CompileInput.values` adds values
  to the built-in library.
- Segment kinds are `default`, `lasting`, `transition` and `momentary`.
- The hold style is no longer a Feet cue: `CompiledCues.holdStyle(marcherId)`
  gives it per performer, and `holdStyles` and `holdStyleAt` are exported.
- Holds stand by default (ADR 0015 D-5): `showDefaults.holdWhileBandMoves` is
  `stand` when omitted, where it was `markTime`. Set it to `markTime` for the
  old rule. `CompileInput.holdStyles` (`CueHoldStyle`) gives the styles the
  holds themselves carry, each of which wins over the show setting for its
  counts.
- New queries: `whoHasValue`, `whoHolds`, `heldAt` and `cueValueAt`.
- Equipment values are a fixed catalog of real items grouped by family
  (`EquipmentFamily`, `EQUIPMENT_FAMILIES`, `equipmentCatalog`): guard
  equipment (flag, swing flag, double swing flags, rifle, sabre), brass,
  woodwinds and drums, each `builtin:equipment.<item>` with `family` and
  `holds`. `builtin:equipment.none` holds nothing, and
  `builtin:equipment.usual` (`EQUIPMENT_USUAL`) is the performer's own
  section default, which compile resolves to that default's value. The rough
  `builtin:equipment.winds` and `builtin:equipment.battery` stay only as the
  default for a section with no catalog item.
- `RecompileOptions.channels` becomes `types`.
- `CueNoteKind` loses `silk_aspect`: the note for a silk whose aspect differs
  waits for silk artwork (ADR 0015 keeps Silk a plain color). `carry_mismatch`
  becomes `equipment_mismatch`.
