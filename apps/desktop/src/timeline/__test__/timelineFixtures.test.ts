import { describe, expect, it } from "vitest";
import {
    createResolver,
    createTimelineOracleForTesting,
    validatePathParams,
    validateShapeGeometry,
    type TimelineSnapshot,
} from "@openmarch/core";
import type { TimelineFixture } from "../fixtures/fixtureTypes";
import { GOLDEN_FIXTURES } from "../fixtures/goldenFixtures";
import { SC11_SIZE, sc11, type Sc11Size } from "../fixtures/scenarioFixtures";
import {
    buildTimelineFixture,
    TIMELINE_FIXTURES,
} from "../fixtures/timelineFixtures";

/**
 * The fixture generators (docs/timeline/phases/05-rendering.md P5.7) as pure functions: every
 * fixture is a show the database would accept, the resolver agrees with the oracle on it, and
 * QA-SC-11 has the spec's scale and is reproducible from its seed.
 */

/** A smaller SC-11 for the checks that build resolvers and oracles. */
const SMALL: Sc11Size = {
    marchers: 60,
    groups: 4,
    groupTransitions: 40,
    stealTransitions: 6,
    timelines: 3,
    shapes: 30,
    chainDepth: 12,
    minRowsPerMarcher: 8,
};

/** Every rule of the schema and triggers that a fixture could break (spec §5.1, §6). */
// eslint-disable-next-line max-lines-per-function
const expectStorable = ({ show, timelines }: TimelineFixture) => {
    const isInt = (n: number) => Number.isInteger(n) && n >= 0;
    const marcherIds = new Set(show.marchers.map((m) => m.id));
    expect(marcherIds.size).toBe(show.marchers.length);

    for (const [id, shape] of Object.entries(show.shapes)) {
        const result = validateShapeGeometry(shape.kind, shape.geometry);
        expect(
            result.ok,
            `shape ${id}: ${JSON.stringify(shape)} ${JSON.stringify(result)}`,
        ).toBe(true);
    }

    for (const t of Object.values(show.transitions)) {
        const what = `transition ${t.id}`;
        expect(isInt(t.start) && isInt(t.end) && t.end > t.start, what).toBe(
            true,
        );
        expect(t.slots, what).toBeGreaterThan(0);
        expect(validatePathParams(t.style, t.params).ok, what).toBe(true);
        if (t.dest === null) {
            expect(t.style, what).not.toBe("follow_the_leader");
            expect(t.points, what).toHaveLength(t.slots);
        } else {
            const shape = show.shapes[t.dest];
            expect(shape, what).toBeDefined();
            if (shape!.kind === "block") {
                expect(t.style, what).not.toBe("follow_the_leader");
                const g = shape!.geometry;
                expect(g.rows * g.cols, what).toBeGreaterThanOrEqual(t.slots);
            }
        }
    }

    const slotsTaken = new Set<string>();
    const marchersIn = new Set<string>();
    for (const a of show.assignments) {
        const what = `assignment ${a.id}`;
        const t = show.transitions[a.transition];
        expect(t, what).toBeDefined();
        expect(marcherIds.has(a.marcher), what).toBe(true);
        expect(a.start >= t!.start && a.end <= t!.end, what).toBe(true);
        expect(a.end > a.start, what).toBe(true);
        expect(a.slot >= 0 && a.slot < t!.slots, what).toBe(true);
        const slotKey = `${a.transition}:${a.slot}`;
        const marcherKey = `${a.transition}:${a.marcher}`;
        expect(slotsTaken.has(slotKey), `${what}: slot taken`).toBe(false);
        expect(marchersIn.has(marcherKey), `${what}: marcher twice`).toBe(
            false,
        );
        slotsTaken.add(slotKey);
        marchersIn.add(marcherKey);
    }
    // No overlap for one marcher on one layer
    const byLane = new Map<string, Array<[number, number]>>();
    for (const a of show.assignments) {
        const key = `${a.marcher}:${a.layer}`;
        byLane.set(key, [...(byLane.get(key) ?? []), [a.start, a.end]]);
    }
    for (const [lane, ranges] of byLane) {
        ranges.sort((x, y) => x[0] - y[0]);
        for (let i = 1; i < ranges.length; i++)
            expect(
                ranges[i]![0],
                `lane ${lane} overlaps`,
            ).toBeGreaterThanOrEqual(ranges[i - 1]![1]);
    }

    // Each transition on exactly one timeline that contains it
    if (timelines) {
        const owner = new Map<number, number>();
        for (const l of timelines)
            for (const id of l.transitions) {
                expect(owner.has(id), `transition ${id} on two timelines`).toBe(
                    false,
                );
                owner.set(id, l.id);
                const t = show.transitions[id]!;
                expect(t.start >= l.start && t.end <= l.end).toBe(true);
            }
        expect(owner.size).toBe(Object.keys(show.transitions).length);
    }
};

/** The resolver and the oracle agree on `show` at every integer and half beat. */
const expectResolverMatchesOracle = (show: TimelineSnapshot) => {
    const resolver = createResolver(show);
    const oracle = createTimelineOracleForTesting(show);
    const last = Math.max(
        1,
        ...Object.values(show.transitions).map((t) => t.end),
    );
    for (const m of resolver.marcherIds())
        for (let b = -1; b <= last + 1; b += 0.5) {
            const [x, y] = resolver.positionAt(m, b);
            const [ox, oy] = oracle.positionAt(m, b);
            expect(Math.abs(x - ox), `M${m} at ${b}`).toBeLessThan(1e-9);
            expect(Math.abs(y - oy), `M${m} at ${b}`).toBeLessThan(1e-9);
        }
    expect(resolver.checkCacheClosure()).toBe(true);
};

describe("fixture registry", () => {
    it("offers G1 to G13 (with G8b) and the QA-SC scenarios", () => {
        expect(TIMELINE_FIXTURES.map((f) => f.name)).toEqual([
            "G1",
            "G2",
            "G3",
            "G4",
            "G5",
            "G6",
            "G7",
            "G8",
            "G8b",
            "G9",
            "G10",
            "G11",
            "G12",
            "G13",
            "QA-SC-01",
            "QA-SC-03",
            "QA-SC-05",
            "QA-SC-11",
        ]);
    });

    it("finds a fixture by name, case-insensitively, and names the known ones otherwise", () => {
        expect(buildTimelineFixture("g6").name).toBe("G6");
        expect(buildTimelineFixture("qa-sc-11", 7).name).toBe(
            "QA-SC-11 (seed 7)",
        );
        expect(() => buildTimelineFixture("G99")).toThrow(/Known: G1, G2/);
    });

    it("builds a fresh show on every call", () => {
        const a = buildTimelineFixture("G6");
        a.show.assignments.pop();
        expect(buildTimelineFixture("G6").show.assignments).toHaveLength(8);
    });
});

describe("fixed fixtures", () => {
    const fixed = TIMELINE_FIXTURES.filter((f) => f.name !== "QA-SC-11");
    for (const { name, build } of fixed)
        it(`${name} is storable and the resolver matches the oracle`, () => {
            const fixture = build(1);
            expectStorable(fixture);
            expectResolverMatchesOracle(fixture.show);
        });

    it("the golden fixtures hold the spec's expected positions", () => {
        const expectAt = (
            name: string,
            m: number,
            beat: number,
            [x, y]: [number, number],
        ) => {
            const [ax, ay] = createResolver(
                GOLDEN_FIXTURES.find((g) => g.name === name)!.build().show,
            ).positionAt(m, beat);
            expect(ax, `${name} M${m} x at ${beat}`).toBeCloseTo(x, 9);
            expect(ay, `${name} M${m} y at ${beat}`).toBeCloseTo(y, 9);
        };
        expectAt("G1", 1, 4, [4, 0]);
        expectAt("G3", 1, 8, [7, 6]);
        expectAt("G4", 1, 10, [8, 0]);
        expectAt("G6", 4, 8, [6, 4]);
        expectAt("G7", 1, 8, [6, -4]);
        expectAt("G12", 4, 10, [8, 9]);
        expectAt("G13", 2, 14, [10.5, 14]);
        expectAt("G13", 3, 20, [4, 14]);
    });
});

describe("QA-SC-11 generator", () => {
    // eslint-disable-next-line max-lines-per-function
    it("has the spec's scale and mix (seed 1)", () => {
        const fixture = sc11(1);
        const { show, timelines } = fixture;
        expectStorable(fixture);
        const transitions = Object.values(show.transitions);

        expect(show.marchers).toHaveLength(250);
        expect(transitions).toHaveLength(200);
        expect(Object.keys(show.shapes)).toHaveLength(120);
        expect(timelines).toHaveLength(10);
        for (const l of timelines!)
            expect(l.transitions.length).toBeGreaterThan(0);

        const kinds = new Set(Object.values(show.shapes).map((s) => s.kind));
        expect([...kinds].sort()).toEqual([
            "block",
            "box",
            "circle",
            "freehand",
            "line",
        ]);

        const share = (style: string) =>
            transitions.filter((t) => t.style === style).length /
            transitions.length;
        expect(share("direct")).toBeGreaterThan(0.5);
        expect(share("direct")).toBeLessThan(0.7);
        expect(share("arc")).toBeGreaterThan(0.04);
        expect(share("arc")).toBeLessThan(0.16);
        expect(share("follow_the_leader")).toBeGreaterThan(0.2);
        expect(share("follow_the_leader")).toBeLessThan(0.4);

        for (const t of transitions) {
            expect(t.slots).toBeGreaterThanOrEqual(8);
            expect(t.slots).toBeLessThanOrEqual(32);
        }

        // Every marcher has at least 10 rows
        const rows = new Map<number, number>();
        for (const a of show.assignments)
            rows.set(a.marcher, (rows.get(a.marcher) ?? 0) + 1);
        for (const m of show.marchers)
            expect(rows.get(m.id) ?? 0).toBeGreaterThanOrEqual(10);

        // A chain of at least 30 back-to-back transitions: marcher 1's layer-0 rows
        const chain = show.assignments
            .filter((a) => a.marcher === 1 && a.layer === 0)
            .sort((a, b) => a.start - b.start);
        expect(chain.length).toBeGreaterThanOrEqual(30);

        // About 10% of the layer-0 rows get a layer-1 steal over their second half
        const base = show.assignments.filter((a) => a.layer === 0);
        const steals = show.assignments.filter((a) => a.layer === 1);
        expect(steals.length / base.length).toBeGreaterThan(0.07);
        expect(steals.length / base.length).toBeLessThanOrEqual(0.1 + 0.02);
        for (const s of steals) {
            const under = base.find(
                (a) =>
                    a.marcher === s.marcher &&
                    a.end === s.end &&
                    a.start < s.start,
            );
            expect(under, `steal ${s.id}`).toBeDefined();
            expect(s.start).toBe(
                under!.start + Math.floor((under!.end - under!.start) / 2),
            );
        }
    });

    it("is the same show for the same seed, and a different one for another seed", () => {
        expect(sc11(5)).toEqual(sc11(5));
        expect(sc11(5).show).not.toEqual(sc11(6).show);
    });

    it("is storable for many seeds", () => {
        for (let seed = 0; seed < 20; seed++) expectStorable(sc11(seed));
    });

    it("a smaller size is storable and matches the oracle", () => {
        for (const seed of [1, 2, 3]) {
            const fixture = sc11(seed, SMALL);
            expectStorable(fixture);
            expect(fixture.show.marchers).toHaveLength(SMALL.marchers);
            expectResolverMatchesOracle(fixture.show);
        }
    });

    it("rejects a size whose groups can't hold the marchers", () => {
        expect(() => sc11(1, { ...SMALL, marchers: 10 })).toThrow();
        expect(() => sc11(1, { ...SMALL, groupTransitions: 5 })).toThrow();
    });

    it("SC11_SIZE is the spec's scale", () => {
        expect(SC11_SIZE).toMatchObject({
            marchers: 250,
            timelines: 10,
            shapes: 120,
        });
        expect(SC11_SIZE.groupTransitions + SC11_SIZE.stealTransitions).toBe(
            200,
        );
    });
});
