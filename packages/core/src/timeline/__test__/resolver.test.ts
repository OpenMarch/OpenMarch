// cspell:ignore NONFOUNDING
/**
 * The cached resolver (spec sections 9 and 10) against the shared golden
 * vectors and QA-FL cases, and notify() cases: after each batch the edited
 * resolver must agree with a freshly built resolver (exactly) and with the
 * oracle, and its caches must stay closed (I-C1). The QA-REG, QA-INV, QA-CX,
 * P-8 and P-10 suites are in `resolverInvalidation.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { createTimelineOracleForTesting, createResolver } from "..";
import { createCachedResolver, type CachedResolver } from "../resolver";
import { GOLDEN } from "./fixtures";
import { expectPositions, runGoldenSuite } from "./goldenSuite";
import {
    Editor,
    NOTIFY_CASES,
    aImg,
    beatsOf,
    clone,
    expectAgrees,
    expectClosed,
    richShow,
} from "./resolverHarness";

runGoldenSuite("resolver", createCachedResolver, (s, db) => {
    const r = s as CachedResolver;
    expectAgrees(r, db);
});

describe("resolver: public construction and queries", () => {
    it("createResolver is exported from the package and matches the oracle", () => {
        const g = GOLDEN.find((x) => x.name.startsWith("G12"))!;
        const db = g.db();
        const r = createResolver(db);
        expectPositions(r, g.expected);
        const o = createTimelineOracleForTesting(db);
        for (const b of beatsOf(db))
            for (const m of r.marcherIds()) {
                const p = r.positionAt(m, b);
                const q = o.positionAt(m, b);
                expect(Math.hypot(p[0] - q[0], p[1] - q[1])).toBeLessThan(1e-9);
            }
        expect(r.checkCacheClosure()).toBe(true);
    });

    it("positionsAt writes x, y pairs in marcherIds() order as Float64", () => {
        const db = GOLDEN.find((x) => x.name.startsWith("G6"))!.db();
        db.marchers.reverse();
        const r = createResolver(db);
        expect(r.marcherIds()).toEqual([1, 2, 3, 4]);
        const out = new Float64Array(8);
        r.positionsAt(8, out);
        [4, 0, 6, 0, 6, 2, 6, 4].forEach((v, i) =>
            expect(out[i]).toBeCloseTo(v, 9),
        );
        expect(() => r.positionsAt(8, new Float64Array(7))).toThrow();
    });

    it("explain reports the span, origin, progress, FTL q and diagnostics", () => {
        const db = GOLDEN.find((x) => x.name.startsWith("G11"))!.db();
        const r = createResolver(db);
        const joiner = r.explain(1, 10);
        expect(joiner.span).toMatchObject({
            marcherId: 1,
            start: 8,
            end: 12,
            kind: "join",
            transitionId: 2,
        });
        expect(joiner.origin).toEqual([0, 0]);
        expect(joiner.originFrom).toMatchObject({ kind: "hold", start: 4 });
        expect(joiner.progress).toBe(0.5);
        expect(joiner.ftl?.q).toBeNull();
        expect(joiner.ftl?.entry.members).toEqual([2, 3, 4]);
        expect(joiner.diagnostics.map((d) => d.code)).toContain(
            "D-FTL-NONFOUNDING",
        );
        const founder = r.explain(4, 8);
        expect(founder.span.kind).toBe("founding");
        expect(founder.ftl?.q).toBe(2);
        expect(founder.progress).toBe(0.5);
        const hold = r.explain(1, -5);
        expect(hold.span.kind).toBe("hold");
        expect(hold.originFrom).toBe("home");
        expect(hold.progress).toBeNull();
        expect(hold.ftl).toBeUndefined();
    });

    it("fails loudly on a dependency cycle instead of looping (spec 9.3)", () => {
        // Valid data can't produce a cycle, so make the state inconsistent:
        // move G12's FTL start onto M4's resume without notifying. The resume
        // then counts as founding, so ftlEntry(2) needs its origin, which
        // needs the steal's, which needs M4's first FTL span, which needs
        // ftlEntry(2).
        const db = GOLDEN.find((x) => x.name.startsWith("G12"))!.db();
        const r = createCachedResolver(db);
        db.transitions[2] = { ...db.transitions[2]!, start: 8 };
        expect(() => r.ftlEntry(2)).toThrow(/dependency cycle/);
    });

    it("ftlEntry rejects a transition that is not follow-the-leader", () => {
        const r = createResolver(GOLDEN[0]!.db());
        expect(() => r.ftlEntry(1)).toThrow(/not follow-the-leader/);
    });

    it("a cold compile computes each node once; a warm query recomputes nothing", () => {
        const r = createCachedResolver(richShow());
        const spans = r
            .marcherIds()
            .reduce((n, m) => n + r.spanInfos(m).length, 0);
        r.resetCounters();
        r.warmAll();
        const c = r.counters();
        expect(c.originsComputed).toBe(spans);
        expect(c.ftlEntriesComputed).toBe(3);
        r.resetCounters();
        r.warmAll();
        const out = new Float64Array(2 * r.marcherIds().length);
        for (let b = -1; b < 32; b += 0.5) r.positionsAt(b, out);
        const w = r.counters();
        expect(w.originsComputed).toBe(0);
        expect(w.ftlEntriesComputed).toBe(0);
        expect(w.cacheMisses).toBe(0);
        expect(w.spanLookups).toBeGreaterThan(0);
        r.resetCounters();
        expect(Object.values(r.counters()).every((v) => v === 0)).toBe(true);
    });
});

describe("resolver notify() (spec 9.4, 10.2)", () => {
    for (const c of NOTIFY_CASES)
        it(c.name, () => {
            const host = richShow();
            const r = createCachedResolver(host);
            r.warmAll(); // so invalidation, not a cold compile, is what's tested
            expectClosed(r);
            const e = new Editor(host);
            c.edit(e);
            const report = r.notify(e.batch());
            expectClosed(r); // before any query compiles again
            c.report?.(report);
            expectAgrees(r, host);
        });

    it("an edit followed by its inverse restores the original results", () => {
        const host = richShow();
        const before = createCachedResolver(clone(host));
        const r = createCachedResolver(host);
        r.warmAll();
        const e = new Editor(host);
        const id = e.findRow(1, 2).id;
        const old = { ...e.findRow(1, 2) };
        e.deleteRow(id);
        r.notify(e.batch());
        expectAgrees(r, host);
        e.host.assignments.push(old);
        r.notify({
            changes: [
                {
                    table: "assignments",
                    rowId: id,
                    before: null,
                    after: aImg(old),
                },
            ],
        });
        expectAgrees(r, host);
        for (const b of beatsOf(host))
            for (const m of r.marcherIds())
                expect(r.positionAt(m, b)).toEqual(before.positionAt(m, b));
    });

    it("applies a long sequence of batches, agreeing after each", () => {
        const host = richShow();
        const r = createCachedResolver(host);
        const e = new Editor(host);
        for (const c of NOTIFY_CASES.filter((x) => !x.solo)) {
            // Probe a few beats so the caches are partly warm, as in playback.
            for (const m of r.marcherIds()) r.positionAt(m, 10);
            c.edit(e);
            r.notify(e.batch());
            expectAgrees(r, host);
        }
    });

    it("dirties only what depends on the edit (W-4 stops the walk)", () => {
        const host = richShow();
        const r = createCachedResolver(host);
        r.warmAll();
        const e = new Editor(host);
        // The last FTL's box changes: nothing before beat 24 depends on it.
        e.updateShape(7, {
            kind: "box",
            geometry: { origin: [-6, -6], width: 5, height: 3 },
        });
        const report = r.notify(e.batch());
        expect(report.ftlEntriesDirtied).toBe(1);
        // only the origins after T8's spans: the trailing holds of M1-M4
        expect(report.originsDirtied).toBe(4);
        r.resetCounters();
        r.warmAll();
        expect(r.counters().originsComputed).toBe(4);
        expect(r.counters().ftlEntriesComputed).toBe(1);
        expectAgrees(r, host);
    });
});
