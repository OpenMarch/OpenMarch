import { useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import type { FieldProperties, Resolver } from "@openmarch/core";
import type Page from "@/global/classes/Page";
import { db } from "@/global/database/db";
import type { MarkerShape } from "@/field/markerShape";
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
import {
    marcherDecided,
    marksByMarcher,
    notDefinedAt,
    type DecidedStretch,
} from "@/timeline/timelineDecided";
import { useHeldMarksStore } from "@/timeline/useHeldMarks";
import { carriedMembers } from "@/timeline/timelineCarried";
import {
    placedBoxesAt,
    usePlacedBoxStore,
} from "@/shapes/placed/placedBoxStore";
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
import { FieldNotDefined } from "./fieldNotDefined";

/**
 * Everything the timeline draws on the field (fork #201): the selected page's
 * next pathways, midpoints, endpoints and step-size warnings
 * (`useTimelinePathSamples`), an isolated move's focus scene
 * (`useTimelineFocusScene`, which also publishes the isolation plan the
 * playhead driver draws members at), collision markers (`useCollisionStore`),
 * who's dimmed, and who's Not defined and off a keyframe (#478). `hiddenIds`, the edited shape's
 * marchers while it's seen on its own (#558), drop out of all of it: no dot,
 * label, path or collision mark. Plans change on page changes,
 * edits and setting changes, never per frame; dimming and the decided look
 * go to the layers through {@link FieldDimming} and {@link FieldNotDefined},
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
    shapeOf,
}: {
    isPlaying: boolean;
    selectedPage: Page | null;
    pages: readonly Page[];
    marcherIds: readonly number[] | undefined;
    fieldProperties: FieldProperties | undefined;
    hiddenIds?: ReadonlySet<number> | null;
    /** Each marcher's shape, for isolation's marks of where marchers are */
    shapeOf?: (marcherId: number) => MarkerShape;
}): {
    paths: OverlayPlan | null;
    focus: OverlayPlan | null;
    collisions: OverlayPlan | null;
    dimming: FieldDimming;
    look: FieldNotDefined;
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
                ? planFocusOverlay(
                      scene,
                      ghostColorFor(theme),
                      emphasis,
                      shapeOf,
                  )
                : null,
        [scene, theme, emphasis, shapeOf],
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
    const look = useFieldDecidedLook(ready, isPlaying);
    return { paths, focus, collisions, dimming, look, ready };
}

/**
 * UI-9: while a move is isolated, the marchers outside it are dimmed, once the
 * resolver is ready. Follows the store outside React; `FieldDimming` ignores updates that keep the same members, such as
 * the window moving inside the move.
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
        const unsubscribes = [
            useTimelineSelectionStore.subscribe((state, previous) => {
                if (
                    state.isolation !== previous.isolation ||
                    state.storedTimelines !== previous.storedTimelines
                )
                    update();
            }),
        ];
        return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    }, [dimming, enabled]);
    return dimming;
}

/**
 * #478 (holds decisions 8 and 9): while paused or scrubbing, the marchers whose position nothing
 * decides on the count shown are Not defined, drawn with a dashed edge; walking, Held, arriving
 * and carried shape members are solid (`timelineDecided.ts`). Labels are bold only on a keyframe,
 * the count a marcher's own coordinate is set (`marcherSetBeats`). Playing, everyone is solid and
 * bold.
 *
 * Each marcher's Set beats and decided stretches are worked out once per resolver version and set
 * of Held marks, so a playhead move only looks them up; the carried shapes are read per count,
 * only when someone would otherwise be Not defined. `FieldNotDefined` redraws only when the look
 * changes. Stopping eases the look in (#302), unless the system asks for reduced motion. The
 * count is the one the field draws (`fieldBeat`), so a dragged start flag (UI-26) shows its own.
 */
function useFieldDecidedLook(
    ready: boolean,
    isPlaying: boolean,
): FieldNotDefined {
    const look = useMemo(() => new FieldNotDefined(), []);
    const played = useRef(false);
    const enabled = ready && !isPlaying;
    useEffect(() => {
        if (!enabled) {
            if (isPlaying) played.current = true;
            look.set(null);
            return;
        }
        // Only the first look after playback eases in; later ones are instant
        let ease = played.current && !prefersReducedMotion();
        played.current = false;
        let read: DecidedRead | null = null;
        const update = () => {
            const { resolver, version } = useTimelineResolverStore.getState();
            if (!resolver) {
                look.set(null);
                return;
            }
            // The Held marks are read after each resolver version (`useHeldMarksHost`): until
            // they arrive, keep the look as it is, so a Held marcher doesn't flash Not defined
            // (after Hold from last keyframe, undo, redo or opening a file)
            if (useHeldMarksStore.getState().version !== version) return;
            read ??= readDecided(resolver);
            const beat = fieldBeat(useTimelineSelectionStore.getState());
            look.set(
                {
                    notDefined: notDefinedAt(read.decided, beat, () =>
                        carriedAt(beat),
                    ),
                    offKeyframe: followingAt(read.setBeats, beat),
                },
                { ease },
            );
            ease = false;
        };
        // Called inside the stores' writes: a failed update mustn't stop their other listeners
        const safely = (fresh: boolean) => {
            if (fresh) read = null;
            try {
                update();
            } catch (error) {
                console.error("Error finding the Not defined marchers", error);
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
            useHeldMarksStore.subscribe((state, previous) => {
                if (
                    state.marks !== previous.marks ||
                    state.version !== previous.version
                )
                    safely(true);
            }),
            usePlacedBoxStore.subscribe((state, previous) => {
                if (
                    state.recipes !== previous.recipes ||
                    state.ends !== previous.ends
                )
                    safely(false);
            }),
            useTimelineSelectionStore.subscribe((state, previous) => {
                if (fieldBeat(state) !== fieldBeat(previous)) safely(false);
            }),
        ];
        return () => {
            for (const unsubscribe of unsubscribes) unsubscribe();
        };
    }, [look, enabled, isPlaying]);
    return look;
}

/** Each marcher's Set beats and decided stretches, worked out once per resolver version and marks. */
type DecidedRead = {
    readonly setBeats: ReadonlyMap<number, readonly number[]>;
    readonly decided: ReadonlyMap<number, readonly DecidedStretch[]>;
};

function readDecided(resolver: Resolver): DecidedRead {
    const marks = marksByMarcher(useHeldMarksStore.getState().marks);
    const setBeats = new Map<number, readonly number[]>();
    const decided = new Map<number, readonly DecidedStretch[]>();
    for (const id of resolver.marcherIds()) {
        const spans = resolverSpans(resolver, id);
        setBeats.set(id, marcherSetBeats(spans));
        decided.set(id, marcherDecided(spans, marks.get(id) ?? []));
    }
    return { setBeats, decided };
}

/**
 * The members of the shapes carried onto `beat` (`placedBoxesAt`): a shape carried onto later pages
 * is the shape's hold (owner, 2026-11-01 on #477), so they draw decided.
 */
function carriedAt(beat: number): Set<number> {
    return carriedMembers(placedBoxesAt(beat));
}

const prefersReducedMotion = () =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
