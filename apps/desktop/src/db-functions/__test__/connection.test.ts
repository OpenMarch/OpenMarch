import { afterEach, describe, expect } from "vitest";
import { describeDbTests, schema, seedObj } from "@/test/base";
import { eq } from "drizzle-orm";
import { faker } from "@faker-js/faker";
import { createLastPage } from "..";

describeDbTests("Database connection", (it) => {
    it("Database should be defined", async ({ db }) => {
        expect(db).toBeDefined();
    });

    it("Database should be able to run a query", async ({ db }) => {
        const result = await db.select().from(schema.marchers);
        expect(result).toBeDefined();
        expect(result.length).toBe(0);
    });

    it("Database should be able to create and delete a marcher", async ({
        db,
    }) => {
        const preResult = await db.select().from(schema.marchers);
        expect(preResult).toBeDefined();
        expect(preResult.length).toBe(0);

        const result = await db
            .insert(schema.marchers)
            .values({
                section: "Test Section",
                drill_prefix: "B",
                drill_order: 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .returning();
        expect(result).toBeDefined();
        expect(result.length).toBe(1);

        const postResult = await db.select().from(schema.marchers);
        expect(postResult).toBeDefined();
        expect(postResult.length).toBe(1);
        expect(postResult[0].id).toBe(result[0].id);
        expect(postResult[0].section).toBe("Test Section");
        expect(postResult[0].drill_prefix).toBe("B");
        expect(postResult[0].drill_order).toBe(1);

        const deleteResult = await db
            .delete(schema.marchers)
            .where(eq(schema.marchers.id, result[0].id))
            .returning();
        expect(deleteResult).toBeDefined();
        expect(deleteResult.length).toBe(1);
        expect(deleteResult[0].id).toBe(result[0].id);

        const postDeleteResult = await db.select().from(schema.marchers);
        expect(postDeleteResult).toBeDefined();
        expect(postDeleteResult.length).toBe(0);
    });

    it("Database should be able to update a marcher", async ({ db }) => {
        const result = await db
            .insert(schema.marchers)
            .values({
                section: "Test Section",
                drill_prefix: "B",
                drill_order: 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .returning();
        expect(result).toBeDefined();
        expect(result.length).toBe(1);
        expect(result[0].id).toBeDefined();

        const postResult = await db.select().from(schema.marchers);
        expect(postResult).toBeDefined();
        expect(postResult.length).toBe(1);
        expect(postResult[0].id).toBe(result[0].id);
        expect(postResult[0].section).toBe("Test Section");
        expect(postResult[0].drill_prefix).toBe("B");
        expect(postResult[0].drill_order).toBe(1);

        const updateResult = await db
            .update(schema.marchers)
            .set({
                section: "Updated Section",
                drill_prefix: "C",
                drill_order: 2,
            })
            .where(eq(schema.marchers.id, result[0].id))
            .returning();
        expect(updateResult).toBeDefined();
        expect(updateResult.length).toBe(1);
        expect(updateResult[0].id).toBe(result[0].id);
        expect(updateResult[0].section).toBe("Updated Section");

        const postUpdateResult = await db.select().from(schema.marchers);
        expect(postUpdateResult).toBeDefined();
        expect(postUpdateResult.length).toBe(1);
        expect(postUpdateResult[0].id).toBe(result[0].id);
        expect(postUpdateResult[0].section).toBe("Updated Section");
        expect(postUpdateResult[0].drill_prefix).toBe("C");
        expect(postUpdateResult[0].drill_order).toBe(2);
    });

    describe("handles joins", () => {
        it("inner join for all pages and beats", async ({ db, pages }) => {
            const result = await db
                .select()
                .from(schema.pages)
                .innerJoin(
                    schema.beats,
                    eq(schema.pages.start_beat, schema.beats.id),
                )
                .all();
            expect(result).toBeDefined();
            expect(result).toHaveLength(pages.expectedPages.length);

            // Assure the object's data is correct
            for (const page of pages.expectedPages) {
                const resultPage = result.find((r) => r.pages.id === page.id);
                expect(resultPage?.pages).toBeDefined();
                expect(resultPage?.pages).toMatchObject(page);

                const expectedBeat = pages.expectedBeats.find(
                    (b) => b.id === page.start_beat,
                );
                expect(resultPage?.beats).toBeDefined();
                expect(resultPage?.beats).toMatchObject(expectedBeat!);
            }

            const resultNoAll = await db
                .select()
                .from(schema.pages)
                .innerJoin(
                    schema.beats,
                    eq(schema.pages.start_beat, schema.beats.id),
                );
            expect(resultNoAll).toBeDefined();
            expect(resultNoAll).toHaveLength(pages.expectedPages.length);

            // Assure the object's data is correct
            for (const page of pages.expectedPages) {
                const resultNoAllPage = resultNoAll.find(
                    (r) => r.pages.id === page.id,
                );
                expect(resultNoAllPage?.pages).toBeDefined();
                expect(resultNoAllPage?.pages).toMatchObject(page);

                const expectedBeat = pages.expectedBeats.find(
                    (b) => b.id === page.start_beat,
                );
                expect(resultNoAllPage?.beats).toBeDefined();
                expect(resultNoAllPage?.beats).toMatchObject(expectedBeat!);
            }
        });
        describe("inner join for one page and beats", () => {
            it.for([
                { page_id: 0 },
                { page_id: 1 },
                { page_id: 2 },
                { page_id: 3 },
                { page_id: 4 },
                { page_id: 5 },
                { page_id: 6 },
            ])("page_id: $page_id", async ({ page_id }, { db, pages }) => {
                const result = await db
                    .select()
                    .from(schema.pages)
                    .innerJoin(
                        schema.beats,
                        eq(schema.pages.start_beat, schema.beats.id),
                    )
                    .where(eq(schema.pages.id, page_id))
                    .get();
                expect(result).toBeDefined();

                expect(result?.pages).toBeDefined();
                const expectedPage = pages.expectedPages.find(
                    (p) => p.id === page_id,
                );
                expect(expectedPage).toBeDefined();
                expect(result?.pages).toMatchObject(expectedPage!);

                expect(result?.beats).toBeDefined();
                const expectedBeat = pages.expectedBeats.find(
                    (b) => b.id === result?.pages.start_beat,
                );
                expect(expectedBeat).toBeDefined();
                expect(result?.beats).toMatchObject(expectedBeat!);
            });
        });

        describe("Create a random number of pages and beats", () => {
            afterEach(async () => {
                faker.seed();
            });

            describe("all()", () => {
                it.for(seedObj)("seed: $seed", async ({ seed }, { db }) => {
                    faker.seed(seed);

                    const pagesToCreate = faker.number.int({ min: 1, max: 25 });

                    for (let i = 0; i < pagesToCreate; i++) {
                        const pageCounts = faker.number.int({
                            min: 1,
                            max: 128,
                        });
                        await createLastPage({ db, newPageCounts: pageCounts });
                    }

                    const pagesNoJoin = await db.select().from(schema.pages);
                    expect(pagesNoJoin).toBeDefined();
                    expect(pagesNoJoin).toHaveLength(pagesToCreate + 1);

                    const beatsNoJoin = await db.select().from(schema.beats);
                    expect(beatsNoJoin).toBeDefined();

                    const pagesWithJoin = await db
                        .select()
                        .from(schema.pages)
                        .innerJoin(
                            schema.beats,
                            eq(schema.pages.start_beat, schema.beats.id),
                        )
                        .all();
                    expect(pagesWithJoin).toBeDefined();
                    expect(pagesWithJoin).toHaveLength(pagesNoJoin.length);

                    for (const page of pagesNoJoin) {
                        const pageWithJoin = pagesWithJoin.find(
                            (p) => p.pages.id === page.id,
                        );
                        expect(pageWithJoin).toBeDefined();
                        expect(pageWithJoin?.pages).toMatchObject(page);

                        const expectedBeat = beatsNoJoin.find(
                            (b) => b.id === page.start_beat,
                        );
                        expect(pageWithJoin?.beats).toBeDefined();
                        expect(pageWithJoin?.beats).toMatchObject(
                            expectedBeat!,
                        );
                    }
                });
            });
            describe("get()", () => {
                it.for(seedObj)("seed: $seed", async ({ seed }, { db }) => {
                    faker.seed(seed);

                    const pagesToCreate = faker.number.int({
                        min: 1,
                        max: 25,
                    });

                    for (let i = 0; i < pagesToCreate; i++) {
                        const pageCounts = faker.number.int({
                            min: 1,
                            max: 128,
                        });
                        await createLastPage({
                            db,
                            newPageCounts: pageCounts,
                        });
                    }

                    const pagesNoJoin = await db
                        .select()
                        .from(schema.pages)
                        .all();
                    expect(pagesNoJoin).toBeDefined();
                    expect(pagesNoJoin).toHaveLength(pagesToCreate + 1);

                    const beatsNoJoin = await db.select().from(schema.beats);
                    expect(beatsNoJoin).toBeDefined();

                    for (const page of pagesNoJoin) {
                        const pageWithJoin = await db
                            .select()
                            .from(schema.pages)
                            .innerJoin(
                                schema.beats,
                                eq(schema.pages.start_beat, schema.beats.id),
                            )
                            .where(eq(schema.pages.id, page.id))
                            .get();
                        expect(pageWithJoin).toBeDefined();
                        expect(pageWithJoin?.pages).toMatchObject(page);

                        const expectedBeat = beatsNoJoin.find(
                            (b) => b.id === page.start_beat,
                        );
                        expect(pageWithJoin?.beats).toBeDefined();
                        expect(pageWithJoin?.beats).toMatchObject(
                            expectedBeat!,
                        );
                    }
                });
            });
        });
    });
});
