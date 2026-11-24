import { describe, expect, it } from "vitest";
import { cometHead, cometStrength, cometTiming } from "../orderComet";

describe("cometTiming", () => {
    it("keeps short lines from flashing and long lines from crawling", () => {
        expect(cometTiming(4).travelMs).toBe(900);
        expect(cometTiming(50).travelMs).toBe(1500);
        expect(cometTiming(400).travelMs).toBe(2800);
    });

    it("gives the tail about a tenth of the line, between 2 and 9 marchers", () => {
        expect(cometTiming(4).tail).toBe(2);
        expect(cometTiming(50).tail).toBe(5);
        expect(cometTiming(200).tail).toBe(9);
    });
});

describe("cometHead", () => {
    const timing = { travelMs: 1000, restMs: 500, tail: 3 };

    it("starts on the leader and runs past the last marcher by the tail", () => {
        expect(cometHead(0, 10, timing)).toBe(0);
        expect(cometHead(500, 10, timing)).toBeCloseTo(6);
        expect(cometHead(999, 10, timing)).toBeCloseTo(11.99, 1);
    });

    it("rests, then starts again at the leader", () => {
        expect(cometHead(1200, 10, timing)).toBeNull();
        expect(cometHead(1500, 10, timing)).toBe(0);
    });

    it("doesn't run on fewer than two marchers", () => {
        expect(cometHead(0, 1, timing)).toBeNull();
    });
});

describe("cometStrength", () => {
    it("is full on the head and fades toward the leader", () => {
        expect(cometStrength(5, 5, 4)).toBe(1);
        expect(cometStrength(4, 5, 4)).toBe(0.75);
        expect(cometStrength(2, 5, 4)).toBe(0.25);
        expect(cometStrength(1, 5, 4)).toBe(0);
    });

    it("eases in just ahead of the head and is dark further ahead", () => {
        expect(cometStrength(6, 5.5, 4)).toBe(0.5);
        expect(cometStrength(7, 5.5, 4)).toBe(0);
    });

    it("is dark while the comet rests", () => {
        expect(cometStrength(0, null, 4)).toBe(0);
    });
});
