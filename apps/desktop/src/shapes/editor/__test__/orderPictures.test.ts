import { describe, expect, it } from "vitest";
import { leastTravel } from "../../leastTravel";
import {
    ORDER_PICTURE_SIZE,
    ORDER_SAMPLE,
    orderPicture,
    orderSequence,
} from "../orderPictures";

/**
 * Who goes where's pictures (#559, design C): the marchers as numbers where they stand, then the
 * new line read as a sequence, worked out with the rule each answer names
 */

const { from, to } = ORDER_SAMPLE;

describe("who goes where's pictures", () => {
    it("reads Least travel's sequence from the real solver", () => {
        const spotOf = leastTravel(from, to);
        const sequence = orderSequence("nearest");
        spotOf.forEach((spot, i) => expect(sequence[spot]).toBe(i + 1));
        expect(sequence.join("")).toBe("2143");
    });

    it("reads Keep order first to last, and Reverse order last to first", () => {
        expect(orderSequence("keep").join("")).toBe("1234");
        expect(orderSequence("reverse").join("")).toBe("4321");
        expect(orderPicture("reverse").after.map((a) => a.n)).toEqual([
            4, 3, 2, 1,
        ]);
    });

    it("tells all three apart", () => {
        const all = (["nearest", "keep", "reverse"] as const).map((c) =>
            orderSequence(c).join(""),
        );
        expect(new Set(all).size).toBe(3);
    });

    it("draws the same marchers where they stand in every picture, inside the picture", () => {
        const { width, height } = ORDER_PICTURE_SIZE;
        const before = orderPicture("nearest").before;
        expect(orderPicture("keep").before).toEqual(before);
        expect(before.map((b) => b.n)).toEqual([1, 2, 3, 4]);
        for (const p of [...before, ...orderPicture("keep").after]) {
            expect(p.x).toBeGreaterThan(0);
            expect(p.x).toBeLessThan(width);
            expect(p.y).toBeGreaterThan(0);
            expect(p.y).toBeLessThan(height);
        }
        // Before stays left of the arrow, after right of it
        const { arrow } = orderPicture("keep");
        for (const b of before) expect(b.x).toBeLessThan(arrow.x1);
        for (const a of orderPicture("keep").after)
            expect(a.x).toBeGreaterThan(arrow.x2);
    });
});
