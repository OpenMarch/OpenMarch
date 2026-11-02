import { describe, expect, it } from "vitest";
import { lineTool } from "../../line/lineTool";
import { drawLine, linePath, type LineParams } from "../../line/lineGeometry";
import type { ToolEnv } from "../../tool/toolKind";
import type { XY } from "../../types";
import {
    GROUP_COLORS,
    GROUP_LABEL_HEIGHT,
    GROUP_LABEL_ROOM,
    groupColor,
    groupDrawing,
    groupLabelWidth,
    placeGroupLabels,
    type GroupGapLabel,
} from "../groupDrawing";

/**
 * What the field draws of a Line's interval groups while the editor's group menu is open (owner
 * feedback on #526): each spot ringed in its group's color, and with a group lit, its gaps
 * labeled. A drawing only.
 */

const STEP = 10;
const half = STEP / 2;
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    constrain: false,
    gridSnap: (p) => ({
        x: Math.round(p.x / half) * half,
        y: Math.round(p.y / half) * half,
    }),
    hitRadius: 3,
};
const interval = lineTool.params.find((p) => p.key === "interval")!;

const lineWith = (n: number, list: string, to: XY = { x: 150, y: 100 }) =>
    interval.type(
        drawLine({ x: 100, y: 100 }, to, env)!,
        n,
        list,
        env,
    ) as LineParams;

/** Spots in order along the line, as the kind lays them out */
const spotsOf = (p: LineParams, n: number) =>
    lineTool.shape.generate(p, n, { stepPx: STEP } as never);

describe("a gap round a corner that holds no marcher", () => {
    // A V whose tip holds no marcher, measured along the path: 3 at 4 steps, then 3
    const p: LineParams = {
        points: [
            { x: 0, y: 0, tension: 0 },
            { x: 30, y: -40, tension: 0 },
            { x: 60, y: 0, tension: 0 },
        ],
        spacing: {
            mode: "path",
            groups: [{ count: 3, interval: 40 }, { interval: 30 }],
            anchor: "start",
        },
        corners: false,
    };
    const spots = spotsOf(p, 5);

    it("labels it at its middle along the line, not across the V", () => {
        const { groupLabels } = groupDrawing(
            lineTool,
            p,
            5,
            spots,
            { lit: 0 },
            STEP,
        );
        // The second gap, 40 to 80 along, goes round the tip at 50
        const round = groupLabels!.filter((l) => !l.seam)[1]!;
        const path = linePath(p);
        const middle = path.at(60);
        expect(round.at.x).toBeCloseTo(middle.x, 6);
        expect(round.at.y).toBeCloseTo(middle.y, 6);
        expect(round.length).toBeCloseTo(40, 6);
        // On the line: the chord's middle would be inside the V
        expect(path.at(path.project(round.at)).y).toBeCloseTo(round.at.y, 6);
    });
});

describe("the groups' colors", () => {
    it("gives each group its own color, round again past the palette", () => {
        const first = GROUP_COLORS.map((_, i) => groupColor(i));
        expect(new Set(first).size).toBe(GROUP_COLORS.length);
        expect(groupColor(GROUP_COLORS.length)).toBe(groupColor(0));
        expect(groupColor(GROUP_COLORS.length + 2)).toBe(groupColor(2));
    });

    it("keeps clear of the shape's purple and the next path's green", () => {
        const hex = (c: string) =>
            [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
        const far = (a: number[], b: number[]) =>
            Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) > 80;
        for (const c of GROUP_COLORS) {
            expect(far(hex(c), [126, 34, 206])).toBe(true);
            expect(far(hex(c), [0, 175, 13])).toBe(true);
        }
    });
});

describe("a line's groups on the field", () => {
    const p = lineWith(8, "2*3+3*2+4");
    const spots = spotsOf(p, 8);

    it("draws nothing with the menu closed", () => {
        expect(groupDrawing(lineTool, p, 8, spots, null, STEP)).toEqual({});
    });

    it("draws nothing for one interval", () => {
        const plain = lineWith(8, "2");
        expect(
            groupDrawing(
                lineTool,
                plain,
                8,
                spotsOf(plain, 8),
                { lit: null },
                STEP,
            ),
        ).toEqual({});
    });

    it("rings every spot faintly in its group's color while the menu is open", () => {
        const { groupMarks, groupLabels } = groupDrawing(
            lineTool,
            p,
            8,
            spots,
            { lit: null },
            STEP,
        );
        expect(groupMarks!.map((m) => m.group)).toEqual([
            0, 0, 1, 1, 1, 2, 2, 2,
        ]);
        expect(groupMarks!.every((m) => m.shade === "faint")).toBe(true);
        expect(groupMarks!.map((m) => m.color)).toEqual(
            [0, 0, 1, 1, 1, 2, 2, 2].map(groupColor),
        );
        expect(groupMarks!.map((m) => m.at)).toEqual(spots.map((s) => s));
        expect(groupLabels).toEqual([]);
    });

    it("lights the group pointed at, dims the rest and labels its gaps at their middles", () => {
        const { groupMarks, groupLabels } = groupDrawing(
            lineTool,
            p,
            8,
            spots,
            { lit: 1 },
            STEP,
        );
        expect(groupMarks!.map((m) => m.shade)).toEqual([
            "dim",
            "dim",
            "lit",
            "lit",
            "lit",
            "dim",
            "dim",
            "dim",
        ]);
        const gapsOnly = groupLabels!.filter((l) => !l.seam);
        expect(gapsOnly.map((l) => l.text)).toEqual(["2", "2"]);
        expect(groupLabels![0]!.at.x).toBeCloseTo(
            (spots[2]!.x + spots[3]!.x) / 2,
        );
        expect(groupLabels![1]!.at.x).toBeCloseTo(
            (spots[3]!.x + spots[4]!.x) / 2,
        );
        expect(groupLabels!.every((l) => l.color === groupColor(1))).toBe(true);
    });

    it("labels a Measured line's gaps with its axis", () => {
        const measured = { ...p, measured: "x" } as LineParams;
        const { groupLabels } = groupDrawing(
            lineTool,
            measured,
            8,
            spotsOf(measured, 8),
            { lit: 0 },
            STEP,
        );
        expect(groupLabels!.map((l) => [l.text, l.seam])).toEqual([
            ["↔ 3", false],
            ["↔ 3", true],
        ]);
        expect(groupLabels![0]!.whole).toBe("↔ 2 at 3");
    });

    it("labels the seams either side of the lit group with the larger interval there", () => {
        const { groupLabels } = groupDrawing(
            lineTool,
            p,
            8,
            spots,
            { lit: 1 },
            STEP,
        );
        const seams = groupLabels!.filter((l) => l.seam);
        // 2 at 3 | 3 at 2 | the rest at 4: the seams take 3 and 4
        expect(seams.map((l) => l.text)).toEqual(["3", "4"]);
        expect(seams[0]!.from).toEqual(spots[1]);
        expect(seams[0]!.to).toEqual(spots[2]);
        expect(seams[1]!.from).toEqual(spots[4]);
        expect(seams[1]!.to).toEqual(spots[5]);
        expect(groupLabels!.every((l) => l.whole === "3 at 2")).toBe(true);
    });

    it("has one seam for a group at an end", () => {
        const { groupLabels } = groupDrawing(
            lineTool,
            p,
            8,
            spots,
            { lit: 2 },
            STEP,
        );
        expect(groupLabels!.filter((l) => l.seam).map((l) => l.text)).toEqual([
            "4",
        ]);
    });
});

describe("the lit group's labels set beside the line", () => {
    const gapLabel = (
        from: XY,
        to: XY,
        more: Partial<GroupGapLabel> = {},
    ): GroupGapLabel => ({
        from,
        to,
        at: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
        text: "3",
        color: "#E69F00",
        seam: false,
        whole: "3 at 3",
        ...more,
    });
    const same = (p: XY) => p;
    const RING = 6;

    it("moves a gap's pill up off a level line by the ring and half its height", () => {
        const [placed] = placeGroupLabels(
            [gapLabel({ x: 0, y: 100 }, { x: 60, y: 100 })],
            same,
            RING,
        );
        expect(placed!.at.x).toBeCloseTo(30);
        expect(placed!.at.y).toBeCloseTo(
            100 - (RING + GROUP_LABEL_HEIGHT / 2 + 2),
        );
        expect(placed!.text).toBe("3");
    });

    it("keeps a pill each for gaps whose chord is short but that are long along the line", () => {
        const short = { x: groupLabelWidth("3") / 2, y: 0 };
        const labels = [
            gapLabel({ x: 0, y: 100 }, { x: short.x, y: 100 }, { length: 40 }),
            gapLabel(
                { x: short.x, y: 100 },
                { x: 2 * short.x, y: 100 },
                { length: 40 },
            ),
        ];
        expect(placeGroupLabels(labels, same, RING)).toHaveLength(2);
        const chords = labels.map(({ length: _, ...l }) => l);
        expect(placeGroupLabels(chords, same, RING)).toHaveLength(1);
    });

    it("moves it to the left of an upright line by the ring and half its width", () => {
        const [placed] = placeGroupLabels(
            [gapLabel({ x: 50, y: 0 }, { x: 50, y: 60 })],
            same,
            RING,
        );
        expect(placed!.at.x).toBeCloseTo(
            50 - (RING + groupLabelWidth("3") / 2 + 2),
        );
        expect(placed!.at.y).toBeCloseTo(30);
    });

    it("keeps to the same side whichever way the line runs, and puts seams on the other", () => {
        const placed = placeGroupLabels(
            [
                gapLabel({ x: 60, y: 100 }, { x: 0, y: 100 }),
                gapLabel({ x: 60, y: 100 }, { x: 120, y: 100 }, { seam: true }),
            ],
            same,
            RING,
        );
        expect(placed[0]!.at.y).toBeLessThan(100);
        expect(placed[1]!.at.y).toBeGreaterThan(100);
        expect(placed[1]!.seam).toBe(true);
    });

    it("clears what stands above the rings when it moves up, and only then", () => {
        const placed = placeGroupLabels(
            [
                gapLabel({ x: 0, y: 100 }, { x: 60, y: 100 }),
                gapLabel({ x: 60, y: 100 }, { x: 120, y: 100 }, { seam: true }),
            ],
            same,
            RING,
            11,
        );
        expect(placed[0]!.at.y).toBeCloseTo(
            100 - (RING + GROUP_LABEL_HEIGHT / 2 + 2 + 11),
        );
        expect(placed[1]!.at.y).toBeCloseTo(
            100 + (RING + GROUP_LABEL_HEIGHT / 2 + 2),
        );
    });

    it("works on screen: the gap and the shift are in CSS px", () => {
        const zoomed = (p: XY) => ({ x: p.x * 2, y: p.y * 2 });
        const [placed] = placeGroupLabels(
            [gapLabel({ x: 0, y: 50 }, { x: 30, y: 50 })],
            zoomed,
            RING,
        );
        expect(placed!.at.x).toBeCloseTo(30);
        expect(placed!.at.y).toBeCloseTo(
            100 - (RING + GROUP_LABEL_HEIGHT / 2 + 2),
        );
    });

    it("draws one label for the group at its middle when its gaps are shorter than a pill and some room", () => {
        const w = groupLabelWidth("3");
        const step = w + GROUP_LABEL_ROOM - 1;
        const spotsAt = [0, 1, 2, 3].map((k) => ({ x: k * step, y: 0 }));
        const labels = [1, 2, 3].map((k) =>
            gapLabel(spotsAt[k - 1]!, spotsAt[k]!),
        );
        const seam = gapLabel(
            { x: 3 * step, y: 0 },
            { x: 4 * step, y: 0 },
            { seam: true, text: "4" },
        );
        const placed = placeGroupLabels([...labels, seam], same, RING);
        expect(placed.map((l) => l.text)).toEqual(["3 at 3", "4"]);
        // Three gaps: the middle one's middle
        expect(placed[0]!.at.x).toBeCloseTo(1.5 * step);
        expect(placed[0]!.at.y).toBeLessThan(0);
    });

    it("puts the one label on the middle spot when the group has an even number of gaps", () => {
        const step = 10;
        const spotsAt = [0, 1, 2].map((k) => ({ x: k * step, y: 0 }));
        const placed = placeGroupLabels(
            [1, 2].map((k) => gapLabel(spotsAt[k - 1]!, spotsAt[k]!)),
            same,
            RING,
        );
        expect(placed).toHaveLength(1);
        expect(placed[0]!.at.x).toBeCloseTo(step);
    });

    it("keeps a label per gap when the gaps are wide enough", () => {
        const step = groupLabelWidth("3") + GROUP_LABEL_ROOM + 1;
        const spotsAt = [0, 1, 2].map((k) => ({ x: k * step, y: 0 }));
        const placed = placeGroupLabels(
            [1, 2].map((k) => gapLabel(spotsAt[k - 1]!, spotsAt[k]!)),
            same,
            RING,
        );
        expect(placed.map((l) => l.text)).toEqual(["3", "3"]);
    });
});
