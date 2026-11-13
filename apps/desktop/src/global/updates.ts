/**
 * The desktop updater's state, as the main process (`electron/main/update.ts`) reports it to the
 * title bar's update pill and Settings › General. Shared by the main process, the preload and
 * the renderer, so it imports nothing.
 *
 * One updater, electron-updater, finds, downloads and installs every update; the renderer
 * only shows its state and asks it to act. The web editor has no updater: it is always the
 * latest version.
 */

export const UPDATE_IPC_CHANNELS = {
    /** invoke: the current `UpdateState` */
    getState: "updates:get-state",
    /** main → renderer: the new `UpdateState` whenever it changes */
    state: "updates:state",
    /** invoke: look for an update now; resolves with the state once the check ends */
    check: "updates:check",
    /** invoke: download the update that was found */
    download: "updates:download",
    /** invoke: close the show, quit, install the downloaded update and open again */
    install: "updates:install",
    /** invoke (macOS): move the app into Applications, where it can update, and relaunch */
    moveToApplications: "updates:move-to-applications",
} as const;

/** Why this copy of the app can't update itself */
export type UpdateUnsupportedReason =
    /** Run from source (`pnpm desktop dev`) */
    | "development"
    /** The Snap Store updates it */
    | "snap"
    /** A Linux install that isn't an AppImage (only AppImages can replace themselves) */
    | "linuxPackage"
    /** Built without an update feed (a fork's unsigned nightly): testers download each one */
    | "noFeed";

export type UpdatePhase =
    | { readonly kind: "unsupported"; readonly reason: UpdateUnsupportedReason }
    /** Not checked yet this session */
    | { readonly kind: "idle" }
    | { readonly kind: "checking" }
    | { readonly kind: "upToDate"; readonly checkedAt: number }
    | { readonly kind: "available"; readonly version: string }
    | {
          readonly kind: "downloading";
          readonly version: string;
          /**
           * The person asked for it (Download, Try again, or Check for updates while it ran).
           * An automatic download stays out of the title bar until it's ready.
           */
          readonly requested: boolean;
          /** 0–100 */
          readonly percent: number;
          readonly bytesPerSecond: number;
          readonly transferred: number;
          readonly total: number;
      }
    /** Ready: installs on quit, or now with "Update now" */
    | { readonly kind: "downloaded"; readonly version: string }
    | {
          readonly kind: "error";
          /** The updater's own message, untranslated, for the details line and bug reports */
          readonly message: string;
          /** The update it was getting, if it had found one */
          readonly version?: string;
      };

export interface UpdateState {
    /** The running app's version */
    readonly currentVersion: string;
    /** Which feed this app follows: nightlies are a separate app with their own feed */
    readonly channel: "stable" | "nightly";
    readonly phase: UpdatePhase;
    /**
     * macOS only: the app runs outside Applications (from the disk image, or Downloads), where
     * macOS won't let it replace itself. It still checks; installing needs a move first.
     */
    readonly needsMoveToApplications: boolean;
    /** Settings › General "Automatically download updates": downloads start without asking */
    readonly automaticDownload: boolean;
    /**
     * "Update now" last session tried to install this version, and the app opened on its old
     * one again. Kept for the session, so the pill can offer the installer instead.
     */
    readonly failedInstallVersion?: string;
}

/** Where a person can read about a version and download its installer by hand */
export function releasePageUrl(
    channel: UpdateState["channel"],
    version?: string,
): string {
    const releases = "https://github.com/OpenMarch/OpenMarch/releases";
    // The signed nightlies' rolling release (.github/workflows/nightly.yaml)
    if (channel === "nightly") return `${releases}/tag/v0.0.0-nightly`;
    return version ? `${releases}/tag/v${version}` : `${releases}/latest`;
}
