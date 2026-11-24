// cspell:ignore concourse vomitory vomitories
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { InstancedMesh, Mesh, type Object3D } from "three";
import { createSharedMaterials, setTexturePainting } from "../../environment";
import type { FieldFootprint, VenueParams } from "../../types";
import {
    BANKS,
    BOWL,
    NIGHTPOUND_HOUSE,
    bowlEye,
    bowlFill,
    buildBowl,
    nightpoundSectionNumber,
    type NightpoundBowl,
} from "../nightpound/bowl";
import {
    BANK_LIST,
    bankAt,
    bankPoint,
    bankTiers,
    rowExtent,
    rowSeats,
    seatBank,
    tierBack,
    tierTop,
} from "../nightpound/bowlPlan";
import { SEAT_HEIGHT, SEAT_PITCH } from "../nightpound/frame";
import {
    ARENA_CENTER_Z,
    DRAPE_RUN,
    DRAPE_Z,
    FLOOR,
    FRONT_CHAMFER,
} from "../nightpound/plan";

beforeAll(() => setTexturePainting(false));

const footprint: FieldFootprint = {
    minX: -16.15,
    maxX: 16.15,
    minZ: -23.77,
    maxZ: 0,
};
const params: VenueParams = {
    homeColor: "#6442ff",
    awayColor: "#c23b3b",
    endZoneText: "",
    endZoneColor: "#1f2a5c",
};

const built: { bowl: NightpoundBowl; dispose(): void }[] = [];
function build(quality: "low" | "high" = "high"): NightpoundBowl {
    const shared = createSharedMaterials();
    const bowl = buildBowl({ footprint, params, quality, shared });
    built.push({
        bowl,
        dispose() {
            bowl.dispose();
            shared.dispose();
        },
    });
    return bowl;
}
afterEach(() => {
    built.splice(0).forEach((b) => b.dispose());
});

function count(root: Object3D): { draws: number; triangles: number } {
    let draws = 0;
    let triangles = 0;
    root.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        draws += 1;
        const geo = o.geometry;
        const n = geo.index
            ? geo.index.count
            : geo.getAttribute("position").count;
        triangles += (n / 3) * (o instanceof InstancedMesh ? o.count : 1);
    });
    return { draws, triangles };
}

/** Whether a plan point is on the arena floor (inside the floor walls). */
function onFloor(x: number, z: number): boolean {
    if (Math.abs(x) >= FLOOR.maxX || z <= FLOOR.minZ || z >= FLOOR.maxZ)
        return false;
    // The front corners are cut off.
    return Math.abs(x) + z < FLOOR.maxX + FLOOR.maxZ - FRONT_CHAMFER;
}

describe("nightpound bowl plan", () => {
    // Heights after the independent size audit (docs/3d/nightpound.md):
    // the side stands are lower than the first cross-section had them.
    it("matches the cross-section's key offsets and heights", () => {
        expect(tierBack(BOWL.lower)).toBeCloseTo(BOWL.crossAisle.offset, 2);
        expect(tierTop(BOWL.lower)).toBeCloseTo(BOWL.crossAisle.y, 2);
        expect(BOWL.crossAisle.offset + BOWL.crossAisle.width).toBeCloseTo(
            BOWL.mid.offset,
            2,
        );
        expect(tierBack(BOWL.mid)).toBeCloseTo(BOWL.club.offset, 2);
        expect(tierTop(BOWL.mid)).toBeCloseTo(7.85, 2);
        expect(tierTop(BOWL.midEnd)).toBeCloseTo(6.95, 2);
        expect(tierBack(BOWL.club)).toBeCloseTo(BOWL.concourse.offset, 2);
        expect(BOWL.concourse.offset + BOWL.concourse.width).toBeCloseTo(
            BOWL.upper.offset,
            2,
        );
        expect(tierTop(BOWL.upper)).toBeCloseTo(18.18, 2);
        expect(tierBack(BOWL.upper)).toBeLessThan(BOWL.rearWall);
        // The back stand's fixed wall is the floor's back edge.
        const [, z] = bankPoint(BANKS.back, BOWL.crossAisle.offset, 0);
        expect(z).toBeCloseTo(FLOOR.minZ, 2);
        // The front wall and the end walls are the floor's.
        expect(bankPoint(BANKS.front, 0, 0)[1]).toBeCloseTo(FLOOR.maxZ, 6);
        expect(bankPoint(BANKS.east, 0, 0)[0]).toBeCloseTo(FLOOR.maxX, 6);
        expect(bankPoint(BANKS.west, 0, 0)[0]).toBeCloseTo(FLOOR.minX, 6);
    });

    it("is an octagon: neighboring banks' rows meet on the mitres", () => {
        for (const d of [0, 5, 12, 20]) {
            BANK_LIST.forEach((b, k) => {
                const next = BANK_LIST[(k + 1) % BANK_LIST.length];
                const [ax, az] = bankPoint(b, d, rowExtent(b, "200", d)[1]);
                const [bx, bz] = bankPoint(
                    next,
                    d,
                    rowExtent(next, "200", d)[0],
                );
                expect(ax).toBeCloseTo(bx, 6);
                expect(az).toBeCloseTo(bz, 6);
            });
        }
        // The front corners are cut at 45 degrees with 3 m legs.
        const [x, z] = bankPoint(
            BANKS.frontEast,
            0,
            rowExtent(BANKS.frontEast, "100", 0)[0],
        );
        expect(x).toBeCloseTo(FLOOR.maxX - FRONT_CHAMFER, 6);
        expect(z).toBeCloseTo(FLOOR.maxZ, 6);
    });

    it("sorts plan points into banks", () => {
        expect(bankAt(0, 30).bank.id).toBe("front");
        expect(bankAt(0, -30).bank.id).toBe("back");
        expect(bankAt(30, ARENA_CENTER_Z).bank.id).toBe("east");
        expect(bankAt(-30, ARENA_CENTER_Z).bank.id).toBe("west");
        expect(bankAt(28, 26).bank.id).toBe("frontEast");
        expect(bankAt(-28, -22).bank.id).toBe("backWest");
        expect(bankAt(0, 30).d).toBeCloseTo(30 - FLOOR.maxZ, 6);
    });

    it("only the front, the ends and the front corners have their 100s out", () => {
        const withLower = BANK_LIST.filter((b) =>
            bankTiers(b).some((t) => t.name === "100"),
        ).map((b) => b.id);
        expect(withLower.sort()).toEqual(
            ["east", "front", "frontEast", "frontWest", "west"].sort(),
        );
        // Only the sides have club rows and an upper deck.
        for (const b of BANK_LIST)
            expect(bankTiers(b).some((t) => t.name === "300")).toBe(
                b.kind === "side",
            );
    });

    it("seats rows in whole seats, clear of the aisles", () => {
        const row = rowSeats(BANKS.front, "200", BOWL.mid, 5);
        expect(row.runs.length).toBe(6);
        for (const [s0, s1] of row.runs) {
            expect((s1 - s0) / SEAT_PITCH).toBeCloseTo(
                Math.round((s1 - s0) / SEAT_PITCH),
                6,
            );
            for (const aisle of [-14.8, -7.4, 0, 7.4, 14.8])
                expect(
                    s1 <= aisle - BOWL.aisle.lower / 2 + 1e-6 ||
                        s0 >= aisle + BOWL.aisle.lower / 2 - 1e-6,
                ).toBe(true);
        }
        // The upper deck's first rows open for the vomitories.
        const cut = rowSeats(BANKS.front, "300", BOWL.upper, 0);
        const whole = rowSeats(
            BANKS.front,
            "300",
            BOWL.upper,
            BOWL.vomitory.rows,
        );
        const seats = (r: typeof cut) =>
            r.runs.reduce(
                (n, [a, b]) => n + Math.round((b - a) / SEAT_PITCH),
                0,
            );
        expect(seats(cut)).toBeLessThan(seats(whole));
        for (const [s0, s1] of cut.runs)
            for (const v of BOWL.vomitory.at)
                expect(s1 <= v - 1.2 || s0 >= v + 1.2).toBe(true);
    });

    it("numbers sections as the arena does", () => {
        const C = ARENA_CENTER_Z;
        // Front center aisle: 112 on the entry side, 113 on the exit side.
        expect(nightpoundSectionNumber(3, 16, 1)).toBe(112);
        expect(nightpoundSectionNumber(-3, 16, 1)).toBe(113);
        expect(nightpoundSectionNumber(12, 16, 1)).toBe(111);
        expect(nightpoundSectionNumber(-12, 16, 1)).toBe(114);
        expect(nightpoundSectionNumber(19, 15, 1)).toBe(110);
        expect(nightpoundSectionNumber(-19, 15, 1)).toBe(115);
        // The entry end: 108 toward the back, 109 toward the front.
        expect(nightpoundSectionNumber(22, -9, 1)).toBe(108);
        expect(nightpoundSectionNumber(22, C + 4, 1)).toBe(109);
        expect(nightpoundSectionNumber(-22, C + 4, 1)).toBe(116);
        expect(nightpoundSectionNumber(-22, -9, 1)).toBe(101);
        // The 200s: 218 and 219 either side of the front's center aisle.
        expect(nightpoundSectionNumber(3, 30, 2)).toBe(218);
        expect(nightpoundSectionNumber(-3, 30, 2)).toBe(219);
        expect(nightpoundSectionNumber(32, C - 5, 2)).toBe(212);
        expect(nightpoundSectionNumber(32, C + 5, 2)).toBe(213);
        expect(nightpoundSectionNumber(-32, C + 5, 2)).toBe(224);
        expect(nightpoundSectionNumber(-32, C - 5, 2)).toBe(201);
        expect(nightpoundSectionNumber(-3, -25, 2)).toBe(206);
        expect(nightpoundSectionNumber(3, -25, 2)).toBe(207);
        // The upper decks: 311 and 411 front center, 304 and 404 back center.
        expect(nightpoundSectionNumber(0, 45, 3)).toBe(311);
        expect(nightpoundSectionNumber(0, 60, 4)).toBe(411);
        expect(nightpoundSectionNumber(26, 45, 3)).toBe(308);
        expect(nightpoundSectionNumber(-26, 45, 3)).toBe(314);
        expect(nightpoundSectionNumber(0, -40, 3)).toBe(304);
        expect(nightpoundSectionNumber(-26, -40, 4)).toBe(401);
        const all = new Set<number>();
        for (let a = 0; a < 360; a += 2) {
            const [x, z] = [
                Math.cos((a * Math.PI) / 180),
                Math.sin((a * Math.PI) / 180),
            ];
            all.add(nightpoundSectionNumber(x * 40, C + z * 40, 2));
        }
        expect(all.size).toBe(24);
    });

    it("fills the front fuller than the back, and leaves the end concourses empty", () => {
        const C = ARENA_CENTER_Z;
        expect(bowlFill(0, 2, 16)).toBeCloseTo(0.92, 6);
        expect(bowlFill(0, 9.5, 36)).toBeCloseTo(0.92, 6);
        expect(bowlFill(0, 6, -25)).toBeCloseTo(0.55, 6);
        expect(bowlFill(0, 14, -40)).toBeLessThanOrEqual(0.55);
        // The ends and the front corners: fuller low than high.
        expect(bowlFill(20, 1, C)).toBeGreaterThan(bowlFill(35, 7, C));
        expect(bowlFill(20, 1, 17)).toBeGreaterThan(bowlFill(30, 8, 27));
        expect(bowlFill(40, 10, C)).toBe(0);
        expect(bowlFill(-40, 10, C)).toBe(0);
        for (let x = -40; x <= 40; x += 5)
            for (let z = -55; z <= 60; z += 5) {
                const f = bowlFill(x, 5, z);
                expect(f).toBeGreaterThanOrEqual(0);
                expect(f).toBeLessThanOrEqual(1);
            }
    });

    it("gives the cameras a seat's eye", () => {
        const [x, y, z] = bowlEye("front", "200", 13);
        expect(x).toBeCloseTo(0, 6);
        // Row N of the 200s on the center line: the spec's judges' seat.
        expect(z).toBeGreaterThan(33);
        expect(z).toBeLessThan(34.5);
        expect(y).toBeGreaterThan(8.2);
        expect(y).toBeLessThan(8.7);
        expect(() => bowlEye("east", "300", 0)).toThrow();
    });
});

describe.each(["high", "low"] as const)(
    "nightpound bowl, %s quality",
    (quality) => {
        it("keeps every seat off the floor and out of the openings", () => {
            const { seatRows } = build(quality);
            expect(seatRows.length).toBeGreaterThan(400);
            for (const row of seatRows) {
                expect(row.side).toBe("neutral");
                expect(row.closed).toBe(false);
                for (const [x, y, z] of row.points) {
                    expect(onFloor(x, z)).toBe(false);
                    expect(bankAt(x, z).d).toBeGreaterThan(0.3);
                    expect(y).toBeGreaterThan(
                        BOWL.lower.base + SEAT_HEIGHT - 1e-6,
                    );
                    // The performance openings and the tunnel behind them.
                    const inOpening =
                        z < DRAPE_Z &&
                        z > FLOOR.minZ - 0.5 &&
                        Math.abs(x) < FLOOR.maxX + 0.5;
                    expect(inOpening).toBe(false);
                    // Inside the hall.
                    expect(Math.abs(x)).toBeLessThan(BOWL.end.wallX);
                    expect(Math.abs(z - ARENA_CENTER_Z)).toBeLessThan(
                        BOWL.halfZ + BOWL.rearWall,
                    );
                }
            }
            expect(DRAPE_RUN.maxX).toBeLessThan(FLOOR.maxX);
        });

        it("has no seats on the back side below the fixed wall's cross aisle", () => {
            const { seatRows } = build(quality);
            const low = seatRows.filter((r) =>
                r.points.some(
                    ([, y]) => y < BOWL.crossAisle.y + SEAT_HEIGHT - 1e-6,
                ),
            );
            expect(low.length).toBeGreaterThan(50);
            for (const row of low)
                for (const [x, , z] of row.points) {
                    expect([
                        "front",
                        "frontEast",
                        "frontWest",
                        "east",
                        "west",
                    ]).toContain(seatBank(x, z).bank.id);
                    // The ends' 100s stop at the drape's line.
                    expect(z).toBeGreaterThan(DRAPE_Z);
                }
            const back = seatRows.filter((r) =>
                r.points.every(([x, , z]) =>
                    seatBank(x, z).bank.id.startsWith("back"),
                ),
            );
            expect(back.length).toBeGreaterThan(100);
            for (const row of back)
                for (const [x, y, z] of row.points) {
                    expect(y).toBeGreaterThan(
                        BOWL.mid.base + SEAT_HEIGHT - 1e-6,
                    );
                    // Behind the fixed wall, or beyond the end walls.
                    expect(
                        z < FLOOR.minZ - 1 || Math.abs(x) > FLOOR.maxX + 1,
                    ).toBe(true);
                }
        });

        it("puts the 100s' first row at the floor wall", () => {
            const { seatRows } = build(quality);
            const firstY = BOWL.lower.base + SEAT_HEIGHT;
            const first = seatRows.filter(
                (r) => Math.abs(r.points[0][1] - firstY) < 1e-6,
            );
            const banks = new Set(
                first.map(
                    (r) => seatBank(r.points[0][0], r.points[0][2]).bank.id,
                ),
            );
            expect([...banks].sort()).toEqual(
                ["east", "front", "frontEast", "frontWest", "west"].sort(),
            );
            for (const row of first)
                for (const [x, , z] of row.points) {
                    const { d } = seatBank(x, z);
                    expect(d).toBeGreaterThan(0.3);
                    expect(d).toBeLessThan(BOWL.lower.depth);
                }
            // Front row A spans the front wall between the corner aisles.
            const front = first.filter(
                (r) =>
                    seatBank(r.points[0][0], r.points[0][2]).bank.id ===
                    "front",
            );
            const xs = front.flatMap((r) => r.points.map((p) => p[0]));
            expect(Math.min(...xs)).toBeLessThan(
                -(FLOOR.maxX - FRONT_CHAMFER) + 1.5,
            );
            expect(Math.max(...xs)).toBeGreaterThan(
                FLOOR.maxX - FRONT_CHAMFER - 1.5,
            );
        });

        it("seats about what the arena holds in WGI trim", () => {
            const { seatRows } = build(quality);
            let seats = 0;
            for (const row of seatRows.filter((r) => !r.standing)) {
                const [a, b] = row.points;
                seats += Math.round(
                    Math.hypot(b[0] - a[0], b[2] - a[2]) / SEAT_PITCH + 0.5,
                );
            }
            // About 13,400 for basketball, less the back 100s folded away.
            expect(seats).toBeGreaterThan(10500);
            expect(seats).toBeLessThan(13400);
        });

        it("stays inside its triangle and draw-call budget", () => {
            const bowl = build(quality);
            const { draws, triangles } = count(bowl.object);
            expect(draws).toBeLessThanOrEqual(12);
            expect(triangles).toBeLessThan(quality === "high" ? 250e3 : 90e3);
            expect(triangles).toBeGreaterThan(10e3);
            expect(bowl.pickTargets?.map((o) => o.name)).toEqual([
                "nightpound.treads",
            ]);
        });

        it("brings the stands up with the house lights", () => {
            const bowl = build(quality);
            const seats = bowl.object.getObjectByName(
                "nightpound.seats",
            ) as Mesh;
            const mat = seats.material as { emissiveIntensity: number };
            bowl.setLighting("show");
            expect(mat.emissiveIntensity).toBeCloseTo(
                NIGHTPOUND_HOUSE.seats.show,
                6,
            );
            bowl.setLighting("house");
            expect(mat.emissiveIntensity).toBeCloseTo(
                NIGHTPOUND_HOUSE.seats.house,
                6,
            );
            expect(NIGHTPOUND_HOUSE.seats.house).toBeGreaterThan(
                NIGHTPOUND_HOUSE.seats.show,
            );
        });
    },
);
