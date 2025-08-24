import { it as baseIt, TestDb, schema, transaction } from "@/test";
import {
    Arc,
    CubicCurve,
    Line,
    Path,
    QuadraticCurve,
    Spline,
} from "@openmarch/path-utility";
import { describe, expect } from "vitest";
import { updateEndpoint } from "../pathways";
import { eq } from "drizzle-orm";

const it = baseIt.extend<{
    pathwaysFixture: {
        existingPathways: Path[];
        db: TestDb;
    };
}>({
    pathwaysFixture: async ({ db }, use) => {
        const existingPathways: Path[] = [
            new Path([new Line({ x: 0, y: 0 }, { x: 100, y: 100 })]),
            new Path([
                new Line({ x: 0, y: 0 }, { x: 100, y: 100 }),
                new Line({ x: 100, y: 100 }, { x: 200, y: 200 }),
            ]),
            new Path([
                new Spline([
                    { x: 0, y: 0 },
                    { x: 100, y: 100 },
                    { x: 200, y: 200 },
                    { x: 300, y: 300 },
                ]),
            ]),
            new Path([
                new Spline([
                    { x: 0, y: 0 },
                    { x: 100, y: 100 },
                    { x: 200, y: 200 },
                    { x: 300, y: 300 },
                ]),
                new Spline([
                    { x: 0, y: 0 },
                    { x: 100, y: 100 },
                    { x: 200, y: 200 },
                    { x: 300, y: 300 },
                ]),
            ]),
            new Path([
                new QuadraticCurve(
                    { x: 0, y: 0 },
                    { x: 100, y: 100 },
                    { x: 200, y: 200 },
                ),
            ]),
            new Path([
                new QuadraticCurve(
                    { x: 0, y: 0 },
                    { x: 100, y: 100 },
                    { x: 200, y: 200 },
                ),
                new QuadraticCurve(
                    { x: 0, y: 1000 },
                    { x: 100, y: 200 },
                    { x: 150, y: 250 },
                ),
            ]),
            new Path([
                new CubicCurve(
                    { x: 0, y: 0 },
                    { x: 100, y: 100 },
                    { x: 150, y: 150 },
                    { x: 200, y: 200 },
                ),
            ]),
            new Path([
                new CubicCurve(
                    { x: 0, y: 0 },
                    { x: 100, y: 100 },
                    { x: 150, y: 150 },
                    { x: 200, y: 200 },
                ),
                new CubicCurve(
                    { x: 0, y: 1000 },
                    { x: 100, y: 1200 },
                    { x: 150, y: 1250 },
                    { x: 200, y: 1300 },
                ),
            ]),
            new Path([
                new Arc({ x: 0, y: 0 }, 100, 100, 0, 0, 0, { x: 200, y: 200 }),
            ]),
            new Path([
                new Arc({ x: 0, y: 0 }, 100, 100, 0, 0, 0, { x: 200, y: 200 }),
                new Arc({ x: 200, y: 200 }, 100, 100, 0, 0, 0, { x: 0, y: 0 }),
            ]),
        ];
        const insertedPathways = await db
            .insert(schema.pathways)
            .values(
                existingPathways.map((pathway) => ({
                    path_data: pathway.toJson(),
                })),
            )
            .returning({
                id: schema.pathways.id,
                path_data: schema.pathways.path_data,
            });
        const dbPathways = insertedPathways.map((p) => Path.fromDb(p));
        await use({ existingPathways: dbPathways, db });
    },
});

describe("pathways", () => {
    it("pathways should exist", async ({
        pathwaysFixture: { existingPathways, db },
    }) => {
        expect(db).toBeDefined();
        const result = await db.select().from(schema.pathways);
        expect(result).toBeDefined();
        expect(result.length).toBe(existingPathways.length);
        expect(result.map((r) => r.path_data)).toEqual(
            existingPathways.map((p) => p.toJson()),
        );
    });

    describe.each<{
        segmentType: string;
        singleIndex: number;
        multiIndex: number;
    }>([
        { segmentType: "line", singleIndex: 0, multiIndex: 1 },
        { segmentType: "spline", singleIndex: 2, multiIndex: 3 },
        { segmentType: "quadratic-curve", singleIndex: 4, multiIndex: 5 },
        { segmentType: "cubic-curve", singleIndex: 6, multiIndex: 7 },
        { segmentType: "arc", singleIndex: 8, multiIndex: 9 },
    ])(
        "update segment: $segmentType",
        ({ segmentType, singleIndex, multiIndex }) => {
            describe.each<{ type: "start" | "end" }>([
                { type: "start" },
                { type: "end" },
            ])("$type - endpoint type", ({ type }) => {
                const getOtherPoints = (pathway: Path) => {
                    const allPoints = pathway.segments.map((s, i) => {
                        const points = s.getControlPoints(i);

                        if (segmentType === "spline") {
                            if (type === "start") {
                                points.shift();
                            } else {
                                points.pop();
                            }
                        } else {
                            const index = points.findIndex(
                                (p) => p.type === type,
                            );
                            if (index === -1) {
                                throw new Error(
                                    `No ${type} point found for segment ${i}`,
                                );
                            }
                            points.splice(index, 1);

                            if (segmentType === "arc") {
                                const centerPoint = points.find(
                                    (p) => p.type === "center",
                                );
                                if (!centerPoint) {
                                    throw new Error(
                                        `No center point found for arc segment ${i}`,
                                    );
                                }
                                points.splice(points.indexOf(centerPoint), 1);
                            }
                        }
                        return points;
                    });
                    return allPoints.flat();
                };

                it("should update the start point of a path with a single segment", async ({
                    pathwaysFixture: { existingPathways, db },
                }) => {
                    expect(existingPathways[singleIndex].segments).toHaveLength(
                        1,
                    );
                    expect(
                        existingPathways[singleIndex].segments[0].type,
                    ).toEqual(segmentType);

                    const newPoint = { x: 123, y: 456 };

                    expect(newPoint).not.toEqual(
                        type === "start"
                            ? existingPathways[singleIndex].getStartPoint()
                            : existingPathways[singleIndex].getLastPoint(),
                    );

                    const originalPoints = getOtherPoints(
                        existingPathways[singleIndex],
                    );

                    await transaction(db, async (tx) => {
                        await updateEndpoint({
                            tx,
                            pathwayId: existingPathways[singleIndex].id,
                            newPoint,
                            type,
                        });
                    });

                    const newPathRow = await db.query.pathways.findFirst({
                        where: eq(
                            schema.pathways.id,
                            existingPathways[singleIndex].id,
                        ),
                    });
                    expect(newPathRow).toBeDefined();
                    const newPath = Path.fromDb(newPathRow!);

                    // check that the other points are the same
                    const newPoints = getOtherPoints(newPath);
                    expect(newPoints).toEqual(originalPoints);

                    expect(
                        type === "start"
                            ? newPath.getStartPoint()
                            : newPath.getLastPoint(),
                    ).toEqual(newPoint);
                });

                it("should update the end point of a path with multiple segments", async ({
                    pathwaysFixture: { existingPathways, db },
                }) => {
                    expect(
                        existingPathways[multiIndex].segments.length,
                    ).toBeGreaterThan(1);

                    const newPoint = { x: 123, y: 456 };

                    expect(newPoint).not.toEqual(
                        type === "start"
                            ? existingPathways[multiIndex].getStartPoint()
                            : existingPathways[multiIndex].getLastPoint(),
                    );

                    await transaction(db, async (tx) => {
                        await updateEndpoint({
                            tx,
                            pathwayId: existingPathways[multiIndex].id,
                            newPoint,
                            type,
                        });
                    });

                    const newPathRow = await db.query.pathways.findFirst({
                        where: eq(
                            schema.pathways.id,
                            existingPathways[multiIndex].id,
                        ),
                    });
                    expect(newPathRow).toBeDefined();
                    const newPath = Path.fromDb(newPathRow!);

                    expect(
                        type === "start"
                            ? newPath.getStartPoint()
                            : newPath.getLastPoint(),
                    ).toEqual(newPoint);
                });
            });

            // it("should update the start point of a pathway", async ({
            //     pathwaysFixture: { existingPathways, db },
            // }) => {
            //     const originalPath = existingPathways[0];
            //     const newPoint = { x: 100, y: 100 };
            //     expect(newPoint).not.toEqual(originalPath.getStartPoint());

            //     // Store original values for comparison
            //     const originalSegmentCount = originalPath.segments.length;
            //     const originalEndPoint = originalPath.getLastPoint();
            //     const originalSegments = originalPath.segments.map(
            //         (segment) => ({
            //             type: segment.type,
            //             data: segment.toJson().data,
            //         }),
            //     );

            //     await transaction(db, async (tx) => {
            //         await updateEndpoint({
            //             tx,
            //             pathwayId: originalPath.id,
            //             newPoint,
            //             type: "start",
            //         });
            //     });

            //     const newPathRow = await db.query.pathways.findFirst({
            //         where: eq(schema.pathways.id, originalPath.id),
            //     });
            //     expect(newPathRow).toBeDefined();
            //     const newPath = Path.fromDb(newPathRow!);

            //     // Verify the start point was updated
            //     expect(newPath.getStartPoint()).toEqual(newPoint);

            //     // Verify basic structure remains the same
            //     expect(newPath.segments).toHaveLength(originalSegmentCount);
            //     expect(newPath.id).toBe(originalPath.id);

            //     // Verify all segments maintain their types
            //     expect(newPath.segments.length).toBe(originalSegments.length);
            //     for (let i = 0; i < newPath.segments.length; i++) {
            //         const newSegment = newPath.segments[i];
            //         const originalSegment = originalSegments[i];

            //         expect(newSegment.type).toBe(originalSegment.type);
            //     }

            //     // Verify the last point remains unchanged (this is the key invariant)
            //     expect(newPath.getLastPoint()).toEqual(originalEndPoint);

            //     // Note: Path length will change when start point changes, which is expected
            //     // The first segment's end point will also change to maintain continuity
            //     // This is the correct behavior for path endpoint updates
            // });

            // it("should update the end point of a pathway", async ({
            //     pathwaysFixture: { existingPathways, db },
            // }) => {
            //     const originalPath = existingPathways[0];
            //     const newPoint = { x: 100, y: 100 };
            //     expect(newPoint).not.toEqual(originalPath.getLastPoint());

            //     // Store original values for comparison
            //     const originalSegmentCount = originalPath.segments.length;
            //     const originalStartPoint = originalPath.getStartPoint();
            //     const originalSegments = originalPath.segments.map(
            //         (segment) => ({
            //             type: segment.type,
            //             data: segment.toJson().data,
            //         }),
            //     );

            //     await transaction(db, async (tx) => {
            //         await updateEndpoint({
            //             tx,
            //             pathwayId: originalPath.id,
            //             newPoint,
            //             type: "end",
            //         });
            //     });

            //     const newPathRow = await db.query.pathways.findFirst({
            //         where: eq(schema.pathways.id, originalPath.id),
            //     });
            //     expect(newPathRow).toBeDefined();
            //     const newPath = Path.fromDb(newPathRow!);

            //     // Verify the end point was updated
            //     expect(newPath.getLastPoint()).toEqual(newPoint);

            //     // Verify basic structure remains the same
            //     expect(newPath.segments).toHaveLength(originalSegmentCount);
            //     expect(newPath.id).toBe(originalPath.id);

            //     // Verify all segments maintain their types
            //     expect(newPath.segments.length).toBe(originalSegments.length);
            //     for (let i = 0; i < newPath.segments.length; i++) {
            //         const newSegment = newPath.segments[i];
            //         const originalSegment = originalSegments[i];

            //         expect(newSegment.type).toBe(originalSegment.type);
            //     }

            //     // Verify the start point remains unchanged (this is the key invariant)
            //     expect(newPath.getStartPoint()).toEqual(originalStartPoint);

            //     // Note: Path length will change when end point changes, which is expected
            //     // The last segment's start point will also change to maintain continuity
            //     // This is the correct behavior for path endpoint updates
            // });

            // it("should update endpoints on complex pathway without changing other properties", async ({
            //     pathwaysFixture: { existingPathways, db },
            // }) => {
            //     const complexPath = existingPathways[1]; // This has Spline + QuadraticCurve segments
            //     const newStartPoint = { x: 50, y: 50 };
            //     const newEndPoint = { x: 250, y: 250 };

            //     // Store original values for comparison
            //     const originalSegmentCount = complexPath.segments.length;
            //     const originalSegments = complexPath.segments.map(
            //         (segment) => ({
            //             type: segment.type,
            //             data: segment.toJson().data,
            //         }),
            //     );

            //     // Update start point
            //     await transaction(db, async (tx) => {
            //         await updateEndpoint({
            //             tx,
            //             pathwayId: complexPath.id,
            //             newPoint: newStartPoint,
            //             type: "start",
            //         });
            //     });

            //     // Update end point
            //     await transaction(db, async (tx) => {
            //         await updateEndpoint({
            //             tx,
            //             pathwayId: complexPath.id,
            //             newPoint: newEndPoint,
            //             type: "end",
            //         });
            //     });

            //     const updatedPathRow = await db.query.pathways.findFirst({
            //         where: eq(schema.pathways.id, complexPath.id),
            //     });
            //     expect(updatedPathRow).toBeDefined();
            //     const updatedPath = Path.fromDb(updatedPathRow!);

            //     // Verify both endpoints were updated
            //     expect(updatedPath.getStartPoint()).toEqual(newStartPoint);
            //     expect(updatedPath.getLastPoint()).toEqual(newEndPoint);

            //     // Verify basic structure remains the same
            //     expect(updatedPath.segments).toHaveLength(originalSegmentCount);
            //     expect(updatedPath.id).toBe(complexPath.id);

            //     // Verify all segments maintain their types
            //     expect(updatedPath.segments.length).toBe(
            //         originalSegments.length,
            //     );
            //     for (let i = 0; i < updatedPath.segments.length; i++) {
            //         const updatedSegment = updatedPath.segments[i];
            //         const originalSegment = originalSegments[i];

            //         expect(updatedSegment.type).toBe(originalSegment.type);

            //         // Verify segment-specific properties are preserved
            //         if (updatedSegment.type === "spline") {
            //             const splineSegment = updatedSegment as any;
            //             expect(splineSegment.degree).toBe(3); // Default degree from fixture
            //             expect(splineSegment.closed).toBe(false);
            //             expect(splineSegment.tension).toBe(0.5);
            //         } else if (updatedSegment.type === "quadratic-curve") {
            //             const quadSegment = updatedSegment as any;
            //             // Control point should remain unchanged
            //             expect(quadSegment.controlPoint).toBeDefined();
            //         }
            //     }

            //     // Note: When updating both start and end points, the path structure changes
            //     // but the segment types and their intrinsic properties remain the same
            //     // This is the correct behavior for path endpoint updates
            // });
        },
    );
});
