import type { YardNumberCoordinates } from "@openmarch/core";
import { FIELD_NUMERAL_GLYPHS } from "./fieldNumeralGlyphs";

/**
 * Painted yard numbers, laid out like the numbers on a real football field.
 *
 * The rule books give the sizes for a 6 ft tall number, and everything here scales
 * from the number's height so custom fields with other heights keep the proportions:
 * - Each digit is at most 4 ft wide and 6 ft tall (NCAA, NFHS and NFL).
 * - The two digits sit either side of the yard line, 1 ft from it.
 * - A direction arrow (NCAA: a triangle with an 18 in base and two 36 in sides)
 *   sits beside the number, pointing toward the nearer goal line. There is none at the 50,
 *   and none for labels that aren't two digits, since those aren't yard numbers.
 */
export const YARD_NUMBER_PROPORTIONS = {
    /** Digit width (4 ft) over digit height (6 ft). */
    digitWidth: 4 / 6,
    /** Gap between the yard line and each digit (1 ft) over digit height. */
    lineGap: 1 / 6,
    /** Arrow base (18 in) over digit height (72 in). */
    arrowBase: 18 / 72,
    /** Arrow length from base to tip (√(36² − 9²) in) over digit height. */
    arrowLength: Math.sqrt(36 ** 2 - 9 ** 2) / 72,
    /** Gap between the outer digit and the arrow's base (1 ft) over digit height. */
    arrowGap: 1 / 6,
} as const;

export type YardNumberLayout = {
    /** The number to paint, e.g. "40". */
    label: string;
    /** X of the yard line the number belongs to. */
    lineX: number;
    /** Y of the edge of the number nearer the middle of the field (the number's top). */
    insideY: number;
    /** Y of the edge of the number nearer the sideline it reads from (the number's bottom). */
    outsideY: number;
    /**
     * Which goal line the arrow points to: -1 toward smaller x, 1 toward larger x,
     * 0 for no arrow (the 50).
     */
    arrowDirection: -1 | 0 | 1;
};

export type YardNumberSide = { insideY: number; outsideY: number };

/**
 * The bands the numbers are painted in, one per side that has both of its coordinates.
 * Sides with no height are skipped.
 *
 * @param stepsToY converts steps from the front sideline to canvas y.
 */
export function yardNumberSides(
    coordinates: YardNumberCoordinates,
    stepsToY: (steps: number) => number,
): YardNumberSide[] {
    const sides: YardNumberSide[] = [];
    const add = (inside?: number, outside?: number) => {
        if (inside === undefined || outside === undefined) return;
        if (inside === outside) return;
        sides.push({ insideY: stepsToY(inside), outsideY: stepsToY(outside) });
    };
    add(
        coordinates.homeStepsFromFrontToInside,
        coordinates.homeStepsFromFrontToOutside,
    );
    add(
        coordinates.awayStepsFromFrontToInside,
        coordinates.awayStepsFromFrontToOutside,
    );
    return sides;
}

/** Which way a yard line's arrow points: away from the center line, none on it. */
export function arrowDirectionFor(stepsFromCenterFront: number): -1 | 0 | 1 {
    return stepsFromCenterFront < 0 ? -1 : stepsFromCenterFront > 0 ? 1 : 0;
}

/** True when every character of the label can be painted as a field numeral. */
export function canPaintAsFieldNumber(label: string): boolean {
    return (
        label.length > 0 &&
        [...label].every((char) => FIELD_NUMERAL_GLYPHS[char] !== undefined)
    );
}

/**
 * Builds one SVG path (absolute coordinates) holding the digits and arrow of a yard number.
 *
 * The number reads upright from the sideline at `outsideY`: when `outsideY` is above
 * `insideY` (the far side of the field), the whole number is turned 180°.
 *
 * Returns undefined when the label has characters that aren't digits.
 */
export function yardNumberPath({
    label: rawLabel,
    lineX,
    insideY,
    outsideY,
    arrowDirection,
}: YardNumberLayout): string | undefined {
    const label = rawLabel.trim();
    if (!canPaintAsFieldNumber(label)) return undefined;
    const height = Math.abs(outsideY - insideY);
    if (height <= 0) return undefined;

    const p = YARD_NUMBER_PROPORTIONS;
    const boxWidth = height * p.digitWidth;
    const gap = height * p.lineGap;
    const digits = [...label];

    // Lay the number out upright, reading from the sideline at the bottom, in a frame
    // where the yard line is x = 0 and the top of the digits is y = 0. Digits are placed
    // in boxes of the full digit width. Two digits straddle the line, each hugging it, as
    // on a real field. Any other count is centred on the line with the same spacing.
    const boxes: { left: number; align: "left" | "right" | "center" }[] = [];
    if (digits.length === 2) {
        boxes.push({ left: -gap - boxWidth, align: "right" });
        boxes.push({ left: gap, align: "left" });
    } else {
        const step = boxWidth + 2 * gap;
        const total = digits.length * boxWidth + (digits.length - 1) * 2 * gap;
        digits.forEach((_, i) =>
            boxes.push({ left: -total / 2 + i * step, align: "center" }),
        );
    }
    const numberLeft = boxes[0].left;
    const numberRight = boxes[boxes.length - 1].left + boxWidth;

    // Map from the upright frame to the canvas. The far side's numbers are turned 180°
    // so they read upright from the far sideline.
    const turned = outsideY < insideY;
    const toCanvas = (x: number, y: number): string => {
        const cx = turned ? lineX - x : lineX + x;
        const cy = turned ? insideY - y : insideY + y;
        return `${round(cx)} ${round(cy)}`;
    };

    const parts: string[] = [];
    digits.forEach((digit, i) => {
        const glyph = FIELD_NUMERAL_GLYPHS[digit];
        const glyphWidth = glyph.width * boxWidth;
        const box = boxes[i];
        const left =
            box.align === "left"
                ? box.left
                : box.align === "right"
                  ? box.left + boxWidth - glyphWidth
                  : box.left + (boxWidth - glyphWidth) / 2;
        parts.push(
            transformGlyphPath(glyph.path, (gx, gy) =>
                toCanvas(left + gx * boxWidth, gy * height),
            ),
        );
    });

    if (arrowDirection !== 0 && digits.length === 2) {
        // The arrow lines up with the top of the number. Its direction is in canvas
        // terms, so undo the 180° turn when choosing which side it goes on.
        const uprightDirection = turned ? -arrowDirection : arrowDirection;
        const baseX =
            uprightDirection < 0
                ? numberLeft - height * p.arrowGap
                : numberRight + height * p.arrowGap;
        const tipX = baseX + uprightDirection * height * p.arrowLength;
        const base = height * p.arrowBase;
        parts.push(
            `M${toCanvas(baseX, 0)}L${toCanvas(tipX, base / 2)}L${toCanvas(baseX, base)}Z`,
        );
    }

    return parts.join("");
}

// Each match is one command letter and its numbers.
const GLYPH_COMMAND = /([MLQZ])([^MLQZ]*)/g; // cspell:disable-line

/** Applies `transform` to every point of a glyph path made of absolute M, L, Q and Z commands. */
function transformGlyphPath(
    path: string,
    transform: (x: number, y: number) => string,
): string {
    let out = "";
    for (const [, command, args] of path.matchAll(GLYPH_COMMAND)) {
        const numbers = args.trim().split(/\s+/).filter(Boolean).map(Number);
        const points: string[] = [];
        for (let i = 0; i + 1 < numbers.length; i += 2)
            points.push(transform(numbers[i], numbers[i + 1]));
        out += command + points.join(" ");
    }
    return out;
}

function round(value: number): number {
    return Math.round(value * 1000) / 1000;
}
