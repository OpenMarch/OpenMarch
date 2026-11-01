// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { ReadableCoords } from "@/global/classes/ReadableCoords";
import { lineCoordinate } from "../lineCoordinate";

/**
 * A snap guide's name (#427): the line as the coordinate sheet writes a spot on it, in its terse
 * wording, from the same formatter
 */
const field = FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
const x = (steps: number) =>
    field.centerFrontPoint.xPixels + steps * field.pixelsPerStep;
const y = (steps: number) =>
    field.centerFrontPoint.yPixels + steps * field.pixelsPerStep;

beforeAll(() => ReadableCoords.setFieldProperties(field));

describe("lineCoordinate", () => {
    it("names a side-to-side line the way the sheet writes its x", () => {
        expect(lineCoordinate("x", x(0))).toBe("On 50");
        expect(lineCoordinate("x", x(-16))).toBe("S1: On 40");
        // 4 steps outside the 35 on side 1
        expect(lineCoordinate("x", x(-28))).toBe("S1: 4 OUT 35");
        expect(lineCoordinate("x", x(14))).toBe("S2: 2 IN 40");
    });

    it("names a front-to-back line the way the sheet writes its y", () => {
        expect(lineCoordinate("y", y(-28))).toBe("On FH");
        // 12 steps behind the back hash
        expect(lineCoordinate("y", y(-68))).toBe("12 BE BH");
        expect(lineCoordinate("y", y(-4))).toBe("4 BE FSL");
    });

    it("between two yard lines alike, names it from the one nearer the center", () => {
        // Halfway between the 35 and the 40 on side 1
        expect(lineCoordinate("x", x(-20))).toBe("S1: 4 OUT 40");
        expect(lineCoordinate("x", x(20))).toBe("S2: 4 OUT 40");
    });

    it("between two front-to-back lines alike, names it from the one nearer the front", () => {
        // Halfway between the front sideline and the front hash
        expect(lineCoordinate("y", y(-14))).toBe("14 BE FSL");
        // Halfway between the front hash and the back hash
        expect(lineCoordinate("y", y(-42))).toBe("14 BE FH");
    });
});
