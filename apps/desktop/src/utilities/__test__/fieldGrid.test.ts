import { describe, expect, it } from "vitest";
import { Checkpoint, FieldProperties } from "@openmarch/core";
import { mockNCAAFieldProperties } from "@/__mocks__/globalMocks";
import {
    getRoundCoordinates,
    getRoundCoordinates2,
} from "../CoordinateActions";
import { gridYAnchorSteps } from "../fieldGrid";
import MarcherPage from "@/global/classes/MarcherPage";

const yCheckpoint = (
    id: number,
    stepsFromCenterFront: number,
    visible: boolean,
): Checkpoint => ({
    id,
    name: `checkpoint ${id}`,
    terseName: `c${id}`,
    axis: "y",
    stepsFromCenterFront,
    useAsReference: true,
    visible,
});

/** A field whose front sideline is hidden and whose front hash is 32.5 steps back */
const offGridYCheckpoints = [
    yCheckpoint(1, 0, false),
    yCheckpoint(2, -32.5, true),
    yCheckpoint(3, -85, true),
];

describe("gridYAnchorSteps", () => {
    it("anchors the grid to the front-most visible checkpoint when it is off the whole-step grid", () => {
        expect(gridYAnchorSteps(offGridYCheckpoints)).toBe(-32.5);
    });

    it("anchors the grid to the front checkpoint when the front-most visible one is on a whole step", () => {
        expect(
            gridYAnchorSteps([
                yCheckpoint(1, 0, true),
                yCheckpoint(2, -32.5, true),
            ]),
        ).toBe(0);
    });

    it("does not reorder the field's checkpoints", () => {
        const checkpoints = [
            yCheckpoint(3, -85, true),
            yCheckpoint(1, 0, false),
            yCheckpoint(2, -32.5, true),
        ];
        gridYAnchorSteps(checkpoints);
        expect(checkpoints.map((c) => c.id)).toEqual([3, 1, 2]);
    });
});

describe("coordinate rounding on a field with an off-grid front hash", () => {
    const pixelsPerStep = 20;
    const centerFrontPoint = { xPixels: 1000, yPixels: 1000 };
    // Grid lines sit at 32.5, 33.5, ... steps behind the front
    const gridLineY = (stepsBehindFront: number) =>
        centerFrontPoint.yPixels - stepsBehindFront * pixelsPerStep;

    it("snaps dragged marchers onto the drawn grid lines", () => {
        const rounded = getRoundCoordinates2({
            coordinate: { xPixels: 1000, yPixels: gridLineY(40.4) },
            uiSettings: {
                coordinateRounding: { nearestXSteps: 1, nearestYSteps: 1 },
            },
            fieldProperties: {
                centerFrontPoint,
                pixelsPerStep,
                yCheckpoints: offGridYCheckpoints,
            },
        });
        expect(rounded.yPixels).toBeCloseTo(gridLineY(40.5));
    });

    it("keeps a user-set Y reference point", () => {
        const rounded = getRoundCoordinates2({
            coordinate: { xPixels: 1000, yPixels: gridLineY(40.4) },
            uiSettings: {
                coordinateRounding: {
                    nearestXSteps: 1,
                    nearestYSteps: 1,
                    referencePointY: 0,
                },
            },
            fieldProperties: {
                centerFrontPoint,
                pixelsPerStep,
                yCheckpoints: offGridYCheckpoints,
            },
        });
        expect(rounded.yPixels).toBeCloseTo(gridLineY(40));
    });

    it("applies snap onto the drawn grid lines", () => {
        const fieldProperties = new FieldProperties({
            ...mockNCAAFieldProperties,
            yCheckpoints: offGridYCheckpoints,
        });
        const stepsToY = (stepsBehindFront: number) =>
            fieldProperties.centerFrontPoint.yPixels -
            stepsBehindFront * fieldProperties.pixelsPerStep;
        const [change] = getRoundCoordinates({
            marcherPages: [
                {
                    marcher_id: 1,
                    page_id: 1,
                    x: fieldProperties.centerFrontPoint.xPixels,
                    y: stepsToY(40.4),
                } as MarcherPage,
            ],
            denominatorX: 1,
            denominatorY: 1,
            fieldProperties,
            xAxis: true,
            yAxis: true,
        });
        expect(change.y).toBeCloseTo(stepsToY(40.5));
    });

    it("breaks a halfway tie the same way when dragging and when applying snap", () => {
        // 40 steps back is halfway between the 39.5 and 40.5 grid lines
        const y = gridLineY(40);
        const dragged = getRoundCoordinates2({
            coordinate: { xPixels: 1000, yPixels: y },
            uiSettings: {
                coordinateRounding: { nearestXSteps: 1, nearestYSteps: 1 },
            },
            fieldProperties: {
                centerFrontPoint,
                pixelsPerStep,
                yCheckpoints: offGridYCheckpoints,
            },
        });
        const [applied] = getRoundCoordinates({
            marcherPages: [
                { marcher_id: 1, page_id: 1, x: 1000, y } as MarcherPage,
            ],
            denominatorX: 1,
            denominatorY: 1,
            fieldProperties: {
                centerFrontPoint,
                pixelsPerStep,
                yCheckpoints: offGridYCheckpoints,
            } as FieldProperties,
            xAxis: true,
            yAxis: true,
        });
        expect(applied.y).toBeCloseTo(gridLineY(39.5));
        expect(dragged.yPixels).toBeCloseTo(applied.y);
    });
});
