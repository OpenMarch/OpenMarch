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
- `RecompileOptions.channels` becomes `types`.
