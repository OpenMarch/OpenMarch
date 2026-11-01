import { afterEach, describe, expect, it } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { Roles } from "@/input/modifierRoles";
import type { ShapeField } from "../../field/shapeField";
import { boxTool } from "../../box/boxTool";
import type { BoxParams } from "../../box/boxGeometry";
import { dragShape, startShapeGesture } from "../../frame/gestures";
import { pivotOf } from "../../frame/pivot";
import { pivotPoint } from "../../frame/frame";
import { useShapeEditorStore } from "../../frame/shapeEditorStore";
import { nudgeEnvFor, toolEnvFor } from "../toolEnv";
import { openTool, press } from "../toolMachine";

/**
 * The roles a shape drag reads (version A, docs/timeline/research/shapes/modifier-roles.md):
 * `fine` leaves the half-step ladder and the field's lines still pull; `constrain` is the shape's
 * own constraint and flips the box's ratio lock; snapping off is the Snap toggle, not a key
 */

const fieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const field = {
    fieldProperties,
    zoom: () => 1,
    marchers: () => [],
    drawn: () => new Map(),
} as unknown as ShapeField;

const roles = (on: Partial<Roles> = {}): Roles => ({
    fine: false,
    constrain: false,
    fromCenter: false,
    ...on,
});

describe("toolEnvFor", () => {
    afterEach(() => useShapeEditorStore.setState({ ratioLocked: false }));

    it("with no roles, snaps to the ladder and pulls", () => {
        const env = toolEnvFor(field, roles());
        expect([env.snap, env.pull, env.fine, env.constrain]).toEqual([
            true,
            true,
            false,
            false,
        ]);
    });

    it("with fine, leaves the ladder but still pulls", () => {
        const env = toolEnvFor(field, roles({ fine: true }));
        expect([env.snap, env.pull, env.fine]).toEqual([false, true, true]);
    });

    it("with constrain, still snaps and pulls", () => {
        const env = toolEnvFor(field, roles({ constrain: true }));
        expect([env.snap, env.pull, env.constrain]).toEqual([true, true, true]);
    });

    it("with fromCenter, grows from the center, and not without it", () => {
        expect(toolEnvFor(field, roles()).fromCenter).toBe(false);
        expect(toolEnvFor(field, roles({ fromCenter: true })).fromCenter).toBe(
            true,
        );
    });

    it("with the Snap toggle off, neither snaps nor pulls", () => {
        const env = toolEnvFor(field, roles(), { snapOn: false });
        expect([env.snap, env.pull, env.fine]).toEqual([false, false, false]);
    });

    it("has no key for snapping nothing", () => {
        const all = toolEnvFor(
            field,
            roles({ fine: true, constrain: true, fromCenter: true }),
        );
        expect(all.pull).toBe(true);
        expect("mod" in all).toBe(false);
        expect("shift" in all).toBe(false);
    });

    it("leaves gridSnap free with fine or the Snap toggle off, and snaps otherwise", () => {
        const at = { x: 3.3, y: 7.7 };
        expect(toolEnvFor(field, roles()).gridSnap(at)).not.toEqual(at);
        expect(
            toolEnvFor(field, roles({ constrain: true })).gridSnap(at),
        ).not.toEqual(at);
        expect(toolEnvFor(field, roles({ fine: true })).gridSnap(at)).toEqual(
            at,
        );
        expect(
            toolEnvFor(field, roles(), { snapOn: false }).gridSnap(at),
        ).toEqual(at);
    });

    it("flips the editor's ratio lock while constrain is held", () => {
        expect(toolEnvFor(field, roles()).ratioLocked).toBe(false);
        expect(toolEnvFor(field, roles({ constrain: true })).ratioLocked).toBe(
            true,
        );
        useShapeEditorStore.setState({ ratioLocked: true });
        expect(toolEnvFor(field, roles()).ratioLocked).toBe(true);
        expect(toolEnvFor(field, roles({ constrain: true })).ratioLocked).toBe(
            false,
        );
    });
});

describe("nudgeEnvFor", () => {
    it("snaps a plain nudge, gives a Fine nudge fine control, and turns snapping off for a Free one", () => {
        const plain = nudgeEnvFor(field, { step: "grid", snap: true });
        expect([plain.snap, plain.pull, plain.fine]).toEqual([
            true,
            true,
            false,
        ]);
        for (const step of ["quarter", "tenth"] as const) {
            const fine = nudgeEnvFor(field, { step, snap: false });
            expect([fine.snap, fine.pull, fine.fine]).toEqual([
                false,
                true,
                true,
            ]);
        }
        for (const step of ["grid", "four"] as const) {
            const free = nudgeEnvFor(field, { step, snap: false });
            expect([free.snap, free.pull, free.fine]).toEqual([
                false,
                false,
                false,
            ]);
        }
    });
});

describe("the pivot pulled out of the center dot", () => {
    const box: BoxParams = {
        center: { x: 100, y: -100 },
        rotation: 0,
        files: 4,
        across: 80,
        deep: 80,
    };
    // 4 by 3, big enough that no handle reaches the center dot
    const N = 12;
    /** The pivot's spot after a reach-inside press on the center dot and a drag to `to` */
    const pivotAfter = (to: { x: number; y: number }, fine: boolean) => {
        const env = toolEnvFor(field, roles({ fine }));
        const center = boxTool.frameOf(box, N).center;
        const gesture = startShapeGesture(boxTool, box, N, center, {
            ...env,
            reachInside: true,
        })!;
        expect(gesture.type).toBe("pivot");
        const out = dragShape(boxTool, N, gesture, to, env) as BoxParams;
        return pivotPoint(boxTool.frameOf(out, N), pivotOf(out));
    };

    it("is the center itself without reach inside", () => {
        const env = toolEnvFor(field, roles({ constrain: true }));
        const center = boxTool.frameOf(box, N).center;
        expect(startShapeGesture(boxTool, box, N, center, env)?.type).toBe(
            "center",
        );
    });

    it("snaps, and fine frees it", () => {
        const to = { x: 141.3, y: -63.7 };
        expect(pivotAfter(to, false)).not.toEqual(to);
        const free = pivotAfter(to, true);
        expect(free.x).toBeCloseTo(to.x, 9);
        expect(free.y).toBeCloseTo(to.y, 9);
    });
});

describe("a draw's first corner", () => {
    const at = { x: 103.3, y: -77.7 };
    const fromWith = (env: ReturnType<typeof toolEnvFor>) => {
        const g = press(openTool(boxTool, []), at, env).gesture;
        return g?.type === "draw" ? g.from : null;
    };

    it("snaps to the grid, and stays where the press is with fine or the Snap toggle off (review of #453)", () => {
        expect(fromWith(toolEnvFor(field, roles()))).not.toEqual(at);
        expect(
            fromWith(toolEnvFor(field, roles({ constrain: true }))),
        ).not.toEqual(at);
        expect(fromWith(toolEnvFor(field, roles({ fine: true })))).toEqual(at);
        expect(fromWith(toolEnvFor(field, roles(), { snapOn: false }))).toEqual(
            at,
        );
    });
});
