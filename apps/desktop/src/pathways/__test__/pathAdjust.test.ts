// cspell:ignore rehomed
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { FieldPointer } from "@/field/editor/fieldEditor";
import { setShapeField } from "@/shapes/field/shapeField";
import {
    PATH_FIELD_MENU,
    drawingOf,
    pathFieldMenu,
    pathPenMode,
} from "../pathPenMode";
import {
    adjustMember,
    adjustTargetOf,
    clearPath,
    closePath,
    openPath,
    selectLane,
    showPath,
    usePathPenStore,
} from "../pathPenStore";
import {
    groupLegDistances,
    laneHitOf,
    limitDrag,
    memberWalkOf,
    scheduleOf,
    type PathShape,
} from "../pathEdit";
import { refitNeeded, type PathTarget } from "../pathTarget";
import { bigSteps } from "../PathEditor";

/**
 * Adjust on the field, pathways step 3b (spec AP-R11 as amended by decision C, J.6): what a press
 * on a lane takes, the live stop-short, Big steps on an adjusted stretch, and when Re-fit shows.
 */
const fieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const STEP = fieldProperties.pixelsPerStep;
const ZOOM = 2;

/** Two members 4 steps above and below a line along y = 20 steps, corners 10 steps apart */
const group = (over: Partial<PathTarget> = {}): PathTarget => {
    const y = 20 * STEP;
    return {
        timelineId: 1,
        transitionId: 8,
        marcherId: 10,
        start: 0,
        end: 16,
        from: { x: 0, y },
        to: { x: 40 * STEP, y },
        routeId: 9,
        points: [
            { id: "p", at: [10 * STEP, y] },
            { id: "q", at: [30 * STEP, y] },
        ],
        ends: { from: { x: 0, y }, to: { x: 40 * STEP, y } },
        group: {
            members: [10, 11].map((m, i) => {
                const dy = (i === 0 ? -4 : 4) * STEP;
                return {
                    marcherId: m,
                    transitionId: 8,
                    drill: `B${i + 1}`,
                    offset: { x: 0, y: dy },
                    from: { x: 0, y: y + dy },
                    to: { x: 40 * STEP, y: y + dy },
                    laneId: m,
                    slot: i,
                    adjust: null,
                };
            }),
            outside: [],
        },
        ...over,
    };
};

const pointer = (x: number, y: number): FieldPointer =>
    ({
        field: { x, y },
        screen: { x: x * ZOOM, y: y * ZOOM },
        button: 0,
    }) as FieldPointer;
const onDot = (dot: boolean) => ({
    reachesInside: () => false,
    isMac: false,
    onDot: () => dot,
});

describe("what a press on an open group path takes (decision C)", () => {
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

    const y = 20 * STEP;
    const laneY = y + 4 * STEP;
    const open = (target = group()) => {
        showPath(target, "2");
        openPath();
    };

    it("takes a press on a lane's line; a dot, the bold line and empty field stay as they were", () => {
        open();
        const onLane = pointer(20 * STEP, laneY);
        expect(pathPenMode.claims(onLane, onDot(false))).toBe(true);
        expect(pathPenMode.claims(onLane, onDot(true))).toBe(false);
        expect(pathPenMode.claims(pointer(20 * STEP, y), onDot(false))).toBe(
            true, // the leg's midpoint handle: the path's own handles win
        );
        expect(pathPenMode.claims(pointer(25 * STEP, y), onDot(false))).toBe(
            false, // the bold line, not on a handle: not a lane's
        );
        expect(
            pathPenMode.claims(pointer(20 * STEP, y + 12 * STEP), onDot(false)),
        ).toBe(false);
    });

    it("lanes on top of each other: a click picks one, which alone takes clicks while adjusted", () => {
        const target = group();
        target.group = {
            ...target.group!,
            members: target.group!.members.map((m) => ({
                ...m,
                offset: { x: 0, y: 4 * STEP },
            })),
        };
        open(target);
        const on = pointer(20 * STEP, laneY);
        const click = () => {
            pathPenMode.press(on, {
                isMac: false,
                onDot: () => false,
            } as never);
            pathPenMode.release(on, null);
            return usePathPenStore.getState().session?.lane?.marcherId;
        };
        expect(click()).toBe(10);
        expect(click()).toBe(10);
    });

    it("takes nothing while the path is closed or being only shown", () => {
        showPath(group(), "2");
        expect(
            pathPenMode.claims(pointer(20 * STEP, laneY), onDot(false)),
        ).toBe(false);
    });

    it("a drag writes nothing on the session until release and previews the bulge", () => {
        open();
        const plainLane = drawingOf(usePathPenStore.getState().session)
            ?.lanes?.[1];
        const held = pointer(20 * STEP, laneY);
        pathPenMode.press(held, { isMac: false, onDot: () => false } as never);
        pathPenMode.move(pointer(20 * STEP, laneY + 5 * STEP));
        const edit = usePathPenStore.getState().session?.laneEdit;
        expect(edit?.marcherId).toBe(11);
        expect(edit?.adjust?.keys.length).toBe(3);
        expect(
            drawingOf(usePathPenStore.getState().session)?.lanes?.[1],
        ).not.toEqual(plainLane);
        pathPenMode.cancel();
        expect(usePathPenStore.getState().session?.laneEdit).toBeNull();
    });

    it("draws an adjusted lane's keys as handles while that lane is adjusted, not otherwise", () => {
        const target = group();
        target.group = {
            ...target.group!,
            members: [
                target.group!.members[0]!,
                {
                    ...target.group!.members[1]!,
                    adjust: {
                        v: 1,
                        keys: [{ a: "p", b: "q", f: 0.5, d: [0, 3 * STEP] }],
                    },
                },
            ],
        };
        open(target);
        expect(
            drawingOf(usePathPenStore.getState().session)?.adjustHandles,
        ).toEqual([]);
        selectLane({ marcherId: 11, key: null });
        const d = drawingOf(usePathPenStore.getState().session);
        expect(d?.adjustHandles).toEqual([
            {
                at: { x: 20 * STEP, y: y + 7 * STEP },
                selected: false,
            },
        ]);
    });
});

describe("the live stop-short (AP-R11)", () => {
    const shape: PathShape = {
        from: { x: 0, y: 0 },
        to: { x: 400, y: 0 },
        points: [
            { id: "p", at: { x: 100, y: 0 } },
            { id: "q", at: { x: 200, y: 0 } },
            { id: "r", at: { x: 300, y: 0 } },
        ],
    };
    const profile = {
        v: 1 as const,
        keys: [
            { a: "p", b: "q", f: 0.4, d: [0, 5] as [number, number] },
            { a: "p", b: "q", f: 0.6, d: [0, 0] as [number, number] },
        ],
    };

    it("stops the point where the keys would come closer than a step", () => {
        const out = limitDrag(
            shape,
            {
                ...shape,
                points: shape.points.map((p, i) =>
                    i === 1 ? { ...p, at: { x: 110, y: 0 } } : p,
                ),
            },
            [profile],
        ).points;
        expect(out[1]!.at.x - 100).toBeCloseTo(11.25 / 0.2, 2);
    });

    it("leaves a drag that keeps them apart, and any drag with no Adjust", () => {
        const next = {
            ...shape,
            points: shape.points.map((p, i) =>
                i === 1 ? { ...p, at: { x: 250, y: 30 } } : p,
            ),
        };
        expect(limitDrag(shape, next, [profile])).toBe(next);
        expect(limitDrag(shape, next, [])).toBe(next);
    });
});

describe("hit testing a lane", () => {
    const shape: PathShape = {
        from: { x: 0, y: 0 },
        to: { x: 400, y: 0 },
        points: [
            { id: "p", at: { x: 100, y: 0 } },
            { id: "q", at: { x: 300, y: 0 } },
        ],
    };
    const member = {
        from: { x: 0, y: 20 },
        to: { x: 400, y: 20 },
        offset: { x: 0, y: 20 },
    };
    const walk = memberWalkOf(scheduleOf(shape), member, shape.points);

    it("the nearest place along the rigid part, a leg with no place, and nothing off the line", () => {
        expect(laneHitOf(walk, { x: 150, y: 23 }, 5)?.x).toBeCloseTo(150, 9);
        expect(laneHitOf(walk, { x: 50, y: 20 }, 5)?.x).toBeNull();
        expect(laneHitOf(walk, { x: 150, y: 40 }, 5)).toBeNull();
    });
});

describe("Big steps on an adjusted lane (QA-BS-L1, J.6)", () => {
    const shape: PathShape = {
        from: { x: 0, y: 0 },
        to: { x: 400, y: 0 },
        points: [
            { id: "p", at: { x: 100, y: 0 } },
            { id: "q", at: { x: 300, y: 0 } },
        ],
    };
    const bulge = (span: number) => ({
        from: { x: 0, y: 20 },
        to: { x: 400, y: 20 },
        offset: { x: 0, y: 20 },
        adjust: {
            v: 1 as const,
            keys: [
                { a: "from", b: "to", f: 0.5, d: [0, 0] as [number, number] },
                {
                    a: "from",
                    b: "to",
                    f: (200 + span) / 400,
                    d: [0, 1.5 * 11.25] as [number, number],
                },
            ],
        },
    });
    const adjusted = (span: number) => {
        const schedule = scheduleOf(shape);
        return groupLegDistances(schedule, [
            {
                marcherId: 1,
                walk: memberWalkOf(schedule, bulge(span), shape.points),
            },
        ]).filter((l) => l.where === "adjusted");
    };

    it("judges each stretch whose displacement changes, at its own travel", () => {
        const [one] = adjusted(11.25);
        const [four] = adjusted(45);
        expect(one!.distance).toBeCloseTo(
            (Math.hypot(11.25, 16.875) * 400) / 11.25,
            6,
        );
        expect(four!.distance).toBeCloseTo(
            (Math.hypot(45, 16.875) * 400) / 45,
            6,
        );
        expect(four!.distance).toBeLessThan(one!.distance);
    });

    it("names the spot and counts on the worst stretch", () => {
        const target = group();
        target.group = {
            ...target.group!,
            members: [
                target.group!.members[0]!,
                {
                    ...target.group!.members[1]!,
                    adjust: {
                        v: 1,
                        keys: [
                            { a: "p", b: "q", f: 0.5, d: [0, 0] },
                            {
                                a: "p",
                                b: "q",
                                f: 0.5 + 11.25 / (20 * STEP),
                                d: [0, 3 * STEP],
                            },
                        ],
                    },
                },
            ],
        };
        showPath(target, "2");
        openPath();
        const big = bigSteps(
            usePathPenStore.getState().session!,
            fieldProperties,
        );
        clearPath();
        expect(big?.where).toBe("adjusted");
        expect(big?.worst?.spot).toBe(2);
        expect(big?.worst?.from).toBe(8);
    });
});

describe("when Re-fit is offered (decision A)", () => {
    it("only when the ends have moved past the geometry tolerance", () => {
        const same = group();
        expect(refitNeeded(same)).toBe(false);
        expect(pathFieldMenu(same)).toBe(PATH_FIELD_MENU);
        const nearly = group({
            drawnEnds: {
                from: same.ends!.from,
                to: { x: same.ends!.to.x + 1e-12, y: same.ends!.to.y },
            },
        });
        expect(refitNeeded(nearly)).toBe(false);
        const moved = group({
            drawnEnds: {
                from: same.ends!.from,
                to: { x: same.ends!.to.x + 5, y: same.ends!.to.y },
            },
        });
        expect(refitNeeded(moved)).toBe(true);
        // The Path group always lists Re-fit; the menu shows it only while it's enabled
        expect(pathFieldMenu(moved)).toBe(PATH_FIELD_MENU);
        expect(PATH_FIELD_MENU).toContain("refitPath");
    });

    it("a path not saved yet has nothing to re-fit", () => {
        expect(refitNeeded(group({ routeId: null, ends: null }))).toBe(false);
    });
});

describe("Adjust, an explicit command (interaction round 2)", () => {
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
    const session = () => usePathPenStore.getState().session;

    it("acts on the one selected member; several, none or a path that isn't a group's say why", () => {
        showPath(group(), "2");
        expect(adjustTargetOf(session(), [11])).toEqual({ marcherId: 11 });
        expect(adjustTargetOf(session(), [10, 11])).toEqual({
            reason: "Adjust one marcher at a time: select just one",
        });
        expect("reason" in adjustTargetOf(session(), [])).toBe(true);
        showPath(group({ group: null }), "B1");
        expect(adjustTargetOf(session(), [])).toEqual({
            reason: "This marcher walks its own path: Edit path changes it",
        });
        showPath(
            group({ lane: { offset: { x: 0, y: 0 }, detachedFrom: 3 } }),
            "B1",
        );
        expect("reason" in adjustTargetOf(session(), [10])).toBe(true);
    });

    it("makes only that member's lane drawn and editable, from quiet; Escape's close goes back to quiet", () => {
        showPath(group(), "2");
        adjustMember(11);
        expect(session()).toMatchObject({
            phase: "open",
            lane: { marcherId: 11, key: null },
        });
        const d = drawingOf(session())!;
        expect(d.outline).toBeNull();
        expect(d.laneIds).toEqual([11]);
        // While adjusting, Adjust names the lane adjusted whatever is selected
        expect(adjustTargetOf(session(), [])).toEqual({ marcherId: 11 });
        // A press on the other member's lane isn't taken: it isn't drawn
        const otherLane = pointer(20 * STEP, 16 * STEP);
        expect(pathPenMode.claims(otherLane, onDot(false))).toBe(false);
        closePath();
        expect(session()).toMatchObject({ phase: "closed", lane: null });
    });

    it("Edit path from Adjust edits the group path, its line drawn again", () => {
        showPath(group(), "2");
        adjustMember(10);
        openPath();
        expect(session()).toMatchObject({ phase: "open", lane: null });
        expect(drawingOf(session())!.outline).not.toBeNull();
    });

    it("does nothing for a marcher who isn't a member", () => {
        showPath(group(), "2");
        adjustMember(99);
        expect(session()!.phase).toBe("closed");
    });
});
