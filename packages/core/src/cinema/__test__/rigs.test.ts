import { describe, expect, it } from "vitest";
import {
    BUILTIN_RIGS,
    MIN_EYE_HEIGHT,
    rigEye,
    yardLineX,
    type BuiltinRigId,
} from "../index";

/** A standard football field with 22.5 inch steps. */
const stepMeters = 22.5 * 0.0254;
const footprint = { minX: -54.86, maxX: 54.86, minZ: -48.77, maxZ: 0 };
const ctx = { footprint, stepMeters };

describe("yardLineX", () => {
    it("puts the 50 at the center and side 1 at negative x", () => {
        expect(yardLineX(50, stepMeters)).toBe(0);
        expect(yardLineX(25, stepMeters)).toBeCloseTo(-22.86, 2);
        expect(yardLineX(75, stepMeters)).toBeCloseTo(22.86, 2);
    });
});

describe("rigEye", () => {
    it("places the 25-yard rig on side 1 by default and mirrors it for side 2", () => {
        const side1 = rigEye(BUILTIN_RIGS.yard25, undefined, ctx)!;
        const side2 = rigEye(BUILTIN_RIGS.yard25, { side: 2 }, ctx)!;
        expect(side1[0]).toBeCloseTo(-22.86, 2);
        expect(side2[0]).toBeCloseTo(22.86, 2);
        // In front of the front sideline, at the rig's height.
        expect(side2[2]).toBe(40);
        expect(side2[1]).toBe(20);
    });

    it("puts the end zone rig behind the goal line on the field's center depth", () => {
        const side1 = rigEye(BUILTIN_RIGS.endZone, { side: 1 }, ctx)!;
        const side2 = rigEye(BUILTIN_RIGS.endZone, { side: 2 }, ctx)!;
        expect(side1[0]).toBeLessThan(footprint.minX);
        expect(side2[0]).toBeGreaterThan(footprint.maxX);
        expect(side1[2]).toBe((footprint.minZ + footprint.maxZ) / 2);
    });

    it("honors yard line, height and distance overrides", () => {
        const eye = rigEye(
            BUILTIN_RIGS.pressBox,
            { yardLine: 40, heightM: 12, backM: 20 },
            ctx,
        )!;
        expect(eye[0]).toBeCloseTo(yardLineX(40, stepMeters), 6);
        expect(eye[1]).toBe(12);
        expect(eye[2]).toBe(20);
    });

    it("never puts a camera below the minimum eye height", () => {
        for (const id of Object.keys(BUILTIN_RIGS) as BuiltinRigId[]) {
            const rig = BUILTIN_RIGS[id];
            expect(rig.id).toBe(id);
            const eye = rigEye(rig, undefined, ctx);
            if (eye) expect(eye[1]).toBeGreaterThanOrEqual(MIN_EYE_HEIGHT);
            const low = rigEye(rig, { heightM: 0.1 }, ctx);
            if (low) expect(low[1]).toBe(MIN_EYE_HEIGHT);
        }
        expect(
            rigEye(BUILTIN_RIGS.lowSideline, { heightM: 0.1 }, ctx)![1],
        ).toBe(0.5);
    });

    it("has no eye for rigs that are placed from the subject", () => {
        expect(rigEye(BUILTIN_RIGS.closeUp, undefined, ctx)).toBeNull();
        expect(rigEye(BUILTIN_RIGS.follow, undefined, ctx)).toBeNull();
        expect(rigEye(BUILTIN_RIGS.aerial, undefined, ctx)).toBeNull();
        expect(rigEye(BUILTIN_RIGS.topDown, undefined, ctx)).toBeNull();
    });
});
