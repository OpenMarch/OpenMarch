import { afterEach, beforeEach, describe, expect, it } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { setShapeField } from "@/shapes/field/shapeField";
import { drawingOf } from "../pathPenMode";
import {
    clearPath,
    openPath,
    showPath,
    usePathPenStore,
} from "../pathPenStore";
import type { PathTarget } from "../pathTarget";

/**
 * A loose path (marchers' own copies of one shape: after Detach all, or drawn for hand-picked
 * marchers) is drawn as each marcher's own line, not as a middle line nobody walks (sim round 3:
 * the one line read as one shared path). Edited, every marcher's line follows.
 */

const fieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const STEP = fieldProperties.pixelsPerStep;
const IDS = [10, 11, 12];

const target = (loose: boolean): PathTarget => ({
    timelineId: 1,
    transitionId: 7,
    marcherId: 10,
    start: 0,
    end: 8,
    from: { x: 0, y: 0 },
    to: { x: 8 * STEP, y: 0 },
    routeId: 9,
    points: [{ id: "c1", at: [4 * STEP, 4 * STEP] }],
    group: {
        members: IDS.map((m, i) => ({
            marcherId: m,
            transitionId: 7,
            drill: `B${i + 1}`,
            offset: { x: 0, y: i * 2 * STEP },
            from: { x: 0, y: i * 2 * STEP },
            to: { x: 8 * STEP, y: i * 2 * STEP },
            laneId: m,
            slot: i,
            adjust: null,
        })),
        outside: [],
        ...(loose ? { loose: true } : {}),
    },
});

beforeEach(() => {
    setShapeField({
        fieldProperties: () => fieldProperties,
        zoom: () => 2,
        marchers: () => [],
        drawn: () => new Map(),
    });
});

afterEach(() => {
    clearPath();
    setShapeField(null);
});

const session = () => usePathPenStore.getState().session;

describe("a loose path's drawing", () => {
    it("quiet with all its marchers selected: each one's own line, no middle line", () => {
        showPath(target(true), "3");
        const d = drawingOf(session(), IDS)!;
        expect(d.outline).toBeNull();
        expect(d.laneIds).toEqual(IDS);
        expect(d.lanes).toHaveLength(3);
    });

    it("a group path selected whole keeps its one middle line", () => {
        showPath(target(false), "3");
        const d = drawingOf(session(), IDS)!;
        expect(d.outline).not.toBeNull();
        expect(d.laneIds ?? []).toEqual([]);
    });

    it("edited: the middle line with its handles, and every marcher's line following", () => {
        showPath(target(true), "3");
        openPath();
        const d = drawingOf(session(), IDS)!;
        expect(d.outline).not.toBeNull();
        expect(d.laneIds).toEqual(IDS);
    });
});
