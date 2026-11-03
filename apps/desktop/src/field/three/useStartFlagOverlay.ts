import { useEffect, useMemo, useRef } from "react";
import type { FieldProperties, Resolver } from "@openmarch/core";
import {
    useStartFlagKeyStore,
    useStartFlagLevelsInEffect,
} from "@/stores/StartFlagKeyStore";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useIsVisualsView } from "@/stores/WorkspaceViewStore";
import {
    startFlagLevelsDrawAnything,
    type StartFlagLevels,
} from "@/timeline/startFlagLevels";
import { marcherSetBeats } from "@/timeline/timelineSetFollowing";
import {
    resolverSpans,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import {
    levelDraws,
    planStartFlagMarcher,
    startFlagOverlayOf,
    type StartFlagMarcherPlan,
    type StartFlagOverlay,
    type StartFlagWindow,
} from "@/field/startFlagOverlay";

const sameDeps = (a: readonly unknown[], b: readonly unknown[] | null) =>
    b !== null &&
    a.length === b.length &&
    a.every((d, i) => Object.is(d, b[i]));

/**
 * Each marcher's dot (and route, with its squares) kept per resolver version, window and
 * warnings, so changing the selection or the levels only samples the marchers that weren't
 * sampled yet. A marcher's Set beats (for its route squares) are kept per resolver version, so
 * moving the window doesn't work them out again.
 */
class StartFlagPieces {
    private context: readonly unknown[] | null = null;
    private readonly pieces = new Map<string, StartFlagMarcherPlan | null>();
    private setBeatsContext: readonly unknown[] | null = null;
    private readonly setBeats = new Map<number, readonly number[]>();

    plan(input: {
        window: StartFlagWindow & { readonly resolver: Resolver };
        version: number;
        marcherIds: readonly number[];
        selectedIds: ReadonlySet<number>;
        levels: StartFlagLevels;
        /** Dots only: no route is sampled (a scrub or a line drag) */
        dotsOnly: boolean;
    }): StartFlagOverlay {
        const { window, levels, selectedIds } = input;
        const setBeatsContext = [window.resolver, input.version];
        if (!sameDeps(setBeatsContext, this.setBeatsContext)) {
            this.setBeats.clear();
            this.setBeatsContext = setBeatsContext;
        }
        const context = [
            ...setBeatsContext,
            window.fromBeat,
            window.toBeat,
            window.stepSizeWarnings,
            window.fieldProperties,
        ];
        if (!sameDeps(context, this.context)) {
            this.pieces.clear();
            this.context = context;
        }
        const marchers: StartFlagMarcherPlan[] = [];
        for (const marcherId of input.marcherIds) {
            if (!levelDraws(levels.dots, marcherId, selectedIds)) continue;
            // Paths are never drawn wider than dots
            const withPath =
                !input.dotsOnly &&
                levelDraws(levels.paths, marcherId, selectedIds);
            // Squares only on a selected marcher's route
            const squares = withPath && selectedIds.has(marcherId);
            const key = `${withPath ? "path" : "dot"}${squares ? "+squares" : ""}:${marcherId}`;
            let piece = this.pieces.get(key);
            if (piece === undefined) {
                piece = planStartFlagMarcher(
                    window,
                    marcherId,
                    withPath,
                    squares ? this.setBeatsOf(window, marcherId) : null,
                );
                this.pieces.set(key, piece);
            }
            if (piece) marchers.push(piece);
        }
        return startFlagOverlayOf(marchers);
    }

    private setBeatsOf(
        { resolver }: { readonly resolver: Resolver },
        marcherId: number,
    ): readonly number[] {
        let beats = this.setBeats.get(marcherId);
        if (!beats) {
            beats = marcherSetBeats(resolverSpans(resolver, marcherId));
            this.setBeats.set(marcherId, beats);
        }
        return beats;
    }
}

/**
 * The window from the start flag to the beat the canvas shows (the cursor, else the playhead),
 * whether there is a range at all (not home), and whether a scrub or line drag is under way.
 */
function useStartFlagWindow() {
    const inRange = useTimelineSelectionStore(
        (s) => s.selection.kind === "range",
    );
    const fromBeat = useTimelineSelectionStore((s) => s.startBeat);
    const toBeat = useTimelineSelectionStore(displayedBeat);
    const gesture = useTimelineSelectionStore(
        (s) => s.scrubbing || s.lineDrag !== null,
    );
    return { inRange, fromBeat, toBeat, gesture };
}

/**
 * Start flag positions on the field (fork #331): the dots and paths plans for the edit window at
 * the levels in effect (`useStartFlagLevelsInEffect`), or `null` when nothing is drawn: every
 * level off, isolating (isolation draws its own route and ghosts), the Visuals workspace, at home,
 * before the resolver is ready, or when the beat the canvas shows isn't after the start flag.
 *
 * The window runs from the start flag to the beat the canvas shows: the cursor (a held preview
 * frame or a paused cursor) when there is one, otherwise the playhead.
 *
 * Cost: nothing is sampled while the levels are off. Each marcher's dot and route are kept per
 * resolver version, window and step-size warnings, so selection and level changes only sample
 * marchers not sampled yet. While the playhead is scrubbed or a line (the start flag or the
 * playhead) is dragged, only dots are drawn, so no route is sampled per step; the paths come back
 * on release. Nothing is sampled while playing: the last plans stay, at the start flag, as
 * marchers leave it.
 *
 * Publishes whether anything is drawn (`useStartFlagKeyStore`'s `drawn`), so the transport's
 * button lights exactly when the field shows something.
 */
export function useStartFlagOverlay({
    enabled,
    isPlaying,
    marcherIds,
    selectedIds,
    fieldProperties,
}: {
    /** The resolver is ready */
    enabled: boolean;
    isPlaying: boolean;
    marcherIds: readonly number[] | undefined;
    selectedIds: readonly number[];
    fieldProperties: FieldProperties | undefined;
}): StartFlagOverlay | null {
    const resolver = useTimelineResolverStore((s) => s.resolver);
    const version = useTimelineResolverStore((s) => s.version);
    const { inRange, fromBeat, toBeat, gesture } = useStartFlagWindow();
    const isolating = useTimelineSelectionStore((s) => s.isolation !== null);
    const visuals = useIsVisualsView();
    const levels = useStartFlagLevelsInEffect();
    const stepSizeWarnings = useUiSettingsStore(
        (s) => s.uiSettings.stepSizeWarnings,
    );
    const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
    const pieces = useMemo(() => new StartFlagPieces(), []);
    const last = useRef<StartFlagOverlay | null>(null);

    const shown =
        enabled &&
        !isolating &&
        !visuals &&
        startFlagLevelsDrawAnything(levels) &&
        inRange &&
        resolver !== null &&
        marcherIds !== undefined &&
        fieldProperties !== undefined;

    const plan = useMemo(
        () =>
            // Nothing when the canvas shows a beat at or before the start flag
            shown && !isPlaying && toBeat > fromBeat
                ? pieces.plan({
                      window: {
                          resolver: resolver!,
                          fromBeat,
                          toBeat,
                          stepSizeWarnings,
                          fieldProperties: fieldProperties!,
                      },
                      version,
                      marcherIds: marcherIds!,
                      selectedIds: selected,
                      levels,
                      dotsOnly: gesture,
                  })
                : null,
        [
            shown,
            isPlaying,
            pieces,
            resolver,
            version,
            marcherIds,
            selected,
            fromBeat,
            toBeat,
            levels,
            gesture,
            stepSizeWarnings,
            fieldProperties,
        ],
    );
    let drawnPlan: StartFlagOverlay | null;
    if (!shown) drawnPlan = last.current = null;
    // While playing the plans from before Play stay, wherever playback put the cursor
    else if (isPlaying) drawnPlan = last.current;
    else drawnPlan = last.current = plan;
    usePublishDrawn(drawnPlan);
    return drawnPlan;
}

/** Tells the transport's button whether the field draws anything (`useStartFlagKeyStore`). */
function usePublishDrawn(plans: StartFlagOverlay | null) {
    const drawn =
        plans !== null &&
        (plans.dots.dots.length > 0 || plans.paths.strokes.length > 0);
    useEffect(() => {
        useStartFlagKeyStore.getState().setDrawn(drawn);
    }, [drawn]);
    useEffect(() => () => useStartFlagKeyStore.getState().setDrawn(false), []);
}
