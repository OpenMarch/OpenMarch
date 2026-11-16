import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { FieldDimming } from "@/field/three/fieldDimming";
import { useShapeFocus } from "@/shapes/field/useShapeFocus";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { FieldPointer } from "@/field/editor/fieldEditor";
import { setShapeField } from "@/shapes/field/shapeField";
import {
    planTrailDrag,
    trailDragPreview,
} from "@/db-functions/timelineTrailDrag";
import { drawingOf, pathPenMode } from "../pathPenMode";
import {
    clearPath,
    setPointer,
    shapeOf,
    usePathPenStore,
    type PathSession,
} from "../pathPenStore";
import type { PathTarget } from "../pathTarget";
import {
    cancelFollowDrawing,
    evenLimitOf,
    followDrawnPlanOf,
    followHit,
    followMarchersOf,
    followPlanOf,
    followPreviewProgress,
    FOLLOW_PREVIEW_LOOP,
    setFollowPreview,
    followSpacingOf,
    setFollowEnds,
    setFollowSpacing,
    trailLine,
    type FollowDrag,
    type FollowKeep,
    followFootprint,
} from "../followDrag";
import { bigSteps, trailDistances } from "../PathEditor";
import { curveOf } from "../pathEdit";
import { useFollowFocus } from "../useFollowFocus";

/**
 * The Follow tool on the field (pathways step 4b, spec Appendix L): the selected line's ends
 * pulse, a middle marcher takes no press, a press-drag on an end draws the first leg with that end
 * leading, the end spots shown are AP-T8's, and Escape cancels the drawing, then leaves.
 */

const fieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const STEP = fieldProperties.pixelsPerStep;
const ZOOM = 2;
const X0 = 40 * STEP;
const Y0 = 30 * STEP;

/** Five marchers in a level line two steps apart, ids 1 to 5 from the left */
const starts = new Map(
    [1, 2, 3, 4, 5].map((id, i) => [id, { x: X0 + 2 * i * STEP, y: Y0 }]),
);

const at = (x: number, y: number): FieldPointer => ({
    field: { x, y },
    screen: { x: x * ZOOM, y: y * ZOOM },
    button: 0,
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    kind: "mouse",
});

/** Keep end spots' move (AP-T9): [9, 17), everyone 20 steps right of where they start */
const KEEP: FollowKeep = {
    timelineId: 7,
    start: 9,
    end: 17,
    spots: new Map(
        [...starts].map(([id, p]) => [id, { x: p.x + 20 * STEP, y: p.y }]),
    ),
};

function open(keep: FollowKeep | null = null, from = starts) {
    const follow: FollowDrag = {
        window: { start: 9, end: 17 },
        ids: [1, 2, 3, 4, 5],
        order: [1, 2, 3, 4, 5],
        starts: from,
        grabbed: null,
        spacing: { kind: "keep" },
        ends: "trail",
        keep,
        step: STEP,
    };
    const members = follow.order.map((id) => ({
        marcherId: id,
        drill: `T${id}`,
        from: from.get(id)!,
        to: from.get(id)!,
    }));
    const target: PathTarget = {
        timelineId: -1,
        transitionId: -1,
        marcherId: 5,
        start: 9,
        end: 17,
        from: from.get(5)!,
        to: from.get(5)!,
        routeId: null,
        points: [],
        ends: null,
        group: null,
        trail: { members, leaderId: 5, reverse: false },
    };
    usePathPenStore.setState({
        session: {
            phase: "drawing",
            target,
            drill: "5",
            points: [],
            pointer: null,
            selected: null,
            dragging: null,
            object: false,
            byRoute: false,
            follow,
        },
    });
}

const session = (): PathSession => usePathPenStore.getState().session!;
const press = { isMac: false, reachesInside: () => true, onDot: () => true };

/** A press on `from`, a drag to `to`, and the release */
function drag(from: { x: number; y: number }, to: { x: number; y: number }) {
    pathPenMode.press(at(from.x, from.y), press);
    pathPenMode.move(at((from.x + to.x) / 2, (from.y + to.y) / 2));
    pathPenMode.move(at(to.x, to.y));
    pathPenMode.release(at(to.x, to.y), null);
}

beforeEach(() => {
    setShapeField({
        fieldProperties: () => fieldProperties,
        zoom: () => ZOOM,
        marchers: () => [],
        drawn: () => new Map(),
    });
});

afterEach(() => {
    clearPath();
    setShapeField(null);
});

describe("the Follow tool (pathways step 4b)", () => {
    it("rings on everyone, the two ends pulsing; nothing else is drawn until an end is pressed", () => {
        open();
        const d = drawingOf(session())!;
        expect(d.memberRings!.map((r) => r.pulse ?? false)).toEqual([
            true,
            false,
            false,
            false,
            true,
        ]);
        expect(d.outline).toBeNull();
        expect(d.spots).toEqual([]);
        expect(pathPenMode.cursorAt(at(X0, Y0))).toBe("grab");
        expect(pathPenMode.cursorAt(at(X0 + 4 * STEP, Y0))).toBe("default");
    });

    it("a middle marcher, or the empty field, takes no press (DL-4)", () => {
        open();
        drag(
            { x: X0 + 4 * STEP, y: Y0 },
            { x: X0 + 4 * STEP, y: Y0 + 10 * STEP },
        );
        drag({ x: X0, y: Y0 + 20 * STEP }, { x: X0 + 9 * STEP, y: Y0 + 20 * STEP }); // prettier-ignore
        expect(session().follow!.grabbed).toBeNull();
        expect(session().points).toEqual([]);
    });

    it("a press-drag on the left end makes it the leader and draws the first leg; clicks add corners", () => {
        open();
        const left = starts.get(1)!;
        drag(left, { x: left.x, y: left.y + 10 * STEP });
        const s = session();
        expect(s.follow!.grabbed).toBe(1);
        expect(trailLine(s.follow!)).toEqual([5, 4, 3, 2, 1]);
        expect(s.target.trail!.leaderId).toBe(1);
        expect(s.target.from).toEqual(left);
        // landed as a Path pen point is (on the grid or a field line), near the drag's end
        expect(s.points).toHaveLength(1);
        expect(s.points[0]!.at.x).toBeCloseTo(left.x, 6);
        expect(Math.abs(s.points[0]!.at.y - (left.y + 10 * STEP))).toBeLessThan(
            STEP,
        );
        // a click adds a corner, as the Path pen does
        pathPenMode.press(at(left.x - 6 * STEP, left.y + 10 * STEP), press);
        pathPenMode.release(at(left.x - 6 * STEP, left.y + 10 * STEP), null);
        expect(session().points).toHaveLength(2);
        expect(shapeOf(session()).to).toEqual(session().points[1]!.at);
    });

    it("the end spots shown are AP-T8's, P(e_q); Even is held to its limit; Big steps reads each member's own way", () => {
        open();
        const right = starts.get(5)!;
        drag(right, { x: right.x + 10 * STEP, y: right.y });
        const s = session();
        const plan = followPlanOf(s)!;
        const end = s.points[0]!.at;
        const line = [1, 2, 3, 4, 5].map((id): [number, number] => [starts.get(id)!.x, starts.get(id)!.y]); // prettier-ignore
        const fresh = planTrailDrag(line, [{ at: [end.x, end.y] }], { kind: "keep" }, STEP); // prettier-ignore
        expect(plan.spots).toEqual(fresh.spots);
        expect(plan.ends).toEqual(fresh.ends);
        expect(plan.startDist).toEqual(fresh.startDist);
        const d = drawingOf(s)!;
        expect(d.spots).toEqual(plan.spots.map(([x, y]) => ({ x, y })));
        // Keep spacing: everyone as far on as the trail is long, 2 steps apart along the way
        const W = plan.drawn;
        d.spots.forEach((p, q) => {
            const want = plan.way.at(2 * q * STEP + W);
            expect(p.x).toBeCloseTo(want[0], 6);
            expect(p.y).toBeCloseTo(want[1], 6);
        });
        // Even's limit: the tail's (8 steps + W) / 4
        expect(evenLimitOf(plan)).toBe(
            Math.floor((8 * STEP + W) / (4 * STEP) / 0.5 + 1e-9) * 0.5,
        );
        setFollowSpacing({ kind: "even", steps: 1 });
        const even = drawingOf(session())!.spots;
        expect(
            Math.hypot(even[4]!.x - even[3]!.x, even[4]!.y - even[3]!.y),
        ).toBeCloseTo(STEP, 6);
        // 10 steps in 8 counts is no Big step for anyone; each walks the same 10 steps
        expect(bigSteps(session(), fieldProperties)).toBeNull();
    });

    it("step 4c (DL-16, DL-17, QA-DL-15): the real marchers stand at the spots written, their starts as ghosts; ▶ Preview walks them as they will walk", () => {
        open();
        const right = starts.get(5)!;
        // Nothing drawn yet: the line is drawn once, its real marchers at the start flag (step 4d)
        const before = drawingOf(session())!;
        expect(before.marchersAt).toEqual({
            ids: [1, 2, 3, 4, 5],
            spots: [1, 2, 3, 4, 5].map((id) => starts.get(id)),
        });
        expect(before.rings).toEqual([]);
        drag(right, { x: right.x + 10 * STEP, y: right.y });
        pathPenMode.move(at(right.x + 10 * STEP, right.y - 6 * STEP));
        pathPenMode.press(at(right.x + 10 * STEP, right.y - 6 * STEP), press);
        pathPenMode.release(at(right.x + 10 * STEP, right.y - 6 * STEP), {
            double: false,
            ownFirst: false,
        });
        const s = session();
        const plan = followPlanOf(s)!;
        const d = drawingOf(s)!;
        const line = trailLine(s.follow!);
        expect(d.marchersAt?.ids).toEqual(line);
        expect(d.marchersAt?.spots).toEqual(
            plan.spots.map(([x, y]) => ({ x, y })),
        );
        expect(d.marchersAt?.walk).toBeUndefined();
        // Starts as the shape tool's ghosts, in the marchers' own looks
        expect(d.rings).toEqual(line.map((id) => starts.get(id)));
        expect(d.ringIds).toEqual(line);
        // ▶ Preview: R-13″'s positions, as the resolver will have them once written
        setFollowPreview(true);
        const walk = drawingOf(session())!.marchersAt!.walk!;
        for (const p of [0, 0.25, 0.5, 0.75, 1])
            expect(walk(p)).toEqual(
                trailDragPreview(followPlanOf(session())!, p).map(([x, y]) => ({ x, y })), // prettier-ignore
            );
        expect(drawingOf(session())!.marchersAt!.spots).toEqual(
            d.marchersAt!.spots,
        );
        setFollowPreview(false);
        expect(drawingOf(session())!.marchersAt!.walk).toBeUndefined();
        // Keep end spots shows none: the line already stands on its spots there
        open(KEEP);
        drag(right, { x: right.x + 10 * STEP, y: right.y });
        setFollowEnds("keep");
        expect(followMarchersOf(session())).toBeNull();
    });

    it("▶ Preview's loop: a moment at the start, the walk, a pause at the end, again", () => {
        const { hold, walk, rest } = FOLLOW_PREVIEW_LOOP;
        expect(followPreviewProgress(0)).toBe(0);
        expect(followPreviewProgress(hold)).toBe(0);
        expect(followPreviewProgress(hold + walk / 2)).toBeCloseTo(0.5, 9);
        expect(followPreviewProgress(hold + walk)).toBe(1);
        expect(followPreviewProgress(hold + walk + rest - 1)).toBe(1);
        expect(followPreviewProgress(hold + walk + rest + hold + walk / 4)).toBeCloseTo(0.25, 9); // prettier-ignore
    });

    it("Ends: Keep end spots only when offered", () => {
        open(null);
        setFollowEnds("keep");
        expect(session().follow!.ends).toBe("trail");
        open(KEEP);
        setFollowEnds("keep");
        expect(session().follow!.ends).toBe("keep");
    });

    it("a smooth point: the spots shown are the ones written, its roundness included", () => {
        open();
        const right = starts.get(5)!;
        drag(right, { x: right.x + 10 * STEP, y: right.y });
        // a second leg, then the first point made smooth, as the pen's drag does
        pathPenMode.press(at(right.x + 10 * STEP, right.y - 10 * STEP), press);
        pathPenMode.release(at(right.x + 10 * STEP, right.y - 10 * STEP), null);
        usePathPenStore.setState({
            session: {
                ...session(),
                points: session().points.map((p, i) =>
                    i === 0 ? { ...p, tension: 0.5 } : p,
                ),
            },
        });
        const s = session();
        const line = [1, 2, 3, 4, 5].map((id): [number, number] => [starts.get(id)!.x, starts.get(id)!.y]); // prettier-ignore
        const written = s.points.map((p) => ({
            at: [p.at.x, p.at.y] as [number, number],
            ...((p.tension ?? 0) > 0 ? { tension: p.tension } : {}),
        }));
        expect(written[0]!.tension).toBe(0.5);
        const want = planTrailDrag(line, written, { kind: "keep" }, STEP);
        const plan = followPlanOf(s)!;
        expect(plan.spots).toEqual(want.spots);
        expect(plan.ends).toEqual(want.ends);
        expect(drawingOf(s)!.spots).toEqual(want.spots.map(([x, y]) => ({ x, y }))); // prettier-ignore
        // and not the corners' way: the smooth point changes where they stop
        const corners = planTrailDrag(line, written.map((p) => ({ at: p.at })), { kind: "keep" }, STEP); // prettier-ignore
        expect(
            corners.spots.some(
                (p, q) =>
                    Math.hypot(p[0] - want.spots[q]![0], p[1] - want.spots[q]![1]) > 1e-3, // prettier-ignore
            ),
        ).toBe(true);
    });

    it("Keep end spots: the spots they have show, the trail runs on into the tail's, and Big steps is step 4's (AP-T9)", () => {
        open(KEEP);
        const right = starts.get(5)!;
        drag(right, { x: right.x + 4 * STEP, y: right.y - 6 * STEP });
        // From trail: where the line stops; a short trail, no Big steps
        expect(bigSteps(session(), fieldProperties)).toBeNull();
        setFollowEnds("keep");
        const s = session();
        const d = drawingOf(s)!;
        const kept = [5, 4, 3, 2, 1].map((id) => KEEP.spots.get(id)!).reverse(); // prettier-ignore
        // tail first, as the line is drawn
        expect(d.spots).toEqual(trailLine(s.follow!).map((id) => KEEP.spots.get(id)!)); // prettier-ignore
        expect(d.spots).toEqual(kept);
        expect(d.lanes!.at(-1)).toEqual(kept);
        // The trail runs on into the tail's end spot, as step 4's does
        const tail = KEEP.spots.get(1)!;
        expect(shapeOf(s).to).toEqual(tail);
        expect(d.outline!.at(-1)!.x).toBeCloseTo(tail.x, 6);
        expect(d.outline!.at(-1)!.y).toBeCloseTo(tail.y, 6);
        // Big steps as step 4 reads it: each walks the line-up, the trail and the end line
        const distances = trailDistances(s.target.trail!.members, curveOf(shapeOf(s)).L); // prettier-ignore
        expect(distances.every((x) => x > 20 * STEP)).toBe(true);
        expect(bigSteps(s, fieldProperties)).not.toBeNull();
        // Back to From trail: AP-T8's spots again
        setFollowEnds("trail");
        expect(drawingOf(session())!.spots).toEqual(
            followPlanOf(session())!.spots.map(([x, y]) => ({ x, y })),
        );
    });

    it("Even stays within its limit as points are removed, and is Keep spacing while the limit is under half a step", () => {
        open();
        const right = starts.get(5)!;
        drag(right, { x: right.x + 10 * STEP, y: right.y });
        // (8 + 10) steps over 4 gaps: up to 4.5
        expect(evenLimitOf(followPlanOf(session()))).toBe(4.5);
        setFollowSpacing({ kind: "even", steps: 4 });
        expect(followSpacingOf(session())).toEqual({ kind: "even", steps: 4 });
        // the trail gone: (8 + 0) / 4 = 2, so Even is held at 2
        usePathPenStore.setState({ session: { ...session(), points: [] } });
        expect(evenLimitOf(followPlanOf(session()))).toBe(2);
        expect(followSpacingOf(session())).toEqual({ kind: "even", steps: 2 });
        const plan = followPlanOf(session())!;
        expect(plan.forward).toBe(true);
        // A line a third of a step apart: no Even at all
        const tight = new Map(
            [1, 2, 3, 4, 5].map((id, i) => [
                id,
                { x: X0 + (i * STEP) / 3, y: Y0 },
            ]),
        );
        open(null, tight);
        const end = tight.get(5)!;
        drag(end, { x: end.x + 4 * STEP, y: end.y });
        // a trail a tenth of a step long, off the grid the pen lands on
        usePathPenStore.setState({
            session: {
                ...session(),
                points: [{ at: { x: end.x + 0.1 * STEP, y: end.y } }],
            },
        });
        const limit = evenLimitOf(followPlanOf(session()))!;
        expect(limit).toBeLessThan(0.5);
        setFollowSpacing({ kind: "even", steps: 2 });
        expect(followSpacingOf(session())).toEqual({ kind: "keep" });
    });

    it("Escape cancels the drawing and the ends pulse again; then it leaves the tool", () => {
        open();
        const right = starts.get(5)!;
        drag(right, { x: right.x + 6 * STEP, y: right.y });
        expect(cancelFollowDrawing()).toBe(true);
        expect(session().follow!.grabbed).toBeNull();
        expect(session().points).toEqual([]);
        expect(cancelFollowDrawing()).toBe(false);
    });

    it("followHit: ends and middles under the pointer", () => {
        open();
        const f = session().follow!;
        expect(followHit(f, { x: X0 + 1, y: Y0 }, 4)).toEqual({
            id: 1,
            end: true,
        });
        expect(followHit(f, { x: X0 + 4 * STEP, y: Y0 }, 4)).toEqual({ id: 3, end: false }); // prettier-ignore
        expect(followHit(f, { x: X0, y: Y0 + 5 * STEP }, 4)).toBeNull();
    });
});

describe("the Follow tool, step 4d", () => {
    const line = [1, 2, 3, 4, 5].map((id): [number, number] => [starts.get(id)!.x, starts.get(id)!.y]); // prettier-ignore
    /** The plan for the line led by 5 through `points` */
    const planThrough = (points: { x: number; y: number }[]) =>
        planTrailDrag(line, points.map((p) => ({ at: [p.x, p.y] as [number, number] })), { kind: "keep" }, STEP); // prettier-ignore

    afterEach(() => {
        vi.useRealTimers();
    });

    it("pull arrows on the two ends, pointing out along the line, until an end is grabbed", () => {
        open();
        const arrows = drawingOf(session())!.pullArrows!;
        expect(arrows).toEqual([
            { at: starts.get(1), dir: { x: -1, y: 0 } },
            { at: starts.get(5), dir: { x: 1, y: 0 } },
        ]);
        // A bent end points along its own last stretch, not the line's overall way
        const bent = new Map(starts);
        bent.set(5, { x: X0 + 6 * STEP, y: Y0 + 2 * STEP });
        open(null, bent);
        const [, right] = drawingOf(session())!.pullArrows!;
        expect(right!.dir.x).toBe(0);
        expect(right!.dir.y).toBeCloseTo(1, 9);
        open();
        drag(starts.get(5)!, { x: X0 + 18 * STEP, y: Y0 });
        expect(drawingOf(session())!.pullArrows).toBeUndefined();
    });

    it("over a middle marcher, a note says to drag from an end; over an end, none", () => {
        open();
        const middle = starts.get(3)!;
        expect(pathPenMode.cursorAt(at(middle.x, middle.y))).toBe("default");
        expect(drawingOf(session())!.tip).toEqual({
            at: middle,
            text: "Drag from an end of the line",
        });
        expect(pathPenMode.cursorAt(at(X0, Y0))).toBe("grab");
        expect(drawingOf(session())!.tip).toBeUndefined();
        pathPenMode.cursorAt(at(middle.x, middle.y));
        pathPenMode.leave();
        expect(drawingOf(session())!.tip).toBeUndefined();
    });

    it("while drawing, the marchers and end spots follow the pointer; the write is what's placed", () => {
        open();
        const right = starts.get(5)!;
        drag(right, { x: right.x + 10 * STEP, y: right.y });
        const placed = session().points.map((p) => p.at);
        const pointer = { x: right.x + 10 * STEP, y: right.y - 8 * STEP };
        setPointer(pointer);
        const s = session();
        const drawn = planThrough([...placed, pointer]);
        const written = planThrough(placed);
        expect(followDrawnPlanOf(s)!.spots).toEqual(drawn.spots);
        expect(followPlanOf(s)!.spots).toEqual(written.spots);
        expect(drawn.spots).not.toEqual(written.spots);
        const d = drawingOf(s)!;
        expect(d.spots).toEqual(drawn.spots.map(([x, y]) => ({ x, y })));
        expect(d.marchersAt!.spots).toEqual(d.spots);
        expect(d.lanes!.at(-1)).toEqual(d.spots);
        // ▶ Preview walks the drawing's way
        setFollowPreview(true);
        expect(followMarchersOf(session())!.walk!(1)).toEqual(
            trailDragPreview(drawn, 1).map(([x, y]) => ({ x, y })),
        );
        // A session that changes nothing the plan reads doesn't plan again
        const plan = followDrawnPlanOf(session());
        setFollowPreview(false);
        expect(followDrawnPlanOf(session())).toBe(plan);
        // The pointer on the last point placed, or off the field: the drawing is the write
        setPointer(null);
        expect(followDrawnPlanOf(session())).toBe(followPlanOf(session()));
        setPointer(placed.at(-1)!);
        expect(followDrawnPlanOf(session())).toBe(followPlanOf(session()));
    });

    it("live during the first press-and-drag out of an end, once a frame", () => {
        vi.useFakeTimers();
        open();
        const right = starts.get(5)!;
        pathPenMode.press(at(right.x, right.y), press);
        pathPenMode.move(at(right.x + 3 * STEP, right.y));
        pathPenMode.move(at(right.x + 5 * STEP, right.y - 4 * STEP));
        // Not yet: the moves wait for the frame, and the last one wins
        expect(session().pointer).toBeNull();
        vi.advanceTimersToNextFrame();
        const pointer = session().pointer!;
        expect(Math.abs(pointer.x - (right.x + 5 * STEP))).toBeLessThan(STEP);
        expect(session().points).toEqual([]);
        expect(followMarchersOf(session())!.spots).toEqual(
            planThrough([pointer]).spots.map(([x, y]) => ({ x, y })),
        );
        expect(followPlanOf(session())!.spots).toEqual(planThrough([]).spots);
        // The release places the first point where it is, whatever the frame had
        pathPenMode.move(at(right.x + 9 * STEP, right.y - 9 * STEP));
        pathPenMode.release(at(right.x + 9 * STEP, right.y - 9 * STEP), null);
        vi.advanceTimersToNextFrame();
        expect(session().points).toHaveLength(1);
        expect(session().pointer).toEqual(session().points[0]!.at);
        // Escape before a waiting frame: the frame doesn't bring the pointer back
        pathPenMode.move(at(right.x + 2 * STEP, right.y));
        cancelFollowDrawing();
        vi.advanceTimersToNextFrame();
        expect(session().pointer).toBeNull();
    });

    it("the path bar keeps clear of the line, where it ends now and the pointer", () => {
        open();
        expect(followFootprint(session())).toHaveLength(starts.size);
        const left = starts.get(1)!;
        pathPenMode.press(at(left.x, left.y), press);
        pathPenMode.release(at(left.x, left.y), { double: false, ownFirst: false }); // prettier-ignore
        const to = { x: left.x - 8 * STEP, y: left.y };
        act(() => setPointer(to));
        const footprint = followFootprint(session());
        expect(footprint).toContainEqual(to);
        // The starts, an end spot for each member, and the pointer
        expect(footprint).toHaveLength(2 * starts.size + 1);
        act(() => clearPath());
        const after = usePathPenStore.getState().session;
        expect(after ? followFootprint(after) : []).toEqual([]);
    });

    it("a click on an end grabs it; moving and clicking places the first point", () => {
        open();
        const left = starts.get(1)!;
        pathPenMode.press(at(left.x, left.y), press);
        pathPenMode.release(at(left.x, left.y), { double: false, ownFirst: false }); // prettier-ignore
        expect(session().follow!.grabbed).toBe(1);
        expect(session().points).toEqual([]);
        const to = at(left.x - 8 * STEP, left.y);
        pathPenMode.move(to);
        pathPenMode.press(to, press);
        pathPenMode.release(to, { double: false, ownFirst: false });
        expect(session().points).toHaveLength(1);
        expect(session().points[0]!.at.x).toBeCloseTo(left.x - 8 * STEP, 6);
    });

    it("everyone but the line fades while the tool is open, and comes back when it closes", () => {
        const dimming = new FieldDimming();
        renderHook(() => useShapeFocus(dimming, useFollowFocus()));
        expect(dimming.isDimmed(9)).toBe(false);
        act(() => open());
        expect(dimming.isDimmed(9)).toBe(true);
        expect(dimming.isDimmed(3)).toBe(false);
        // The line's own marchers stay drawn: the tool puts them where they're shown
        expect(dimming.opacityOf(3)).toBe(1);
        // Drawing doesn't set the fade again: the line keeps its identity as the pointer moves
        const setFocus = vi.spyOn(dimming, "setFocus");
        act(() => setPointer({ x: X0, y: Y0 + 4 * STEP }));
        expect(setFocus).not.toHaveBeenCalled();
        setFocus.mockRestore();
        act(() => clearPath());
        expect(dimming.isDimmed(9)).toBe(false);
    });
});
