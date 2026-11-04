import { describe, expect, it } from "vitest";
import type Page from "@/global/classes/Page";
import { hasMotionBetweenPages, PAGE_LINE_TOLERANCE_PX } from "../pageLines";

/** Pages ending on `ends` (page 0 holds beat 0, so its end is 1). */
const pagesEnding = (ends: number[]) => {
    let next = 0;
    return ends.map((end) => {
        const beats = [];
        for (; next < end; next++) beats.push({ index: next });
        return { beats } as unknown as Pick<Page, "beats">;
    });
};

/** A resolver whose marchers are at `paths[id](beat)`. */
const resolverOf = (
    paths: Record<number, (beat: number) => [number, number]>,
) => {
    const ids = Object.keys(paths).map(Number);
    return {
        marcherIds: () => ids,
        positionsAt: (beat: number, out: Float64Array) => {
            ids.forEach((id, i) => {
                const [x, y] = paths[id]!(beat);
                out[2 * i] = x;
                out[2 * i + 1] = y;
            });
        },
    };
};

/** Straight from (0, 0) at beat 1 to (80, 40) at beat 9, held after */
const straight = (beat: number): [number, number] => {
    const u = Math.min(Math.max((beat - 1) / 8, 0), 1);
    return [80 * u, 40 * u];
};

/** Gets to (80, 40) by beat 5 and holds: the move ends mid-page */
const endsMidPage = (beat: number): [number, number] => {
    const u = Math.min(Math.max((beat - 1) / 4, 0), 1);
    return [80 * u, 40 * u];
};

describe("hasMotionBetweenPages", () => {
    const pages = pagesEnding([1, 9, 13]);

    it("is false for straight moves from page to page, and for holds", () => {
        expect(
            hasMotionBetweenPages({
                resolver: resolverOf({ 1: straight, 2: () => [5, 5] }),
                pages,
            }),
        ).toBe(false);
    });

    it("is true for a move that ends partway through a page", () => {
        expect(
            hasMotionBetweenPages({
                resolver: resolverOf({ 1: straight, 2: endsMidPage }),
                pages,
            }),
        ).toBe(true);
    });

    it("is true for a curved path between the same page positions", () => {
        const arc = (beat: number): [number, number] => {
            const [x, y] = straight(beat);
            const u = Math.min(Math.max((beat - 1) / 8, 0), 1);
            return [x, y + 20 * Math.sin(Math.PI * u)];
        };
        expect(
            hasMotionBetweenPages({ resolver: resolverOf({ 1: arc }), pages }),
        ).toBe(true);
    });

    it("checks a one-count page at its half count", () => {
        const bump = (beat: number): [number, number] => [
            beat > 9 && beat < 10 ? 10 : 0,
            0,
        ];
        expect(
            hasMotionBetweenPages({
                resolver: resolverOf({ 1: bump }),
                pages: pagesEnding([1, 9, 10]),
            }),
        ).toBe(true);
    });

    it("ignores drift within the tolerance", () => {
        const wobble = (beat: number): [number, number] => {
            const [x, y] = straight(beat);
            return [x + (beat % 1 ? PAGE_LINE_TOLERANCE_PX / 2 : 0), y];
        };
        expect(
            hasMotionBetweenPages({
                resolver: resolverOf({ 1: wobble }),
                pages,
            }),
        ).toBe(false);
    });

    it("only checks the marchers asked about", () => {
        const resolver = resolverOf({ 1: straight, 2: endsMidPage });
        expect(
            hasMotionBetweenPages({
                resolver,
                pages,
                marcherIds: new Set([1]),
            }),
        ).toBe(false);
        expect(
            hasMotionBetweenPages({
                resolver,
                pages,
                marcherIds: new Set([2]),
            }),
        ).toBe(true);
    });

    it("is false with fewer than two pages", () => {
        expect(
            hasMotionBetweenPages({
                resolver: resolverOf({ 1: endsMidPage }),
                pages: pagesEnding([1]),
            }),
        ).toBe(false);
    });
});
