import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type MockInstance,
} from "vitest";
import {
    createResolver,
    type TimelineSnapshot,
    type TransitionRow,
    type XY,
} from "@openmarch/core";
import { exportWalkedPaths } from "../exportWalkedPaths";
import { pathSvg } from "../drillChartSvg";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";

/** The walked paths a drill chart draws between pages (spec R-20 item 10, QA-WP-13 and QA-WP-14). */

const move = (
    id: number,
    start: number,
    end: number,
    to: XY,
    extra: Partial<TransitionRow> = {},
): TransitionRow => ({
    id,
    start,
    end,
    dest: null,
    points: [to],
    slots: 1,
    style: "direct",
    order: "slot",
    params: null,
    ...extra,
});

/** One marcher from (0, 0); pages end at beats 1, 9 and 17 */
const show = (transitions: TransitionRow[]): TimelineSnapshot => ({
    marchers: [{ id: 1, home: [0, 0] }],
    shapes: {},
    transitions: Object.fromEntries(transitions.map((t) => [t.id, t])),
    assignments: transitions.map((t, i) => ({
        id: i + 1,
        marcher: 1,
        transition: t.id,
        slot: 0,
        start: t.start,
        end: t.end,
        layer: 0,
    })),
});
const pages = [
    { id: 10, beats: [{ index: 0 }] },
    { id: 11, beats: [{ index: 1 }, { index: 8 }] },
    { id: 12, beats: [{ index: 9 }, { index: 16 }] },
];
const walksOf = (host: TimelineSnapshot) =>
    exportWalkedPaths({ host, resolver: createResolver(host) }, pages);

// A path that can't be worked out is logged and left as the straight line: no test here may log
// an error unless it says so.
let errors: MockInstance<typeof console.error>;
beforeEach(() => {
    errors = vi.spyOn(console, "error");
});
afterEach(() => {
    const logged = errors.mock.calls.map((call) => call.map(String).join(" "));
    errors.mockRestore();
    expect(logged).toEqual([]);
});

describe("exportWalkedPaths", () => {
    it("logs an error and keeps the straight line when a path can't be worked out", () => {
        const host = show([
            move(1, 1, 8, [40, 0], { style: "arc", params: { bulge: 0.2 } }),
        ]);
        const resolver = createResolver(host);
        errors.mockImplementation(() => {});
        const walks = exportWalkedPaths(
            {
                host,
                resolver: {
                    spanInfos: resolver.spanInfos,
                    ftlEntry: resolver.ftlEntry,
                    positionAt: () => {
                        throw new Error("no position");
                    },
                },
            },
            pages,
        );
        expect(walks(1, 10, 11)).toBeUndefined();
        expect(errors).toHaveBeenCalledTimes(1);
        expect(String(errors.mock.calls[0]![0])).toContain("marcher 1");
        errors.mockClear();
    });

    it("has nothing for a straight walk, a hold, or a straight walk with a stop on the way", () => {
        const walks = walksOf(
            show([
                move(1, 1, 5, [40, 0]),
                // a stop from beat 5 to 6, then on along the same line
                move(2, 6, 9, [100, 0]),
            ]),
        );
        expect(walks(1, 10, 11)).toBeUndefined();
        // page 12: the marcher stands still
        expect(walks(1, 11, 12)).toBeUndefined();
        // unknown pages and marchers, and pages out of order
        expect(walks(1, 10, 99)).toBeUndefined();
        expect(walks(2, 10, 11)).toBeUndefined();
        expect(walks(1, 11, 10)).toBeUndefined();
    });

    it("draws an arc, with the midpoint where the marcher is at the middle beat", () => {
        const walks = walksOf(
            show([
                move(1, 1, 9, [100, 0], {
                    style: "arc",
                    params: { bulge: 0.5 },
                }),
            ]),
        );
        const walk = walks(1, 10, 11)!;
        // a half turn, in two quarter turns
        expect(walk.d).toBe("M 0 0 A 50 50 0 0 0 50 50 A 50 50 0 0 0 100 0");
        expect(walk.mid.x).toBeCloseTo(50, 9);
        expect(walk.mid.y).toBeCloseTo(50, 9);
        // asked again: the same object
        expect(walks(1, 10, 11)).toBe(walk);
    });

    it("draws a turn between two straight moves in one page as the two lines walked", () => {
        const walks = walksOf(
            show([move(1, 1, 5, [40, 0]), move(2, 5, 9, [40, 40])]),
        );
        expect(walks(1, 10, 11)).toEqual({
            d: "M 0 0 L 40 0 L 40 40",
            mid: { x: 40, y: 0 },
        });
    });

    it("draws out and back to the same spot", () => {
        const walks = walksOf(
            show([move(1, 1, 5, [40, 0]), move(2, 5, 9, [0, 0])]),
        );
        expect(walks(1, 10, 11)?.d).toBe("M 0 0 L 40 0 L 0 0");
    });
});

describe("pathSvg with walked paths", () => {
    const theme =
        FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES.theme;
    const straight = {
        previous: { x: 0, y: 0 },
        current: { x: 100, y: 0 },
        next: { x: 100, y: 80 },
    };

    it("replaces only the line and the midpoint of the walk it is given", () => {
        const plain = pathSvg(straight, theme).split("\n");
        const walked = pathSvg(
            {
                ...straight,
                previousWalk: {
                    d: "M 0 0 A 50 50 0 0 0 100 0",
                    mid: { x: 50, y: 50 },
                },
            },
            theme,
        ).split("\n");
        expect(walked).toHaveLength(plain.length);
        expect(plain[0]).toMatch(/^<line /);
        expect(walked[0]).toMatch(
            /^<path d="M 0 0 A 50 50 0 0 0 100 0" fill="none" stroke="rgb\(\d+,\d+,\d+\)"( stroke-opacity="[\d.]+")? stroke-width="2" \/>$/,
        );
        expect(walked[1]).toContain('cx="50" cy="50"');
        // the end point, the next path and the two markers are the same
        expect(walked.slice(2)).toEqual(plain.slice(2));
    });
});
