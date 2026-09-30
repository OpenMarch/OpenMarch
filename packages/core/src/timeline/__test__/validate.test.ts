import { describe, expect, it } from "vitest";
import {
    COORD_BOUND,
    normalizeStartAngle,
    validateDestination,
    validateDestinations,
    validateHome,
    validatePathParams,
    validateShapeGeometry,
} from "../validate";
import type { ShapeKind } from "../types";

/** What `JSON.parse("1e999")` yields: SQLite json_valid accepts it (QA-DB-31) */
const JSON_1E999: number = JSON.parse("1e999");
const B = COORD_BOUND;
const TWO_PI = 2 * Math.PI;
/** Just beyond the bound, as the next double above 1e6 */
const BEYOND = B + 1e-9;

const ok = (r: { ok: boolean }) => expect(r.ok).toBe(true);
function rejects(
    r: ReturnType<typeof validateShapeGeometry>,
    code: string,
    path?: string,
) {
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.length).toBeGreaterThan(0);
    for (const e of r.errors) {
        expect(e.code).toBe(code);
        expect(e.message.length).toBeGreaterThan(0);
    }
    if (path !== undefined) expect(r.errors.map((e) => e.path)).toContain(path);
}
const shapeBad = (kind: ShapeKind, g: unknown, path?: string) =>
    rejects(validateShapeGeometry(kind, g), "E-S1", path);

describe("normalizeStartAngle", () => {
    it("leaves values in [0, 2pi) alone", () => {
        expect(normalizeStartAngle(0)).toBe(0);
        expect(normalizeStartAngle(1)).toBe(1);
        expect(normalizeStartAngle(TWO_PI - 1e-9)).toBe(TWO_PI - 1e-9);
    });
    it("wraps values outside the range", () => {
        expect(normalizeStartAngle(TWO_PI + 1)).toBeCloseTo(1, 12);
        expect(normalizeStartAngle(-1)).toBeCloseTo(TWO_PI - 1, 12);
        expect(normalizeStartAngle(10 * TWO_PI + 0.5)).toBeCloseTo(0.5, 9);
    });
    it("stores 0 when rounding yields exactly 2pi", () => {
        expect(normalizeStartAngle(TWO_PI)).toBe(0);
        // -1e-20 % 2pi is -1e-20, and adding 2pi rounds to exactly 2pi
        expect(normalizeStartAngle(-1e-20)).toBe(0);
        expect(Object.is(normalizeStartAngle(-0), -0)).toBe(false);
    });
    it("always lands in [0, 2pi) for a sweep of inputs", () => {
        for (const t of [-1e15, -7, -TWO_PI, -1e-300, 3, 1e10, 1e20]) {
            const r = normalizeStartAngle(t);
            expect(r).toBeGreaterThanOrEqual(0);
            expect(r).toBeLessThan(TWO_PI);
        }
    });
    it("returns NaN for non-finite input", () => {
        expect(normalizeStartAngle(Infinity)).toBeNaN();
        expect(normalizeStartAngle(NaN)).toBeNaN();
    });
});

describe("validateShapeGeometry: line", () => {
    const line = (a: unknown, b: unknown) => ({ points: [a, b] });
    it("accepts two distinct in-bound points, including exactly at the bound", () => {
        ok(validateShapeGeometry("line", line([0, 0], [1, 0])));
        ok(validateShapeGeometry("line", line([-B, -B], [B, B])));
    });
    it("rejects coincident endpoints", () => {
        shapeBad("line", line([3, 4], [3, 4]), "points");
    });
    it("rejects wrong point counts", () => {
        shapeBad("line", { points: [[0, 0]] }, "points");
        shapeBad(
            "line",
            {
                points: [
                    [0, 0],
                    [1, 1],
                    [2, 2],
                ],
            },
            "points",
        );
    });
    it("rejects points just beyond the bound", () => {
        shapeBad("line", line([0, 0], [BEYOND, 0]), "points[1][0]");
        shapeBad("line", line([0, -BEYOND], [1, 1]), "points[0][1]");
    });
    it("rejects non-finite coordinates (QA-DB-31)", () => {
        shapeBad("line", line([0, 0], [Infinity, 0]), "points[1][0]");
        shapeBad("line", line([0, 0], [JSON_1E999, 0]), "points[1][0]");
        shapeBad("line", line([NaN, 0], [1, 1]), "points[0][0]");
        shapeBad("line", line([0, 0], [0, -Infinity]), "points[1][1]");
    });
    it("rejects wrong shape and types (QA-DB-25)", () => {
        shapeBad("line", {
            points: [
                [0, 0],
                ["1", 1],
            ],
        });
        shapeBad("line", { points: [[0, 0], [1]] });
        shapeBad("line", { points: "nope" });
        shapeBad("line", { origin: [0, 0], width: 1, height: 1 });
        shapeBad("line", null);
        shapeBad("line", [
            [0, 0],
            [1, 1],
        ]);
        shapeBad(
            "line",
            {
                points: [
                    [0, 0],
                    [1, 1],
                ],
                extra: 1,
            },
            "extra",
        );
    });
});

describe("validateShapeGeometry: freehand", () => {
    it("accepts 2+ points with positive length and repeated consecutive points", () => {
        ok(
            validateShapeGeometry("freehand", {
                points: [
                    [0, 0],
                    [1, 1],
                ],
            }),
        );
        ok(
            validateShapeGeometry("freehand", {
                points: [
                    [0, 0],
                    [0, 0],
                    [2, 0],
                    [2, 0],
                ],
            }),
        );
        ok(
            validateShapeGeometry("freehand", {
                points: [
                    [-B, B],
                    [B, -B],
                ],
            }),
        );
    });
    it("rejects fewer than 2 points", () => {
        shapeBad("freehand", { points: [] }, "points");
        shapeBad("freehand", { points: [[1, 1]] }, "points");
    });
    it("rejects zero total length", () => {
        shapeBad(
            "freehand",
            {
                points: [
                    [1, 1],
                    [1, 1],
                ],
            },
            "points",
        );
        shapeBad(
            "freehand",
            {
                points: [
                    [1, 1],
                    [1, 1],
                    [1, 1],
                ],
            },
            "points",
        );
    });
    it("accepts a closed loop that returns to its start", () => {
        ok(
            validateShapeGeometry("freehand", {
                points: [
                    [0, 0],
                    [1, 0],
                    [0, 0],
                ],
            }),
        );
    });
    it("rejects an out-of-bound or non-finite point anywhere in the list", () => {
        shapeBad(
            "freehand",
            {
                points: [
                    [0, 0],
                    [1, 1],
                    [B, BEYOND],
                ],
            },
            "points[2][1]",
        );
        shapeBad(
            "freehand",
            {
                points: [
                    [0, 0],
                    [Infinity, 1],
                    [2, 2],
                ],
            },
            "points[1][0]",
        );
        shapeBad(
            "freehand",
            {
                points: [
                    [0, 0],
                    [1, NaN],
                ],
            },
            "points[1][1]",
        );
    });
});

describe("validateShapeGeometry: box", () => {
    const box = (o: unknown, width: unknown, height: unknown) => ({
        origin: o,
        width,
        height,
    });
    it("accepts a box whose far corner is exactly at the bound", () => {
        ok(validateShapeGeometry("box", box([0, 0], 4, 2)));
        ok(validateShapeGeometry("box", box([-B, -B], 2 * B, 2 * B)));
    });
    it("rejects a far corner just beyond the bound", () => {
        shapeBad("box", box([0, 0], B + 1, 1), "width");
        shapeBad("box", box([-B, -B], 2 * B + 1e-6, 1), "width");
        shapeBad("box", box([0, 0], 1, 2 * B), "height");
    });
    it("rejects an origin beyond the bound", () => {
        shapeBad("box", box([BEYOND, 0], 1, 1), "origin[0]");
    });
    it("rejects non-positive or non-finite sides", () => {
        shapeBad("box", box([0, 0], 0, 1), "width");
        shapeBad("box", box([0, 0], 1, 0), "height");
        shapeBad("box", box([0, 0], -1, 1), "width");
        shapeBad("box", box([0, 0], 1, -0.001), "height");
        shapeBad("box", box([0, 0], Infinity, 1), "width");
        shapeBad("box", box([0, 0], 1, JSON_1E999), "height");
        shapeBad("box", box([0, 0], NaN, 1), "width");
    });
    it("rejects the wrong shape for the kind (QA-DB-25)", () => {
        shapeBad("box", {
            points: [
                [0, 0],
                [1, 1],
            ],
        });
        shapeBad("box", { origin: [0, 0], width: "1", height: 1 }, "width");
        shapeBad("box", { origin: [0, 0], width: 1 }, "height");
    });
});

describe("validateShapeGeometry: circle", () => {
    const circle = (
        center: unknown,
        radius: unknown,
        start_angle: unknown = 0,
        clockwise: unknown = false,
    ) => ({ center, radius, start_angle, clockwise });
    it("accepts a circle whose perimeter touches the bound exactly", () => {
        ok(validateShapeGeometry("circle", circle([0, 0], 5)));
        ok(validateShapeGeometry("circle", circle([0, 0], B)));
        ok(
            validateShapeGeometry(
                "circle",
                circle([B - 10, -B + 10], 10, 1, true),
            ),
        );
    });
    it("rejects a perimeter that leaves the bound", () => {
        shapeBad("circle", circle([B, 0], 1), "radius");
        shapeBad("circle", circle([-B, 0], 1e-3), "radius");
        shapeBad("circle", circle([0, B - 5], 5.001), "radius");
        shapeBad("circle", circle([0, -B + 5], 5.001), "radius");
    });
    it("bounds the radius to (0, 1e6]", () => {
        shapeBad("circle", circle([0, 0], 0), "radius");
        shapeBad("circle", circle([0, 0], -1), "radius");
        shapeBad("circle", circle([0, 0], B + 1), "radius");
        shapeBad("circle", circle([0, 0], Infinity), "radius");
        shapeBad("circle", circle([0, 0], JSON_1E999), "radius");
        shapeBad("circle", circle([0, 0], NaN), "radius");
    });
    it("requires start_angle in [0, 2pi)", () => {
        ok(validateShapeGeometry("circle", circle([0, 0], 1, 0)));
        ok(validateShapeGeometry("circle", circle([0, 0], 1, TWO_PI - 1e-12)));
        shapeBad("circle", circle([0, 0], 1, TWO_PI), "start_angle");
        shapeBad("circle", circle([0, 0], 1, -1e-12), "start_angle");
        shapeBad("circle", circle([0, 0], 1, 1e20), "start_angle");
        shapeBad("circle", circle([0, 0], 1, Infinity), "start_angle");
        shapeBad("circle", circle([0, 0], 1, NaN), "start_angle");
    });
    it("accepts a normalized angle after normalizing an out-of-range one", () => {
        ok(
            validateShapeGeometry(
                "circle",
                circle([0, 0], 1, normalizeStartAngle(TWO_PI)),
            ),
        );
        ok(
            validateShapeGeometry(
                "circle",
                circle([0, 0], 1, normalizeStartAngle(-1)),
            ),
        );
    });
    it("requires a boolean clockwise and a finite in-bound center", () => {
        shapeBad("circle", circle([0, 0], 1, 0, "yes"), "clockwise");
        shapeBad("circle", circle([Infinity, 0], 1), "center[0]");
        shapeBad("circle", circle([0, BEYOND], 1), "center[1]");
    });
    it("rejects the wrong shape for the kind (QA-DB-25)", () => {
        shapeBad("circle", { origin: [0, 0], width: 1, height: 1 });
        shapeBad("circle", { center: [0, 0], radius: 1 });
    });
});

describe("validateShapeGeometry: block", () => {
    const block = (
        origin: unknown,
        rows: unknown,
        cols: unknown,
        spacing: unknown,
    ) => ({ origin, rows, cols, spacing });
    it("accepts a grid whose far corner is exactly at the bound", () => {
        ok(validateShapeGeometry("block", block([0, 0], 1, 1, [2, 2])));
        ok(validateShapeGeometry("block", block([0, 0], 3, 5, [2, 4])));
        ok(validateShapeGeometry("block", block([-B, -B], 3, 3, [B, B])));
        ok(validateShapeGeometry("block", block([B, B], 3, 3, [-B, -B])));
    });
    it("rejects a grid whose far corner leaves the bound, checking the whole grid", () => {
        shapeBad("block", block([-B, 0], 2, 4, [B, 1]), "cols");
        shapeBad("block", block([0, -B], 4, 2, [1, B]), "rows");
        shapeBad("block", block([B, 0], 1, 2, [1e-6, 0]), "cols");
        // Negative spacing walks the grid in the other direction
        shapeBad("block", block([0, 0], 1, 3, [-B, 0]), "cols");
    });
    it("rejects an origin beyond the bound", () => {
        shapeBad("block", block([BEYOND, 0], 1, 1, [1, 1]), "origin[0]");
    });
    it("requires integer rows and cols >= 1", () => {
        shapeBad("block", block([0, 0], 0, 1, [1, 1]), "rows");
        shapeBad("block", block([0, 0], 1, 0, [1, 1]), "cols");
        shapeBad("block", block([0, 0], 1.5, 1, [1, 1]), "rows");
        shapeBad("block", block([0, 0], 1, 2.5, [1, 1]), "cols");
        shapeBad("block", block([0, 0], -1, 1, [1, 1]), "rows");
        shapeBad("block", block([0, 0], "2", 1, [1, 1]), "rows");
        shapeBad("block", block([0, 0], Infinity, 1, [1, 1]), "rows");
        shapeBad("block", block([0, 0], 1, JSON_1E999, [1, 1]), "cols");
        shapeBad("block", block([0, 0], NaN, 1, [1, 1]), "rows");
    });
    it("requires finite spacing (any sign, zero allowed)", () => {
        ok(validateShapeGeometry("block", block([0, 0], 2, 2, [0, 0])));
        shapeBad("block", block([0, 0], 2, 2, [Infinity, 1]), "spacing[0]");
        shapeBad("block", block([0, 0], 2, 2, [1, NaN]), "spacing[1]");
        shapeBad("block", block([0, 0], 2, 2, [1]), "spacing");
    });
    it("rejects the wrong shape for the kind (QA-DB-25)", () => {
        shapeBad("block", {
            points: [
                [0, 0],
                [1, 1],
            ],
        });
        shapeBad("block", { origin: [0, 0], cols: 2, spacing: [1, 1] }, "rows");
    });
});

describe("validateShapeGeometry: general", () => {
    it("rejects an unknown kind and non-object geometry", () => {
        rejects(validateShapeGeometry("hexagon" as ShapeKind, {}), "E-S1");
        shapeBad("box", undefined);
        shapeBad("circle", 5);
    });
    it("reports every problem, not just the first", () => {
        const r = validateShapeGeometry("box", {
            origin: [Infinity, 0],
            width: -1,
            height: 0,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(3);
    });
});

describe("validatePathParams", () => {
    const paramsBad = (
        style: Parameters<typeof validatePathParams>[0],
        p: unknown,
        path?: string,
    ) => rejects(validatePathParams(style, p), "E-P1", path);

    it("direct requires null", () => {
        ok(validatePathParams("direct", null));
        paramsBad("direct", {});
        paramsBad("direct", { bulge: 0.1 });
        paramsBad("direct", undefined);
        paramsBad("direct", 0);
    });
    it("arc accepts |bulge| <= 1/2 including exactly at the bound", () => {
        ok(validatePathParams("arc", { bulge: 0 }));
        ok(validatePathParams("arc", { bulge: 0.5 }));
        ok(validatePathParams("arc", { bulge: -0.5 }));
        ok(validatePathParams("arc", { bulge: 1e-300 }));
    });
    it("arc rejects |bulge| just beyond 1/2", () => {
        paramsBad("arc", { bulge: 0.5000000001 }, "bulge");
        paramsBad("arc", { bulge: -0.5000000001 }, "bulge");
        paramsBad("arc", { bulge: 2 }, "bulge");
        paramsBad("arc", { bulge: 1e200 }, "bulge");
    });
    it("arc rejects non-numeric and non-finite bulge (QA-DB-31)", () => {
        paramsBad("arc", { bulge: Infinity }, "bulge");
        paramsBad("arc", { bulge: JSON_1E999 }, "bulge");
        paramsBad("arc", { bulge: -Infinity }, "bulge");
        paramsBad("arc", { bulge: NaN }, "bulge");
        paramsBad("arc", { bulge: "0.1" }, "bulge");
        paramsBad("arc", { bulge: null }, "bulge");
    });
    it("arc rejects the wrong params for the style (QA-DB-25)", () => {
        paramsBad("arc", null);
        paramsBad("arc", {}, "bulge");
        paramsBad("arc", { waypoints: [] });
        paramsBad("arc", { bulge: 0.1, waypoints: [] }, "waypoints");
        paramsBad("arc", [0.1]);
    });
    it("follow_the_leader accepts empty and in-bound waypoints, at the bound", () => {
        ok(validatePathParams("follow_the_leader", { waypoints: [] }));
        ok(
            validatePathParams("follow_the_leader", {
                waypoints: [
                    [1, 2],
                    [3, 4],
                ],
            }),
        );
        ok(
            validatePathParams("follow_the_leader", {
                waypoints: [
                    [B, -B],
                    [-B, B],
                ],
            }),
        );
        // Repeated waypoints are legal
        ok(
            validatePathParams("follow_the_leader", {
                waypoints: [
                    [1, 1],
                    [1, 1],
                ],
            }),
        );
    });
    it("follow_the_leader rejects waypoints beyond the bound or non-finite", () => {
        paramsBad(
            "follow_the_leader",
            { waypoints: [[BEYOND, 0]] },
            "waypoints[0][0]",
        );
        paramsBad(
            "follow_the_leader",
            {
                waypoints: [
                    [0, 0],
                    [0, -BEYOND],
                ],
            },
            "waypoints[1][1]",
        );
        paramsBad(
            "follow_the_leader",
            { waypoints: [[Infinity, 0]] },
            "waypoints[0][0]",
        );
        paramsBad(
            "follow_the_leader",
            { waypoints: [[0, JSON_1E999]] },
            "waypoints[0][1]",
        );
        paramsBad(
            "follow_the_leader",
            { waypoints: [[NaN, 0]] },
            "waypoints[0][0]",
        );
    });
    it("follow_the_leader rejects the wrong params for the style (QA-DB-25)", () => {
        paramsBad("follow_the_leader", null);
        paramsBad("follow_the_leader", {}, "waypoints");
        paramsBad("follow_the_leader", { bulge: 0.1 });
        paramsBad("follow_the_leader", { waypoints: "x" }, "waypoints");
        paramsBad("follow_the_leader", { waypoints: [[1]] }, "waypoints[0]");
        paramsBad(
            "follow_the_leader",
            { waypoints: [["1", 2]] },
            "waypoints[0][0]",
        );
        paramsBad("follow_the_leader", [[0, 0]]);
    });
    it("rejects an unknown style", () => {
        rejects(validatePathParams("teleport" as never, null), "E-P1");
    });
});

describe("validateDestinations, validateDestination and validateHome", () => {
    it("accepts one in-bound point per slot, at the bound", () => {
        ok(
            validateDestinations(
                [
                    [0, 0],
                    [B, -B],
                ],
                2,
            ),
        );
        ok(validateDestinations([[1, 1]], 1));
        ok(validateDestination([-B, B]));
        ok(validateHome([B, B]));
        ok(validateHome([-B, -B]));
        ok(validateHome([0, 0]));
    });
    it("rejects a wrong count", () => {
        rejects(validateDestinations([[0, 0]], 2), "E-D2");
        rejects(
            validateDestinations(
                [
                    [0, 0],
                    [1, 1],
                ],
                1,
            ),
            "E-D2",
        );
        rejects(validateDestinations([], 0), "E-D2");
        rejects(validateDestinations([[0, 0]], 1.5), "E-D2");
    });
    it("rejects points beyond the bound", () => {
        rejects(
            validateDestinations(
                [
                    [0, 0],
                    [BEYOND, 0],
                ],
                2,
            ),
            "E-D2",
            "[1][0]",
        );
        rejects(validateDestination([0, -BEYOND]), "E-D2", "point[1]");
        rejects(validateHome([BEYOND, 0]), "E-N2", "home[0]");
        rejects(validateHome([0, -BEYOND]), "E-N2", "home[1]");
    });
    it("rejects non-finite and non-numeric coordinates (QA-DB-31, QA-DB-40)", () => {
        rejects(validateDestinations([[Infinity, 0]], 1), "E-D2", "[0][0]");
        rejects(validateDestinations([[0, JSON_1E999]], 1), "E-D2", "[0][1]");
        rejects(validateDestinations([[NaN, 0]], 1), "E-D2", "[0][0]");
        rejects(validateDestinations([["3", 0]], 1), "E-D2", "[0][0]");
        rejects(validateHome([NaN, 0]), "E-N2", "home[0]");
        rejects(validateHome([0, Infinity]), "E-N2", "home[1]");
        rejects(validateHome([0, -JSON_1E999]), "E-N2", "home[1]");
    });
    it("rejects non-array and malformed input", () => {
        rejects(validateDestinations("nope", 1), "E-D2");
        rejects(validateDestinations([[1, 2, 3]], 1), "E-D2", "[0]");
        rejects(validateHome(null), "E-N2");
        rejects(validateHome([1]), "E-N2");
        rejects(validateDestination({ x: 1, y: 2 }), "E-D2");
    });
});
