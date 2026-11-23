import { describe, expect, it } from "vitest";
import { lineSegments, type LineParams } from "../lineGeometry";
import { lineTool } from "../lineTool";
import { boxesAt } from "../../placed/placedBox";

/**
 * Step 4c (spec L.5, QA-DL-14): Curves saved before keep their params, kind and look. A placed
 * Curve is a Line recipe whose points are all Smooth; the trail drag's Curves add Corners and
 * points that hold no marcher, which the Line already had, so nothing a stored Curve reads changes.
 */
const STORED_CURVE: LineParams = {
    points: [
        { x: 100, y: 200, tension: 1 },
        { x: 160, y: 150, tension: 1 },
        { x: 230, y: 210, tension: 1 },
        { x: 300, y: 160, tension: 1 },
    ],
    spacing: { mode: "fit" },
};
const round = (n: number) => Math.round(n * 1e6) / 1e6;

describe("a Curve saved before step 4c", () => {
    it("reads back as a Line with the same params, spots and outline", () => {
        const [box] = boxesAt({
            recipes: [
                {
                    id: 1,
                    timelineId: null,
                    kind: "line",
                    kindVersion: 2,
                    params: { ...STORED_CURVE, spots: 5 },
                    orderMode: "keep",
                    reverse: false,
                    members: [],
                },
            ].map((r) => ({
                ...r,
                members: [1, 2, 3, 4, 5].map((id, slot) => ({
                    marcherId: id,
                    slot,
                    x: 0,
                    y: 0,
                })),
            })),
            endBeatOf: () => 0,
            beat: 0,
            positionOf: () => ({ x: 0, y: 0 }),
        });
        expect(box?.kind).toBe(lineTool);
        expect(box?.params).toEqual(STORED_CURVE);
        const spots = lineTool.shape
            .generate(STORED_CURVE, 5, { stepPx: 12, snapPoint: (p) => p })
            .map((s) => [round(s.x), round(s.y)]);
        expect(spots).toMatchInlineSnapshot(`
          [
            [
              100,
              200,
            ],
            [
              146.590277,
              154.205004,
            ],
            [
              197.336957,
              183.212674,
            ],
            [
              250.62826,
              202.929032,
            ],
            [
              300,
              160,
            ],
          ]
        `);
        expect(
            lineSegments(STORED_CURVE).map((s) =>
                s.type === "cubic"
                    ? [
                          round(s.c1.x),
                          round(s.c1.y),
                          round(s.c2.x),
                          round(s.c2.y),
                      ]
                    : s.type,
            ),
        ).toMatchInlineSnapshot(`
          [
            [
              120,
              183.333333,
              139.292562,
              149.856205,
            ],
            [
              182.498245,
              150.15623,
              206.248249,
              208.949765,
            ],
            [
              252.942927,
              211.014471,
              276.666667,
              176.666667,
            ],
          ]
        `);
    });
});
