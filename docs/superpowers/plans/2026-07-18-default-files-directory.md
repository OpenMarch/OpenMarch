# Default Files Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users set a persisted default directory where new OpenMarch (`.dots`) files are created — remembered implicitly from the first show they create, and editable in Settings via the native directory picker.

**Architecture:** A single `electron-store` key `defaultFilesDirectory` holds the value. The main process is the choke point: `createFileAtPath()` (which both the new-show wizard and the legacy `newFile()` route through) writes the value once, on the first created file. New IPC handlers expose get/set plus a native directory picker. The renderer reads the value to pre-fill the wizard's file location, and a Settings row lets users change it.

**Tech Stack:** Electron (main + preload IPC via `ipcMain.handle`/`ipcRenderer.invoke`), React renderer, `electron-store`, Tolgee i18n, Vitest (jsdom) unit tests, Playwright e2e.

## Global Constraints

- Store key name is exactly `defaultFilesDirectory` (string, empty default).
- Prefer native OS controls: use `dialog.showOpenDialog` with `properties: ["openDirectory", "createDirectory"]` for folder selection and `app.getPath("documents")` for fallbacks. No custom path-entry UI.
- The implicit default is **write-once**: `createFileAtPath` sets it only when it is currently empty. Later new-file choices never overwrite it. Only the Settings "Edit" flow changes it afterward.
- Resolution priority for the wizard's pre-filled directory: (1) `defaultFilesDirectory` if non-empty, (2) last-opened file's directory, (3) `app.getPath("documents")`.
- Settings row button label is exactly **"Edit"**. There is **no** clear/reset control.
- Follow existing patterns: mirror the `get-theme`/`set-theme` IPC style; `ElectronApi` type is `typeof APP_API` in `apps/desktop/electron/preload/index.ts`, so adding a method to `APP_API` auto-types `window.electron.*`.
- Run desktop unit tests from `apps/desktop/` with `pnpm vitest run <path>`.

---

### Task 1: Pure write-once helper + unit test

Extract the write-once decision into a pure, Electron-free module so it can be unit-tested directly.

**Files:**

- Create: `apps/desktop/electron/main/services/default-files-directory.ts`
- Test: `apps/desktop/electron/main/services/__test__/default-files-directory.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `computeDefaultDirectoryToPersist(currentValue: string | undefined | null, newFilePath: string): string | null` — returns the directory to store, or `null` if nothing should be persisted. Returns `null` when `currentValue` is a non-empty string (write-once) or when `newFilePath` is falsy; otherwise returns the parent directory of `newFilePath` using POSIX/OS `dirname`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/electron/main/services/__test__/default-files-directory.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeDefaultDirectoryToPersist } from "../default-files-directory";

describe("computeDefaultDirectoryToPersist", () => {
  it("returns the parent directory when no value is stored yet", () => {
    expect(
      computeDefaultDirectoryToPersist("", "/Users/jo/Shows/My Show.dots"),
    ).toBe("/Users/jo/Shows");
  });

  it("returns the parent directory when stored value is undefined", () => {
    expect(
      computeDefaultDirectoryToPersist(undefined, "/Users/jo/Shows/a.dots"),
    ).toBe("/Users/jo/Shows");
  });

  it("returns null (write-once) when a value is already stored", () => {
    expect(
      computeDefaultDirectoryToPersist(
        "/Users/jo/Existing",
        "/Users/jo/Shows/a.dots",
      ),
    ).toBeNull();
  });

  it("returns null when the new file path is empty", () => {
    expect(computeDefaultDirectoryToPersist("", "")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/desktop && pnpm vitest run electron/main/services/__test__/default-files-directory.test.ts`
Expected: FAIL — cannot resolve `../default-files-directory`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/desktop/electron/main/services/default-files-directory.ts`:

```ts
import { dirname } from "node:path";

/**
 * Decide whether to persist a default files directory, enforcing write-once
 * semantics. Returns the directory to store, or null if nothing should change.
 *
 * - Returns null when a non-empty value is already stored (write-once).
 * - Returns null when newFilePath is falsy.
 * - Otherwise returns the parent directory of newFilePath.
 */
export function computeDefaultDirectoryToPersist(
  currentValue: string | undefined | null,
  newFilePath: string,
): string | null {
  if (typeof currentValue === "string" && currentValue.trim() !== "") {
    return null;
  }
  if (!newFilePath) {
    return null;
  }
  return dirname(newFilePath);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/desktop && pnpm vitest run electron/main/services/__test__/default-files-directory.test.ts`
Expected: PASS — 4 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/main/services/default-files-directory.ts apps/desktop/electron/main/services/__test__/default-files-directory.test.ts
git commit -m "feat(default-files-dir): add write-once persist helper"
```

---

### Task 2: Main-process IPC surface + creation-path wiring + preload/mock

Add the get/set/picker IPC handlers, wire the write-once helper into `createFileAtPath`, pre-fill the legacy `newFile()` dialog, and expose the three methods through preload and the renderer mock.

**Files:**

- Modify: `apps/desktop/electron/main/index.ts` (IPC handlers near the `get-theme` block ~line 553; `createFileAtPath` ~line 697; `newFile` ~line 1006)
- Modify: `apps/desktop/electron/preload/index.ts` (`APP_API` object, near `getDefaultDocumentsPath` ~line 168)
- Modify: `apps/desktop/src/__mocks__/electron.ts`

**Interfaces:**

- Consumes: `computeDefaultDirectoryToPersist` from Task 1 (`../services/default-files-directory` relative to `electron/main/index.ts` is `./services/default-files-directory`).
- Produces (on `window.electron`, auto-typed via `ElectronApi = typeof APP_API`):
  - `getDefaultFilesDirectory(): Promise<string>` — resolves the stored value or `""`.
  - `setDefaultFilesDirectory(dir: string): Promise<boolean>` — validates `dir` is an existing directory, stores it, returns `true`; returns `false` on invalid path.
  - `selectDirectory(): Promise<string | null>` — opens the native directory picker; returns the chosen absolute path or `null` if canceled.
- IPC channel names: `settings:getDefaultFilesDirectory`, `settings:setDefaultFilesDirectory`, `dialog:selectDirectory`.

- [ ] **Step 1: Add the import for the helper**

In `apps/desktop/electron/main/index.ts`, add near the other local imports (after line 34 `import { repairDatabase } from "../database/repair";`):

```ts
import { computeDefaultDirectoryToPersist } from "./services/default-files-directory";
```

- [ ] **Step 2: Wire write-once persistence into `createFileAtPath`**

In `apps/desktop/electron/main/index.ts`, in `createFileAtPath` (~line 697), after `addRecentFile(filePath);` and before `return 200;`, add:

```ts
const dirToPersist = computeDefaultDirectoryToPersist(
  store.get("defaultFilesDirectory") as string | undefined,
  filePath,
);
if (dirToPersist) {
  store.set("defaultFilesDirectory", dirToPersist);
}
```

- [ ] **Step 3: Pre-fill the legacy `newFile()` save dialog**

In `apps/desktop/electron/main/index.ts`, in `newFile()` (~line 1024), replace the `showSaveDialog` options object:

```ts
const dialogResult = await dialog.showSaveDialog(win, {
  buttonLabel: "Create New",
  filters: [{ name: "OpenMarch File", extensions: ["dots"] }],
});
```

with:

```ts
const storedDefaultDir = store.get("defaultFilesDirectory") as
  | string
  | undefined;
const dialogResult = await dialog.showSaveDialog(win, {
  buttonLabel: "Create New",
  defaultPath: storedDefaultDir || undefined,
  filters: [{ name: "OpenMarch File", extensions: ["dots"] }],
});
```

- [ ] **Step 4: Add the three IPC handlers**

In `apps/desktop/electron/main/index.ts`, after the `set-language` handler (~line 569), add:

```ts
// Default files directory

ipcMain.handle("settings:getDefaultFilesDirectory", () => {
  return (store.get("defaultFilesDirectory", "") as string) || "";
});

ipcMain.handle("settings:setDefaultFilesDirectory", (_event, dir: string) => {
  try {
    if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return false;
    }
    store.set("defaultFilesDirectory", dir);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("dialog:selectDirectory", async () => {
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});
```

- [ ] **Step 5: Expose the methods in preload**

In `apps/desktop/electron/preload/index.ts`, inside `APP_API` after the `getDefaultDocumentsPath` entry (~line 168-169), add:

```ts
    getDefaultFilesDirectory: () =>
        ipcRenderer.invoke(
            "settings:getDefaultFilesDirectory",
        ) as Promise<string>,
    setDefaultFilesDirectory: (dir: string) =>
        ipcRenderer.invoke(
            "settings:setDefaultFilesDirectory",
            dir,
        ) as Promise<boolean>,
    selectDirectory: () =>
        ipcRenderer.invoke("dialog:selectDirectory") as Promise<string | null>,
```

- [ ] **Step 6: Add renderer mocks**

In `apps/desktop/src/__mocks__/electron.ts`, add alongside the other `vi.fn()` mocks (near `showSaveDialog: vi.fn(),`):

```ts
    getDefaultFilesDirectory: vi.fn().mockResolvedValue(""),
    setDefaultFilesDirectory: vi.fn().mockResolvedValue(true),
    selectDirectory: vi.fn().mockResolvedValue(null),
```

- [ ] **Step 7: Verify type-check and existing tests pass**

Run: `cd apps/desktop && pnpm vitest run electron/main/services/__test__/default-files-directory.test.ts`
Expected: PASS (unchanged from Task 1).

Run: `cd apps/desktop && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: No new type errors referencing the added methods. (If the repo's tsc has pre-existing unrelated errors, confirm none mention `defaultFilesDirectory`, `selectDirectory`, or the touched files.)

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/electron/main/index.ts apps/desktop/electron/preload/index.ts apps/desktop/src/__mocks__/electron.ts
git commit -m "feat(default-files-dir): add IPC surface and wire creation paths"
```

---

### Task 3: Wizard pre-fills from the stored default

Make `ProjectStep` prefer the stored `defaultFilesDirectory` before falling back to the last-file/Documents heuristic.

**Files:**

- Modify: `apps/desktop/src/components/launchpage/newShow/steps/ProjectStep.tsx` (the `fetchDefaultDirectory` effect ~lines 79-103)

**Interfaces:**

- Consumes: `window.electron.getDefaultFilesDirectory()` from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Prepend the stored-default lookup**

In `apps/desktop/src/components/launchpage/newShow/steps/ProjectStep.tsx`, replace the body of `fetchDefaultDirectory` (currently starting with `const lastFilePath = await window.electron.databaseGetPath();`) so the stored default is checked first:

```ts
const fetchDefaultDirectory = async () => {
  try {
    const storedDefault = await window.electron.getDefaultFilesDirectory();
    if (storedDefault?.trim()) {
      setDefaultDirectory(normalizePath(storedDefault));
      return;
    }
    const lastFilePath = await window.electron.databaseGetPath();
    if (lastFilePath?.trim()) {
      const normalizedPath = normalizePath(lastFilePath);
      const pathParts = normalizedPath.split("/");
      pathParts.pop();
      const directory = pathParts.join("/");
      if (directory) {
        setDefaultDirectory(directory);
        return;
      }
    }
    const docsPath = await window.electron.getDefaultDocumentsPath();
    setDefaultDirectory(docsPath);
  } catch {
    const docsPath = await window.electron.getDefaultDocumentsPath();
    setDefaultDirectory(docsPath);
  }
};
```

- [ ] **Step 2: Verify existing ProjectStep/newShow tests still pass**

Run: `cd apps/desktop && pnpm vitest run src/components/launchpage`
Expected: PASS (no regressions; the mock added in Task 2 returns `""`, so behavior falls through to the existing heuristic in tests).

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/launchpage/newShow/steps/ProjectStep.tsx
git commit -m "feat(default-files-dir): wizard prefers stored default directory"
```

---

### Task 4: Settings UI row + i18n keys

Add a "Default files folder" row to General settings with an "Edit" button that opens the native picker.

**Files:**

- Modify: `apps/desktop/src/components/launchpage/settings/GeneralSettings.tsx`
- Modify: `apps/desktop/i18n/en.json` (the `settings` object ~line 1020)

**Interfaces:**

- Consumes: `window.electron.getDefaultFilesDirectory()`, `window.electron.selectDirectory()`, `window.electron.setDefaultFilesDirectory(dir)` from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Add i18n keys**

In `apps/desktop/i18n/en.json`, inside the `settings` object, add these keys (keep the object alphabetically ordered — `defaultFilesFolder` sorts after `"general.appearance.light"` (line 1027) and before `"general.language"` (line 1028), so insert the block there):

```json
        "general.defaultFilesFolder": "Default files folder",
        "general.defaultFilesFolder.edit": "Edit",
        "general.defaultFilesFolder.notSet": "Not set — uses last location",
```

- [ ] **Step 2: Add the settings row**

In `apps/desktop/src/components/launchpage/settings/GeneralSettings.tsx`:

Add to the imports from `@openmarch/ui` (line 6-12) — ensure `Button` is imported (add it to the existing named import list):

```ts
import {
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTriggerButton,
  Button,
} from "@openmarch/ui";
```

Add state + loader inside the component (after `const { uiSettings, setUiSettings } = useUiSettingsStore();`, line 28):

```ts
const [defaultFilesFolder, setDefaultFilesFolder] = useState("");

useEffect(() => {
  const loadDefaultFilesFolder = async () => {
    const stored = await window.electron.getDefaultFilesDirectory();
    setDefaultFilesFolder(stored ?? "");
  };
  void loadDefaultFilesFolder();
}, []);

const handleEditDefaultFilesFolder = async () => {
  const selected = await window.electron.selectDirectory();
  if (!selected) return;
  const ok = await window.electron.setDefaultFilesDirectory(selected);
  if (ok) setDefaultFilesFolder(selected);
};
```

Add the row JSX after the `showFullDatabasePath` row (after the closing `</div>` of that row, ~line 131, before the component's outer closing `</div>`):

```tsx
<div className="flex h-[2.5rem] items-center justify-between px-8">
  <p className="text-body text-text-subtitle">
    <T keyName="settings.general.defaultFilesFolder" />
  </p>
  <div className="flex items-center gap-8">
    <span className="text-text-subtitle text-sub max-w-[220px] truncate">
      {defaultFilesFolder || (
        <T keyName="settings.general.defaultFilesFolder.notSet" />
      )}
    </span>
    <Button
      type="button"
      variant="secondary"
      size="compact"
      onClick={() => void handleEditDefaultFilesFolder()}
    >
      <T keyName="settings.general.defaultFilesFolder.edit" />
    </Button>
  </div>
</div>
```

- [ ] **Step 3: Verify type-check and tests**

Run: `cd apps/desktop && pnpm vitest run src/components/launchpage/settings`
Expected: PASS (or "no tests found" for this path — acceptable; the mocks from Task 2 back the new calls).

Run: `cd apps/desktop && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: No new type errors in `GeneralSettings.tsx`.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/components/launchpage/settings/GeneralSettings.tsx apps/desktop/i18n/en.json
git commit -m "feat(default-files-dir): add settings row to edit default folder"
```

---

### Task 5: E2E — settings row renders

Extend the settings e2e to assert the new row appears on the launch-page settings.

**Files:**

- Modify: `apps/desktop/e2e/tests/settings.spec.mts`

**Interfaces:**

- Consumes: the rendered Settings UI from Task 4.
- Produces: nothing.

- [ ] **Step 1: Add the assertion test**

In `apps/desktop/e2e/tests/settings.spec.mts`, add a new test after the existing `settingsMenus.forEach(...)` block (use the existing `navigateToLaunchPageSettings` helper already defined in the file):

```ts
test("Launch page - default files folder row is visible", async ({
  electronApp,
}) => {
  const { page } = electronApp;
  await navigateToLaunchPageSettings(page);
  await expect(page.getByText("Default files folder")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e test**

Run: `cd apps/desktop && pnpm exec playwright test e2e/tests/settings.spec.mts -g "default files folder"`
Expected: PASS. (If the local environment cannot launch the Electron e2e harness, capture the failure output and report it in the task report rather than marking the step done — do not delete the test.)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/e2e/tests/settings.spec.mts
git commit -m "test(default-files-dir): assert settings row renders"
```

---

## Notes for the executor

- Localization: only `en.json` gets new keys in this plan; the other locale files (`es`, `fr`, `ja`, `pt-BR`) fall back to the key/English until translated. That matches how new keys are normally introduced here.
- The wizard already writes the chosen file via `database:createAtPath` → `createFileAtPath`, so the write-once persistence in Task 2 covers the wizard path automatically; no extra wizard wiring for persistence is needed (Task 3 is read-only pre-fill).
- `store.set("defaultFilesDirectory", …)` uses the same `electron-store` instance as `theme`/`language`, so no new store setup is required.
