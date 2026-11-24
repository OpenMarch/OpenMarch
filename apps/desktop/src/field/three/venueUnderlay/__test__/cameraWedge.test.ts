import { describe, expect, it } from "vitest";
import { worldToPixels } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { View3dCameraPose } from "@/view3d/sync/protocol";
import {
    cameraAim,
    cameraAimedAt,
    cameraMovedTo,
    cameraWedge,
    poseLooking,
} from "../cameraWedge";

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

describe("moving the camera from the field", () => {
    it("aims at the ground where the middle of the view meets it", () => {
        // 15 m up, tipped 30° down: the ground 15·√3 ≈ 26 m ahead
        const [x, y, z] = cameraAim(pose());
        expect(x).toBeCloseTo(0);
        expect(y).toBeCloseTo(0);
        expect(z).toBeCloseTo(20 - 15 * Math.sqrt(3));
    });

    it("aims level ahead when the camera looks at the horizon", () => {
        const [, y, z] = cameraAim(pose({ direction: [0, 0, -1] }));
        expect(y).toBe(15);
        expect(z).toBeLessThan(20);
    });

    it("carries the camera across the ground at its height, looking the same way", () => {
        const start = pose();
        const moved = cameraMovedTo(start, 10, 5);
        expect(moved.position).toEqual([10, 15, 5]);
        const after = poseLooking(start, moved.position, moved.target);
        after.direction.forEach((n, i) =>
            expect(n).toBeCloseTo(start.direction[i]),
        );
    });

    it("turns the camera to look at a spot on the ground, where it stands", () => {
        const aimed = cameraAimedAt(pose(), 30, -10);
        expect(aimed.position).toEqual([0, 15, 20]);
        expect(aimed.target).toEqual([30, 0, -10]);
        expect(
            cameraAim(poseLooking(pose(), aimed.position, aimed.target))[0],
        ).toBeCloseTo(30);
    });

    it("keeps the pitch exactly, even looking up at the stands", () => {
        const start = pose({ direction: [0, 0.2, -Math.sqrt(0.96)] });
        const moved = cameraMovedTo(start, 5, 0);
        const after = poseLooking(start, moved.position, moved.target);
        after.direction.forEach((n, i) =>
            expect(n).toBeCloseTo(start.direction[i]),
        );
    });

    it("moves a camera looking straight down", () => {
        const start = pose({ position: [0, 40, -25], direction: [0, -1, 0] });
        const moved = cameraMovedTo(start, 10, -25);
        expect(moved.target).not.toEqual(moved.position);
        expect(cameraAim(start)).toEqual([0, 0, -25]);
    });

    it("keeps the ring under the pointer when aiming far across the stadium", () => {
        const aimed = cameraAimedAt(pose(), 0, -150);
        const after = poseLooking(pose(), aimed.position, aimed.target);
        expect(cameraAim(after)[2]).toBeCloseTo(-150);
    });

    it("keeps a direction when aimed at its own feet", () => {
        const aimed = cameraAimedAt(pose(), 0, 20);
        expect(aimed.target[2]).toBeLessThan(20);
    });
});
