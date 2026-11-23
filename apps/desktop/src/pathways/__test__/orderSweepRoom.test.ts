// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { boxTool } from "@/shapes/box/boxTool";
import {
    openTool,
    pointerMove,
    press,
    release,
    type ToolState,
} from "@/shapes/tool/toolMachine";
import type { ToolEnv } from "@/shapes/tool/toolKind";
import {
    closeShapeTool,
    openShapeTool,
    useShapeToolStore,
} from "@/shapes/tool/shapeToolStore";
import { restoreDiscardedShape } from "@/shapes/tool/shapeLeave";
import { clearPath, usePathPenStore, type PathSession } from "../pathPenStore";
import {
    makeRoomForOrderSweep,
    orderSweepBlocked,
    undoInOrderSweep,
} from "../orderSweepRoom";
import {
    cancelOrderSweep,
    openOrderSweep,
    useMarcherOrderStore,
} from "../marcherOrderStore";

/**
 * Set order opens over nothing that hides it (pathways step 4g): an open shape tool is discarded
 * as Escape would (undo brings it back), an open path or Follow tool closes, and a path being
 * drawn with points placed refuses it instead of throwing the drawing away.
 */

const marchers = [1, 2, 3].map((id) => ({
    id,
    at: { x: id * 10, y: 0 },
    drillRank: id,
}));

const env: ToolEnv = {
    stepPx: 10,
    snap: false,
    constrain: false,
    gridSnap: (p) => p,
    hitRadius: 3,
};

/** The box tool open on the three with a box drawn */
function drawnBox(): ToolState {
    let tool = openTool(boxTool, marchers);
    tool = press(tool, { x: 0, y: 0 }, env);
    tool = pointerMove(tool, { x: 40, y: 40 }, env);
    return release(tool, { stepPx: 10, snapPoint: (p) => p });
}

/** A pen session in `phase` with `points` placed, enough for the store's own close */
const penAt = (phase: PathSession["phase"], points = 0) =>
    usePathPenStore.setState({
        session: {
            phase,
            points: Array.from({ length: points }, (_, i) => ({
                id: `p${i}`,
                at: { x: i, y: 0 },
            })),
            target: { routeId: 7, points: [] },
            pointer: null,
            selected: null,
            dragging: null,
        } as unknown as PathSession,
    });

/** Set order open on the three */
const openSweep = () =>
    openOrderSweep({
        ids: marchers.map((m) => m.id),
        at: new Map(marchers.map((m) => [m.id, m.at])),
        beat: 8,
        before: null,
    });

afterEach(() => {
    cancelOrderSweep();
    closeShapeTool();
    useShapeToolStore.setState({ discarded: null });
    clearPath();
});

describe("making room for Set order", () => {
    it("discards an open shape tool, which undo can bring back", () => {
        openShapeTool(drawnBox(), null, null);
        expect(makeRoomForOrderSweep()).toBe(true);
        expect(useShapeToolStore.getState().tool).toBeNull();
        expect(restoreDiscardedShape()).toBe(true);
        expect(useShapeToolStore.getState().tool).not.toBeNull();
    });

    it("closes an open path or Follow tool, leaving it drawn", () => {
        penAt("open", 2);
        expect(orderSweepBlocked()).toBeNull();
        expect(makeRoomForOrderSweep()).toBe(true);
        expect(usePathPenStore.getState().session?.phase).toBe("closed");
    });

    it("refuses while a path is drawn with points placed, closing nothing", () => {
        openShapeTool(openTool(boxTool, marchers), null, null);
        penAt("drawing", 1);
        expect(orderSweepBlocked()).toMatch(/finish or cancel the path/i);
        expect(makeRoomForOrderSweep()).toBe(false);
        expect(usePathPenStore.getState().session?.phase).toBe("drawing");
        expect(useShapeToolStore.getState().tool).not.toBeNull();
    });

    it("leaves a closed path alone, and opens over nothing at all", () => {
        penAt("closed", 2);
        expect(makeRoomForOrderSweep()).toBe(true);
        expect(usePathPenStore.getState().session?.phase).toBe("closed");
        clearPath();
        expect(makeRoomForOrderSweep()).toBe(true);
    });
});

describe("undo and redo while Set order is on", () => {
    it("undo cancels it and brings back the shape tool it discarded", () => {
        openShapeTool(drawnBox(), null, null);
        const drawn = useShapeToolStore.getState().tool;
        expect(makeRoomForOrderSweep()).toBe(true);
        openSweep();
        undoInOrderSweep();
        expect(useMarcherOrderStore.getState().sweep).toBeNull();
        expect(useShapeToolStore.getState().tool).toBe(drawn);
        expect(useShapeToolStore.getState().discarded).toBeNull();
    });

    it("with no shape discarded, undo only cancels it", () => {
        expect(makeRoomForOrderSweep()).toBe(true);
        openSweep();
        undoInOrderSweep();
        expect(useMarcherOrderStore.getState().sweep).toBeNull();
        expect(useShapeToolStore.getState().tool).toBeNull();
    });

    it("redo cancels it and keeps the discarded shape for an undo after", () => {
        openShapeTool(drawnBox(), null, null);
        expect(makeRoomForOrderSweep()).toBe(true);
        openSweep();
        undoInOrderSweep(true);
        expect(useMarcherOrderStore.getState().sweep).toBeNull();
        expect(useShapeToolStore.getState().tool).toBeNull();
        expect(restoreDiscardedShape()).toBe(true);
    });
});
