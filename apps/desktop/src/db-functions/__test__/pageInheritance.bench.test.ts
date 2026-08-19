import { describeDbTests, schema, transaction } from "@/test/base";
import { expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { recomputeInheritedPagesInTransaction } from "../pageInheritance";

// Gated benchmark, run with: VITEST_ENABLE_BENCH=true npx vitest run pageInheritance.bench
// Measures the worst case: editing page 0 in a large show re-flows every
// downstream non-anchor page in one recompute
const BENCH = process.env.VITEST_ENABLE_BENCH === "true";

const PAGES = 100;
const MARCHERS = 150;

// downstreamX controls how many rows change: 999 forces every row to re-flow
// (worst case), 0 matches page 0 so the no-op skip writes nothing (read + compute floor)
async function seedShow(
    tx: Parameters<Parameters<typeof transaction>[1]>[0],
    downstreamX: number,
) {
    // beat 0 and page 0 already exist in the blank template
    const beats = [];
    for (let i = 1; i < PAGES; i++)
        beats.push({ id: i, duration: 0.5, position: i });
    await tx.insert(schema.beats).values(beats);

    const marchers = [];
    for (let m = 1; m <= MARCHERS; m++)
        marchers.push({
            id: m,
            section: "BD",
            drill_prefix: "BD",
            drill_order: m,
        });
    await tx.insert(schema.marchers).values(marchers);

    // every page after 0 is non-anchor so all of them hold page 0
    const pages = [];
    for (let i = 1; i < PAGES; i++)
        pages.push({
            id: i,
            start_beat: i,
            is_subset: 0,
            is_coordinate_anchor: 0,
        });
    await tx.insert(schema.pages).values(pages);

    const marcherPages = [];
    for (let m = 1; m <= MARCHERS; m++)
        marcherPages.push({ marcher_id: m, page_id: 0, x: 0, y: 0 });
    for (let i = 1; i < PAGES; i++)
        for (let m = 1; m <= MARCHERS; m++)
            marcherPages.push({
                marcher_id: m,
                page_id: i,
                x: downstreamX,
                y: downstreamX,
            });
    // chunk to stay under the SQLite bound-variable limit
    for (let i = 0; i < marcherPages.length; i += 500)
        await tx
            .insert(schema.marcher_pages)
            .values(marcherPages.slice(i, i + 500));
}

async function timeRecompute(db: Parameters<typeof transaction>[0]) {
    // silence the drizzle query logger so its per-statement console prints do
    // not dominate the measurement
    const originalLog = console.log;
    console.log = () => {};
    const start = performance.now();
    try {
        await transaction(db, async (tx) => {
            await recomputeInheritedPagesInTransaction({ tx });
        });
    } finally {
        console.log = originalLog;
    }
    return performance.now() - start;
}

describeDbTests("pageInheritance-benchmark", (it) => {
    (BENCH ? it : it.skip)(
        `worst case: ${PAGES}x${MARCHERS}, page 0 the only anchor, every row re-flows`,
        async ({ db }) => {
            await transaction(db, (tx) => seedShow(tx, 999));
            const elapsedMs = await timeRecompute(db);
            // eslint-disable-next-line no-console
            console.log(
                `BENCH worst-case (writes ${(PAGES - 1) * MARCHERS} rows): ${elapsedMs.toFixed(0)}ms`,
            );
            await transaction(db, async (tx) => {
                const dot = await tx.query.marcher_pages.findFirst({
                    where: and(
                        eq(schema.marcher_pages.page_id, PAGES - 1),
                        eq(schema.marcher_pages.marcher_id, 1),
                    ),
                });
                expect(dot).toMatchObject({ x: 0, y: 0 });
            });
            expect(elapsedMs).toBeLessThan(60000);
        },
    );

    (BENCH ? it : it.skip)(
        `floor: ${PAGES}x${MARCHERS}, nothing changes (read + compute, no writes)`,
        async ({ db }) => {
            await transaction(db, (tx) => seedShow(tx, 0));
            const elapsedMs = await timeRecompute(db);
            // eslint-disable-next-line no-console
            console.log(
                `BENCH floor (0 rows written, paid on every edit): ${elapsedMs.toFixed(0)}ms`,
            );
            expect(elapsedMs).toBeLessThan(60000);
        },
    );
});
