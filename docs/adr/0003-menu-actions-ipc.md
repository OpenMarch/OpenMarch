# 0003: App menu items run renderer actions over one IPC channel

- Status: accepted
- Date: 2026-10-09

## Context

UI-17 (docs/timeline/ui.md) made Space the one Play (looping while Loop is on), Shift+Space play
the page once, C turn looping on and off, and `?` open a list of shortcuts. The research behind it found that menu items showing their
shortcut are how desktop users find these, and the owner asked for them. The app menu lives in
the Electron main process, but every one of these actions is a renderer registered action
(`RegisteredActionsHandler`), which owns playback state.

Electron menu accelerators are normally registered with the system. A registered Space or plain
letter would be taken from text fields, breaking typing. On Linux and Windows,
`registerAccelerator: false` shows an accelerator without registering it. macOS always registers
it.

## Decision

- **One channel, `menu:action`** (main to renderer), carrying the name of a registered action.
  The list of items lives in `apps/desktop/src/global/menuActions.ts`, shared by the main
  process, the preload and the renderer. The renderer runs an action only if it is in that list
  (`isMenuAction`), so the channel can't run arbitrary actions.
- **The preload exposes `onMenuAction(callback)`**, which returns an unsubscribe function, as
  `onNewShowOpen` does.
- **Shortcuts are shown, not registered.** On Linux and Windows the item has its accelerator with
  `registerAccelerator: false`. On macOS the label carries the key instead ("Play / Stop (Space)").
  The renderer's keyboard handler stays the only owner of the keys.
- The items: a **Playback** menu (Play / Stop, Play Page Once, Loop On / Off) and **Help → Keyboard
  Shortcuts**.

## Consequences

- New menu items that run renderer actions are added to `menuActions.ts`, not given new channels.
- The menu's shortcut text is maintained in that list. A unit test checks it against the action
  registry's shortcuts, so a changed key can't leave the menu stale.
- On macOS the shortcut is part of the label rather than right-aligned, so it doesn't look native.
- Actions that only apply in timeline mode do nothing from the menu in page mode, as their keys do.

## Verification

- `apps/desktop/src/components/timeline/__test__/transportShortcuts.test.ts`: every menu action
  exists in `RegisteredActionsEnum` and its accelerator matches the registry's shortcut.
- Manual: in the built app, open the menu (☰), choose Playback → Play / Stop and Help →
  Keyboard Shortcuts, and type a space in a text field to check it still types.
