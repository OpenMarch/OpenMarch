# Default Files Directory — Design

**Date:** 2026-07-18
**Branch:** `default-files-directory`
**Status:** Approved design, pending implementation plan

## Problem

When a user creates a new OpenMarch (`.dots`) file, the save location defaults to
an OS-chosen folder or a folder derived from the last-opened file. There is no way
for a user to set an explicit default directory where new shows are created. This
feature adds a persisted, user-editable "default files folder" that pre-fills new
file creation.

## Principles

- **Lean on native OS controls as much as possible.** Use native save/open dialogs,
  the native directory picker, and Electron `app.getPath` rather than any custom
  path-entry UI.

## Behavior summary

- The default folder is **set implicitly the first time** a user creates a show —
  the directory of the first created file is remembered.
- It is **written once**: later new-file choices never silently overwrite it.
- It is **editable in Settings** via the native directory picker.
- Both file-creation paths (the new-show wizard and the legacy `newFile()` save
  dialog) honor it.

## 1. Persistence & resolution

Add one `electron-store` key: **`defaultFilesDirectory`** (string, empty by default).

Directory used to pre-fill new-file location resolves in priority order:

1. `defaultFilesDirectory` (the explicit setting), if non-empty
2. else the last-opened file's directory (existing `ProjectStep` heuristic via
   `databaseGetPath()`)
3. else the OS Documents folder (existing fallback via `getDefaultDocumentsPath()`)

**Implicit "remember first choice"** happens in the main process at the single choke
point `createFileAtPath()` (`apps/desktop/electron/main/index.ts:697`). Both the
wizard (`database:createAtPath`) and the legacy `newFile()` route through it. After a
successful create:

```
if (!store.get("defaultFilesDirectory")) {
    store.set("defaultFilesDirectory", path.dirname(filePath));
}
```

This guarantees write-once semantics regardless of which path created the file.

## 2. IPC + preload surface

Three thin additions, mirroring the existing `get-theme` / `set-theme` pattern.

Main-process IPC handlers (`apps/desktop/electron/main/index.ts`):

- `settings:getDefaultFilesDirectory` → returns the stored string (or `""`).
- `settings:setDefaultFilesDirectory` → validates the path exists (native
  `fs.existsSync` + is a directory); stores it. Returns success/failure.
- `dialog:selectDirectory` → opens the **native**
  `dialog.showOpenDialog(win, { properties: ["openDirectory", "createDirectory"] })`
  and returns the chosen folder path (or `null` if canceled).

Preload exposures (`apps/desktop/electron/preload/index.ts`):

- `getDefaultFilesDirectory(): Promise<string>`
- `setDefaultFilesDirectory(dir: string): Promise<boolean>`
- `selectDirectory(): Promise<string | null>`

No custom path-editing UI — the native picker is the only way to change the value.
Type declarations updated in `electron-env.d.ts` (or wherever the `window.electron`
surface is typed).

## 3. Wiring the two creation paths

- **Wizard** (`ProjectStep.tsx`): the `fetchDefaultDirectory` effect gains a step 0 —
  call `getDefaultFilesDirectory()` first; if non-empty, use it; otherwise fall
  through to the existing last-file → Documents logic. No other wizard changes.
- **Legacy `newFile()`** (`index.ts:1006`): read `defaultFilesDirectory` from the
  store and pass it as `defaultPath` to `showSaveDialog`.
- **Implicit remember**: the write-once guard in `createFileAtPath` (section 1).

## 4. Settings UI

A new row in `GeneralSettings.tsx`:

- Label: "Default files folder" (new Tolgee key under `settings.general.*`).
- Displays the current path, or "Not set — uses last location" when empty.
- A button labeled **"Edit"** that calls `selectDirectory()`; on a non-null result,
  writes back via `setDefaultFilesDirectory` and updates the displayed value.
- **No clear / reset option.**

All folder selection goes through the native picker per the OS-controls principle.

## 5. Testing

- **Unit:** extract the resolution-priority logic and the write-once guard into a
  pure helper and unit-test both (default set → used; unset → falls through; guard
  does not overwrite an existing value).
- **E2E:** extend `apps/desktop/e2e/tests/settings.spec.mts` to assert the new row
  renders and reflects a stored value.

## Out of scope

- No per-file override of the remembered default beyond the normal save dialog.
- No migration of existing users' last-file heuristic into the new setting (it
  simply gets populated on their next new-file creation).
