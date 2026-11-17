// @vitest-environment node
// apps/desktop/src/view3d/core/instruments/__test__/battery.test.ts
import { describe, expect, it } from "vitest";
import {
    bounds,
    triangleCount,
    PART_HEAD,
    PART_SHELL,
    PART_WOOD,
    PART_METAL,
    PART_BLACK,
    PART_ALUMINUM,
    PART_BRONZE,
    type Piece,
} from "../mesh";
import { hold } from "../holds";
import {
    BASS_SIZES_IN,
    bassForward,
    bassSizesFor,
    batteryModel,
} from "../battery";
import type { BatteryModelId } from "../model";

const IDS: BatteryModelId[] = ["snare", "tenors", "bass", "cymbals"];

describe("battery models", () => {
    it.each(IDS)("%s stays within the triangle budgets", (id) => {
        const high = triangleCount(batteryModel(id, "high").pieces);
        const low = triangleCount(batteryModel(id, "low").pieces);
        expect(high).toBeGreaterThanOrEqual(4000);
        expect(high).toBeLessThanOrEqual(12000);
        expect(low).toBeGreaterThanOrEqual(1000);
        expect(low).toBeLessThanOrEqual(3500);
    });

    it("builds the snare 14 by 12 on the chest with a stick in each hand", () => {
        const m = batteryModel("snare");
        expect(m.bone).toBe("spine002");
        const shell = m.pieces.filter((p) => p.part === PART_SHELL && !p.bone);
        const b = bounds(shell);
        expect(b.max[0] - b.min[0]).toBeCloseTo(0.356, 1);
        expect(b.max[2] - b.min[2]).toBeCloseTo(0.305, 1);
        expect(
            m.pieces.some((p) => p.part === PART_WOOD && p.bone === "handR"),
        ).toBe(true);
        expect(
            m.pieces.some((p) => p.part === PART_WOOD && p.bone === "handL"),
        ).toBe(true);
        expect(m.pieces.some((p) => p.part === PART_HEAD)).toBe(true);
    });

    it("sizes the bass drum from its options", () => {
        for (const inches of [18, 26, 32]) {
            const m = batteryModel("bass", "high", { bassInches: inches });
            const shell = m.pieces.filter((p) => p.part === PART_SHELL);
            const b = bounds(shell);
            // the heads' axis is +Z: the diameter spans x and y
            expect(b.max[0] - b.min[0]).toBeCloseTo(inches * 0.0254, 1);
            expect(b.max[2] - b.min[2]).toBeCloseTo(0.356, 1);
            expect(m.options?.bassInches).toBe(inches);
        }
    });

    it("spreads bass sizes evenly, smallest first", () => {
        expect(BASS_SIZES_IN).toEqual([14, 16, 18, 20, 22, 24, 26, 28, 30, 32]);
        expect(bassSizesFor(0)).toEqual([]);
        expect(bassSizesFor(1)).toEqual([26]);
        expect(bassSizesFor(2)).toEqual([18, 32]);
        expect(bassSizesFor(5)).toEqual([18, 22, 26, 28, 32]);
    });

    it("reaches below 18 in only for lines longer than five", () => {
        expect(bassSizesFor(6)).toEqual([16, 20, 22, 26, 28, 32]);
        expect(bassSizesFor(7)).toEqual([14, 18, 20, 24, 26, 30, 32]);
        expect(bassSizesFor(10)).toEqual([...BASS_SIZES_IN]);
        for (let n = 1; n <= 10; n++)
            expect(new Set(bassSizesFor(n)).size).toBe(n);
        expect(bassSizesFor(12)).toHaveLength(12);
    });

    it("hangs a cymbal from each hand, facing each other", () => {
        const m = batteryModel("cymbals");
        const left = m.pieces.filter((p) => p.bone === "handL");
        const right = m.pieces.filter((p) => p.bone === "handR");
        expect(left.length).toBeGreaterThan(0);
        expect(right.length).toBeGreaterThan(0);
        // bronze plates, whatever the brass finish, each with a black pad
        for (const side of [left, right]) {
            expect(side.filter((p) => p.part === PART_BRONZE)).toHaveLength(1);
            expect(
                side.every((p) => [PART_BRONZE, PART_BLACK].includes(p.part)),
            ).toBe(true);
        }
        expect(m.pieces.some((p) => p.part === PART_METAL)).toBe(false);
        const bl = bounds(left.filter((p) => p.part === PART_BRONZE));
        const br = bounds(right.filter((p) => p.part === PART_BRONZE));
        expect(bl.max[1] - bl.min[1]).toBeCloseTo(0.457, 1);
        expect(bl.min[0]).toBeGreaterThan(br.max[0] - 0.05);
    });
});

describe("battery placement", () => {
    const center = (pieces: Piece[]) => {
        const b = bounds(pieces);
        return b.min.map((v, i) => (v + b.max[i]) / 2);
    };
    const shellCenter = (inches: number) =>
        center(
            batteryModel("bass", "high", { bassInches: inches }).pieces.filter(
                (p) => p.part === PART_SHELL,
            ),
        );

    it("moves bigger bass drums forward (instrument −X) so every size clears the chest", () => {
        const small = shellCenter(18);
        const big = shellCenter(32);
        // forward is instrument −X: the 32 sits about 0.18 further out
        expect(small[0] - big[0]).toBeCloseTo(0.178, 2);
        expect(bassForward(18)).toBeCloseTo(0.0886, 3);
        // the drum's back (toward the player, +X) stays at the carrier, 0.14
        // ahead of the hold's origin; its wood hoops stand 0.02 proud of it
        for (const inches of [14, 18, 26, 32]) {
            const b = bounds(
                batteryModel("bass", "high", {
                    bassInches: inches,
                }).pieces.filter((p) => p.part === PART_SHELL),
            );
            expect(b.max[0]).toBeCloseTo(0.16, 2);
        }
    });

    it("carries every bass drum high: centers about the shoulders, tops no higher than 1.85 m", () => {
        for (const inches of [18, 22, 26, 32]) {
            const b = bounds(
                batteryModel("bass", "high", {
                    bassInches: inches,
                }).pieces.filter((p) => p.part === PART_SHELL),
            );
            // the origin sits at 1.0 m
            const center = 1.0 + (b.max[1] + b.min[1]) / 2;
            // photos put every size's center at about shoulder height
            expect(center).toBeGreaterThan(1.25);
            expect(center).toBeLessThan(1.55);
            expect(1.0 + b.max[1]).toBeLessThanOrEqual(1.8501);
        }
    });

    it("angles each bass mallet up and forward from the hand", () => {
        for (const inches of [18, 32]) {
            const m = batteryModel("bass", "high", { bassInches: inches });
            for (const bone of ["handR", "handL"] as const) {
                const shaft = m.pieces.find(
                    (p) => p.part === PART_WOOD && p.bone === bone,
                )!;
                const head = m.pieces.find(
                    (p) => p.part === PART_BLACK && p.bone === bone,
                )!;
                const sb = center([shaft]);
                const hb = center([head]);
                expect(hb[1]).toBeGreaterThan(sb[1]); // up
                expect(hb[0]).toBeLessThan(sb[0]); // forward is instrument −X
            }
        }
    });

    it("lands each bass mallet on its head's center for every size", () => {
        for (const inches of [18, 26, 32]) {
            const m = batteryModel("bass", "high", { bassInches: inches });
            const axis = shellCenter(inches);
            for (const bone of ["handR", "handL"] as const) {
                const head = m.pieces.filter(
                    (p) => p.part === PART_BLACK && p.bone === bone,
                );
                expect(head.length).toBe(1);
                const c = center(head);
                // the heads are at z ±0.178; the mallet's center just outside its plane
                expect(Math.abs(Math.abs(c[2]) - 0.178)).toBeLessThanOrEqual(
                    0.03,
                );
                expect(Math.sign(c[2])).toBe(bone === "handR" ? -1 : 1);
                expect(
                    Math.hypot(c[0] - axis[0], c[1] - axis[1]),
                ).toBeLessThanOrEqual(0.02);
            }
        }
    });

    it("records the options every battery model was built with", () => {
        for (const id of IDS)
            expect(
                batteryModel(id, "low", { bassInches: 30 }).options?.bassInches,
            ).toBe(30);
    });

    /** Each hand's stick tip: the center of the last wooden piece on that hand. */
    const tips = (id: "snare" | "tenors") => {
        const m = batteryModel(id);
        return (["handR", "handL"] as const).map((bone) => {
            const wood = m.pieces.filter(
                (p) => p.part === PART_WOOD && p.bone === bone,
            );
            return center([wood[wood.length - 1]]);
        });
    };

    it("angles the snare sticks in over the head without crossing or passing the front rim", () => {
        // the head is the disc of radius 0.178 at z 0; +X the performer's right, +Y forward
        const [right, left] = tips("snare");
        for (const t of [right, left]) {
            expect(Math.hypot(t[0], t[1])).toBeLessThan(0.178 - 0.04);
            expect(t[1]).toBeGreaterThan(0); // the front half
            expect(t[2]).toBeGreaterThan(0);
            expect(t[2]).toBeLessThan(0.05);
        }
        expect(right[0]).toBeGreaterThan(0);
        expect(left[0]).toBeLessThan(0);
    });

    it("puts each tenor stick's tip over one of the two front drums", () => {
        const [right, left] = tips("tenors");
        // drum 1 (10 inch) front left, drum 2 (12 inch) front right
        const front = [
            { x: -0.14, y: 0.17, r: (10 * 0.0254) / 2 },
            { x: 0.16, y: 0.22, r: (12 * 0.0254) / 2 },
        ];
        const over = (t: number[], d: (typeof front)[number]) =>
            Math.hypot(t[0] - d.x, t[1] - d.y) < d.r - 0.03 &&
            t[2] > 0 &&
            t[2] < 0.06;
        expect(over(right, front[1])).toBe(true);
        expect(over(left, front[0])).toBe(true);
    });
});

/** An instrument-frame point in the body's rest frame, as `instrumentGeometry.ts` places it. */
function toBody(family: "snare" | "tenors" | "bass") {
    const { origin, bellAxis, capsAxis } = hold(family, "up").instrument;
    const u = (v: number[]) => {
        const l = Math.hypot(v[0], v[1], v[2]);
        return v.map((c) => c / l);
    };
    const z = u(bellAxis);
    const d = capsAxis[0] * z[0] + capsAxis[1] * z[1] + capsAxis[2] * z[2];
    const y = u(capsAxis.map((c, i) => c - z[i] * d));
    const x = [
        y[1] * z[2] - y[2] * z[1],
        y[2] * z[0] - y[0] * z[2],
        y[0] * z[1] - y[1] * z[0],
    ];
    return (p: number[]) =>
        [0, 1, 2].map(
            (k) => origin[k] + x[k] * p[0] + y[k] * p[1] + z[k] * p[2],
        );
}
const vertices = (pieces: Piece[]) =>
    pieces.flatMap((p) =>
        Array.from({ length: p.positions.length / 3 }, (_, i) =>
            p.positions.slice(i * 3, i * 3 + 3),
        ),
    );

describe("drum carriers", () => {
    it.each(["snare", "tenors", "bass"] as const)(
        "%s hangs from aluminum bars over both shoulders and down the back",
        (id) => {
            const body = toBody(id);
            const metal = vertices(
                batteryModel(id).pieces.filter(
                    (p) => p.part === PART_ALUMINUM && !p.bone,
                ),
            ).map(body);
            for (const side of [-1, 1]) {
                const mine = metal.filter(
                    (v) => Math.sign(v[0]) === side && Math.abs(v[0]) < 0.16,
                );
                // over the shoulder top (1.46 on every body) ...
                expect(
                    mine.some((v) => v[1] > 1.47 && Math.abs(v[2]) < 0.08),
                ).toBe(true);
                // ... and down the back behind the shoulder blades
                expect(mine.some((v) => v[1] < 1.4 && v[2] < -0.17)).toBe(true);
            }
            // a plate down the middle of the chest and belly, clear of the body
            expect(
                metal.some(
                    (v) =>
                        Math.abs(v[0]) < 0.05 &&
                        v[1] > 1.0 &&
                        v[1] < 1.3 &&
                        v[2] > 0.18 &&
                        v[2] < 0.21,
                ),
            ).toBe(true);
            const chest = metal.filter(
                (v) =>
                    Math.abs(v[0]) < 0.12 &&
                    v[1] > 1.0 &&
                    v[1] < 1.3 &&
                    v[2] > 0,
            );
            for (const v of chest) expect(v[2]).toBeGreaterThan(0.17);
        },
    );

    it.each(["snare", "tenors", "bass"] as const)(
        "keeps the %s shells in front of the carrier plate",
        (id) => {
            const body = toBody(id);
            for (const inches of id === "bass" ? [18, 26, 32] : [0]) {
                const shells = vertices(
                    batteryModel(id, "high", {
                        bassInches: inches || undefined,
                    }).pieces.filter((p) => p.part === PART_SHELL),
                ).map(body);
                const nearChest = shells.filter(
                    (v) => Math.abs(v[0]) < 0.17 && v[1] > 0.85 && v[1] < 1.35,
                );
                for (const v of nearChest) expect(v[2]).toBeGreaterThan(0.18);
            }
        },
    );
});

describe("tenor layout", () => {
    const drums = () =>
        batteryModel("tenors")
            .pieces.filter((p) => p.part === PART_SHELL)
            .map((p) => {
                const b = bounds([p]);
                return {
                    x: (b.max[0] + b.min[0]) / 2,
                    y: (b.max[1] + b.min[1]) / 2,
                    w: b.max[0] - b.min[0],
                };
            })
            .sort((a, b) => a.x - b.x);

    it("sets sixes: shots in the middle by the player, 10 and 12 in front, 13 and 14 at the sides", () => {
        const d = drums();
        expect(d.length).toBe(6);
        const by = (inches: number) =>
            d.find((x) => Math.abs(x.w - inches * 0.0254) < 0.02)!;
        const [s6, s8, d1, d2, d3, d4] = [6, 8, 10, 12, 13, 14].map(by);
        // left to right from the player: 13 at the far left, 14 at the far right
        expect(d[0]).toBe(d3);
        expect(d[5]).toBe(d4);
        // drum 1 left of drum 2, the 6 inch shot left of the 8
        expect(d1.x).toBeLessThan(d2.x);
        expect(s6.x).toBeLessThan(s8.x);
        // the shots nearest the player, the front pair ahead of them
        for (const shot of [s6, s8]) {
            expect(shot.y).toBeLessThan(d1.y - 0.15);
            expect(shot.y).toBeLessThan(d2.y - 0.15);
        }
        // the outer drums behind the front pair, at the player's sides
        expect(d3.y).toBeLessThan(d1.y);
        expect(d4.y).toBeLessThan(d2.y);
    });

    it("keeps the set under 1.1 m wide with no two drums overlapping", () => {
        const all = batteryModel("tenors").pieces.filter(
            (p) => p.part === PART_SHELL,
        );
        const b = bounds(all);
        expect(b.max[0] - b.min[0]).toBeLessThan(1.1);
        const d = drums();
        for (let i = 0; i < d.length; i++)
            for (let j = i + 1; j < d.length; j++)
                expect(
                    Math.hypot(d[i].x - d[j].x, d[i].y - d[j].y),
                ).toBeGreaterThan((d[i].w + d[j].w) / 2);
    });

    it("keeps every head level", () => {
        for (const h of batteryModel("tenors").pieces.filter(
            (p) => p.part === PART_HEAD,
        )) {
            const b = bounds([h]);
            expect(b.max[2] - b.min[2]).toBeLessThan(0.01);
        }
    });
});
