import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { FieldProperties } from "@openmarch/core";
import type Page from "@/global/classes/Page";
import { db } from "@/global/database/db";
import { useCollisionStore } from "@/stores/CollisionStore";
import {
    isolatedTimeline,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimelineResolverStore } from "@/timeline/timelineStore";
import { useTimelineFocusScene } from "@/timeline/useTimelineFocusScene";
import { ghostColorFor } from "@/timeline/useTimelineFocusScene";
import { useTimelinePathSamples } from "@/timeline/useTimelinePathSamples";
import {
    planCollisionOverlay,
    planFocusOverlay,
    planPathOverlay,
    type OverlayPlan,
} from "@/field/timelineOverlays";
import { FieldDimming } from "./fieldDimming";

/**
 * Everything the timeline draws on the field (fork #201): the selected page's
 * pathways, midpoints, endpoints and step-size warnings
 * (`useTimelinePathSamples`), an isolated move's focus scene
 * (`useTimelineFocusScene`, which also publishes the isolation plan the
 * playhead driver draws members at), collision markers (`useCollisionStore`),
 * and who's dimmed. Plans change on page changes, edits and setting changes,
 * never per frame; dimming goes to the layers through {@link FieldDimming},
 * outside React.
 */
// eslint-disable-next-line max-lines-per-function
export function useTimelineVisuals({
    isPlaying,
    selectedPage,
    pages,
    marcherIds,
    fieldProperties,
}: {
    isPlaying: boolean;
    selectedPage: Page | null;
    pages: readonly Page[];
    marcherIds: readonly number[] | undefined;
    fieldProperties: FieldProperties | undefined;
}): {
    paths: OverlayPlan | null;
    focus: OverlayPlan | null;
    collisions: OverlayPlan | null;
    dimming: FieldDimming;
    /** Whether the resolver is ready: the timeline draws nothing before. */
    ready: boolean;
} {
    // Drawn from the resolver only once it's ready
    const ready = useTimelineResolverStore((s) => s.status === "ready");
    const settings = useUiSettingsStore(
        useShallow((s) => ({
            previousPaths: s.uiSettings.previousPaths,
            nextPaths: s.uiSettings.nextPaths,
            stepSizeWarnings: s.uiSettings.stepSizeWarnings,
            showCollisions: s.uiSettings.showCollisions,
        })),
    );
    // Isolation's own paths and ghosts replace the page's paths
    const isolating = useTimelineSelectionStore((s) => s.isolation !== null);
    const previousPathsEnabled = settings.previousPaths && !isolating;
    const nextPathsEnabled = settings.nextPaths && !isolating;
    const stepSizeWarningsEnabled = settings.stepSizeWarnings && !isolating;

    const { previousPaths, nextPaths } = useTimelinePathSamples({
        enabled: ready,
        isPlaying,
        selectedPage,
        pages,
        marcherIds,
        previousPathsEnabled,
        nextPathsEnabled,
        stepSizeWarningsEnabled,
    });
    const paths = useMemo(
        () =>
            ready && marcherIds && fieldProperties
                ? planPathOverlay({
                      marcherIds,
                      previousPaths,
                      nextPaths,
                      previousPathsEnabled,
                      nextPathsEnabled,
                      stepSizeWarningsEnabled,
                      fieldProperties,
                  })
                : null,
        [
            ready,
            marcherIds,
            previousPaths,
            nextPaths,
            previousPathsEnabled,
            nextPathsEnabled,
            stepSizeWarningsEnabled,
            fieldProperties,
        ],
    );

    const { scene, emphasis } = useTimelineFocusScene({
        database: db,
        enabled: ready,
    });
    const theme = fieldProperties?.theme;
    const focus = useMemo(
        () =>
            scene && theme
                ? planFocusOverlay(scene, ghostColorFor(theme), emphasis)
                : null,
        [scene, theme, emphasis],
    );

    // The selected page's collisions
    const { currentCollisions, setCurrentCollision } = useCollisionStore();
    useEffect(() => {
        setCurrentCollision(selectedPage);
    }, [selectedPage, setCurrentCollision]);
    const collisions = useMemo(
        () =>
            !isPlaying && settings.showCollisions && currentCollisions.length
                ? planCollisionOverlay(currentCollisions)
                : null,
        [isPlaying, settings.showCollisions, currentCollisions],
    );

    const dimming = useFieldDimming(ready);
    return { paths, focus, collisions, dimming, ready };
}

/**
 * UI-9: while a move is isolated, the marchers outside it are dimmed, once the
 * resolver is ready. Follows the timeline selection store outside React;
 * `FieldDimming` ignores updates that keep the same members, such as the
 * window moving inside the move.
 */
function useFieldDimming(enabled: boolean): FieldDimming {
    const dimming = useMemo(() => new FieldDimming(), []);
    useEffect(() => {
        const update = () => {
            const isolated = enabled
                ? isolatedTimeline(useTimelineSelectionStore.getState())
                : null;
            dimming.set(isolated?.marcherIds ?? null);
        };
        update();
        return useTimelineSelectionStore.subscribe((state, previous) => {
            if (
                state.isolation !== previous.isolation ||
                state.storedTimelines !== previous.storedTimelines
            )
                update();
        });
    }, [dimming, enabled]);
    return dimming;
}
