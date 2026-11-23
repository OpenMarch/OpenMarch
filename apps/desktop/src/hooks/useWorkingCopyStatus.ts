import { useEffect, useState } from "react";
import type { WorkingCopyStatus } from "@om-electron/database/workingCopy/WorkingCopySession";

/** Whether the open show is edited through a working copy, as last reported. */
let active = false;
export const workingCopyIsActive = () => active;

/**
 * The open show's save state when it's edited through a working copy (ADR 0018), or null when
 * it's edited in place (and in the web editor, which has no working copies).
 */
export function useWorkingCopyStatus(): WorkingCopyStatus | null {
    const [status, setStatus] = useState<WorkingCopyStatus | null>(null);

    useEffect(() => {
        const api = window.electron.workingCopy;
        if (!api) return;
        let mounted = true;
        api.getStatus()
            .then((current) => {
                if (mounted) setStatus(current);
                active = !!current;
            })
            .catch(() => {
                // Hosts without working copies answer nothing.
            });
        const unsubscribe = api.onStatus((next) => {
            active = next.state !== "closed";
            if (mounted) setStatus(next.state === "closed" ? null : next);
        });
        return () => {
            mounted = false;
            unsubscribe();
        };
    }, []);

    return status;
}

/** The file name from a path, on any platform. */
export function fileNameOf(filePath: string): string {
    return filePath.split(/[/\\]/).filter(Boolean).pop() ?? filePath;
}
