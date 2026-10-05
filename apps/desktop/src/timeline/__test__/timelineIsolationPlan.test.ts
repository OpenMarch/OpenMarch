import { afterEach, describe, expect, it } from "vitest";
import { createResolver, type TimelineSnapshot } from "@openmarch/core";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { atIsolatedEnd, planCanvasEdit } from "../timelineCoordinateWrites";
import { useTimelineResolverStore } from "../timelineStore";
import {
    applyIsolationPlan,
    editingPositionAt,
    useIsolationPlanStore,
    type IsolationPlan,
} from "../timelineIsolationPlan";

/** Marcher 1 moves to (0, 160) over [0, 16); marcher 2 holds at (50, 50). */
const snapshot = (): TimelineSnapshot => ({
    marchers: [
        { id: 1, home: [0, 0] },
        { id: 2, home: [50, 50] },
    ],
    shapes: {},
    transitions: {
        1: {
            id: 1,
            start: 0,
            end: 16,
            dest: null,
            points: [[0, 160]],
            slots: 1,
            style: "direct",
            order: "slot",
            params: null,
        },
    },
    assignments: [
        {
            id: 1,
            marcher: 1,
            transition: 1,
            slot: 0,
            start: 0,
            end: 16,
            layer: 0,
        },
    ],
});

const plan = (): IsolationPlan => ({
    timelineId: 7,
    plan: createResolver(snapshot()),
    members: new Set([1]),
});

/** A "real show" where marcher 1 stays home, as if another move had taken it */
const real = {
    positionAt: (id: number) => (id === 1 ? [0, 0] : [50, 50]) as const,
};

describe("isolation plan (docs/timeline/research/ownership/09-isolation.md)", () => {
    afterEach(() => {
        useTimelineSelectionStore.getState().reset();
        useIsolationPlanStore.getState().set(null);
        useTimelineResolverStore.setState({ resolver: null });
    });

    const ISOLATION = {
        timelineId: 7,
        start: 0,
        end: 16,
        restore: { startBeat: 0, startPinned: false, playheadBeat: 0 },
    };

    it("members are drawn and edited at the plan; others at the real show", () => {
        expect(editingPositionAt(real, 1, 16, plan())).toEqual([0, 160]);
        expect(editingPositionAt(real, 2, 16, plan())).toEqual([50, 50]);
        expect(editingPositionAt(real, 1, 16, null)).toEqual([0, 0]);
        const positions = new Float64Array([0, 0, 50, 50]);
        applyIsolationPlan(positions, [1, 2], 8, plan());
        expect([...positions]).toEqual([0, 80, 50, 50]);
    });

    it("isolation edits the isolated timeline's end, stolen members included", () => {
        useIsolationPlanStore.getState().set(plan());
        expect(
            planCanvasEdit({
                selection: { kind: "range", start: 4, end: 9 },
                isolation: {
                    timelineId: 7,
                    start: 1,
                    end: 17,
                    restore: {
                        startBeat: 0,
                        startPinned: false,
                        playheadBeat: 0,
                    },
                },
            }),
        ).toEqual({
            ok: true,
            target: { kind: "timeline", timelineId: 7, ghosts: true },
            beat: 17,
        });
    });

    it("refuses edits while the isolated plan isn't loaded (review: isolation 3)", () => {
        const result = planCanvasEdit({
            selection: { kind: "range", start: 0, end: 16 },
            isolation: ISOLATION,
        });
        expect(result.ok).toBe(false);
    });

    it("a canvas drop mid-move lands at the move's end by the same offset (review: isolation 1)", () => {
        useIsolationPlanStore.getState().set(plan());
        useTimelineResolverStore.setState({
            resolver: createResolver(snapshot()),
        });
        useTimelineSelectionStore.setState({
            isolation: ISOLATION,
            playheadBeat: 8,
        });
        // Marcher 1 is drawn at (0, 80) at beat 8 and dropped 5 to the right
        expect(atIsolatedEnd([{ marcher_id: 1, x: 5, y: 80 }])).toEqual([
            { marcher_id: 1, x: 5, y: 160 },
        ]);
        // At the end, a drop is written as it is
        useTimelineSelectionStore.setState({ playheadBeat: 16 });
        expect(atIsolatedEnd([{ marcher_id: 1, x: 5, y: 80 }])).toEqual([
            { marcher_id: 1, x: 5, y: 80 },
        ]);
    });
});
