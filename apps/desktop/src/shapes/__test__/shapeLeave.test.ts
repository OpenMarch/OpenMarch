import { afterEach, describe, expect, it } from "vitest";
import { boxTool } from "../box/boxTool";
import {
    edit,
    openTool,
    pointerMove,
    press,
    release,
    targetsOf,
    type ToolState,
} from "../tool/toolMachine";
import type { ToolEnv } from "../tool/toolKind";
import type { ShapeContext } from "../types";
import {
    closeShapeTool,
    openShapeTool,
    useShapeToolStore,
} from "../tool/shapeToolStore";
import {
    discardShapeTool,
    forgetDiscardedShape,
    hasDiscardedShape,
    restoreDiscardedShape,
} from "../tool/shapeLeave";
import type { CanvasEditPlan } from "@/timeline/timelineCoordinateWrites";

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    constrain: false,
    gridSnap: (p) => ({ x: snapHalf(p.x), y: snapHalf(p.y) }),
    hitRadius: 3,
};
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };
const marchers = Array.from({ length: 4 }, (_, i) => ({
    id: i + 1,
    at: { x: 300 + i * 7, y: 300 },
    drillRank: i,
}));

/** The moment the tool opened at: the window from beat 16 to 32 */
const WINDOW: CanvasEditPlan = {
    ok: true,
    target: { kind: "range", start: 16, end: 32 },
    beat: 32,
};

/** The box tool open on four marchers with a 4-step box drawn */
function drawn(): ToolState {
    let tool = openTool(boxTool, marchers);
    tool = press(tool, { x: 0, y: 0 }, env);
    tool = pointerMove(tool, { x: 40, y: 40 }, env);
    return release(tool, ctx);
}

const openTool$ = () => useShapeToolStore.getState().tool;

afterEach(() => {
    closeShapeTool();
    forgetDiscardedShape();
});

describe("Escape on an open shape", () => {
    it("discards it, and undo right after brings it back with its numbers and who goes where", () => {
        let tool = drawn();
        // An edit inside the tool, so its own history comes back too
        tool = edit(tool, { ...(tool.params as object), across: 20 }, ctx);
        openShapeTool(tool, WINDOW);
        discardShapeTool();
        expect(openTool$()).toBeNull();
        expect(hasDiscardedShape()).toBe(true);

        expect(restoreDiscardedShape()).toBe(true);
        const back = openTool$()!;
        expect(back.params).toEqual(tool.params);
        expect(back.assignment).toEqual(tool.assignment);
        expect(targetsOf(back, ctx)).toEqual(targetsOf(tool, ctx));
        expect(back.past).toHaveLength(tool.past.length);
        expect(useShapeToolStore.getState().openedAt).toBe(WINDOW);
        // Once only
        expect(hasDiscardedShape()).toBe(false);
        closeShapeTool();
        expect(restoreDiscardedShape()).toBe(false);
    });

    it("leaves nothing to bring back when no shape was drawn", () => {
        openShapeTool(openTool(boxTool, marchers), WINDOW);
        discardShapeTool();
        expect(openTool$()).toBeNull();
        expect(hasDiscardedShape()).toBe(false);
    });

    it("can't be undone once another shape opens or it is forgotten", () => {
        openShapeTool(drawn(), WINDOW);
        discardShapeTool();
        openShapeTool(openTool(boxTool, marchers), WINDOW);
        expect(hasDiscardedShape()).toBe(false);
        closeShapeTool();

        openShapeTool(drawn(), WINDOW);
        discardShapeTool();
        forgetDiscardedShape();
        expect(restoreDiscardedShape()).toBe(false);
        expect(openTool$()).toBeNull();
    });
});
