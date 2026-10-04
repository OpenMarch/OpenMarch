import { beforeAll, describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector2 } from "three";
import { setTexturePainting } from "@/view3d/core/environment";
import { buildBlank } from "@/view3d/core/kits/blank";
import { buildGym } from "@/view3d/core/kits/gym";
import { buildHs } from "@/view3d/core/kits/hs";
import { buildProKit } from "@/view3d/core/kits/pro";
import type { FieldFootprint, KitBuilder, SeatRow } from "@/view3d/core/types";
import { DEFAULT_VENUE_PARAMS } from "@/view3d/core/venueSettings";
import { pickSeatEye } from "../CameraRig";
import { SEATED_EYE } from "../rigMath";
import { closestOnSegment, snapToSeatRows } from "../seatSnap";

beforeAll(() => setTexturePainting(false));

const row = (points: SeatRow["points"], closed = false): SeatRow => ({
    points,
    closed,
    depth: 0.8,
    side: "home",
});

describe("closestOnSegment", () => {
    it("projects onto the segment and clamps to its ends", () => {
        expect(closestOnSegment([5, 3, 1], [0, 0, 0], [10, 0, 0])).toEqual([
            5, 0, 0,
        ]);
        expect(closestOnSegment([-5, 0, 0], [0, 0, 0], [10, 0, 0])).toEqual([
            0, 0, 0,
        ]);
        expect(closestOnSegment([2, 2, 2], [1, 1, 1], [1, 1, 1])).toEqual([
            1, 1, 1,
        ]);
    });
});

describe("snapToSeatRows", () => {
    const rows = [
        row([
            [-10, 1, 10],
            [10, 1, 10],
        ]),
        row([
            [-10, 2, 11],
            [10, 2, 11],
        ]),
    ];

    it("snaps to the nearest row point", () => {
        const snap = snapToSeatRows([3, 1.1, 10.2], rows)!;
        expect(snap.rowIndex).toBe(0);
        expect(snap.point).toEqual([3, 1, 10]);
        const back = snapToSeatRows([-4, 2.2, 10.9], rows)!;
        expect(back.rowIndex).toBe(1);
        expect(back.point).toEqual([-4, 2, 11]);
    });

    it("clamps to a row's end", () => {
        expect(snapToSeatRows([40, 1, 10], rows)!.point).toEqual([10, 1, 10]);
    });

    it("uses the closing segment of closed rows", () => {
        const ring = row(
            [
                [0, 0, 0],
                [10, 0, 0],
                [10, 0, 10],
                [0, 0, 10],
            ],
            true,
        );
        const snap = snapToSeatRows([-1, 0, 5], [ring])!;
        expect(snap.point).toEqual([0, 0, 5]);
    });

    it("returns null without rows", () => {
        expect(snapToSeatRows([0, 0, 0], [])).toBeNull();
        expect(snapToSeatRows([0, 0, 0], [row([])])).toBeNull();
    });
});

/** A football field with end zones, in world meters. */
const footprint: FieldFootprint = {
    minX: -54.86,
    maxX: 54.86,
    minZ: -48.77,
    maxZ: 0,
};

function build(builder: KitBuilder) {
    return builder({
        footprint,
        params: { ...DEFAULT_VENUE_PARAMS },
        quality: "low",
    });
}

describe("pickSeatEye", () => {
    const kits: [string, KitBuilder][] = [
        ["hs", buildHs],
        ["pro", buildProKit],
        ["gym", buildGym],
    ];

    for (const [id, builder] of kits) {
        it(`seats the eye 1.2 m above a tread on a seat row (${id})`, () => {
            const kit = build(builder);
            // Look from the press box (or first camera) at a front-side row.
            const r = kit.seatRows[Math.min(5, kit.seatRows.length - 1)];
            const p = r.points[0];
            const q = r.points[1];
            const aim = [(p[0] + q[0]) / 2, p[1], (p[2] + q[2]) / 2] as const;
            const camera = new PerspectiveCamera(45, 1, 0.3, 3000);
            camera.position.set(aim[0] + 2, aim[1] + 30, aim[2] + 60);
            camera.lookAt(aim[0], aim[1], aim[2]);
            camera.updateMatrixWorld();
            camera.updateProjectionMatrix();
            const eye = pickSeatEye(kit, camera, new Vector2(0, 0));
            expect(eye).not.toBeNull();
            const snap = snapToSeatRows(
                [eye![0], eye![1] - SEATED_EYE, eye![2]],
                kit.seatRows,
            )!;
            // On a row horizontally...
            expect(
                Math.hypot(snap.point[0] - eye![0], snap.point[2] - eye![2]),
            ).toBeLessThan(1e-6);
            // ...and a seated eye above its tread (rows sit on the tread or
            // up to bench height).
            const above = eye![1] - snap.point[1];
            expect(above).toBeGreaterThan(SEATED_EYE - 0.5);
            expect(above).toBeLessThanOrEqual(SEATED_EYE + 1e-6);
            kit.dispose();
        });
    }

    it("misses in a kit without stands", () => {
        const kit = build(buildBlank);
        const camera = new PerspectiveCamera();
        camera.position.set(0, 50, 50);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        expect(pickSeatEye(kit, camera, new Vector2(0, 0))).toBeNull();
        kit.dispose();
    });
});
