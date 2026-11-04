// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    parsePropColor,
    propColorsByMarcher,
    propColorToString,
} from "../propColor";

describe("prop colors", () => {
    it("round-trips a color through the stored text", () => {
        const red = { r: 220, g: 38, b: 38, a: 1 };
        expect(propColorToString(red)).toBe("rgba(220, 38, 38, 1)");
        expect(parsePropColor(propColorToString(red))).toEqual(red);
        expect(parsePropColor("rgba(1,2,3,0.5)")).toEqual({
            r: 1,
            g: 2,
            b: 3,
            a: 0.5,
        });
        expect(parsePropColor("rgb(1, 2, 3)")).toEqual({
            r: 1,
            g: 2,
            b: 3,
            a: 1,
        });
    });

    it("reads no color, or a bad one, as none", () => {
        expect(propColorToString(null)).toBeNull();
        expect(parsePropColor(null)).toBeNull();
        expect(parsePropColor("")).toBeNull();
        expect(parsePropColor("red")).toBeNull();
        expect(parsePropColor("rgba(300, 0, 0, 1)")).toBeNull();
    });

    it("maps the colored items by marcher id", () => {
        const colors = propColorsByMarcher([
            { marcher_id: 4, color: "rgba(0, 128, 0, 1)" },
            { marcher_id: 5, color: null },
        ]);
        expect([...colors.keys()]).toEqual([4]);
        expect(colors.get(4)).toEqual({ r: 0, g: 128, b: 0, a: 1 });
    });
});
