import { usePreviewModeStore } from "@/stores/PreviewModeStore";
import { useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import type { FieldProperties } from "@openmarch/core";
import type Page from "@/global/classes/Page";
import { db } from "@/global/database/db";
import { useCollisionStore } from "@/stores/CollisionStore";
import {
    fieldBeat,
    isolatedTimeline,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import {
    resolverSpans,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import { followingAt, marcherSetBeats } from "@/timeline/timelineSetFollowing";
import { useKeptAssignmentsStore } from "@/timeline/useKeepLaterPages";
import { useTimelineFocusScene } from "@/timeline/useTimelineFocusScene";
import { ghostColorFor } from "@/timeline/useTimelineFocusScene";
import { useTimelinePathSamples } from "@/timeline/useTimelinePathSamples";
import {
    planCollisionOverlay,
    planFocusOverlay,
    planPathOverlay,
    type OverlayPlan,
} from "@/field/timelineOverlays";
import { useVisualsStore } from "@/stores/VisualsStore";
import {
    isVisualsView,
    useWorkspaceViewStore,
} from "@/stores/WorkspaceViewStore";
import { useEditorModeStore } from "@/stores/EditorModeStore";
import { FieldDimming } from "./fieldDimming";
import { FieldFollowing } from "./fieldFollowing";

/**
 * Everything the timeline draws on the field (fork #201): the selected page's
 * next pathways, midpoints, endpoints and step-size warnings
 * (`useTimelinePathSamples`), an isolated move's focus scene
 * (`useTimelineFocusScene`, which also publishes the isolation plan the
 * playhead driver draws members at), collision markers (`useCollisionStore`),
 * who's dimmed, and who's Following (#300). `hiddenIds`, the edited shape's
 * marchers while it's seen on its own (#558), drop out of all of it: no dot,
 * label, path or collision mark. Plans change on page changes,
 * edits and setting changes, never per frame; dimming and the Following look
 * go to the layers through {@link FieldDimming} and {@link FieldFollowing},
 * outside React.
 */
// eslint-disable-next-line max-lines-per-function
export function useTimelineVisuals({
    isPlaying,
    selectedPage,
    pages,
    marcherIds,
    fieldProperties,
    hiddenIds = null,
}: {
    isPlaying: boolean;
    selectedPage: Page | null;
    pages: readonly Page[];
    marcherIds: readonly number[] | undefined;
    fieldProperties: FieldProperties | undefined;
    hiddenIds?: ReadonlySet<number> | null;
}): {
    paths: OverlayPlan | null;
    focus: OverlayPlan | null;
    collisions: OverlayPlan | null;
    dimming: FieldDimming;
    following: FieldFollowing;
    /** Whether the resolver is ready: the timeline draws nothing before. */
    ready: boolean;
} {
    // Drawn from the resolver only once it's ready
    const ready = useTimelineResolverStore((s) => s.status === "ready");
    const settings = useUiSettingsStore(
        useShallow((s) => ({
            nextPaths: s.uiSettings.nextPaths,
            stepSizeWarnings: s.uiSettings.stepSizeWarnings,
            showCollisions: s.uiSettings.showCollisions,
        })),
    );
    // Isolation's own paths and ghosts replace the page's paths
    const isolating = useTimelineSelectionStore((s) => s.isolation !== null);
    const nextPathsEnabled = settings.nextPaths && !isolating;
    const stepSizeWarningsEnabled = settings.stepSizeWarnings && !isolating;

    const { nextPaths } = useTimelinePathSamples({
        enabled: ready,
        isPlaying,
        selectedPage,
        pages,
        marcherIds,
        nextPathsEnabled,
        stepSizeWarningsEnabled,
    });
    const paths = useMemo(
        () =>
            ready && marcherIds && fieldProperties
                ? planPathOverlay({
                      marcherIds: hiddenIds
                          ? marcherIds.filter((id) => !hiddenIds.has(id))
                          : marcherIds,
                      nextPaths,
                      nextPathsEnabled,
                      stepSizeWarningsEnabled,
                      fieldProperties,
                  })
                : null,
        [
            ready,
            marcherIds,
            nextPaths,
            nextPathsEnabled,
            stepSizeWarningsEnabled,
            fieldProperties,
            hiddenIds,
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
    const collisions = useMemo(() => {
        const shown = hiddenIds
            ? currentCollisions.filter(
                  (c) =>
                      !hiddenIds.has(c.marcher1Id) &&
                      !hiddenIds.has(c.marcher2Id),
              )
            : currentCollisions;
        return !isPlaying && settings.showCollisions && shown.length
            ? planCollisionOverlay(shown)
            : null;
    }, [isPlaying, settings.showCollisions, currentCollisions, hiddenIds]);

    const dimming = useFieldDimming(ready);
    useEffect(() => dimming.setHidden(hiddenIds), [dimming, hiddenIds]);
    const following = useFieldFollowing(ready, isPlaying);
    return { paths, focus, collisions, dimming, following, ready };
}

/**
 * UI-9: while a move is isolated, the marchers outside it are dimmed, once the
 * resolver is ready. In Visuals mode a focused who does the same, ahead of
 * any isolation (performer-behavior.md section 7.1); dimmed marchers stay
 * selectable there, since the selection is a who. Follows the stores outside
 * React; `FieldDimming` ignores updates that keep the same members, such as
 * the window moving inside the move.
 */
function useFieldDimming(enabled: boolean): FieldDimming {
    const dimming = useMemo(() => new FieldDimming(), []);
    useEffect(() => {
        const update = () => {
            const focused = isVisualsView()
                ? useVisualsStore.getState().focusMarcherIds
                : null;
            if (focused) {
                dimming.set(focused);
                return;
            }
            const isolated = enabled
                ? isolatedTimeline(useTimelineSelectionStore.getState())
                : null;
            dimming.set(isolated?.marcherIds ?? null);
        };
        update();
        const unsubscribes = [
            useTimelineSelectionStore.subscribe((state, previous) => {
                if (
                    state.isolation !== previous.isolation ||
                    state.storedTimelines !== previous.storedTimelines
                )
                    update();
            }),
            useVisualsStore.subscribe((state, previous) => {
                if (state.focusMarcherIds !== previous.focusMarcherIds)
                    update();
            }),
            useWorkspaceViewStore.subscribe(update),
            useEditorModeStore.subscribe(update),
            usePreviewModeStore.subscribe(update),
        ];
        return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    }, [dimming, enabled]);
    return dimming;
}

/**
 * #300: while paused or scrubbing, the marchers with no coordinate of their
 * own on the count shown are Following, drawn with a dashed edge; playing, nobody is. Each
 * marcher's Set beats are worked out once per resolver version and kept
 * markers, so a playhead move only looks them up, and `FieldFollowing`
 * redraws only when who's Following changes. Stopping eases the dashes in
 * (#302), unless the system asks for reduced motion. The count is the one the
 * field draws (`fieldBeat`), so a dragged start flag (UI-26) shows its own.
 */
function useFieldFollowing(ready: boolean, isPlaying: boolean): FieldFollowing {
    const following = useMemo(() => new FieldFollowing(), []);
    const played = useRef(false);
    const enabled = ready && !isPlaying;
    useEffect(() => {
        if (!enabled) {
            if (isPlaying) played.current = true;
            following.set(null);
            return;
        }
        // Only the first look after playback eases in; later ones are instant
        let ease = played.current && !prefersReducedMotion();
        played.current = false;
        let setBeats: Map<number, readonly number[]> | null = null;
        const update = () => {
            const { resolver } = useTimelineResolverStore.getState();
            if (!resolver) {
                following.set(null);
                return;
            }
            if (!setBeats) {
                const kept = useKeptAssignmentsStore.getState().ids;
                setBeats = new Map(
                    resolver
                        .marcherIds()
                        .map((id) => [
                            id,
                            marcherSetBeats(resolverSpans(resolver, id), kept),
                        ]),
                );
            }
            following.set(
                followingAt(
                    setBeats,
                    fieldBeat(useTimelineSelectionStore.getState()),
                ),
                { ease },
            );
            ease = false;
        };
        // Called inside the stores' writes: a failed update mustn't stop their other listeners
        const safely = (fresh: boolean) => {
            if (fresh) setBeats = null;
            try {
                update();
            } catch (error) {
                console.error("Error finding the Following marchers", error);
            }
        };
        safely(true);
        const unsubscribes = [
            useTimelineResolverStore.subscribe((state, previous) => {
                if (
                    state.version !== previous.version ||
                    state.resolver !== previous.resolver
                )
                    safely(true);
            }),
            useKeptAssignmentsStore.subscribe((state, previous) => {
                if (state.ids !== previous.ids) safely(true);
            }),
            useTimelineSelectionStore.subscribe((state, previous) => {
                if (fieldBeat(state) !== fieldBeat(previous)) safely(false);
            }),
        ];
        return () => {
            for (const unsubscribe of unsubscribes) unsubscribe();
        };
    }, [following, enabled, isPlaying]);
    return following;
}

const prefersReducedMotion = () =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
