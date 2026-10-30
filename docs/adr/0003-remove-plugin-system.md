# 0003: Remove the plugin system

- Status: accepted
- Date: 2026-10-29

## Context

Since June 2025 the desktop app could load plugins: `.om.js` files in the
`plugins` folder of the app's user-data directory. On startup the editor
window read each file through the `plugins:list` and `plugins:get` IPC
channels and ran it as a `<script>` in the page, with full access to the
renderer. The Plugins settings section listed plugins from the
`OpenMarch/plugins` GitHub repository and installed one by downloading its
file through `plugins:install`.

Nobody uses it. The plugins repository has a handful of examples, and the
only API they had was the Fabric canvas on `window.canvas`, which the field
renderer replacement removes. Meanwhile it costs:

- **Security.** Any file in that folder runs with the editor window's
  privileges, `plugins:get` reads any path the renderer passes it, and
  `plugins:install` writes whatever a URL returns.
- **Flaky tests.** The settings section fetches from `api.github.com` when it
  mounts. In `SettingsWindow.test.tsx` the response sometimes arrives after
  the test environment is torn down, and the late state update throws
  `window is not defined`, failing CI at random.

## Decision

Remove the plugin system entirely rather than redesign it:

- the `plugins:list`, `plugins:get`, `plugins:install` and `plugins:uninstall`
  IPC channels, the `window.plugins` preload API and its types;
- plugin loading in `App.tsx` and the `Plugin` class;
- the Plugins settings section and its translation keys.

An existing `plugins` folder in user data is left in place and ignored. The
app doesn't delete files it didn't create on the user's behalf.

If extensibility comes back, it should be a new design with a defined API and
a sandbox, recorded in its own ADR.

## Consequences

- Installed plugins stop loading after the update, with no notice in the app.
- The renderer can no longer ask the main process to read an arbitrary path
  or download a file into user data through these channels.
- The settings window has eight sections instead of nine.
- The 2025-06-12 blog post announcing plugins carries a note that they were
  removed.

## Verification

- `pnpm tsc --noEmit` in `apps/desktop` and the desktop unit tests,
  including `SettingsWindow.test.tsx` and `SettingsSidebar.test.tsx`, and the
  Electron settings e2e spec (`e2e/tests/settings.spec.mts`).
- `git grep -n "plugins:"` under `apps/desktop` finds no IPC channel.
