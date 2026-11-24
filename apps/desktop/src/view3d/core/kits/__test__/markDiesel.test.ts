// cspell:ignore superframe superframes Raycaster tarped sightline
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
    Box3,
    DoubleSide,
    Mesh,
    Raycaster,
    Vector3,
    type Object3D,
    type Vector3Tuple,
} from "three";
import type { FieldFootprint, KitResult, VenueParams } from "../../types";
import { buildCrowd, ft, setTexturePainting } from "../../environment";
import { outlineOffset } from "../bowl";
import { buildMarkDiesel, dieselCameras, DIESEL_PRESETS } from "../markDiesel";
import {
    DIESEL_RING,
    DIESEL_SECTIONS,
    dieselSectionNumber,
} from "../markDiesel/bowl";
import { dieselDrapeFoot } from "../markDiesel/drape";
import { dieselFrame, ROOF_PITCH } from "../markDiesel/frame";
import { DIESEL_BANNERS } from "../markDiesel/roof";

beforeAll(() => setTexturePainting(false));

/** Football field with end zones (design.md section 2). */
const football: FieldFootprint = {
    minX: -54.864,
    maxX: 54.864,
    minZ: -48.768,
    maxZ: 0,
};
/** A smaller indoor-style footprint, off center. */
const small: FieldFootprint = { minX: -20, maxX: 24, minZ: -26, maxZ: 0 };

const params: VenueParams = {
    homeColor: "#6442ff",
    awayColor: "#c23b3b",
    endZoneText: "",
    endZoneColor: "#1f2a5c",
};

const kits: KitResult[] = [];
const build = (footprint = football, quality: "low" | "high" = "high") => {
    const kit = buildMarkDiesel({ footprint, params, quality });
    kits.push(kit);
    kit.root.updateMatrixWorld(true);
    return kit;
};
afterEach(() => {
    kits.splice(0).forEach((k) => k.dispose());
});

const meshes = (root: Object3D) => {
    const out: Mesh[] = [];
    root.traverse((o) => {
        if (o instanceof Mesh) out.push(o);
    });
    return out;
};
const byName = (root: Object3D, name: string) => {
    const out: Object3D[] = [];
    root.traverse((o) => {
        if (o.name === name) out.push(o);
    });
    return out;
};
const box = (root: Object3D, name: string) => {
    const b = new Box3();
    byName(root, name).forEach((o) => b.expandByObject(o));
    return b;
};
/** Whether an object and everything above it is visible. */
const shown = (o: Object3D | null): boolean =>
    !o || (o.visible && shown(o.parent));

describe("dieselFrame", () => {
    const f = dieselFrame(football);

    it("puts the origin at the field center, with the drape on the back sideline", () => {
        expect(f.CENTER).toEqual({ x: 0, z: -24.384 });
        expect(f.FIELD_HALF_LENGTH).toBeCloseTo(54.864);
        expect(f.FIELD_HALF_WIDTH).toBeCloseTo(24.384);
        expect(f.DRAPE.side).toBe("-z");
        expect(f.DRAPE.z).toBeLessThan(-f.FIELD_HALF_WIDTH);
        // The window wall is the north end, -X.
        expect(f.WINDOW_WALL.x).toBe(-f.BUILDING.halfX);
    });

    it("holds the published roof dimensions", () => {
        // Superframes 300 ft apart, 241 ft to their top; a 13.2 degree roof.
        expect(f.ROOF.superframes.z).toBeCloseTo(ft(150));
        expect(f.ROOF.superframes.top).toBeCloseTo(ft(241));
        expect(ROOF_PITCH).toBeCloseTo(Math.tan((13.2 * Math.PI) / 180));
        // The opening is 300 ft across the field by 588 ft along it.
        expect(2 * f.ROOF.opening.halfZ).toBeCloseTo(ft(300));
        expect(2 * f.ROOF.opening.halfX).toBeCloseTo(ft(588));
        // The ridge is 276 ft above the field, and the roof falls from it.
        expect(f.ROOF.ridgeY).toBeCloseTo(ft(241) + ft(150) * ROOF_PITCH);
        expect(f.ROOF.ridgeY).toBeGreaterThan(ft(270));
        expect(f.ROOF.ridgeY).toBeLessThan(ft(290));
        expect(f.ROOF.roofY(0)).toBe(f.ROOF.ridgeY);
        expect(f.ROOF.roofY(f.BUILDING.halfZ)).toBeCloseTo(f.ROOF.eaveY);
        expect(f.ROOF.eaveY).toBeLessThan(f.ROOF.superframes.top);
    });

    it("hangs the lights under the superframes, above every seat", () => {
        expect(f.CATWALK_Y).toBeLessThan(f.ROOF.superframes.bottomMid);
        expect(f.CATWALK_Y).toBeGreaterThan(f.BOWL.upper.top + 2);
        for (const [a, b] of f.CATWALK_RUNS) {
            expect(Math.abs(a[2])).toBeCloseTo(f.ROOF.superframes.z);
            expect(a[1]).toBe(f.CATWALK_Y);
            expect(b[0]).toBeGreaterThan(a[0]);
        }
        expect(f.CATWALK_RING).toHaveLength(4);
        expect(f.CATWALK_CORNERS).toHaveLength(4);
    });

    it("stacks four seated decks at the measured section", () => {
        const B = f.BOWL;
        const { lower, loge, club, mid, cornerMid, terrace } = B;
        const { upperWest, upperEast, upperSouth, cornerUpper } = B;
        // The field wall stands 14.2 m off the sidelines (section.md).
        expect(B.marginZ).toBeCloseTo(14.2, 5);
        // The 100s and 200s: one bank, split by the cross-aisle.
        expect(loge.offset).toBeGreaterThan(lower.back);
        expect(loge.base).toBeGreaterThan(lower.top);
        // Loge boxes, then the 300s behind ribbon 1, then the 400s.
        expect(B.logeBoxes.bottom).toBeGreaterThanOrEqual(loge.top);
        expect(B.ribbon.bottom).toBeGreaterThan(B.logeBoxes.top);
        expect(mid.base).toBeGreaterThan(club.top);
        // One suite level, over the back rows of the 400s.
        expect(B.suites).toHaveLength(1);
        const [suite] = B.suites;
        expect(B.suiteFascia.bottom).toBeGreaterThan(mid.top + 1.5);
        // It overhangs rows 4 to 10 of the 400s.
        expect(B.suiteFascia.offset).toBeGreaterThanOrEqual(
            mid.offset + 3 * mid.depth,
        );
        expect(B.suiteFascia.offset).toBeLessThan(mid.back);
        expect(suite.bottom).toBeGreaterThanOrEqual(B.suiteFascia.top);
        // The 500s behind the ring of names, then the 600s.
        expect(B.upperFascia.bottom).toBeGreaterThanOrEqual(suite.top);
        expect(terrace.base).toBeGreaterThanOrEqual(B.upperFascia.top);
        expect(upperWest.base).toBeGreaterThan(terrace.top + 2);
        // The press box stands behind the top row of the west 600s, not
        // over it, its floor about 44 to 45 m up (solved from photos B
        // and 7), its sill just over the last tread.
        expect(B.pressBox.offset).toBeGreaterThanOrEqual(upperWest.back);
        expect(B.pressBox.bottom).toBeGreaterThanOrEqual(44);
        expect(B.pressBox.bottom).toBeLessThanOrEqual(45);
        expect(B.pressBox.sill).toBeGreaterThan(upperWest.top);
        expect(B.pressBox.sill).toBeLessThan(upperWest.top + 0.5);
        expect(B.pressBox.top).toBeLessThan(
            f.ROOF.roofY(B.halfZ + B.pressBox.back) - f.ROOF.thickness - 3,
        );
        expect(B.halfZ + B.pressBox.back).toBeLessThan(f.BUILDING.halfZ);
        // Ribbon 2 and the ring of names are one band of height.
        expect(B.ribbon2.bottom).toBe(B.upperFascia.bottom);
        expect(B.ribbon2.top).toBe(B.upperFascia.top);
        // Row counts from the seat maps.
        expect([lower.rows, loge.rows, club.rows, mid.rows]).toEqual([
            23, 11, 5, 10,
        ]);
        expect(cornerMid.rows).toBe(15);
        expect(terrace.rows).toBe(5);
        expect(
            [upperWest, upperEast, upperSouth, cornerUpper].map((t) => t.rows),
        ).toEqual([21, 26, 28, 22]);
        expect(B.northMid.rows).toBe(23);
        // Measured heights, to the decimeter.
        expect(mid.base).toBeCloseTo(20.5, 1);
        expect(upperWest.top).toBeCloseTo(45.9, 1);
        expect(upperSouth.top).toBeCloseTo(50, 0);
        // Everything fits inside the outer wall, under the side roofs.
        expect(B.halfZ + upperEast.back).toBeLessThan(f.BUILDING.halfZ);
        expect(B.halfX + upperSouth.back).toBeLessThan(f.BUILDING.halfX);
        expect(B.halfX + B.northMid.back).toBeLessThan(f.BUILDING.halfX);
        const backZ = B.halfZ + upperEast.back;
        expect(f.ROOF.roofY(backZ) - f.ROOF.thickness).toBeGreaterThan(
            upperEast.top + 3,
        );
        // The corner boards hang across the corners, 33 degrees round the
        // corner arc from the ends (photo 6), over the 500s' front, their
        // foot 34 m up (2.5 m over the 500s' last tread) and their top just
        // under the light row, outside the superframes' line and past the
        // end of the light row.
        for (const b of f.VIDEO_BOARDS) {
            expect(b.width).toBeCloseTo(ft(97));
            expect(b.height).toBeCloseTo(ft(53));
            expect(b.y - b.height / 2).toBeCloseTo(34, 0);
            expect(b.y - b.height / 2).toBeGreaterThan(B.terrace.top + 2);
            expect(b.y + b.height / 2).toBeLessThan(f.CATWALK_Y);
            const d = outlineOffset(B.outline, b.x, b.z);
            expect(d).toBeLessThan(terrace.offset);
            expect(d).toBeGreaterThan(B.ribbon2.offset - 1);
            const arc = Math.atan2(
                Math.abs(b.z) - (B.halfZ - B.outline.cornerRadius),
                Math.abs(b.x) - (B.halfX - B.outline.cornerRadius),
            );
            expect((arc * 180) / Math.PI).toBeCloseTo(33, 3);
            expect(Math.abs(b.z)).toBeGreaterThan(f.ROOF.superframes.z);
            // The screen faces the field's center; its nearer end is past
            // the light row's last block.
            const yaw = Math.atan2(-b.x, -b.z);
            expect(
                Math.abs(b.x) - (b.width / 2) * Math.abs(Math.cos(yaw)),
            ).toBeGreaterThan(Math.abs(f.CATWALK_CORNERS[0][0]));
        }
        // South-east and north-west, mirrored.
        const [se, nw] = f.VIDEO_BOARDS;
        expect([Math.sign(se.x), Math.sign(se.z)]).toEqual([1, -1]);
        expect(nw.x).toBeCloseTo(-se.x);
        expect(nw.z).toBeCloseTo(-se.z);
    });

    it("follows the show's own field", () => {
        const s = dieselFrame(small);
        expect(s.CENTER).toEqual({ x: 2, z: -13 });
        expect(s.BOWL.halfX).toBeCloseTo(22 + s.BOWL.marginX);
        expect(s.BOWL.wallX.south - s.BOWL.wallX.north).toBeCloseTo(
            44 + s.BOWL.marginX + s.BOWL.marginSouth,
        );
        // Heights don't depend on the field.
        expect(s.CATWALK_Y).toBe(f.CATWALK_Y);
        expect(s.ROOF.ridgeY).toBe(f.ROOF.ridgeY);
    });
});

describe("Mark Diesel kit", () => {
    it("builds inside its envelope with no NaN geometry", () => {
        for (const fp of [football, small]) {
            for (const quality of ["high", "low"] as const) {
                const kit = build(fp, quality);
                const f = dieselFrame(fp);
                const bounds = new Box3();
                for (const name of [
                    "markDiesel.bowl",
                    "markDiesel.roof",
                    "markDiesel.drape",
                    "markDiesel.boards",
                ])
                    bounds.union(box(kit.root, name));
                for (const m of meshes(kit.root)) {
                    const pos = m.geometry.getAttribute("position");
                    for (let i = 0; i < pos.array.length; i++)
                        expect(Number.isNaN(pos.array[i])).toBe(false);
                }
                const { halfX, halfZ } = f.BUILDING;
                expect(bounds.min.x).toBeGreaterThan(f.CENTER.x - halfX - 2);
                expect(bounds.max.x).toBeLessThan(f.CENTER.x + halfX + 2);
                expect(bounds.min.z).toBeGreaterThan(f.CENTER.z - halfZ - 2);
                expect(bounds.max.z).toBeLessThan(f.CENTER.z + halfZ + 2);
                expect(bounds.min.y).toBeGreaterThan(-0.5);
                expect(bounds.max.y).toBeLessThan(f.ROOF.ridgeY + 3);
                // The bowl surrounds the field on every side.
                expect(bounds.min.x).toBeLessThan(fp.minX - 40);
                expect(bounds.max.z).toBeGreaterThan(fp.maxZ + 40);
                expect(kit.focus).toEqual([f.CENTER.x, 0, f.CENTER.z]);
            }
        }
    });

    it("offers roof closed, day and night, and lights itself as its own venue", () => {
        const kit = build();
        expect(kit.lightingPresets).toEqual(["roofClosed", "day", "night"]);
        expect(kit.lightingPresets).toEqual(DIESEL_PRESETS);
        expect(kit.defaultLighting).toBe("roofClosed");
        expect(kit.lightingVenue).toBe("markDiesel");
        for (const preset of DIESEL_PRESETS)
            expect(() => kit.setLighting(preset)).not.toThrow();
    });

    it("builds the tiers at the frame's heights", () => {
        const kit = build();
        const f = dieselFrame(football);
        const { BOWL } = f;
        const straight = BOWL.halfX - BOWL.outline.cornerRadius;

        // The ring of names: the upper deck's fascia, on the straights only.
        const names = box(kit.root, "markDiesel.nameRing");
        expect(names.min.y).toBeCloseTo(BOWL.upperFascia.bottom, 3);
        expect(names.max.y).toBeCloseTo(BOWL.upperFascia.top, 3);
        expect(names.max.x).toBeCloseTo(straight, 3);
        expect(names.min.x).toBeCloseTo(-straight, 3);

        // The LED ribbons: the club fascia all the way round, and ribbon 2
        // around the corners and ends.
        // (`ribbons.ts` hangs them just in front of the bowl's dark fascias.)
        const ribbon1 = box(kit.root, "markDiesel.ledRibbon1");
        expect(ribbon1.min.y).toBeCloseTo(BOWL.ribbon.bottom, 1);
        expect(ribbon1.max.y).toBeCloseTo(BOWL.ribbon.top, 1);
        const ribbon2 = box(kit.root, "markDiesel.ledRibbon2");
        expect(ribbon2.min.y).toBeCloseTo(BOWL.ribbon2.bottom, 1);
        expect(ribbon2.max.y).toBeCloseTo(BOWL.ribbon2.top, 1);
        expect(ribbon2.max.x).toBeGreaterThan(
            BOWL.halfX + BOWL.ribbon2.offset - 0.2,
        );
        expect(ribbon2.max.x).toBeLessThan(BOWL.halfX + BOWL.ribbon2.offset);
        expect(byName(kit.root, "markDiesel.ribbon")).toHaveLength(0);

        // Suite glass: the open loge boxes behind the 200s are the lowest
        // glass, and the one suite level the highest, under the ring.
        const suites = box(kit.root, "markDiesel.suites");
        // (The field suites' glass, at field level, is the lowest.)
        expect(suites.min.y).toBeCloseTo(BOWL.fieldSuites.floor, 3);
        expect(suites.max.y).toBeGreaterThanOrEqual(BOWL.suites[0].top);
        expect(suites.max.y).toBeLessThan(BOWL.pressBox.top);

        // Seats reach from the field wall to the south 600s' last row.
        const treads = box(kit.root, "markDiesel.treads");
        expect(treads.min.y).toBeCloseTo(BOWL.lower.base, 3);
        expect(treads.max.y).toBeCloseTo(BOWL.upperSouth.top, 3);
        // Their far reach is the back of the east 600s.
        expect(treads.min.z - f.CENTER.z).toBeCloseTo(
            -(BOWL.halfZ + BOWL.upperEast.back),
            2,
        );
        expect(kit.pickTargets).toEqual(byName(kit.root, "markDiesel.treads"));
    });

    it("splits the ring into straights, corners and ends", () => {
        const [f0, f1] = DIESEL_RING.front;
        const [b0, b1] = DIESEL_RING.back;
        expect(f1 - f0).toBe(b1 - b0);
        expect((f1 - f0) % DIESEL_SECTIONS.x).toBe(0);
        // The tarped seats and the open ones cover the ring exactly once.
        const [t0, t1] = DIESEL_RING.tarp;
        const [o0, o1] = DIESEL_RING.open;
        expect(o0).toBe(t1);
        expect(o1 - o0 + (t1 - t0)).toBe(DIESEL_RING.all[0][1]);
        expect(t0).toBeLessThan(b0);
        expect(t1).toBeGreaterThan(b1);
    });

    it("seats the crowd facing the drape and leaves the masked stand empty", () => {
        const kit = build();
        const f = dieselFrame(football);
        const o = {
            ...f.BOWL.outline,
            centerX: f.CENTER.x,
            centerZ: f.CENTER.z,
        };
        expect(kit.seatRows.length).toBeGreaterThan(400);
        const backSideline = f.CENTER.z - f.BOWL.halfZ;
        const straight = f.BOWL.halfX - f.BOWL.outline.cornerRadius;
        let front = 0;
        for (const row of kit.seatRows) {
            expect(row.closed).toBe(false);
            expect(row.points.length).toBeGreaterThanOrEqual(2);
            const d = outlineOffset(o, row.points[0][0], row.points[0][2]);
            expect(d).toBeGreaterThan(0);
            for (const [x, y, z] of row.points) {
                // A row keeps to one ring, at one height. (Near the field
                // the rings square off from the outline's corners.)
                const off = Math.abs(outlineOffset(o, x, z) - d);
                expect(off).toBeLessThan(
                    d >= f.BOWL.front.fade
                        ? 0.05
                        : f.BOWL.front.push + f.BOWL.front.south,
                );
                expect(y).toBe(row.points[0][1]);
            }
            const mid = row.points[Math.floor(row.points.length / 2)];
            // Nobody sits on the back sideline, under or behind the drape.
            if (Math.abs(mid[0] - f.CENTER.x) <= straight)
                expect(mid[2]).toBeGreaterThan(backSideline);
            if (mid[2] > f.CENTER.z + f.BOWL.halfZ) front++;
        }
        expect(front).toBeGreaterThan(200);
        // The crowd builds from them.
        const crowd = buildCrowd(kit.seatRows, { quality: "high" });
        expect(crowd.count).toBeGreaterThan(5000);
        crowd.dispose();
    });

    it("hangs the drape across the back sideline with the credits facing the audience", () => {
        const kit = build();
        const f = dieselFrame(football);
        const { DRAPE } = f;
        // One mesh holds both hangs. The lower one is nearest the field:
        // it lands on the lower bowl and stops under the ring of names.
        const cloth = box(kit.root, "markDiesel.drapeCloth");
        // Its foot lies over the tarped rows, down to the third row.
        const foot = dieselDrapeFoot(f);
        expect(cloth.min.y).toBeCloseTo(foot.y, 3);
        expect(foot.y).toBeLessThan(DRAPE.bottom);
        expect(foot.y).toBeGreaterThan(f.BOWL.lower.base);
        expect(cloth.max.z - f.CENTER.z).toBeCloseTo(
            -(f.BOWL.halfZ + foot.offset),
            0,
        );
        expect(DRAPE.bottom).toBeLessThan(f.BOWL.lower.top);
        expect(DRAPE.top).toBeLessThan(f.BOWL.upperFascia.bottom);
        // Hung under the back catwalk.
        expect(Math.abs(DRAPE.z + f.ROOF.superframes.z)).toBeLessThan(3);
        // The upper hang covers the upper deck from the names to the
        // catwalk, and wraps a little way round both back corners.
        expect(cloth.max.y).toBeCloseTo(DRAPE.upper.top, 3);
        expect(cloth.min.z - f.CENTER.z).toBeCloseTo(DRAPE.upper.z, 2);
        expect(DRAPE.upper.bottom).toBeGreaterThan(f.BOWL.upperFascia.top);
        expect(cloth.max.x - cloth.min.x).toBeGreaterThan(DRAPE.width + 10);
        expect(cloth.max.z).toBeLessThan(f.CENTER.z - f.BOWL.halfZ);

        // The logo panel sits on the lower hang, just proud of it, facing +Z.
        const banner = byName(kit.root, "markDiesel.drapeLogo")[0] as Mesh;
        const facing = banner.getWorldDirection(new Vector3());
        expect(facing.z).toBeCloseTo(1);
        const where = banner.getWorldPosition(new Vector3());
        expect(where.z - f.CENTER.z).toBeCloseTo(DRAPE.z + 0.12, 3);
        expect(where.y - DRAPE.banner.height / 2).toBeGreaterThan(DRAPE.bottom);
        expect(where.y + DRAPE.banner.height / 2).toBeLessThan(DRAPE.top);
        expect(() =>
            kit.setShowCredits?.({ title: "Finals", designer: "Sam Rivera" }),
        ).not.toThrow();
    });

    it("roofs the building with a gable, superframes and banners", () => {
        const kit = build();
        const f = dieselFrame(football);
        const roof = box(kit.root, "markDiesel.roofDeck");
        expect(roof.max.y).toBeCloseTo(f.ROOF.ridgeY, 2);
        expect(roof.min.y).toBeLessThan(f.ROOF.eaveY);
        expect(roof.min.y).toBeGreaterThan(f.ROOF.eaveY - 2);
        expect(roof.max.z - roof.min.z).toBeGreaterThan(2 * f.BUILDING.halfZ);
        expect(roof.max.x - roof.min.x).toBeGreaterThan(2 * f.BUILDING.halfX);

        // The steel hangs between the lights and the deck.
        const steel = box(kit.root, "markDiesel.steel");
        expect(steel.max.y).toBeLessThan(f.ROOF.ridgeY + 1.5);
        expect(steel.min.y).toBeCloseTo(0, 1); // the columns stand on the floor

        // The speaker frame hangs over the 50, above the catwalk's lamps'
        // sightline to the field's middle.
        const speaker = box(kit.root, "markDiesel.speakerFrame");
        const center = speaker.getCenter(new Vector3());
        expect(center.x).toBeCloseTo(f.CENTER.x, 1);
        expect(center.z).toBeCloseTo(f.CENTER.z, 1);
        expect(speaker.min.y).toBeGreaterThan(f.SPEAKER.arrayBottom - 0.5);

        // Banners along the two inner transverse trusses, two faces each.
        const banners = byName(kit.root, "markDiesel.banners")[0] as Mesh;
        expect(banners.geometry.getAttribute("position").count).toBe(
            2 * DIESEL_BANNERS.perTruss * 2 * 6,
        );
        const hung = new Box3().setFromObject(banners);
        expect(hung.min.y).toBeGreaterThan(f.CATWALK_Y);
        expect(hung.max.x - f.CENTER.x).toBeCloseTo(f.ROOF.transverse.xs[3], 0);
    });

    it("glows brightest over the field and keeps its bays at low quality", () => {
        /** The panels' sheets: each quad's level and its texture span. */
        const sheets = (quality: "low" | "high") => {
            const kit = build(football, quality);
            const f = dieselFrame(football);
            const mesh = byName(
                kit.root,
                "markDiesel.roofPanelUnder",
            )[0] as Mesh;
            const pos = mesh.geometry.getAttribute("position");
            const uv = mesh.geometry.getAttribute("uv");
            const color = mesh.geometry.getAttribute("color");
            const out: { x: number; level: number; uSpan: number }[] = [];
            for (let q = 0; q + 5 < pos.count; q += 6) {
                const xs = [0, 1, 2].map((k) => pos.getX(q + k) - f.CENTER.x);
                const us = [0, 1, 2].map((k) => uv.getX(q + k));
                const level = color.getX(q);
                // The panels' own steel is near black; skip it.
                if (level < 0.1) continue;
                out.push({
                    x: (Math.min(...xs) + Math.max(...xs)) / 2,
                    level,
                    uSpan: Math.max(...us) - Math.min(...us),
                });
            }
            return { out, f };
        };
        const { out, f } = sheets("high");
        const mean = (list: typeof out) =>
            list.reduce((sum, s) => sum + s.level, 0) / list.length;
        const inner = out.filter((s) => Math.abs(s.x) < 20);
        const outer = out.filter(
            (s) => Math.abs(s.x) > f.ROOF.transverse.xs[3] + 5,
        );
        // The bays between the banner trusses stand out from the rest
        // (photo 2).
        expect(mean(inner)).toBeGreaterThan(2 * mean(outer));
        // One bay to a texture tile at high quality; at low a quad covers
        // four bays and the tile does too, so the bays still read.
        expect(Math.max(...out.map((s) => s.uSpan))).toBeLessThanOrEqual(1.01);
        const low = sheets("low").out;
        expect(Math.max(...low.map((s) => s.uSpan))).toBeLessThanOrEqual(1.01);
    });

    it("opens and closes the roof in onFrame, down the slope to each side", () => {
        const kit = build();
        const f = dieselFrame(football);
        const panels = byName(kit.root, "markDiesel.roofPanel");
        expect(panels).toHaveLength(2);
        const inside: Vector3Tuple = [0, 10, -24];
        const run = (frames: number) => {
            for (let i = 0; i < frames; i++)
                kit.onFrame!({ cameraPosition: inside, dt: 1 / 60 });
        };
        // Closed by default, and it stays closed.
        run(5);
        panels.forEach((p) => expect(p.position.length()).toBe(0));

        kit.setLighting("day");
        run(10);
        expect(panels[0].position.z).toBeGreaterThan(0);
        expect(panels[1].position.z).toBeLessThan(0);
        run(500);
        const travel = f.ROOF.opening.halfZ;
        expect(panels[0].position.z).toBeCloseTo(travel, 5);
        expect(panels[1].position.z).toBeCloseTo(-travel, 5);
        // They ride down the roof's slope.
        panels.forEach((p) =>
            expect(p.position.y).toBeCloseTo(-travel * ROOF_PITCH, 5),
        );

        kit.setLighting("roofClosed");
        run(500);
        panels.forEach((p) => expect(p.position.z).toBeCloseTo(0, 5));
        // A preset the kit doesn't offer changes nothing.
        kit.setLighting("dusk");
        run(50);
        panels.forEach((p) => expect(p.position.z).toBeCloseTo(0, 5));
    });

    it("from above, cuts away the roof between the camera and the field", () => {
        for (const quality of ["high", "low"] as const) {
            const kit = build(football, quality);
            const f = dieselFrame(football);
            // Low quality has one roof, which hides whole from above.
            const whole = byName(kit.root, "markDiesel.roofAll")[0];
            const west = byName(kit.root, "markDiesel.roofWest")[0] ?? whole;
            const east = byName(kit.root, "markDiesel.roofEast")[0] ?? whole;
            const half = quality === "high";
            const center = byName(kit.root, "markDiesel.roofCenter")[0];
            const at = (x: number, y: number, z: number) =>
                kit.onFrame!({
                    cameraPosition: [x + f.CENTER.x, y, z + f.CENTER.z],
                    dt: 1 / 60,
                });
            const state = () => [west, east, center].map((o) => o.visible);

            // From any seat, and from the street outside, the roof is whole.
            at(0, 8, 50);
            expect(state()).toEqual([true, true, true]);
            // In the air over midfield, under the cluster, too ...
            at(0, 20, 0);
            expect(state()).toEqual([true, true, true]);
            // ... but above its lowest array the cluster would fill the view
            // of the drill (a zoom out from the field rises through it).
            at(0, f.CATWALK_Y, 0);
            expect(state()).toEqual([true, true, false]);
            at(0, 20, f.BUILDING.halfZ + 80);
            expect(state()).toEqual([true, true, true]);

            // From the air on the audience side, the near half goes.
            at(-189, 195, 183);
            expect(state()).toEqual([false, half, false]);
            at(40, 160, -200);
            expect(state()).toEqual([half, false, false]);
            // Straight overhead, or beyond an end, both halves go.
            at(0, 300, 0.15);
            expect(state()).toEqual([false, false, false]);
            at(260, 150, 0);
            expect(state()).toEqual([false, false, false]);

            // Back inside, it all returns.
            at(0, 8, 50);
            expect(state()).toEqual([true, true, true]);
        }
    });

    it("places the cameras in their seats, under the roof, looking at the field", () => {
        const kit = build();
        const f = dieselFrame(football);
        const ids = kit.cameras.map((c) => c.id);
        expect(ids).toEqual([
            "pressBox",
            "judges",
            "directors",
            "lowerBowl",
            "upper",
            "endZone",
            "sideline",
            "blimp",
            "topDown",
        ]);
        const label = (id: string) => (id === "upper" ? "upperDeck" : id);
        kit.cameras.forEach((c) =>
            expect(c.labelKey).toBe(`view3d.camera.${label(c.id)}`),
        );
        // The kit reports them in the scene's space: the frame's, moved to
        // the field center.
        dieselCameras(f).forEach((seat, i) => {
            expect(kit.cameras[i].position[0]).toBeCloseTo(
                seat.position[0] + f.CENTER.x,
            );
            expect(kit.cameras[i].position[2]).toBeCloseTo(
                seat.position[2] + f.CENTER.z,
            );
        });

        const treads = byName(kit.root, "markDiesel.treads")[0] as Mesh;
        (treads.material as Mesh["material"] & { side: number }).side =
            DoubleSide;
        const down = new Vector3(0, -1, 0);
        const seats = kit.cameras.filter((c) => c.kind === "seat");
        expect(seats).toHaveLength(6);
        for (const c of seats) {
            const [x, y, z] = c.position;
            // Inside the building, under the roof.
            expect(Math.abs(x - f.CENTER.x)).toBeLessThan(f.BUILDING.halfX);
            expect(Math.abs(z - f.CENTER.z)).toBeLessThan(f.BUILDING.halfZ);
            // Under the light row, but for the press box, which stands
            // 40 m outboard of it under the side roof.
            if (c.id === "pressBox") {
                expect(y).toBeLessThan(
                    f.ROOF.roofY(z - f.CENTER.z) - f.ROOF.thickness - 2,
                );
                continue;
            }
            expect(y).toBeLessThan(f.CATWALK_Y);
            // A seated eye: a tread lies 1 to 1.5 m under it.
            const hit = new Raycaster(
                new Vector3(x, y, z),
                down,
                0,
                5,
            ).intersectObject(treads)[0];
            expect(hit, c.id).toBeDefined();
            expect(hit.distance).toBeGreaterThan(0.9);
            expect(hit.distance).toBeLessThan(1.6);
        }
        const at = (id: string) => {
            const c = kit.cameras.find((cam) => cam.id === id)!;
            const [x, y, z] = c.position;
            return { c, x: x - f.CENTER.x, y, z: z - f.CENTER.z };
        };
        // The photos' seat: the 200s' first row on the 50, looking at the
        // banner.
        const lower = at("lowerBowl");
        expect(lower.x).toBeCloseTo(0);
        expect(lower.z).toBeGreaterThan(f.BOWL.halfZ + f.BOWL.loge.offset);
        expect(lower.c.target[2] - f.CENTER.z).toBeCloseTo(f.DRAPE.z);
        // The judges: the 400s' third row at the 50, about (0, 22.6, 76).
        const judges = at("judges");
        expect(judges.x).toBeCloseTo(0);
        expect(judges.y).toBeCloseTo(22.6, 0);
        expect(judges.z).toBeCloseTo(76, 0);
        // The directors: row 15 of section 139, one section south of the
        // 50, seated a few rows below where photo 10 was taken standing
        // (12.3, 6.8, 52.6).
        const directors = at("directors");
        expect(directors.x).toBeGreaterThan(8);
        expect(directors.x).toBeLessThan(18);
        expect(directors.y).toBeCloseTo(
            f.BOWL.lower.base + 14 * f.BOWL.lower.rise + 1.2,
            3,
        );
        expect(dieselSectionNumber(f, directors.x, directors.z, 1)).toBe(139);
        // The judges sit in 440, at the 50.
        expect(dieselSectionNumber(f, judges.x, judges.z, 4)).toBe(440);
        expect(directors.z).toBeGreaterThan(f.BOWL.halfZ + 10);
        expect(directors.z).toBeLessThan(f.BOWL.halfZ + f.BOWL.lower.back);
        // The upper deck: the 600s at the 50, in front of the section's
        // portal.
        const upper = at("upper");
        expect(upper.x).toBeCloseTo(0);
        expect(upper.y).toBeGreaterThan(f.BOWL.upperWest.base);
        expect(upper.z).toBeGreaterThan(f.BOWL.halfZ + f.BOWL.upperWest.offset);
        // The press box stands behind the top row of the west 600s: its eye
        // is behind the last row and over its seat backs, and nothing of
        // the stand comes between it and the field.
        const press = at("pressBox");
        expect(press.y).toBeGreaterThan(f.BOWL.upperWest.top + 1);
        expect(press.y).toBeLessThan(f.BOWL.pressBox.top);
        expect(press.z).toBeGreaterThan(
            f.BOWL.halfZ + f.BOWL.upperWest.back - 0.5,
        );
        const stand = [
            "markDiesel.treads",
            "markDiesel.seats",
            "markDiesel.concrete",
            "markDiesel.fascias",
        ].flatMap((n) => byName(kit.root, n));
        const pressEye = new Vector3(...press.c.position);
        for (const x of [-40, -20, 0, 20, 40])
            for (const z of [f.FIELD_HALF_WIDTH, 0, -f.FIELD_HALF_WIDTH]) {
                const to = new Vector3(
                    x + f.CENTER.x,
                    0.05,
                    z + f.CENTER.z,
                ).sub(pressEye);
                const ray = new Raycaster(
                    pressEye,
                    to.clone().normalize(),
                    0.05,
                    to.length() - 0.3,
                );
                expect(
                    ray
                        .intersectObjects(stand, false)
                        .map((h) => h.object.name),
                    `${x}, ${z}`,
                ).toEqual([]);
            }
        // The end zone: row 30 of the north end's lower stand (photo 11),
        // with a clear view of the field. Looking toward the field and down,
        // the eye sees its own stand's seats and then the floor: no tunnel
        // lid or other structure in the foreground (the old seat, behind a
        // 200s tunnel, saw a slab from 20 to 35 degrees down).
        const end = at("endZone");
        expect(end.x).toBeLessThan(-f.BOWL.halfX - f.BOWL.northLower.offset);
        expect(end.y).toBeCloseTo(
            f.BOWL.northLower.base + 29 * f.BOWL.northLower.rise + 1.2,
            3,
        );
        const solid = meshes(kit.root).filter((m) => shown(m));
        const eye = new Vector3(...end.c.position);
        for (let pitch = 10; pitch <= 40; pitch += 5) {
            const a = (pitch * Math.PI) / 180;
            const dir = new Vector3(
                -Math.sign(end.x) * Math.cos(a),
                -Math.sin(a),
                0,
            );
            const hit = new Raycaster(eye, dir, 0.3, 200).intersectObjects(
                solid,
                false,
            )[0];
            expect(hit?.object.name, `${pitch} degrees down`).not.toBe(
                "markDiesel.structure",
            );
        }
    });

    it("lets nothing in the hall cast a shadow but the performers' key light", () => {
        const kit = build();
        const casters = meshes(kit.root).filter((m) => m.castShadow);
        expect(casters.map((m) => m.name)).toEqual([]);
        // Nothing at low quality either.
        const low = build(football, "low");
        expect(meshes(low.root).filter((m) => m.castShadow)).toEqual([]);
    });

    it("stays under the draw-call budget, crowd included", () => {
        for (const quality of ["high", "low"] as const) {
            const kit = build(football, quality);
            const crowd = buildCrowd(kit.seatRows, {
                density: kit.crowdDensity,
                quality,
                ...kit.crowd,
            });
            kit.root.add(crowd.object);
            const count = () => {
                let draws = 0;
                let triangles = 0;
                kit.root.traverse((o) => {
                    if (!(o instanceof Mesh) || !shown(o)) return;
                    draws++;
                    const geo = o.geometry;
                    const n = geo.index
                        ? geo.index.count
                        : geo.getAttribute("position").count;
                    const instances =
                        (o as Mesh & { count?: number }).count ?? 1;
                    triangles += (n / 3) * instances;
                });
                return { draws, triangles };
            };
            const bare = count();
            // Seated at each camera: the full figures around it, the cards
            // for everyone else.
            for (const id of ["judges", "upper", "lowerBowl"]) {
                crowd.follow(kit.cameras.find((c) => c.id === id)!.position);
                const { draws, triangles } = count();
                // Far under design.md's cap of 300 draw calls a kit. The pro
                // dome draws 28 at high and 15 at low; this hall has the
                // drape, the boards, the ribbons and the seats the pro dome
                // lacks. The crowd is two of them, the glass rails one, and
                // the turf past the field and its paint two.
                expect(draws).toBe(bare.draws);
                expect(draws).toBeLessThanOrEqual(quality === "low" ? 46 : 58);
                // The pro dome draws about 360k at high and 190k at low. A
                // full house is about 46,000 people (23,000 at low): 2
                // triangles each as cards, and up to 2,100 full figures of
                // 160 (600 of 49 at low), so the hall is about 620k at high
                // and 165k at low. The prelims crowd before it, 4,100 full
                // figures, brought the hall to 705k and 197k. In the real
                // renderer the full house draws in the prelims crowd's time
                // (8.6 to 9.3 ms at high, about 4 ms at low).
                expect(triangles).toBeLessThan(
                    quality === "low" ? 200e3 : 640e3,
                );
            }
            kit.root.remove(crowd.object);
            crowd.dispose();
        }
    });

    it("disposes every geometry and material it created", () => {
        const kit = buildMarkDiesel({
            footprint: football,
            params,
            quality: "high",
        });
        const disposed = new Set<unknown>();
        const resources = new Set<{ dispose(): void }>();
        for (const m of meshes(kit.root)) {
            resources.add(m.geometry);
            (Array.isArray(m.material) ? m.material : [m.material]).forEach(
                (mat) => resources.add(mat),
            );
        }
        resources.forEach((r) => {
            const original = r.dispose.bind(r);
            r.dispose = () => {
                disposed.add(r);
                original();
            };
        });
        kit.dispose();
        resources.forEach((r) => expect(disposed.has(r)).toBe(true));
        expect(kit.root.children).toHaveLength(0);
    });
});
