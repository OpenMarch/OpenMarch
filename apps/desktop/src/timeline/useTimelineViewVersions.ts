import { useMemo, useSyncExternalStore } from "react";
import { useTimelineDisplayStore } from "@/db-functions/timelineDisplay";
import { useTimelineResolverStore } from "./timelineStore";

const subscribe = (notify: () => void) => {
    const stopResolver = useTimelineResolverStore.subscribe(notify);
    const stopDisplay = useTimelineDisplayStore.subscribe(notify);
    return () => {
        stopResolver();
        stopDisplay();
    };
};

const snapshot = () =>
    `${useTimelineResolverStore.getState().version}:${useTimelineDisplayStore.getState().version}`;

/**
 * The resolver store's version and the display version (P7.15), read together. A write that moves
 * both gives one new pair, so a view that reloads on it loads once per write.
 */
export function useTimelineViewVersions(): {
    version: number;
    displayVersion: number;
} {
    const key = useSyncExternalStore(subscribe, snapshot);
    return useMemo(() => {
        const [version, displayVersion] = key.split(":").map(Number);
        return { version: version!, displayVersion: displayVersion! };
    }, [key]);
}
