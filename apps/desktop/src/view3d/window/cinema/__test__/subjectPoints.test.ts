// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { FieldProperties, WorldPoint } from "@openmarch/core";
import type { ShowPositions } from "@/view3d/positions";
import {
    createSubjectPoints,
    SUBJECT_CACHE_SIZE,
    type CinemaMarcher,
} from "../subjectPoints";

const fieldProperties = {} as FieldProperties;

/** Marcher `id` stands at x = id, z = -ms / 1000. Counts every read. */
function fakePositions(known: readonly number[]) {
    const calls: { id: number; ms: number }[] = [];
    const positions = {
        positionInto(
            id: number,
            ms: number,
            _fp: FieldProperties,
            out: WorldPoint,
        ) {
            calls.push({ id, ms });
            if (!known.includes(id) || Number.isNaN(ms)) return false;
            out.x = id;
            out.z = -ms / 1000;
            return true;
        },
    } as unknown as ShowPositions;
    return { positions, calls };
}

const marchers: CinemaMarcher[] = [
    { id: 1, section: "Trumpet", tagIds: [7] },
    { id: 2, section: "Trumpet", tagIds: [] },
    { id: 3, section: "Tuba", tagIds: [7, 8] },
    { id: 4, section: "Snare", tagIds: [] },
];

function setUp(known: readonly number[] = [1, 2, 3, 4]) {
    const fake = fakePositions(known);
    return {
        ...fake,
        subjectPoints: createSubjectPoints(
            fake.positions,
            marchers,
            fieldProperties,
        ),
    };
}

const xs = (points: readonly WorldPoint[]) => points.map((p) => p.x);

describe("createSubjectPoints", () => {
    it("returns every marcher for the band", () => {
        const { subjectPoints } = setUp();
        expect(xs(subjectPoints({ kind: "band" }, 0))).toEqual([1, 2, 3, 4]);
    });

    it("returns only the marchers of a section", () => {
        const { subjectPoints } = setUp();
        expect(
            xs(subjectPoints({ kind: "section", section: "Trumpet" }, 0)),
        ).toEqual([1, 2]);
        expect(subjectPoints({ kind: "section", section: "Flute" }, 0)).toEqual(
            [],
        );
    });

    it("returns only the marchers with a tag", () => {
        const { subjectPoints } = setUp();
        expect(xs(subjectPoints({ kind: "tag", tagId: 7 }, 0))).toEqual([1, 3]);
        expect(subjectPoints({ kind: "tag", tagId: 99 }, 0)).toEqual([]);
    });

    it("skips unknown ids in a set", () => {
        const { subjectPoints } = setUp();
        expect(
            xs(subjectPoints({ kind: "set", marcherIds: [4, 99, 2] }, 0)),
        ).toEqual([4, 2]);
    });

    it("returns nothing for a marcher who isn't in the show", () => {
        const { subjectPoints } = setUp();
        expect(subjectPoints({ kind: "marcher", marcherId: 99 }, 0)).toEqual(
            [],
        );
        expect(xs(subjectPoints({ kind: "marcher", marcherId: 3 }, 0))).toEqual(
            [3],
        );
    });

    it("leaves out a marcher the resolver has no position for", () => {
        const { subjectPoints } = setUp([1, 3]);
        expect(xs(subjectPoints({ kind: "band" }, 0))).toEqual([1, 3]);
    });

    it("returns nothing for the subjects core resolves itself", () => {
        const { subjectPoints, calls } = setUp();
        expect(subjectPoints({ kind: "spot", x: 1, z: 2 }, 0)).toEqual([]);
        expect(calls).toHaveLength(0);
    });

    it("answers two times in the same 1/60 s from the cache", () => {
        const { subjectPoints, calls } = setUp();
        const first = subjectPoints({ kind: "band" }, 1000);
        const reads = calls.length;
        expect(reads).toBe(4);
        const second = subjectPoints({ kind: "band" }, 1004);
        expect(calls.length).toBe(reads);
        expect(second).toEqual(first);
    });

    it("samples at the bucket's time, so the answer doesn't depend on which time asked first", () => {
        const a = setUp();
        const b = setUp();
        const fromLate = a.subjectPoints({ kind: "band" }, 1004);
        const fromEarly = b.subjectPoints({ kind: "band" }, 1000);
        expect(fromLate).toEqual(fromEarly);
        expect(fromLate[0].z).toBeCloseTo(-1, 9);
    });

    it("keeps subjects apart in the cache", () => {
        const { subjectPoints } = setUp();
        subjectPoints({ kind: "section", section: "Trumpet" }, 0);
        expect(
            xs(subjectPoints({ kind: "section", section: "Tuba" }, 0)),
        ).toEqual([3]);
        expect(xs(subjectPoints({ kind: "tag", tagId: 8 }, 0))).toEqual([3]);
        expect(
            xs(subjectPoints({ kind: "set", marcherIds: [1, 2] }, 0)),
        ).toEqual([1, 2]);
        expect(
            xs(subjectPoints({ kind: "set", marcherIds: [2, 1] }, 0)),
        ).toEqual([2, 1]);
    });

    it("treats times before the show, and times that aren't numbers, as its start", () => {
        const { subjectPoints, calls } = setUp();
        const start = subjectPoints({ kind: "band" }, 0);
        const reads = calls.length;
        expect(subjectPoints({ kind: "band" }, -250)).toEqual(start);
        expect(subjectPoints({ kind: "band" }, Number.NaN)).toEqual(start);
        expect(calls.length).toBe(reads);
        expect(calls.every((c) => c.ms >= 0)).toBe(true);
    });

    it("drops the least recently used time once the cache is full", () => {
        const { subjectPoints, calls } = setUp();
        const step = 1000 / 60;
        subjectPoints({ kind: "band" }, 0);
        for (let i = 1; i < SUBJECT_CACHE_SIZE; i++) {
            subjectPoints({ kind: "band" }, i * step);
            // keeps time 0 the most recently used
            subjectPoints({ kind: "band" }, 0);
        }
        const full = calls.length;
        expect(full).toBe(SUBJECT_CACHE_SIZE * 4);
        // one more time pushes out the oldest (step 1), not time 0
        subjectPoints({ kind: "band" }, SUBJECT_CACHE_SIZE * step);
        subjectPoints({ kind: "band" }, 0);
        expect(calls.length).toBe(full + 4);
        subjectPoints({ kind: "band" }, step);
        expect(calls.length).toBe(full + 8);
    });
});
