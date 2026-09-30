/**
 * QA-INV-08: differential fuzz of the cached resolver against a fresh build
 * and the oracle (spec 12.6), asserting P-3 and P-4 after every batch.
 *
 * CI runs a small, fast default. The full run (1,000 seeds x 80 steps) is
 * opt-in: `pnpm --dir packages/core run test:fuzz`, or set
 * `TIMELINE_FUZZ_SEEDS`, `TIMELINE_FUZZ_STEPS` and `TIMELINE_FUZZ_FIRST`.
 */
import { describe, expect, it } from "vitest";
import { makeFuzzWorld, runFuzz } from "./fuzzHarness";

const env = (name: string, fallback: number) => {
    const v = Number(process.env[name]);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
};
const SEEDS = env("TIMELINE_FUZZ_SEEDS", 60);
const STEPS = env("TIMELINE_FUZZ_STEPS", 40);
const FIRST = env("TIMELINE_FUZZ_FIRST", 1);

describe("differential fuzz (QA-INV-08)", () => {
    it("the generator is deterministic per seed", () => {
        const a = makeFuzzWorld(7);
        const b = makeFuzzWorld(7);
        expect(a.db).toEqual(b.db);
        expect(a.randomBatch()).toEqual(b.randomBatch());
    });

    it(`${SEEDS} seeds x ${STEPS} steps: no divergence, closure violation or exception`, () => {
        const stats = runFuzz(SEEDS, STEPS, FIRST);
        if (process.env.TIMELINE_FUZZ_SEEDS)
            // eslint-disable-next-line no-console
            console.log(
                `fuzz: ${stats.seeds} seeds, ${stats.batches} batches, ${stats.divergent} divergent, ${stats.closure} closure violations, ${stats.exceptions} exceptions`,
            );
        expect(stats.firstFailures).toEqual([]);
        expect(stats.divergent).toBe(0);
        expect(stats.closure).toBe(0);
        expect(stats.exceptions).toBe(0);
        expect(stats.batches).toBeGreaterThan(SEEDS * STEPS * 0.5);
        // every edit kind was exercised (enough batches to hit them all)
        if (SEEDS * STEPS >= 500)
            for (const name of makeFuzzWorld(1).opNames)
                expect(stats.ops[name] ?? 0, name).toBeGreaterThan(0);
    }, 600_000);
});
