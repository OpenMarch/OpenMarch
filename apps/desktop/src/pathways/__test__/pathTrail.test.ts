// cspell:ignore tnew gnew
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { FieldPointer } from "@/field/editor/fieldEditor";
import { setShapeField } from "@/shapes/field/shapeField";
import {
    TRAIL_FIELD_MENU,
    drawingOf,
    pathFieldMenu,
    pathPenMode,
} from "../pathPenMode";
import {
    activatePath,
    addPoint,
    clearPath,
    openPath,
    pathKey,
    pathMarcherIds,
    setPathHidden,
    showPath,
    startDrawing,
    switchDrawing,
    usePathPenStore,
} from "../pathPenStore";
import { refitNeeded, type PathTarget } from "../pathTarget";
import { bigSteps, trailDistances } from "../PathEditor";
import { setFollowTheLeader } from "../followTheLeader";

/**
 * A trail on the field (pathways step 4, spec Appendix K): the pen draws the part from the
 * leader's start to the end spot the line is entered at; the line-up and the end line are drawn
 * faint; every member has a ring, the leader's saying so; the trail's menu has Reverse; and a
 * drawing switches between a group path and a trail without losing its points.
 */

const fieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const STEP = fieldProperties.pixelsPerStep;
const ZOOM = 2;

/** Three marchers in a row, tail to leader, ending in a column to the right */
const members = [1, 2, 3].map((id, i) => ({
    marcherId: id,
    drill: `T${id}`,
    from: { x: 4 * i * STEP, y: 0 },
    to: { x: 20 * STEP, y: (10 + 4 * i) * STEP },
}));

const trail = (routeId: number | null): PathTarget => ({
    timelineId: 1,
    transitionId: 7,
    marcherId: 3,
    start: 0,
    end: 16,
    from: members[2]!.from,
    to: members[0]!.to,
    routeId,
    points: routeId === null ? [] : [{ id: "c1", at: [14 * STEP, 0] as const }],
    ends:
        routeId === null
            ? null
            : { from: members[2]!.from, to: members[0]!.to },
    group: null,
    trail: { members, leaderId: 3, reverse: false },
});

const group = (): PathTarget => ({
    ...trail(null),
    trail: null,
    marcherId: 1,
    group: {
        members: members.map((m) => ({
            ...m,
            transitionId: 7,
            offset: { x: 0, y: 0 },
        })),
        outside: [],
    },
});

const at = (x: number, y: number, button = 0): FieldPointer => ({
    field: { x, y },
    screen: { x: x * ZOOM, y: y * ZOOM },
    button,
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    kind: "mouse",
});

beforeEach(() => {
    // Trails are drawn only with Follow-the-leader on (#1095)
    setFollowTheLeader(true);
    setShapeField({
        fieldProperties: () => fieldProperties,
        zoom: () => ZOOM,
        marchers: () => [],
        drawn: () => new Map(),
    });
});

afterEach(() => {
    clearPath();
    setPathHidden(false);
    setShapeField(null);
    setFollowTheLeader(false);
});

describe("a trail with Follow-the-leader off (#1095)", () => {
    it("is shown, drawn the same, but never drawn again, opened or activated", () => {
        setFollowTheLeader(false);
        // Shown quiet, as with the switch on: the file plays it as before
        showPath(trail(5), "3");
        const off = drawingOf(usePathPenStore.getState().session)!;
        setFollowTheLeader(true);
        showPath(trail(5), "3");
        expect(drawingOf(usePathPenStore.getState().session)).toEqual(off);
        setFollowTheLeader(false);
        expect(openPath()).toBe(false);
        expect(usePathPenStore.getState().session!.phase).toBe("closed");
        // A click on its line (`activatePath`) shows it quiet
        activatePath(trail(5), "3", null, true);
        expect(usePathPenStore.getState().session!.phase).toBe("closed");
        // A new trail isn't drawn; a group path still is
        clearPath();
        startDrawing(trail(null), "3");
        expect(usePathPenStore.getState().session).toBeNull();
        startDrawing(group(), "3");
        expect(usePathPenStore.getState().session!.phase).toBe("drawing");
        clearPath();
        // On again: opened as before
        setFollowTheLeader(true);
        showPath(trail(5), "3");
        expect(openPath()).toBe(true);
        expect(usePathPenStore.getState().session!.phase).toBe("open");
    });
});

describe("a trail on the field (pathways step 4)", () => {
    it("draws the drawn part from the leader to the entrance, the line-up and the end line faint, a ring on everyone", () => {
        showPath(trail(5), "3");
        const d = drawingOf(usePathPenStore.getState().session)!;
        expect(d.outline![0]).toEqual(members[2]!.from);
        expect(d.outline!.at(-1)).toEqual(members[0]!.to);
        expect(d.lanes).toEqual([
            members.map((m) => m.from),
            members.map((m) => m.to),
        ]);
        expect(d.rings).toEqual(members.map((m) => m.from));
        expect(d.ringIds).toEqual([1, 2, 3]);
        expect(d.spots).toEqual(members.map((m) => m.to));
        expect(d.memberRings!.map((r) => r.kind)).toEqual([
            "group",
            "group",
            "own",
        ]);
        expect(d.memberRings![2]!.label).toBe("Leads the line");
    });

    it("its menu offers Edit path, Reverse leader and Remove; Re-fit never", () => {
        const stored = trail(5);
        expect(pathFieldMenu(stored)).toBe(TRAIL_FIELD_MENU);
        expect(TRAIL_FIELD_MENU).toEqual([
            "editPath",
            "reverseTrail",
            "removePath",
        ]);
        // The leader moved since it was drawn: still no Re-fit, the drawn part follows it (R-9′)
        expect(
            refitNeeded({ ...stored, from: { x: 9 * STEP, y: 3 * STEP } }),
        ).toBe(false);
        showPath(stored, "3");
        expect(pathPenMode.fieldMenuAt(at(11 * STEP, 0))).toEqual(
            TRAIL_FIELD_MENU,
        );
    });

    it("shown closed, its members keep their walked paths; drawn or open, they give way", () => {
        showPath(trail(5), "3");
        const closed = usePathPenStore.getState().session;
        expect(pathMarcherIds(closed, false, false)).toEqual([]);
        startDrawing(trail(null), "3");
        expect(
            pathMarcherIds(usePathPenStore.getState().session, false, false),
        ).toEqual([1, 2, 3]);
    });

    it("a drawing switches between Together and Follow and keeps its points", () => {
        startDrawing(group(), "3");
        addPoint({ x: 12 * STEP, y: 2 * STEP });
        expect(switchDrawing(trail(null), "3")).toBe(true);
        let s = usePathPenStore.getState().session!;
        expect(s.phase).toBe("drawing");
        expect(s.target.trail?.leaderId).toBe(3);
        expect(s.points.map((p) => p.at)).toEqual([
            { x: 12 * STEP, y: 2 * STEP },
        ]);
        expect(switchDrawing(group(), "3")).toBe(true);
        s = usePathPenStore.getState().session!;
        expect(s.target.trail ?? null).toBeNull();
        expect(s.points).toHaveLength(1);
        // Another selection, or nothing being drawn: the caller starts a new drawing
        expect(
            switchDrawing(
                {
                    ...trail(null),
                    trail: {
                        ...trail(null).trail!,
                        members: members.slice(0, 2),
                    },
                },
                "2",
            ),
        ).toBe(false);
        clearPath();
        expect(switchDrawing(trail(null), "3")).toBe(false);
    });

    it("a trail is keyed by its route, apart from a group path and an own path", () => {
        expect(pathKey(trail(5))).toBe("1:t5");
        expect(pathKey(trail(null))).toBe("1:tnew");
        expect(pathKey(group())).toBe("1:gnew");
    });

    it("Big steps tests each member's own distance and names who has the farthest to go", () => {
        // line-up 8, drawn part 20 (straight), end line 8: the tail walks 8 + 20 + 0, the leader
        // 0 + 20 + 8, in steps
        expect(trailDistances(members, 20 * STEP).map((d) => d / STEP)).toEqual(
            [28, 28, 28],
        );
        expect(
            trailDistances(
                [
                    { from: { x: 0, y: 0 }, to: { x: 50, y: 0 } },
                    { from: { x: 3, y: 0 }, to: { x: 50, y: 10 } },
                ],
                40,
            ),
        ).toEqual([43, 50]);
        startDrawing(trail(null), "3");
        const calm = bigSteps(usePathPenStore.getState().session!, {
            ...fieldProperties,
        } as never);
        expect(calm).toBeNull();
        // The same trail in two counts is far too fast, and a marcher is named
        startDrawing({ ...trail(null), end: 2 }, "3");
        const big = bigSteps(
            usePathPenStore.getState().session!,
            fieldProperties as never,
        );
        expect(big?.marcher).toMatch(/^T[123]$/);
        expect(big?.where).toBeNull();
    });
});
