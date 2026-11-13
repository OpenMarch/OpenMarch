import { useEffect, useState } from "react";
import { isWebBuild } from "@/utilities/webBuild";
import { releasePageUrl, type UpdateState } from "@/global/updates";

/**
 * The desktop updater's state (`electron/main/update.ts`), kept current. Null in the web
 * editor, which has no updater, and until the main process answers.
 */
export function useUpdateState(): UpdateState | null {
    const [state, setState] = useState<UpdateState | null>(null);
    useEffect(() => {
        const updates = isWebBuild ? undefined : window.electron?.updates;
        if (!updates) return;
        let live = true;
        const unsubscribe = updates.onState(setState);
        // No answer (no updater behind the preload, as in the browser test host) is no state
        updates
            .getState()
            .then((initial) => {
                if (live && initial) setState((current) => current ?? initial);
            })
            .catch(() => {});
        return () => {
            live = false;
            unsubscribe();
        };
    }, []);
    return state;
}

/** Opens the release page, where the installer can be downloaded by hand */
export function openReleasePage(state: UpdateState, version?: string) {
    void window.electron.openExternal(releasePageUrl(state.channel, version));
}

/** The version the update pill is about, if it has one to show */
export function pendingVersion(state: UpdateState): string | undefined {
    const { phase } = state;
    switch (phase.kind) {
        case "available":
        case "downloading":
        case "downloaded":
            return phase.version;
        case "error":
            return phase.version ?? state.failedInstallVersion;
        default:
            return state.failedInstallVersion;
    }
}

/** Megabytes, one decimal: "12.3" */
export const megabytes = (bytes: number) => (bytes / 1_000_000).toFixed(1);
