import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { db } from "@/global/database/db";
import type { DbConnection } from "@/db-functions/types";
import { useTimelineMode } from "@/hooks/queries/useWorkspaceSettings";
import { startTimelineResolver, stopTimelineResolver } from "./timelineStore";
import { useTimelineSelectionHost } from "./useTimelineSelectionHost";
import { useTimelinePageBridge } from "./useTimelinePageBridge";
import { useDeselectDimmedMarchers } from "./useTimelineDimming";
import { useTimelinePlaybackDriver } from "./useTimelinePlaybackDriver";
import { useKeptAssignmentsHost } from "./useKeepLaterPages";
import {
    createTimelineDevApi,
    type TimelineDevApi,
} from "./fixtures/timelineFixtures";

declare global {
    interface Window {
        /** Timeline dev tools; present only while the file's timeline dev flag is on */
        openmarchTimeline?: TimelineDevApi;
    }
}

/**
 * Runs the resolver session for `db` while `enabled` is true: starting it subscribes to timeline
 * changes and cold-builds; turning it off, or unmounting, unsubscribes and clears the store.
 */
export function useTimelineResolverSession(
    database: DbConnection,
    enabled: boolean,
): void {
    useEffect(() => {
        if (!enabled) return;
        void startTimelineResolver(database);
        return () => stopTimelineResolver();
    }, [database, enabled]);
}

/**
 * Installs the dev console API (`window.openmarchTimeline`, with the P5.7 fixture loader) while
 * `enabled` is true. There is no other UI for it.
 */
export function useTimelineDevApi(
    database: DbConnection,
    enabled: boolean,
): void {
    const queryClient = useQueryClient();
    useEffect(() => {
        if (!enabled) return;
        const api = createTimelineDevApi(
            database,
            // A fixture adds marchers and rows outside the app's mutation hooks
            () => void queryClient.invalidateQueries(),
        );
        window.openmarchTimeline = api;
        return () => {
            if (window.openmarchTimeline === api)
                delete window.openmarchTimeline;
        };
    }, [database, enabled, queryClient]);
}

/**
 * Runs the timeline resolver for the open file while its timeline dev flag (`timelineMode` in
 * `workspace_settings`) is on, and, in development builds only, installs the dev console API.
 * With the flag off, nothing subscribes, nothing is built and the console API is absent.
 */
export default function TimelineResolverHost() {
    const enabled = useTimelineMode();
    useTimelineResolverSession(db, enabled);
    // The stored timelines the UI-9 selection resolves to (P8.11)
    useTimelineSelectionHost(db, enabled);
    // TEMPORARY (P8.12): the legacy selected page follows the playhead
    useTimelinePageBridge(enabled);
    // UI-9: marchers outside the selected timeline can't stay selected
    useDeselectDimmedMarchers(enabled);
    // UI-9 Play: loop a selected range, stop at the end, leave the playhead where a pause lands
    useTimelinePlaybackDriver(enabled);
    // UI-18 keep later pages: the kept spots the chains and the inspector line read
    useKeptAssignmentsHost(db, enabled);
    // The console API can write fixtures into the file. The flag lives in the file itself, so it
    // alone mustn't expose a write path in a release build: development builds only.
    useTimelineDevApi(db, enabled && import.meta.env.DEV);
    return null;
}
