# Fabric field: frozen

This folder, `src/global/classes/canvasObjects/`, and the Fabric parts of
`src/timeline/` and `MarcherRotationInput.tsx` are the Fabric.js field. It's
being replaced by a three.js field behind a renderer-independent editor
([ADR 0005](../../../../../docs/adr/0005-three-field-renderer.md), plan in
[docs/field](../../../../../docs/field/README.md)).

Until fork ticket #209 (the switch) merges:

- Fix only real breakage here. Each fix adds a parity scenario that pins the
  fixed behavior.
- Don't add features or change behavior here. Build them on the new field.

#209 deletes this code.
