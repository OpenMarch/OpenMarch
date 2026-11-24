import { describe, expect, it } from "vitest";
import { worldToPixels } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { View3dCameraPose } from "@/view3d/sync/protocol";
import { cameraWedge } from "../cameraWedge";

const fp = FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
const pose = (over: Partial<View3dCameraPose> = {}): View3dCameraPose => ({
    // In the press box: 20 m in front of the front sideline, 15 m up
    position: [0, 15, 20],
    // Looking at the field (toward -z), tipped down
    direction: [0, -0.5, -Math.sqrt(0.75)],
    fov: 50,
    aspect: 1.6,
    ...over,
});

describe("cameraWedge", () => {
    it("starts where the camera stands", () => {
        const w = cameraWedge(pose(), fp)!;
        expect(w.apex).toEqual(worldToPixels(fp, { x: 0, z: 20 }));
    });

    it("points the way the camera looks, as wide as its view", () => {
        const w = cameraWedge(pose(), fp)!;
        // Toward the back of the field: up the 2D field, where y is smaller
        expect(w.left.y).toBeLessThan(w.apex.y);
        expect(w.right.y).toBeLessThan(w.apex.y);
        expect(w.left.x).not.toBeCloseTo(w.right.x);
        // Symmetric about the line of sight
        expect(w.left.x - w.apex.x).toBeCloseTo(-(w.right.x - w.apex.x));
    });

    it("reaches about as far as the middle of the view meets the ground", () => {
        const steep = cameraWedge(
            pose({ direction: [0, -Math.sqrt(0.75), -0.5] }),
            fp,
        )!;
        const shallow = cameraWedge(pose(), fp)!;
        expect(steep.apex.y - steep.left.y).toBeLessThan(
            shallow.apex.y - shallow.left.y,
        );
    });

    it("has no wedge looking straight down", () => {
        expect(cameraWedge(pose({ direction: [0, -1, 0] }), fp)).toBeNull();
    });

    it("still draws a wedge looking above the horizon", () => {
        expect(
            cameraWedge(pose({ direction: [0, 0.2, -0.98] }), fp),
        ).not.toBeNull();
    });
});
