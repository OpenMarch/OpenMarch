import { describe, expect, it } from "vitest";
import { lineTool } from "../../line/lineTool";
import type { LineParams } from "../../line/lineGeometry";
import { withPivot } from "../../frame/pivot";
import type { ToolEnv } from "../../tool/toolKind";
import { stepDrawing } from "../stepDrawing";

/**
 * What the field draws of a Line's offset while its numbers are engaged (owner on #596): the step
 * from the first marcher to the next as a right angle, each leg labeled as the editor's numbers
 * read, and the pivot it grows from lit. Nothing otherwise. A drawing only.
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
const N = 5;
const measured = lineTool.choices!.find((c) => c.key === "measured")!;

/** 5 marchers from (100, 100), each 2 steps right and 1 up the screen from the last */
const rising = (): LineParams =>
    measured.pick(
        withPivot(
            lineTool.draw({ x: 100, y: 100 }, { x: 180, y: 60 }, N, env)!,
            "w",
        ),
        N,
        "offset",
        env,
    );

describe("the step drawing", () => {
    it("is drawn only while the offset numbers are engaged, or an end is dragged", () => {
        const p = rising();
        expect(stepDrawing(lineTool, p, N, false, null, STEP)).toEqual({});
        expect(
            stepDrawing(lineTool, p, N, false, { type: "move" }, STEP),
        ).toEqual({});
        expect(
            stepDrawing(lineTool, p, N, true, null, STEP).offsetStep,
        ).toBeDefined();
        expect(
            stepDrawing(lineTool, p, N, false, { type: "handle" }, STEP)
                .offsetStep,
        ).toBeDefined();
    });

    it("runs from the first marcher across then up, labeled as the editor reads, the pivot lit", () => {
        const out = stepDrawing(lineTool, rising(), N, true, null, STEP);
        expect(out.offsetStep).toEqual({
            from: { x: 100, y: 100 },
            corner: { x: 120, y: 100 },
            to: { x: 120, y: 90 },
            across: "↔ 2",
            deep: "↕ 1",
        });
        expect(out.pivotPreview).toEqual({ x: 100, y: 100 });
    });

    it("reads down the screen below 0, and from the end the pivot is at", () => {
        const p = rising();
        // The pivot at the far end: the step goes from there, back and down
        const far = withPivot(p, "e");
        const out = stepDrawing(lineTool, far, N, true, null, STEP);
        expect(out.offsetStep).toMatchObject({
            from: { x: 180, y: 60 },
            to: { x: 160, y: 70 },
            across: "↔ −2",
            deep: "↕ −1",
        });
        expect(out.pivotPreview).toEqual({ x: 180, y: 60 });
    });

    it("has nothing to draw on a line not measured as an offset", () => {
        const plain = lineTool.draw(
            { x: 100, y: 100 },
            { x: 180, y: 60 },
            N,
            env,
        )!;
        expect(stepDrawing(lineTool, plain, N, true, null, STEP)).toEqual({});
    });
});
