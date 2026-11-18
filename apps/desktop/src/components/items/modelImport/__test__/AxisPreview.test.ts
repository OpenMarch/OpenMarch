import { describe, expect, it } from "vitest";
import { tipped, UPRIGHT } from "@/showAssets/modelImport/orientation";
import { SWING } from "../AxisPreview";

/** A file axis after the tilt, then the turn about +Y, as the import applies them */
function placed(
    tilt: readonly number[],
    turn: number,
    v: readonly number[],
): number[] {
    const t = [0, 1, 2].map(
        (r) =>
            tilt[r * 3] * v[0] +
            tilt[r * 3 + 1] * v[1] +
            tilt[r * 3 + 2] * v[2],
    );
    const c = Math.round(Math.cos((turn * Math.PI) / 180));
    const s = Math.round(Math.sin((turn * Math.PI) / 180));
    return [c * t[0] + s * t[2], t[1], -s * t[0] + c * t[2]].map((n) => n + 0);
}

describe("the axis preview's arrows", () => {
    it("swing the way Rotate X and Rotate Z tip the model", () => {
        for (const axis of ["x", "z"] as const) {
            const [from, toward] = SWING[axis];
            expect(placed(tipped(UPRIGHT, 0, axis), 0, from)).toEqual(toward);
        }
    });

    it("swing the way Rotate Y turns it", () => {
        const [from, toward] = SWING.y;
        expect(placed(UPRIGHT, 90, from)).toEqual(toward);
    });
});
