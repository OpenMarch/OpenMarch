import { describe, expect, it } from "vitest";
import { pixelsToWorld } from "@openmarch/core";
import FieldPropertiesTemplates from "../../../../global/classes/FieldProperties.templates";
import {
    FRONT_HEADING,
    SLIDE_BAND,
    marcherHeading,
    travelDirection,
} from "../facing";
import { writeMatrix } from "../../../vendor/om-pose/instanced-marchers.js";

const fp = FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES;
const deg = (r: number) => (r * 180) / Math.PI;

/** World travel for a move of (dxPx, dyPx) canvas pixels. */
function canvasTravel(dxPx: number, dyPx: number) {
    const x0 = fp.centerFrontPoint.xPixels - 200;
    const y0 = fp.centerFrontPoint.yPixels - 300;
    const a = pixelsToWorld(fp, { x: x0, y: y0 });
    const b = pixelsToWorld(fp, { x: x0 + dxPx, y: y0 + dyPx });
    return [b.x - a.x, b.z - a.z] as const;
}

describe("marcher facing", () => {
    it("faces the front sideline at heading 0", () => {
        expect(FRONT_HEADING).toBe(0);
        expect(marcherHeading()).toBe(0);
    });

    it("draws the body's +Z (its front) toward the audience, +X (its left) toward side 2", () => {
        const m = new Float32Array(16);
        writeMatrix(m, 0, 3, -20, marcherHeading(), 1);
        // columns: local +X -> (m[0], m[2]), local +Z -> (m[8], m[10])
        const col = (k: number) => [m[k], m[k + 1], m[k + 2]].map((v) => v + 0); // -0 to 0
        expect(col(8)).toEqual([0, 0, 1]);
        expect(col(0)).toEqual([1, 0, 0]);
        expect([m[12], m[14]]).toEqual([3, -20]);
    });
});

describe("travel direction for a marcher facing front", () => {
    it("marches forward toward the front sideline (down the canvas)", () => {
        const d = travelDirection(...canvasTravel(0, 40));
        expect(d.family).toBe("forward");
        expect(d.legYaw).toBeCloseTo(0, 12);
    });

    it("marches backward toward the back sideline (up the canvas)", () => {
        const d = travelDirection(...canvasTravel(0, -40));
        expect(d.family).toBe("backward");
        expect(d.legYaw).toBeCloseTo(0, 12);
    });

    it("slides to its left toward side 2 (right on the canvas)", () => {
        const d = travelDirection(...canvasTravel(40, 0));
        expect(d.family).toBe("slideL");
        expect(d.legYaw).toBeCloseTo(0, 12);
    });

    it("slides to its right toward side 1 (left on the canvas)", () => {
        const d = travelDirection(...canvasTravel(-40, 0));
        expect(d.family).toBe("slideR");
    });

    it("turns the legs toward a diagonal: 45 degrees front and toward side 2", () => {
        const d = travelDirection(...canvasTravel(40, 40));
        expect(d.family).toBe("forward");
        expect(deg(d.legYaw)).toBeCloseTo(45, 9); // + is toward the performer's left
    });

    it("backs up on a diagonal toward the back sideline and side 1", () => {
        const d = travelDirection(...canvasTravel(-40, -40));
        expect(d.family).toBe("backward");
        expect(deg(d.legYaw)).toBeCloseTo(45, 9);
        expect(deg(d.phi)).toBeCloseTo(-135, 9);
    });

    it("doesn't travel when the dot doesn't move", () => {
        expect(travelDirection(0, 0).family).toBe("none");
    });
});

describe("slides face the 50", () => {
    /** Travel at `angle` degrees from the front (+ toward the performer's left, side 2), any length. */
    const at = (angle: number) => {
        const r = (angle * Math.PI) / 180;
        return [Math.sin(r), Math.cos(r)] as const;
    };

    it("is a 10 degree band either side of sideways", () => {
        expect((SLIDE_BAND * 180) / Math.PI).toBeCloseTo(10, 9);
    });

    it("keeps the forward slide clips when sliding toward the 50", () => {
        const d = travelDirection(...at(90), 0, "toward");
        expect(d.family).toBe("slideL");
        expect(d.legYaw).toBeCloseTo(0, 12);
    });

    it("marches backward with the legs turned 90 degrees when sliding away from the 50", () => {
        const l = travelDirection(...at(90), 0, "away");
        expect(l.family).toBe("backward");
        expect(deg(l.legYaw)).toBeCloseTo(-90, 9);
        const r = travelDirection(...at(-90), 0, "away");
        expect(r.family).toBe("backward");
        expect(deg(r.legYaw)).toBeCloseTo(90, 9);
    });

    it("applies the rule to slides a little ahead of or behind sideways", () => {
        // 95 degrees (a little behind) toward the 50: still a forward gait
        const f = travelDirection(...at(95), 0, "toward");
        expect(f.family).toBe("forward");
        expect(deg(f.legYaw)).toBeCloseTo(95, 9);
        // 85 degrees (a little ahead) away from the 50: a backward gait
        const b = travelDirection(...at(85), 0, "away");
        expect(b.family).toBe("backward");
        expect(deg(b.legYaw)).toBeCloseTo(-95, 9);
    });

    it("flips the feet outside the band: 101 degrees is backward, 79 forward, whatever the 50", () => {
        expect(travelDirection(...at(101), 0, "toward").family).toBe(
            "backward",
        );
        expect(travelDirection(...at(79), 0, "away").family).toBe("forward");
    });

    it("turns the legs toward the travel as before when the 50 gives no answer", () => {
        const d = travelDirection(...at(85), 0, null);
        expect(d.family).toBe("forward");
        expect(deg(d.legYaw)).toBeCloseTo(85, 9);
        expect(travelDirection(...at(-90)).family).toBe("slideR");
    });
});
