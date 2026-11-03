import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { db } from "@/global/database/db";
import type { DbConnection } from "@/db-functions/types";
import {
    setTimelinePutDownItems,
    startTimelineResolver,
    stopTimelineResolver,
} from "./timelineStore";
import { usePutDownItems } from "@/hooks/queries/usePutDownItems";
import { useTimelineSelectionHost } from "./useTimelineSelectionHost";
import { useTimelinePageBridge } from "./useTimelinePageBridge";
import { useDeselectDimmedMarchers } from "./useTimelineDimming";
import { useTimelinePlaybackDriver } from "./useTimelinePlaybackDriver";
import { useHeldMarksHost } from "./useHeldMarks";
import { useBasicModeGuards } from "./useBasicModeGuards";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { useCollisionDetection } from "@/hooks/useCollisionDetection";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { pageFlags } from "./timelinePlayhead";
import { useBasicLocksHost } from "./basicLocks";
import {
    createTimelineDevApi,
    type TimelineDevApi,
} from "./fixtures/timelineFixtures";

declare global {
    interface Window {
        /** Timeline dev tools; present only in development builds */
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
 * Feeds the resolver the items it puts down where their holders release them (ADR 0002 D-9):
 * Placement isn't in the timeline change log, so the store gets it from a query.
 */
export function useTimelinePutDownFeed(): void {
    const items = usePutDownItems();
    useEffect(() => {
        if (items) setTimelinePutDownItems(items);
    }, [items]);
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

/** Keeps `useTimelineSelectionStore`'s page boxes on the show's pages. */
function useTimelinePageBoxes(enabled: boolean): void {
    const { pages } = useTimingObjects();
    useEffect(() => {
        if (!enabled) return;
        useTimelineSelectionStore
            .getState()
            .setPageBoxes(
                pageFlags(pages).flatMap((f) =>
                    f.range ? [{ ...f.range, name: f.page.name }] : [],
                ),
            );
    }, [enabled, pages]);
}

/**
 * Runs the timeline resolver for the open file and, in development builds only, installs the dev
 * console API.
 */
export default function TimelineResolverHost() {
    useTimelineResolverSession(db, true);
    // C2.5: released items are put down at their holders
    useTimelinePutDownFeed();
    // The stored timelines the UI-9 selection resolves to (P8.11)
    useTimelineSelectionHost(db, true);
    // TEMPORARY (P8.12): the legacy selected page follows the playhead
    useTimelinePageBridge(true);
    // UI-9: marchers outside the selected timeline can't stay selected
    useDeselectDimmedMarchers(true);
    // UI-9 Play: loop a selected range, stop at the end, leave the playhead where a pause lands
    useTimelinePlaybackDriver(true);
    // UI-10: the start flag follows the page boxes (both modes: Basic edits inside them, UI-19)
    useTimelinePageBoxes(true);
    // UI-26: Expert's start flag stays put; UI-19: Basic's follows, with no loop or isolation
    useBasicModeGuards(true);
    // UI-19: the marchers Basic can't edit, per page
    useBasicLocksHost(true);
    // Holds (#472): the Held marks the timeline's Held bars read
    useHeldMarksHost(db, true);
    // #226: the selected page's collisions, for both fields and the Collisions tab
    useCollisionDetection();
    // The console API can write fixtures into the file: development builds only
    useTimelineDevApi(db, import.meta.env.DEV);
    return null;
}
