import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { FieldPointer } from "@/field/editor/fieldEditor";
import { setShapeField } from "@/shapes/field/shapeField";
import type { XY } from "@openmarch/core";
import { rippleTrail } from "@/db-functions/timelineTrailRipple";
import {
    planRipple,
    ripplePreview,
    type RippleForm,
} from "@/db-functions/timelineTrailRipplePlan";
import { drawingOf, pathPenMode } from "../pathPenMode";
import {
    clearPath,
    finishDrawing,
    setPointer,
    shapeOf,
    usePathPenStore,
    type PathSession,
} from "../pathPenStore";
import type { PathTarget } from "../pathTarget";
import {
    followHasTrail,
    followMarchersOf,
    rippleDrawnPlanOf,
    rippleEndAt,
    ripplePlanOf,
    setFollowEnds,
    setFollowPreview,
    type FollowDrag,
    type FollowKeep,
} from "../followDrag";

vi.mock("@/db-functions/timelineTrailRipple", () => ({
    rippleTrail: vi.fn(async () => ({})),
    rippleFormAt: vi.fn(async () => null),
}));

/**
 * Ripple in on the Follow tool (pathways step 9, spec L.10, RP-1 to RP-6): the third Ends choice,
 * the next form's spots dealt in trail order from the end the drawing arrives at, a straight
 * connector finished with nothing drawn, and what the drawing shows being what's written.
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

/** The next form: a line 14 steps right and 10 up of M1, two steps apart, M5 on its left end */
const FORM_SPOTS: XY[] = [0, 1, 2, 3, 4].map((k) => [
    X0 + (14 + 2 * k) * STEP,
    Y0 - 10 * STEP,
]);
const FORM: RippleForm = { ids: [5, 4, 3, 2, 1], spots: FORM_SPOTS };
const KEEP: FollowKeep = {
    timelineId: 7,
    start: 9,
    end: 17,
    spots: new Map(
        FORM.ids.map((id, k) => [
            id,
            { x: FORM_SPOTS[k]![0], y: FORM_SPOTS[k]![1] },
        ]),
    ),
};

const at = (x: number, y: number): FieldPointer => ({
    field: { x, y },
    screen: { x: x * ZOOM, y: y * ZOOM },
    button: 0,
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
});

function open(form: RippleForm | null = FORM) {
    const follow: FollowDrag = {
        window: { start: 9, end: 17 },
        ids: [1, 2, 3, 4, 5],
        order: [1, 2, 3, 4, 5],
        starts,
        grabbed: null,
        spacing: { kind: "keep" },
        ends: "trail",
        keep: KEEP,
        form,
        step: STEP,
    };
    const members = follow.order.map((id) => ({
        marcherId: id,
        drill: `T${id}`,
        from: starts.get(id)!,
        to: starts.get(id)!,
    }));
    const target: PathTarget = {
        timelineId: -1,
        transitionId: -1,
        marcherId: 5,
        start: 9,
        end: 17,
        from: starts.get(5)!,
        to: starts.get(5)!,
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
const tuple = (p: { x: number; y: number }): XY => [p.x, p.y];
/** A plan's facts, without its trail's functions */
const facts = (plan: ReturnType<typeof planRipple> | null) =>
    plan && {
        takes: plan.takes,
        spots: plan.spots,
        startDist: plan.startDist,
        endDist: plan.endDist,
        entrance: plan.entrance,
        connector: plan.connector,
    };
const line = [1, 2, 3, 4, 5].map((id) => tuple(starts.get(id)!));

function drag(from: { x: number; y: number }, to: { x: number; y: number }) {
    pathPenMode.press(at(from.x, from.y), press);
    pathPenMode.move(at((from.x + to.x) / 2, (from.y + to.y) / 2));
    pathPenMode.move(at(to.x, to.y));
    pathPenMode.release(at(to.x, to.y), null);
}

beforeEach(() => {
    vi.mocked(rippleTrail).mockClear();
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

describe("Ripple in (pathways step 9)", () => {
    it("RP-1: offered only when the end spots make a form", () => {
        open(null);
        setFollowEnds("ripple");
        expect(session().follow!.ends).toBe("trail");
        clearPath();
        open();
        setFollowEnds("ripple");
        expect(session().follow!.ends).toBe("ripple");
    });

    it("RP-3, RP-5: once an end is grabbed there's a trail, the straight connector, and the marchers stand on their dealt spots", () => {
        open();
        setFollowEnds("ripple");
        // A press and release on the right end, no drag: grabbed, nothing placed
        const right = starts.get(5)!;
        pathPenMode.press(at(right.x, right.y), press);
        pathPenMode.release(at(right.x, right.y), null);
        const s = session();
        expect(s.follow!.grabbed).toBe(5);
        expect(s.points).toEqual([]);
        expect(followHasTrail(s)).toBe(true);
        const plan = ripplePlanOf(s)!;
        // The near end (M5's spot) is the entrance: the tail M1 takes it, M5 the far end
        expect(plan.takes).toEqual([5, 4, 3, 2, 1]);
        expect(plan.spots).toEqual(FORM_SPOTS);
        expect(facts(plan)).toEqual(facts(planRipple(line, FORM, [])));
        // The trail runs on into the entrance; the marchers shown where they will stand
        expect(tuple(shapeOf(s).to)).toEqual(FORM_SPOTS[0]);
        const d = drawingOf(s)!;
        expect(d.spots.map(tuple)).toEqual(FORM_SPOTS);
        expect(d.marchersAt!.ids).toEqual([1, 2, 3, 4, 5]);
        expect(d.marchersAt!.spots.map(tuple)).toEqual(FORM_SPOTS);
        // ▶ Preview walks them along the trail as written
        setFollowPreview(true);
        const shown = followMarchersOf(session())!;
        expect(shown.walk!(0.5).map(tuple)).toEqual(ripplePreview(plan, 0.5));
    });

    it("RP-4: the entrance follows the pointer while drawing, and a finish on the far end enters there with nothing drawn (RP-6)", async () => {
        open();
        setFollowEnds("ripple");
        const right = starts.get(5)!;
        const far = FORM_SPOTS[4]!;
        pathPenMode.press(at(right.x, right.y), press);
        pathPenMode.move(at(right.x + 5 * STEP, right.y - 5 * STEP));
        // Over the far end: entered there, no corner added for the pointer
        setPointer({ x: far[0], y: far[1] });
        const shown = rippleDrawnPlanOf(session())!;
        expect(shown.takes).toEqual([1, 2, 3, 4, 5]);
        expect(facts(shown)).toEqual(facts(planRipple(line, FORM, [], 1)));
        pathPenMode.move(at(far[0], far[1]));
        pathPenMode.release(at(far[0], far[1]), null);
        await vi.waitFor(() => expect(rippleTrail).toHaveBeenCalledTimes(1));
        expect(vi.mocked(rippleTrail).mock.calls[0]![0]).toMatchObject({
            marcherIds: [1, 2, 3, 4, 5],
            leaderId: 5,
            points: [],
            keepMove: 7,
            enter: 1,
        });
    });

    it("RP-4 (review blocker): Enter with the pointer out on the field writes the deal the drawing shows", async () => {
        open();
        setFollowEnds("ripple");
        const right = starts.get(5)!;
        pathPenMode.press(at(right.x, right.y), press);
        pathPenMode.release(at(right.x, right.y), null);
        // Six steps below the far end: nearer it than the near end, but not on it
        const far = FORM_SPOTS[4]!;
        setPointer({ x: far[0], y: far[1] + 6 * STEP });
        const shown = rippleDrawnPlanOf(session())!;
        expect(shown.takes).toEqual([1, 2, 3, 4, 5]);
        // The placed plan alone would enter at the near end
        expect(ripplePlanOf(session())!.takes).toEqual([5, 4, 3, 2, 1]);
        await finishDrawing();
        expect(rippleTrail).toHaveBeenCalledTimes(1);
        expect(vi.mocked(rippleTrail).mock.calls[0]![0]).toMatchObject({
            points: [],
            enter: shown.entrance,
        });
        expect(shown.entrance).toBe(1);
    });

    it("RP-4: one reach for being on an end, two steps, for the drawing and the finish alike", () => {
        open();
        setFollowEnds("ripple");
        const right = starts.get(5)!;
        pathPenMode.press(at(right.x, right.y), press);
        pathPenMode.release(at(right.x, right.y), null);
        const far = FORM_SPOTS[4]!;
        // 1.9 steps off the far end: on it, no corner for the pointer
        setPointer({ x: far[0], y: far[1] + 1.9 * STEP });
        expect(rippleDrawnPlanOf(session())!.connector).toBeCloseTo(
            planRipple(line, FORM, [], 1).connector,
            9,
        );
        expect(
            rippleEndAt(session().follow!, {
                x: far[0],
                y: far[1] + 1.9 * STEP,
            }),
        ).toBe(1);
        expect(
            rippleEndAt(session().follow!, {
                x: far[0],
                y: far[1] + 2.1 * STEP,
            }),
        ).toBeNull();
    });

    it("corners bend the connector; Finish writes what's placed, the entrance by the last point", async () => {
        open();
        setFollowEnds("ripple");
        const right = starts.get(5)!;
        const corner = { x: right.x, y: right.y - 10 * STEP };
        drag(right, corner);
        const s = session();
        expect(s.points).toHaveLength(1);
        const placed = s.points[0]!.at;
        expect(facts(ripplePlanOf(s))).toEqual(
            facts(planRipple(line, FORM, [{ at: tuple(placed) }])),
        );
        await finishDrawing();
        expect(rippleTrail).toHaveBeenCalledTimes(1);
        expect(vi.mocked(rippleTrail).mock.calls[0]![0]).toMatchObject({
            points: [{ at: tuple(placed) }],
            // The pointer sits on the point placed: the entrance shown is the placed plan's
            enter: planRipple(line, FORM, [{ at: tuple(placed) }]).entrance,
        });
    });

    it("Keep end spots may finish with nothing drawn; From trail can't (RP-6)", async () => {
        open();
        const right = starts.get(5)!;
        pathPenMode.press(at(right.x, right.y), press);
        pathPenMode.release(at(right.x, right.y), null);
        // From trail with nothing drawn: Finish is Escape, the drawing goes
        await finishDrawing();
        expect(usePathPenStore.getState().session?.phase ?? "closed").not.toBe(
            "drawing",
        );
        expect(rippleTrail).not.toHaveBeenCalled();
    });
});
