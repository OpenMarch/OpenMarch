# Context

Shared vocabulary for OpenMarch work. Keep entries short and link to the long-form doc.

## Modifier keys

From the modifier roles design, `docs/timeline/research/shapes/modifier-roles.md` (version A).
The code is `apps/desktop/src/input/modifierRoles.ts`.

- **$mod**: Cmd on a Mac, Ctrl elsewhere, resolved like the shortcuts registry
  (`shortcuts/bindings.ts`). Mac Ctrl (a right-click) and the Windows/Linux Meta key (the OS key)
  never carry a role.
- **Held role**: what a held key means during a drag, read live for the whole gesture: `fine`
  (Shift), `constrain` ($mod) and `fromCenter` (Alt). One role per key; holding two keys gives
  both roles, and no chord means anything of its own.
- **Press choice**: what a key means at the moment the pointer goes down, read once: `add`
  (Shift), `subtract` (Alt) and `reachInside` ($mod). A press uses its key only when the choice
  applies to what's under the pointer, and a key the press used isn't read as a held role until
  it's released.
  On empty field inside a multi-selection's box a plain press moves the selection, and an add or
  subtract press starts the marquee or lasso (owner, 2026-10-30).
- **Role toggles**: the touch pill's Fine, Equal (constrain) and From center, held or latched,
  OR'd into the held roles of every drag; the press rule never blocks them. Its Add is the `add`
  press choice. Named by role, never by key (`stores/TouchModifierStore.ts`).
- **Snap toggle**: an on-screen setting, not a held key; it has a shortcut. It turns off the
  half-step ladder and the pull of guides and marchers for shape and marcher drags on the field,
  and grid snapping for arrow nudges on marchers. Its label is "Snap"; its off state, "Snap off".
  It resets on restart and when a file opens. The timeline keeps its own held Alt = no snap.
