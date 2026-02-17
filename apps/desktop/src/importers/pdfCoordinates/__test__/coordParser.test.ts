import { describe, it, expect } from "vitest";
import { parseLateral, parseFrontBack, type ParseResult } from "../coordParser";

// Standard football X checkpoints (0-100 in 5-yard increments)
function makeXCheckpoints() {
    const xCheckpoints = [];
    for (let yards = 0; yards <= 100; yards += 5) {
        const curYardLine = yards < 50 ? yards : 100 - yards;
        const stepsFromCenterFront = ((yards - 50) / 5) * 8;
        xCheckpoints.push({
            name: `${curYardLine} yard line`,
            stepsFromCenterFront,
            useAsReference: true,
        });
    }
    return xCheckpoints;
}

// High school Y checkpoints (single hash type)
const makeHsField = () => ({
    xCheckpoints: makeXCheckpoints(),
    yCheckpoints: [
        {
            name: "front sideline",
            stepsFromCenterFront: 0,
            useAsReference: true,
        },
        {
            name: "HS front hash",
            stepsFromCenterFront: -28,
            useAsReference: true,
        },
        {
            name: "HS back hash",
            stepsFromCenterFront: -56,
            useAsReference: true,
        },
        {
            name: "grid back sideline",
            stepsFromCenterFront: -85,
            useAsReference: true,
        },
    ],
});

// College Y checkpoints (single hash type)
const makeCollegeField = () => ({
    xCheckpoints: makeXCheckpoints(),
    yCheckpoints: [
        {
            name: "front sideline",
            stepsFromCenterFront: 0,
            useAsReference: true,
        },
        {
            name: "NCAA front hash",
            stepsFromCenterFront: -32,
            useAsReference: true,
        },
        {
            name: "grid NCAA back hash",
            stepsFromCenterFront: -52,
            useAsReference: true,
        },
        {
            name: "real NCAA back hash",
            stepsFromCenterFront: -53.33,
            useAsReference: false,
        },
        {
            name: "grid back sideline",
            stepsFromCenterFront: -85,
            useAsReference: true,
        },
        {
            name: "real back sideline",
            stepsFromCenterFront: -85.33,
            useAsReference: false,
        },
    ],
});

const makeField = makeHsField;

const field = makeField();

function expectOk(result: ParseResult, expected: number, precision = 1) {
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.steps).toBeCloseTo(expected, precision);
}

function expectErr(result: ParseResult, code?: string) {
    expect(result.ok).toBe(false);
    if (!result.ok && code) expect(result.code).toBe(code);
}

describe("parseLateral (x-axis)", () => {
    describe("On yard line", () => {
        it("Side 1: On 50 yd ln", () => {
            expectOk(parseLateral("Side 1: On 50 yd ln", field), 0);
        });

        it("Side 2: On 50 yd ln", () => {
            expectOk(parseLateral("Side 2: On 50 yd ln", field), 0);
        });

        it("Side 1: On 40 yd ln → -16 steps", () => {
            expectOk(parseLateral("Side 1: On 40 yd ln", field), -16);
        });

        it("Side 2: On 40 yd ln → +16 steps", () => {
            expectOk(parseLateral("Side 2: On 40 yd ln", field), 16);
        });

        it("On 0 (goal line) side 1 → -80 steps", () => {
            expectOk(parseLateral("Side 1: On 0 yd ln", field), -80);
        });

        it("On 0 (goal line) side 2 → +80 steps", () => {
            expectOk(parseLateral("Side 2: On 0 yd ln", field), 80);
        });
    });

    describe("Steps inside yard line", () => {
        it("Side 1: 4.0 steps Inside 25 yd ln", () => {
            // 25 yd line on side 1 = -40 steps. Inside = toward center = +4
            expectOk(
                parseLateral("Side 1: 4.0 steps Inside 25 yd ln", field),
                -36,
            );
        });

        it("Side 2: 4.0 steps Inside 25 yd ln", () => {
            // 25 yd line on side 2 = +40 steps. Inside = toward center = -4
            expectOk(
                parseLateral("Side 2: 4.0 steps Inside 25 yd ln", field),
                36,
            );
        });

        it("Side 1: 2.0 steps Inside 45 yd ln", () => {
            // 45 yd on side 1 = -8. Inside = +2 = -6
            expectOk(
                parseLateral("Side 1: 2.0 steps Inside 45 yd ln", field),
                -6,
            );
        });
    });

    describe("Steps outside yard line", () => {
        it("Side 1: 4.0 steps Outside 30 yd ln", () => {
            // 30 yd on side 1 = -32. Outside = away from center = -4
            expectOk(
                parseLateral("Side 1: 4.0 steps Outside 30 yd ln", field),
                -36,
            );
        });

        it("Side 2: 4.0 steps Outside 30 yd ln", () => {
            // 30 yd on side 2 = +32. Outside = away from center = +4
            expectOk(
                parseLateral("Side 2: 4.0 steps Outside 30 yd ln", field),
                36,
            );
        });
    });

    describe("Side synonyms", () => {
        it("Side A = Side 1", () => {
            const a = parseLateral("Side A: On 50 yd ln", field);
            const one = parseLateral("Side 1: On 50 yd ln", field);
            expect(a.ok).toBe(true);
            expect(one.ok).toBe(true);
            if (a.ok && one.ok) expect(a.steps).toBe(one.steps);
        });

        it("Left = Side 1", () => {
            const left = parseLateral("Left: On 50 yd ln", field);
            const one = parseLateral("Side 1: On 50 yd ln", field);
            expect(left.ok).toBe(true);
            expect(one.ok).toBe(true);
            if (left.ok && one.ok) expect(left.steps).toBe(one.steps);
        });

        it("Right = Side 2", () => {
            const right = parseLateral("Right: On 50 yd ln", field);
            const two = parseLateral("Side 2: On 50 yd ln", field);
            expect(right.ok).toBe(true);
            expect(two.ok).toBe(true);
            if (right.ok && two.ok) expect(right.steps).toBe(two.steps);
        });
    });

    describe("format variations", () => {
        it("without colon: Side 1 On 50 yd ln", () => {
            expectOk(parseLateral("Side 1 On 50 yd ln", field), 0);
        });

        it("with 'yard line' instead of 'yd ln'", () => {
            expectOk(parseLateral("Side 1: On 50 yard line", field), 0);
        });

        it("without yd ln suffix", () => {
            expectOk(parseLateral("Side 1: On 50", field), 0);
        });

        it("extra whitespace", () => {
            expectOk(parseLateral("  Side 1:   On  50  yd  ln  ", field), 0);
        });
    });

    describe("error cases", () => {
        it("empty string returns error", () => {
            expectErr(parseLateral("", field), "EMPTY");
        });

        it("gibberish returns error", () => {
            expectErr(parseLateral("banana split", field));
        });
    });
});

describe("parseFrontBack (y-axis)", () => {
    describe("On reference", () => {
        it("On Front Hash (HS)", () => {
            expectOk(parseFrontBack("On Front Hash (HS)", field), -28);
        });

        it("On Back Hash (HS)", () => {
            expectOk(parseFrontBack("On Back Hash (HS)", field), -56);
        });

        it("On Front Sideline", () => {
            expectOk(parseFrontBack("On Front Sideline", field), 0);
        });

        it("On Back Sideline", () => {
            expectOk(parseFrontBack("On Back Sideline", field), -85);
        });
    });

    describe("Steps behind reference", () => {
        it("4.0 steps Behind Front Hash (HS)", () => {
            // Front hash HS = -28, behind = further from front = -4
            expectOk(
                parseFrontBack("4.0 steps Behind Front Hash (HS)", field),
                -32,
            );
        });

        it("8.0 steps Behind Back Hash (HS)", () => {
            // Back hash HS = -56, behind = further from front = -8
            expectOk(
                parseFrontBack("8.0 steps Behind Back Hash (HS)", field),
                -64,
            );
        });
    });

    describe("Steps in front of reference", () => {
        it("4.0 steps In Front Of Front Hash (HS)", () => {
            // Front hash HS = -28, in front = toward front = +4
            expectOk(
                parseFrontBack("4.0 steps In Front Of Front Hash (HS)", field),
                -24,
            );
        });

        it("2.0 steps In Front Of Back Hash (HS)", () => {
            // Back hash HS = -56, in front = toward front = +2
            expectOk(
                parseFrontBack("2.0 steps In Front Of Back Hash (HS)", field),
                -54,
            );
        });
    });

    describe("College hash", () => {
        const collegeField = makeCollegeField();

        it("On Front Hash (College) → NCAA front hash", () => {
            expectOk(
                parseFrontBack("On Front Hash (College)", collegeField),
                -32,
            );
        });

        it("On Front Hash without tag on college field → NCAA", () => {
            expectOk(parseFrontBack("On Front Hash", collegeField), -32);
        });

        it("4.0 steps Behind Front Hash on college field", () => {
            expectOk(
                parseFrontBack("4.0 steps Behind Front Hash", collegeField),
                -36,
            );
        });
    });

    describe("format variations", () => {
        it("lowercase 'on front hash (hs)'", () => {
            expectOk(parseFrontBack("on front hash (hs)", field), -28);
        });

        it("extra whitespace", () => {
            expectOk(
                parseFrontBack(
                    "  4.0  steps  Behind  Front Hash  (HS)  ",
                    field,
                ),
                -32,
            );
        });

        it("abbreviated FH → first front hash (HS)", () => {
            expectOk(parseFrontBack("On FH", field), -28);
        });

        it("abbreviated BH → first back hash (HS)", () => {
            expectOk(parseFrontBack("On BH", field), -56);
        });

        it("FSL for front sideline", () => {
            expectOk(parseFrontBack("On FSL", field), 0);
        });

        it("BSL for back sideline", () => {
            expectOk(parseFrontBack("On BSL", field), -85);
        });
    });

    describe("error cases", () => {
        it("empty string returns error", () => {
            expectErr(parseFrontBack("", field), "EMPTY");
        });

        it("no hash/sideline reference returns error", () => {
            expectErr(
                parseFrontBack("4.0 steps somewhere", field),
                "FB_NO_REFERENCE",
            );
        });
    });
});

describe("edge cases from real Pyware output", () => {
    it("handles 'Side 1: On 50 yd In'", () => {
        // OCR might misread 'ln' as 'In'
        const result = parseLateral("Side 1: On 50 yd In", field);
        // Should still parse — 'yd' alone triggers YARDLINE, 'In' becomes noise
        expect(result.ok).toBe(true);
    });

    it("handles missing 'steps' word: '4.0 Inside 25 yd ln'", () => {
        // Some formats omit the 'steps' keyword
        const result = parseLateral("Side 1: 4.0 Inside 25 yd ln", field);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.steps).toBeCloseTo(-36, 1);
    });

    it("handles reversed order: 'On 50 yd ln Side 1'", () => {
        const result = parseLateral("On 50 yd ln Side 1", field);
        expect(result.ok).toBe(true);
    });

    it("handles 'On Front Hash' without parenthesized tag", () => {
        const result = parseFrontBack("On Front Hash", field);
        expect(result.ok).toBe(true);
    });

    it("handles generic 'Hash' (defaults to front)", () => {
        const result = parseFrontBack("On Hash", field);
        expect(result.ok).toBe(true);
    });
});
