// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useWorkspaceViewStore } from "@/stores/WorkspaceViewStore";
import { useEditorModeStore } from "@/stores/EditorModeStore";
import { usePreviewModeStore } from "@/stores/PreviewModeStore";
import { boxTool } from "../box/boxTool";
import { openTool } from "../tool/toolMachine";
import {
    goBackTo,
    isAwayFrom,
    momentLabel,
    momentOf,
} from "../tool/shapeMoment";
import {
    closeShapeTool,
    isShapeAway,
    isShapeHidden,
    openShapeTool,
    useShapeToolStore,
} from "../tool/shapeToolStore";
import {
    discardShapeTool,
    forgetDiscardedShape,
    hasDiscardedShape,
    restoreDiscardedShape,
    startOverWaitingShape,
    undoOpenShape,
} from "../tool/shapeLeave";
import type { ToolState } from "../tool/toolMachine";

const store = () => useTimelineSelectionStore.getState();

/** Page boxes for flags at 9, 17 and 25 */
const BOXES = [
    { start: 1, end: 9 },
    { start: 9, end: 17 },
    { start: 17, end: 25 },
];

const marchers = [1, 2].map((id) => ({
    id,
    at: { x: 100 * id, y: 100 },
    drillRank: id,
}));
/** Discarding keeps only a drawn shape, so this one has numbers */
const drawn = (): ToolState => ({
    ...openTool(boxTool, marchers),
    params: {} as never,
});

beforeEach(() => {
    store().reset();
    store().setPageBoxes(BOXES);
});

afterEach(() => {
    closeShapeTool();
    forgetDiscardedShape();
});

describe.each([
    ["Expert", true],
    ["Basic", false],
] as const)("an open shape's moment (#416), %s", (_mode, startStays) => {
    beforeEach(() => store().setStartStays(startStays));

    it("is away once the playhead moves, and back by Go back", () => {
        store().selectRange(9, 12);
        const moment = momentOf();
        expect(isAwayFrom(moment)).toBe(false);

        store().seek(20);
        expect(isAwayFrom(moment)).toBe(true);

        goBackTo(moment);
        expect(isAwayFrom(moment)).toBe(false);
        expect(store().startBeat).toBe(9);
        expect(store().playheadBeat).toBe(12);
    });

    it("at home, Go back goes home", () => {
        const moment = momentOf();
        expect(momentLabel(moment)).toBe("home");
        store().seek(5);
        expect(isAwayFrom(moment)).toBe(true);
        goBackTo(moment);
        expect(store().selection).toEqual({ kind: "home" });
        expect(isAwayFrom(moment)).toBe(false);
    });

    it("coming back by another route counts too", () => {
        store().selectRange(9, 12);
        const moment = momentOf();
        store().selectRange(1, 9);
        store().selectRange(9, 12);
        expect(isAwayFrom(moment)).toBe(false);
    });
});

describe("an open shape's moment (#416)", () => {
    it("labels the shape's count", () => {
        store().selectRange(9, 12);
        expect(momentLabel(momentOf())).toBe("count 12");
    });

    it("isolating a move is away too, and Go back comes back out of it", () => {
        store().setStoredTimelines([
            { id: 7, start: 9, end: 17, marcherIds: new Set([1]) },
        ]);
        store().selectRange(9, 12);
        const moment = momentOf();
        store().isolate(7);
        expect(isAwayFrom(moment)).toBe(true);
        goBackTo(moment);
        expect(store().isolation).toBeNull();
        expect(isAwayFrom(moment)).toBe(false);
    });

    it("a shape drawn in isolation goes back into it", () => {
        store().setStoredTimelines([
            { id: 7, start: 9, end: 17, marcherIds: new Set([1]) },
        ]);
        store().selectRange(9, 17);
        store().isolate(7);
        const moment = momentOf();
        store().exitIsolation();
        store().selectRange(1, 9);
        expect(isAwayFrom(moment)).toBe(true);
        goBackTo(moment);
        expect(store().isolation?.timelineId).toBe(7);
        expect(isAwayFrom(moment)).toBe(false);
    });

    it("an open shape is away only while a shape is open and its moment is elsewhere", () => {
        expect(isShapeAway()).toBe(false);
        store().selectRange(9, 12);
        openShapeTool(drawn(), null);
        expect(isShapeAway()).toBe(false);
        store().seek(20);
        expect(isShapeAway()).toBe(true);
        closeShapeTool();
        expect(isShapeAway()).toBe(false);
        expect(useShapeToolStore.getState().moment).toBeNull();
    });

    it("an open shape waits hidden while the show plays, in Visuals and in Preview", () => {
        store().selectRange(9, 12);
        openShapeTool(drawn(), null);
        expect(isShapeHidden()).toBe(false);

        store().setPlayback({ kind: "on" });
        expect(isShapeHidden()).toBe(true);
        expect(isShapeAway()).toBe(false);
        store().setPlayback(null);
        expect(isShapeHidden()).toBe(false);

        useEditorModeStore.setState({ mode: "expert" });
        useWorkspaceViewStore.getState().setView("visuals");
        expect(isShapeHidden()).toBe(true);
        useWorkspaceViewStore.getState().setView("editor");
        expect(isShapeHidden()).toBe(false);

        usePreviewModeStore.setState({ isPreview: true });
        expect(isShapeHidden()).toBe(true);
        usePreviewModeStore.setState({ isPreview: false });

        store().seek(20);
        expect(isShapeHidden()).toBe(true);
    });

    it("a shape discarded while away comes back on undo with its own moment", () => {
        store().selectRange(9, 12);
        openShapeTool(drawn(), null);
        const moment = useShapeToolStore.getState().moment;
        store().seek(20);
        discardShapeTool();
        expect(restoreDiscardedShape()).toBe(true);
        expect(useShapeToolStore.getState().moment).toEqual(moment);
        expect(isShapeAway()).toBe(true);
    });

    it("a new shape started away from a waiting one dismisses it, and undo before drawing brings it back", () => {
        store().selectRange(9, 12);
        const waiting = drawn();
        openShapeTool(waiting, null);
        const moment = useShapeToolStore.getState().moment;
        store().seek(20);

        startOverWaitingShape();
        expect(useShapeToolStore.getState().tool).toBeNull();
        expect(hasDiscardedShape()).toBe(true);
        openShapeTool(openTool(boxTool, marchers), null, undefined, {
            keepDiscarded: true,
        });
        expect(isShapeAway()).toBe(false);
        expect(hasDiscardedShape()).toBe(true);

        // Nothing drawn yet: undo brings the waiting shape back, away at its own moment
        undoOpenShape();
        expect(useShapeToolStore.getState().tool).toBe(waiting);
        expect(useShapeToolStore.getState().moment).toEqual(moment);
        expect(isShapeAway()).toBe(true);
    });

    it("starting over does nothing to a shape at its own moment", () => {
        store().selectRange(9, 12);
        const tool = drawn();
        openShapeTool(tool, null);
        startOverWaitingShape();
        expect(useShapeToolStore.getState().tool).toBe(tool);
        expect(hasDiscardedShape()).toBe(false);
    });

    it("undo on an open shape with its own history steps through it", () => {
        const tool = { ...drawn(), past: [{ ...drawn(), past: [] }] } as never;
        openShapeTool(tool, null);
        useShapeToolStore.setState({
            discarded: { tool: drawn(), openedAt: null, moment: null },
        });
        undoOpenShape();
        expect(useShapeToolStore.getState().tool).not.toBe(tool);
        expect(useShapeToolStore.getState().tool).not.toBeNull();
        expect(hasDiscardedShape()).toBe(true);
    });
});
