# 0014: The desktop app updates itself through electron-updater, shown in the title bar

- Status: accepted
- Date: 2026-11-11

## Context

The desktop app had two update systems that didn't know about each other. electron-updater
downloaded an update silently at launch and installed it on quit, with no UI. Separately, the
title bar's "New Version Available!" asked GitHub's API for the latest release from the renderer
and offered the installer to download by hand. A person could reinstall by hand an update the
updater had already staged. The API's "latest release" skipped prereleases, so beta testers were
never told about a newer beta. And when the updater failed, nobody saw it (fork #404).

Fork #404 first weighed shipping the renderer and main-process code over the air, on a fixed
native runtime. That was set aside: it splits one version into two, adds a second signing and
rollback system, and most of its benefit comes from making updates visible, not faster.

## Decision

- **One updater.** electron-updater finds, downloads and installs every update. The renderer only
  shows its state and asks it to act. `electron/main/update.ts` holds a small state machine
  (`createUpdateController`) that turns electron-updater's events into one `UpdateState`
  (`src/global/updates.ts`): unsupported, idle, checking, up to date, available, downloading
  (with progress), downloaded, or error.
- **IPC contract.** `src/global/updates.ts` names the channels, shared by the main process, the
  preload and the renderer: `updates:get-state`, `updates:check`, `updates:download`,
  `updates:install` and `updates:move-to-applications` (invoke), and `updates:state` (main to
  every window, on each change). The preload exposes them as `window.electron.updates`.
- **When it runs.** It checks at launch and every hour, and on "Check for updates" (a registered
  action, `checkForUpdates`, also in the app menu through `menu:action`, ADR 0003). "Download
  updates automatically" (Settings › General, on by default; the old `automaticUpdates` key)
  decides whether a found update downloads by itself. A downloaded update always installs on
  quit. An automatic download shows only as a small progress ring (the percentage in its tooltip); a
  download the person asked for (Download, Try again, or Check for updates while one runs)
  shows its text and a progress bar.
- **Background and asked-for checks differ.** The launch and hourly checks are quiet: while an
  update waits for Download they don't hide the pill, and if they fail the found update stays.
  A check the person asks for reports what it found, failures included, and its download shows
  in the title bar.
- **macOS staging.** electron-updater reports "downloaded" once the zip is on disk, but
  Squirrel.Mac still fetches and unpacks it. The update counts as ready only after Electron's own
  `autoUpdater` reports `update-downloaded`, so Update now never waits on Squirrel.
- **Update now** hides the window and closes the show the way quitting does but keeps it as the file to reopen, then
  calls `quitAndInstall` (silent on Windows, with the app reopened afterwards). The controller
  records the attempt. If the next launch is still on the old version, it reports the failed
  install and offers the installer. If the app hasn't quit 30 s after `quitAndInstall`, or the
  install raises an error after the show closed, it relaunches on the same version. On Linux it installs the AppImage without
  starting it and has Electron open it after this app exits: electron-updater would start it at
  once, while this app still holds the profile's storage. If the app is still quitting when the
  timeout runs, it leaves the restart to the installer.
- **Where it can't update itself**, it says so and does nothing: development builds, Snap (the
  Snap Store updates it), Linux installs that aren't an AppImage, and builds with no update feed
  (a fork's unsigned nightlies). On macOS outside
  Applications, where macOS won't let an app replace itself, it still checks but offers
  "Move to Applications" instead of downloading.
- **Feeds.** Releases and betas use the GitHub provider, as before (`latest-${arch}`).
  Nightlies are a separate app (`com.openmarch.app.nightly`) with their own feed: the generic
  provider on the rolling release `v0.0.0-nightly` in OpenMarch/OpenMarch. Its tag is a semver
  prerelease ("nightly"), because beta builds read the same repository's release list, and
  electron-updater's GitHub provider skips custom prerelease channels but would take a tag such
  as `nightly`. Nightlies there are signed and notarized like releases, since macOS only updates a
  signed app. A build without the secrets (a fork) is unsigned and has no feed.

## Consequences

- The title bar's update pill replaces the GitHub-API version check. It appears only when there
  is something to do or watch (available, downloading, with a progress ring or bar, ready, failed), and
  its popover holds the step: Download, Update now, Move to Applications, or Try again and
  Download installer.
- Release notes come from the release page ("What's new"), not from the app.
- A nightly build's files carry its version in their names (except the Linux AppImage, which
  keeps one name so an update replaces it in place instead of renaming the file launchers point
  at), so a download that starts while the
  next nightly uploads still finds its file. The workflow uploads the files, then the feed, then
  deletes the old files.
- The nightly's package name is `openmarch-nightly` (`extraMetadata.name`): electron-builder
  names electron-updater's download cache after it, and a shared cache would let the released
  app and the nightly clear each other's staged update.
- Nightly version numbers drop the base version's own prerelease (`0.2.0-nightly.YYYYMMDD.run`),
  so they keep sorting in order across beta numbers.
- Each nightly build is notarized and signed through Azure, which adds minutes to the run and
  uses signing quota.

## Verification

- `apps/desktop/electron/main/__test__/update.test.ts`: the controller's events and states,
  automatic and asked-for downloads, no download outside Applications, Update now closing the
  show before it installs, the relaunch when an install doesn't happen, the failed-install record,
  the hourly checks, and the unsupported installs.
- Manual, on signed builds (nightlies on macOS, Windows and Linux AppImage): install build N, publish
  N+1, and check that the pill shows the update, the download's progress and Update now, and
  that the app reopens on N+1 with the show open.
