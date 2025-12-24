import {
    DbConnection,
    schema,
    transaction,
    describeDbTests,
} from "@/test/base";
import {
    Arc,
    CubicCurve,
    Line,
    Path,
    QuadraticCurve,
    Spline,
} from "@openmarch/core";
import { describe, expect } from "vitest";
import { findPageIdsForPathway, updateEndPoint } from "../pathways";
import { eq } from "drizzle-orm";

describeDbTests("pathways", (baseIt) => {
    const it = baseIt.extend<{
        pathwaysFixture: {
            existingPathways: Path[];
            db: DbConnection;
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
                    new Arc({ x: 0, y: 0 }, 100, 100, 0, 0, 0, {
                        x: 200,
                        y: 200,
                    }),
                ]),
                new Path([
                    new Arc({ x: 0, y: 0 }, 100, 100, 0, 0, 0, {
                        x: 200,
                        y: 200,
                    }),
                    new Arc({ x: 200, y: 200 }, 100, 100, 0, 0, 0, {
                        x: 0,
                        y: 0,
                    }),
                ]),
            ];
            await db.insert(schema.pathways).values(
                existingPathways.map((pathway) => ({
                    path_data: pathway.toJson(),
                })),
            );
            const dbPathways = (await db.query.pathways.findMany()).map(
                (dbPath) => Path.fromDb(dbPath),
            );
            await use({ existingPathways: dbPathways, db });
        },
    });

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
                        await updateEndPoint({
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
                        await updateEndPoint({
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
        },
    );

    describe("findPageIdsForPathway", () => {
        it("No pathways should be associated with any pages yet", async ({
            marchersAndPages: { expectedMarcherPages },
            pathwaysFixture: { existingPathways, db },
        }) => {
            await transaction(db, async (tx) => {
                const pageIds = await findPageIdsForPathway({
                    tx,
                    pathwayId: existingPathways[0].id,
                });
                expect(pageIds).toEqual([]);
            });
        });

        it("Pathways should be associated with a page", async ({
            marchersAndPages,
            pathwaysFixture: { existingPathways, db },
        }) => {
            // Make all marcherPages have pathway 0
            await db.update(schema.marcher_pages).set({
                path_data_id: existingPathways[0].id,
            });
            const allPageIds = new Set(
                marchersAndPages.expectedMarcherPages.map((mp) => mp.page_id),
            );
            await transaction(db, async (tx) => {
                const pageIds = await findPageIdsForPathway({
                    tx,
                    pathwayId: existingPathways[0].id,
                });
                expect(pageIds.length).toEqual(allPageIds.size);
                expect(pageIds).toEqual(Array.from(allPageIds));
            });
        });
    });
});
