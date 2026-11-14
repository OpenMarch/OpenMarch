import { describe, expect, it } from "vitest";
import {
    canPaintAsFieldNumber,
    YARD_NUMBER_PROPORTIONS,
    yardNumberPath,
} from "../fieldNumbers";
import { FIELD_NUMERAL_GLYPHS } from "../fieldNumeralGlyphs";

type Box = { minX: number; maxX: number; minY: number; maxY: number };

/** Bounds of every point in each subpath of an absolute M/L/Q/Z path. */
function subpathBounds(path: string): Box[] {
    return path
        .split("M")
        .filter(Boolean)
        .map((sub) => {
            const n = sub.match(/-?\d+(\.\d+)?/g)!.map(Number);
            const xs = n.filter((_, i) => i % 2 === 0);
            const ys = n.filter((_, i) => i % 2 === 1);
            return {
                minX: Math.min(...xs),
                maxX: Math.max(...xs),
                minY: Math.min(...ys),
                maxY: Math.max(...ys),
            };
        });
}

function union(boxes: Box[]): Box {
    return {
        minX: Math.min(...boxes.map((b) => b.minX)),
        maxX: Math.max(...boxes.map((b) => b.maxX)),
        minY: Math.min(...boxes.map((b) => b.minY)),
        maxY: Math.max(...boxes.map((b) => b.maxY)),
    };
}

// 6 ft tall numbers at 0.5 px per inch: 36 px tall, 24 px per digit, 6 px gap to the line
const HEIGHT = 36;
const home = { lineX: 500, insideY: 100, outsideY: 100 + HEIGHT };
const away = { lineX: 500, insideY: 400, outsideY: 400 - HEIGHT };
const ZERO_WIDTH = FIELD_NUMERAL_GLYPHS["0"].width;
const ARROW_LENGTH = HEIGHT * YARD_NUMBER_PROPORTIONS.arrowLength;

describe("glyph data", () => {
    it("has every digit, the widest exactly 1 wide, all spanning 0..1 in y", () => {
        const digits = Object.keys(FIELD_NUMERAL_GLYPHS).sort();
        expect(digits).toEqual([..."0123456789"]);
        const widths = digits.map((d) => FIELD_NUMERAL_GLYPHS[d].width);
        expect(Math.max(...widths)).toBe(1);
        const all = union(
            digits.flatMap((d) => subpathBounds(FIELD_NUMERAL_GLYPHS[d].path)),
        );
        // Curve control points may sit a hair outside the outline
        expect(all.minY).toBeCloseTo(0, 2);
        expect(all.maxY).toBeCloseTo(1, 2);
    });
});

describe("canPaintAsFieldNumber", () => {
    it.each([
        ["40", true],
        ["5", true],
        ["G", false],
        ["4A", false],
        ["", false],
    ])("%s -> %s", (label, expected) => {
        expect(canPaintAsFieldNumber(label)).toBe(expected);
    });
});

describe("yardNumberPath", () => {
    it("returns undefined for labels that are not digits", () => {
        expect(
            yardNumberPath({ label: "G", arrowDirection: 0, ...home }),
        ).toBeUndefined();
    });

    it("paints the 50 at 6 ft tall, digits 1 ft either side of the line, no arrow", () => {
        const path = yardNumberPath({
            label: "50",
            arrowDirection: 0,
            ...home,
        })!;
        const boxes = subpathBounds(path);
        const all = union(boxes);
        expect(all.minY).toBeCloseTo(home.insideY, 0);
        expect(all.maxY).toBeCloseTo(home.outsideY, 0);
        // The right digit starts 1 ft past the line and is as wide as its glyph
        expect(all.maxX).toBeCloseTo(home.lineX + 6 + ZERO_WIDTH * 24, 0);
        expect(all.maxX).toBeLessThanOrEqual(home.lineX + 6 + 24 + 0.01);
        expect(all.minX).toBeGreaterThanOrEqual(home.lineX - 6 - 24 - 0.01);
        // Nothing within 1 ft of the yard line
        for (const b of boxes)
            expect(
                b.maxX <= home.lineX - 6 + 0.01 ||
                    b.minX >= home.lineX + 6 - 0.01,
            ).toBe(true);
    });

    it("puts the arrow on the goal-line side of the number, aligned to its top", () => {
        const path = yardNumberPath({
            label: "40",
            arrowDirection: -1,
            ...home,
        })!;
        const arrow = subpathBounds(path).at(-1)!;
        const tipX = home.lineX - 6 - 24 - 6 - ARROW_LENGTH;
        expect(arrow.minX).toBeCloseTo(tipX, 1);
        expect(arrow.maxX).toBeCloseTo(home.lineX - 36, 1);
        expect(arrow.minY).toBeCloseTo(home.insideY, 1);
        expect(arrow.maxY).toBeCloseTo(home.insideY + 9, 1); // 18 in base
    });

    it("turns the far side's numbers 180° and keeps the arrow pointing at the same goal line", () => {
        const homePath = yardNumberPath({
            label: "40",
            arrowDirection: 1,
            ...home,
        })!;
        const awayPath = yardNumberPath({
            label: "40",
            arrowDirection: 1,
            ...away,
        })!;
        const homeBoxes = subpathBounds(homePath);
        const awayBoxes = subpathBounds(awayPath);
        const awayAll = union(awayBoxes);
        expect(awayAll.minY).toBeCloseTo(away.outsideY, 1);
        expect(awayAll.maxY).toBeCloseTo(away.insideY, 1);

        // Both arrows point toward larger x and sit by the top (inside) of the number
        const homeArrow = homeBoxes.at(-1)!;
        const awayArrow = awayBoxes.at(-1)!;
        expect(homeArrow.minX).toBeGreaterThan(home.lineX);
        expect(awayArrow.minX).toBeGreaterThan(away.lineX);
        expect(awayArrow.maxX).toBeCloseTo(homeArrow.maxX, 1);
        expect(awayArrow.maxY).toBeCloseTo(away.insideY, 1);

        // On the far side the "4" is on the right of the line, read upside down
        const awayFour = awayBoxes.filter(
            (b) => b.minX >= away.lineX + 5.99 && b.maxX <= away.lineX + 30.01,
        );
        expect(awayFour.length).toBeGreaterThan(0);
    });

    it("scales with the number's height", () => {
        const path = yardNumberPath({
            label: "50",
            arrowDirection: 0,
            lineX: 0,
            insideY: 0,
            outsideY: 72,
        })!;
        const all = union(subpathBounds(path));
        expect(all.maxX).toBeCloseTo(12 + ZERO_WIDTH * 48, 0);
        expect(all.maxY).toBeCloseTo(72, 0);
    });
});
