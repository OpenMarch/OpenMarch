import { runAction } from "@/shortcuts/registry";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useFieldViewStore, type FieldView } from "@/field/three/fieldView";
import type { BenchmarkKind } from "./frameStats";
import {
    nextFrame,
    SCENARIO_MS,
    ScenarioSkipped,
    type BenchmarkScenario,
} from "./runFieldBenchmark";

const timeline = () => useTimelineSelectionStore.getState();

/** Pauses, and waits until the app has: pausing puts the playhead where playback stopped. */
export async function pausePlayback(isPlaying: () => boolean) {
    if (isPlaying()) runAction("playPause");
    for (let frame = 0; isPlaying() && frame < 120; frame++) await nextFrame();
    await nextFrame();
}

/** Playback from the top of the show; ends early if the show does. */
function playScenario(isPlaying: () => boolean): BenchmarkScenario {
    let playhead = 0;
    return {
        kind: "play",
        start() {
            playhead = timeline().playheadBeat;
            // From the top, so runs on one show compare
            timeline().seek(0);
            if (!isPlaying() && !runAction("playPause"))
                throw new ScenarioSkipped("Play isn't available here");
        },
        // Playback takes a moment to start
        step: (elapsed) => elapsed < 500 || isPlaying(),
        async stop() {
            await pausePlayback(isPlaying);
            timeline().seek(playhead);
        },
    };
}

/** The playhead to the end of the show and back, like a fast scrub. */
function scrubScenario(ms: number): BenchmarkScenario {
    let playhead = 0;
    return {
        kind: "scrub",
        start() {
            playhead = timeline().playheadBeat;
            if (!timeline().showEndBeat)
                throw new ScenarioSkipped("The show has no beats");
            timeline().beginScrub();
        },
        step(elapsed) {
            const phase = (elapsed / ms) * 2;
            const along = phase <= 1 ? phase : 2 - phase;
            timeline().seek(Math.round(along * (timeline().showEndBeat ?? 0)));
        },
        stop() {
            timeline().endScrub();
            timeline().seek(playhead);
        },
    };
}

/**
 * The field's view, as the zoom and pan scenarios move it: read and written
 * directly, past the navigation limits. One per field.
 */
export type BenchmarkView = {
    get(): FieldView;
    set(view: Pick<FieldView, "zoom" | "panX" | "panY">): void;
    /** The element the field's wheel input lands on, once it's up. */
    element(): Element | null;
};

/** The new field's view: its one view store. */
export const threeFieldView = (
    element: () => Element | null,
): BenchmarkView => ({
    get: () => useFieldViewStore.getState(),
    set: (view) => useFieldViewStore.setState(view),
    element,
});

/** A scenario that moves the field's view each frame, then puts it back. */
function viewScenario(
    kind: BenchmarkKind,
    view: BenchmarkView,
    move: (now: FieldView, start: FieldView, elapsed: number) => FieldView,
): BenchmarkScenario {
    let start: FieldView | null = null;
    return {
        kind,
        start() {
            start = { ...view.get() };
        },
        step(elapsed) {
            view.set(move(view.get(), start!, elapsed));
        },
        stop() {
            if (start) view.set(start);
        },
    };
}

/**
 * In to 8× and back out at the center, every 3 s, through the field's own
 * pinch zoom: a Ctrl+wheel event each frame, which the field takes as a
 * pinch in either mouse mode. Each event steers the zoom toward the curve, so
 * the field follows it whatever its zoom speed, and the zoom goes through the
 * same input a user's does.
 */
function zoomScenario(view: BenchmarkView): BenchmarkScenario {
    let start: FieldView | null = null;
    return {
        kind: "zoom",
        start() {
            start = { ...view.get() };
        },
        step(elapsed) {
            const target = view.element();
            if (!target || !start) return;
            const goal =
                start.zoom *
                Math.pow(8, (1 - Math.cos((elapsed / 1500) * Math.PI)) / 2);
            const ratio = Math.log(goal / view.get().zoom);
            const box = target.getBoundingClientRect();
            target.dispatchEvent(
                new WheelEvent("wheel", {
                    deltaY: Math.max(-40, Math.min(40, -ratio * 200)),
                    ctrlKey: true,
                    clientX: box.left + box.width / 2,
                    clientY: box.top + box.height / 2,
                    bubbles: true,
                    cancelable: true,
                }),
            );
        },
        stop() {
            if (start) view.set(start);
        },
    };
}

/** Round and round, a few pixels a frame. */
const panScenario = (view: BenchmarkView) =>
    viewScenario("pan", view, (now, _start, elapsed) => ({
        ...now,
        panX: now.panX + Math.cos(elapsed / 400) * 12,
        panY: now.panY + Math.sin(elapsed / 400) * 6,
    }));

/**
 * The benchmark's scenarios on the open show, as the prototype's: playback,
 * a scrub back and forth across the whole show, a zoom in and out at the
 * center, and a circular pan. Each puts back what it changed.
 *
 * They drive the app the way a user's input does: Play is the Play action and
 * a scrub moves the timeline's playhead. Zoom and pan write the field's view
 * (`view`), the same moves on either field. Dragging marchers isn't measured
 * yet.
 */
export function fieldBenchmarkScenarios({
    isPlaying,
    view,
    ms = SCENARIO_MS,
}: {
    /** Whether the app is playing now. */
    isPlaying: () => boolean;
    view: BenchmarkView;
    ms?: number;
}): Record<BenchmarkKind, BenchmarkScenario> {
    return {
        play: playScenario(isPlaying),
        scrub: scrubScenario(ms),
        zoom: zoomScenario(view),
        pan: panScenario(view),
        drag: {
            kind: "drag",
            // Not measured yet: select all and drag them in a circle with real pointer
            // input, as the prototype's `bench("drag")`, then undo
            start() {
                throw new ScenarioSkipped("not measured yet");
            },
            step: () => false,
            stop() {},
        },
    };
}
