import { describe, expect, it } from "vitest";
import { lineTool } from "../../line/lineTool";
import type { LineParams } from "../../line/lineGeometry";
import type { ToolEnv } from "../../tool/toolKind";
import { rowsGapDrawing } from "../rowsGapDrawing";

/**
 * What the field draws of a Line's rows while their Rows apart or Slant number is engaged
 * (#1190): the gap from the drawn row to the next, each leg labeled as the menu's numbers read.
 * Nothing otherwise. A drawing only.
 */

const STEP = 10;
const half = STEP / 2;
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    constrain: false,
    gridSnap: (p) => ({
        x: Math.round(p.x / half) * half,
        y: Math.round(p.y / half) * half,
    }),
    hitRadius: 3,
};
const N = 16;
const rows = lineTool.rows!;
const line = (): LineParams =>
    lineTool.draw({ x: 100, y: 200 }, { x: 180, y: 200 }, N, env)!;
const withRow = (): LineParams => rows.add(line(), N, "far", env)!;

describe("the rows' gap on the field", () => {
    it("shows only while a Rows apart or Slant number is engaged", () => {
        expect(rowsGapDrawing(lineTool, withRow(), N, false, STEP)).toEqual({});
    });

    it("shows nothing for the drawn line alone", () => {
        expect(rowsGapDrawing(lineTool, line(), N, true, STEP)).toEqual({});
    });

    it("labels the gap in steps, with no slant leg when the rows don't lean", () => {
        const { rowsGap } = rowsGapDrawing(lineTool, withRow(), N, true, STEP);
        expect(rowsGap?.apart).toBe("2 steps apart");
        expect(rowsGap?.slant).toBeNull();
        expect(rowsGap?.corner.y).toBeCloseTo(180);
    });

    it("says one step, and labels the slant as the menu reads it", () => {
        let p = rows.apart.type(withRow(), N, "1", env)!;
        p = rows.slant.type(p, N, "-1½", env)!;
        const { rowsGap } = rowsGapDrawing(lineTool, p, N, true, STEP);
        expect(rowsGap?.apart).toBe("1 step apart");
        expect(rowsGap?.slant).toBe(`Slant ${rows.slant.display(p, N, STEP)}`);
        expect(rowsGap!.to.x - rowsGap!.corner.x).toBeCloseTo(-1.5 * STEP);
    });
});
