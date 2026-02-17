import { describeDbTests, schema, DbConnection } from "@/test/base";
import {
    Spline,
    QuadraticCurve,
    CubicCurve,
    Arc,
    Path,
    Line,
} from "@openmarch/core";
import { _pathwayQueries } from "../usePathways";
import { describe, expect } from "vitest";
import { count, eq } from "drizzle-orm";
import { expectedPages } from "@/test/mock-data/marchers-and-pages.mjs";

describeDbTests("usePathways", (baseIt) => {
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

    describe("getAll", () => {
        it("should return all pathways", async ({
            pathwaysFixture: { existingPathways, db },
        }) => {
            const pathways = await _pathwayQueries.getAll(db);
            const pathwaysArray = Object.values(pathways);
            const pathDataSegments = pathwaysArray.map((p) => [
                p.id,
                p.path_data.segments,
            ]);
            expect(pathDataSegments).toEqual(
                existingPathways.map((p) => [p.id, p.segments]),
            );
        });
        it("should return no pathways", async ({ db }) => {
            const pathways = await _pathwayQueries.getAll(db);
            const pathwaysArray = Object.values(pathways);
            const pathDataSegments = pathwaysArray.map(
                (p) => p.path_data.segments,
            );
            expect(pathDataSegments).toEqual([]);
        });
    });

    describe("getByPageId", () => {
        it("should return no pathways for a page", async ({
            pathwaysFixture: { existingPathways, db },
        }) => {
            const pathways = await _pathwayQueries.getByPageId(1, db);
            expect(pathways).toEqual({});
        });

        describe.each(expectedPages.map((p) => ({ pageId: p.id })))(
            "pageId - $pageId",
            ({ pageId }) => {
                it.concurrent(
                    "should return a single pathway for a page",
                    async ({
                        marchersAndPages,
                        pathwaysFixture: { existingPathways, db },
                    }) => {
                        await db
                            .update(schema.marcher_pages)
                            .set({
                                path_data_id: existingPathways[0].id,
                            })
                            .where(eq(schema.marcher_pages.page_id, pageId));
                        const pathways = await _pathwayQueries.getByPageId(
                            pageId,
                            db,
                        );
                        expect(Object.keys(pathways)).toHaveLength(1);
                        expect(Object.values(pathways)[0].path_data).toEqual(
                            existingPathways[0],
                        );
                    },
                );

                it.concurrent(
                    "should return multiple pathways for a page",
                    async ({
                        marchersAndPages,
                        pathwaysFixture: { existingPathways, db },
                    }) => {
                        expect(existingPathways.length).toBeGreaterThan(0);
                        const numberOfMarcherPagesOnPage = (
                            await db

                                .select({ count: count() })
                                .from(schema.marcher_pages)
                                .where(eq(schema.marcher_pages.page_id, pageId))
                                .get()
                        )?.count;
                        expect(numberOfMarcherPagesOnPage).toBeDefined();
                        expect(numberOfMarcherPagesOnPage).toBeGreaterThan(1);
                        if (!numberOfMarcherPagesOnPage)
                            throw new Error("No numberOfMarcherPagesOnPage");

                        let expectedPathways = [];
                        const marcherPagesOnPage =
                            await db.query.marcher_pages.findMany({
                                where: eq(schema.marcher_pages.page_id, pageId),
                                limit: existingPathways.length,
                            });

                        for (let i = 0; i < existingPathways.length; i++) {
                            const marcherPage = marcherPagesOnPage[i];
                            const pathwayIndex = i;
                            await db
                                .update(schema.marcher_pages)
                                .set({
                                    path_data_id:
                                        existingPathways[pathwayIndex].id,
                                })
                                .where(
                                    eq(schema.marcher_pages.id, marcherPage.id),
                                );
                            expectedPathways.push(
                                existingPathways[pathwayIndex],
                            );
                        }

                        const pathways = await _pathwayQueries.getByPageId(
                            pageId,
                            db,
                        );
                        expect(Object.keys(pathways).length).toEqual(
                            marcherPagesOnPage.length,
                        );
                        expect(
                            Object.entries(pathways).map(([id, p]) => [
                                Number(id),
                                p.path_data,
                            ]),
                        ).toEqual(expectedPathways.map((p) => [p.id, p]));
                    },
                );
            },
        );
    });
});
