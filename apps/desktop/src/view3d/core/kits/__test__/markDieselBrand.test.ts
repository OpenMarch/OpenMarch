// cspell:ignore superframe superframes keylined wordmark
import {
    afterAll,
    afterEach,
    beforeAll,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import { Box3, Mesh, Vector3, type Object3D, type Scene } from "three";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import {
    createSharedMaterials,
    ft,
    setTexturePainting,
} from "../../environment";
import { planField } from "../../field";
import { MARCHER_MARK, OPENMARCH_LOGO } from "../../field/brandMark";
import { DEFAULT_VENUE_PARAMS, KIT_VENUE_PARAMS } from "../../venueSettings";
import type { FieldFootprint, VenueParams } from "../../types";
import { bowlOutline } from "../bowl";
import {
    DIESEL_RAFTER,
    rafterBannerLayout,
    transverseChordBottom,
} from "../markDiesel/banners";
import {
    buildDieselBoards,
    DIESEL_BOARD,
    dieselBoardCenterY,
    dieselBoardSpots,
    dieselBoardYaw,
} from "../markDiesel/boards";
import { DIESEL_RING } from "../markDiesel/bowl";
import { paintStadiumSign } from "../markDiesel/stadiumSign";
import {
    DIESEL_VENUE_PARAMS,
    dieselFieldArt,
    paintAppIcon,
    paintBoardCard,
    paintBoardHeader,
    paintDieselFlag,
    paintLogo,
    paintLogoPanel,
    paintMonument,
    paintNameRing,
    paintRafterBanner,
    paintRibbonLower,
    dieselBandNames,
    dieselRibbonState,
    paintRibbonUpper,
    paintSponsorPanel,
    paintWallPad,
    RAFTER_BANNERS,
    SPONSOR_PANELS,
} from "../markDiesel/brand";
import {
    createBoardFeed,
    DIESEL_FEED,
    feedCameraPose,
    feedInView,
    FeedThrottle,
    type FeedRenderer,
} from "../markDiesel/feed";
import {
    dieselFrame,
    type DieselCtx,
    type DieselPart,
} from "../markDiesel/frame";
import { dieselSuperframeBottom } from "../markDiesel/roof";
import {
    buildDieselRibbons,
    RIBBON_PROUD,
    ringStrip,
} from "../markDiesel/ribbons";
import {
    buildDieselSite,
    dieselMonumentSpots,
    dieselTreeSpots,
} from "../markDiesel/site";
import {
    packSponsorAtlas,
    sponsorRow,
    WALL_PROUD,
} from "../markDiesel/surround";

/** Stands in for the test DOM's missing Path2D, so the marks can be seen. */
class FakePath {
    constructor(readonly d: string) {}
}

beforeAll(() => {
    setTexturePainting(false);
    vi.stubGlobal("Path2D", FakePath);
});
afterAll(() => vi.unstubAllGlobals());

const football: FieldFootprint = {
    minX: -ft(180),
    maxX: ft(180),
    minZ: -ft(160),
    maxZ: 0,
};
const small: FieldFootprint = { minX: -20, maxX: 24, minZ: -26, maxZ: 0 };
const shared = createSharedMaterials();
const frame = dieselFrame(football);
const context = (quality: "low" | "high", footprint = football): DieselCtx => ({
    footprint,
    params: DIESEL_VENUE_PARAMS,
    quality,
    shared,
    frame: dieselFrame(footprint),
});
const parts: DieselPart[] = [];
const keep = <T extends DieselPart>(part: T): T => {
    parts.push(part);
    return part;
};
afterEach(() => parts.splice(0).forEach((part) => part.dispose()));
afterAll(() => shared.dispose());

const box = (root: Object3D, name: string) => {
    root.updateMatrixWorld(true);
    return new Box3().setFromObject(root.getObjectByName(name)!);
};

/** One path of each mark that only that mark has: the logo's P, the marcher's M. */
const MARKS: Record<string, string> = {
    [OPENMARCH_LOGO.paths[13]]: "[logo]",
    [MARCHER_MARK.paths[3]]: "[marcher]",
};

/**
 * A 2D context that records the words it draws, a letter at a time too, and
 * the OpenMarch marks it fills, as "[logo]" and "[marcher]".
 */
function textRecorder() {
    const drawn: string[] = [];
    const gradient = { addColorStop: () => {} };
    const target: Record<string, unknown> = {
        font: "10px sans-serif",
        measureText: (text: string) => ({
            width:
                text.length *
                0.6 *
                parseFloat(/([\d.]+)px/.exec(String(target.font))?.[1] ?? "10"),
        }),
        createLinearGradient: () => gradient,
        fillText: (text: string) => drawn.push(text),
        fill: (path?: unknown) => {
            if (path instanceof FakePath && MARKS[path.d])
                drawn.push(MARKS[path.d]);
        },
    };
    const g = new Proxy(target, {
        get(obj, key: string) {
            if (key in obj) return obj[key];
            return () => undefined;
        },
        set(obj, key: string, value) {
            obj[key] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
    /** Everything drawn, with letters set one at a time joined back up. */
    const words = () => {
        const out: string[] = [];
        let run = "";
        for (const text of drawn)
            if (text.length === 1) run += text;
            else {
                if (run) out.push(run);
                run = "";
                out.push(text);
            }
        if (run) out.push(run);
        return out;
    };
    return { g, drawn, words };
}

/** Everything a painter writes, as one string. */
const written = (paint: (g: CanvasRenderingContext2D) => void): string => {
    const { g, words } = textRecorder();
    paint(g);
    return words().join(" | ");
};

describe("Venue brand painters", () => {
    it("paints OpenMarch's own marks", () => {
        expect(written((g) => paintLogo(g, 256, 256, 128, "#fff"))).toBe(
            "[logo]",
        );
        expect(written((g) => paintAppIcon(g, 256, 256, 256))).toBe(
            "[marcher]",
        );
    });

    it("names the hall only on the red signs, and no other brand", () => {
        const state = {
            title: "",
            bands: ["Virginia Anthem", "Detroit Headphones", "Boise Kites"],
        };
        const faces: Record<string, string> = {
            logoPanel: written((g) => paintLogoPanel(g, 512, 512)),
            wall: written((g) => paintWallPad(g, 2048, 128)),
            nameRing: written((g) => paintNameRing(g, 4096, 128)),
            ribbonLower: written((g) => paintRibbonLower(g, 4096, 128, state)),
            ribbonUpper: written((g) => paintRibbonUpper(g, 4096, 128)),
            header: written((g) => paintBoardHeader(g, 2048, 256)),
            card: written((g) => paintBoardCard(g, 1024, 560, { title: "x" })),
            flag: written((g) => paintDieselFlag(g, 512, 768)),
            monument: written((g) => paintMonument(g, 1040, 400)),
            sign: written((g) => paintStadiumSign(g, 1152, 152)),
        };
        SPONSOR_PANELS.forEach((panel, i) => {
            // The On The Move logo is an image the test DOM never loads.
            if (panel.face === "otm") return;
            faces[`sponsor${i}`] = written((g) =>
                paintSponsorPanel(g, panel, panel.width * 128, 128),
            );
        });
        RAFTER_BANNERS.forEach((banner, i) => {
            faces[`rafter${i}`] = written((g) =>
                paintRafterBanner(g, banner, 256, 640),
            );
        });
        // OpenMarch's marks: the drape's panel, the flags, the wall, the upper
        // ribbon, the video boards' header and card, the monuments and two
        // sideline boards (the logo and the web address); On The Move's logo
        // is on a third. The other boards and the ring of names are plain.
        const branded = Object.entries(faces)
            .filter(([, text]) => /\[logo\]|\[marcher\]|openmarch/i.test(text))
            .map(([face]) => face);
        const boardsShowing = (face: string) =>
            SPONSOR_PANELS.map((p, i) =>
                p.face === face ? `sponsor${i}` : null,
            ).filter((f) => f !== null);
        expect(boardsShowing("logo")).toHaveLength(1);
        expect(boardsShowing("site")).toHaveLength(1);
        expect(boardsShowing("otm")).toHaveLength(1);
        expect(branded.sort()).toEqual(
            [
                "logoPanel",
                "flag",
                "wall",
                "ribbonUpper",
                "header",
                "card",
                "monument",
                ...boardsShowing("logo"),
                ...boardsShowing("site"),
            ].sort(),
        );
        for (const face of boardsShowing("blank"))
            expect(faces[face], face).toBe("");
        for (const [face, text] of Object.entries(faces))
            expect(text, face).not.toMatch(
                /lucas|colts|yamaha|bands of america|\bboa\b/i,
            );
        // No event is named anywhere: any show can be on the field.
        for (const [face, text] of Object.entries(faces))
            expect(text, face).not.toMatch(/grand|national|prelims|finals\b/i);
        // The hall's name is on the red suite signs and nowhere else.
        for (const [face, text] of Object.entries(faces))
            if (face !== "sign")
                expect(text, face).not.toMatch(/diesel|stadium|welcome/i);
        expect(faces.sign).toContain("MARK DIESEL STADIUM");
        // On The Move's logo, between them, is an image the test DOM never
        // loads.
        expect(faces.wall).toBe("[logo] | openmarch.com");
        expect(faces.nameRing).toBe("");
        expect(faces.ribbonUpper).toBe("[logo] | openmarch.com");
        expect(faces[boardsShowing("site")[0]]).toBe("openmarch.com");
        expect(faces.header).toBe("[logo]");
        expect(faces.card).toBe("[logo] | NOW PERFORMING | x");
        expect(faces.monument).toBe("[logo] | openmarch.com");
    });

    it("shows the order of appearance on the lower ribbon, without a clock", () => {
        const bands = ["Virginia Anthem", "Detroit Headphones", "Boise Kites"];
        const untitled = written((g) =>
            paintRibbonLower(g, 4096, 128, { title: " ", bands }),
        );
        expect(untitled).toBe(
            "NOW PERFORMING | Virginia Anthem | UP NEXT | Detroit Headphones | ON DECK | Boise Kites",
        );

        const titled = written((g) =>
            paintRibbonLower(g, 4096, 128, { title: "Finals", bands }),
        );
        expect(titled).toBe(
            "NOW PERFORMING | Finals | UP NEXT | Virginia Anthem | ON DECK | Detroit Headphones",
        );
    });

    it("makes up different bands, place then noun", () => {
        let seed = 1;
        const random = () =>
            ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
        const names = dieselBandNames(3, random);
        expect(names).toHaveLength(3);
        expect(new Set(names).size).toBe(3);
        for (const name of names)
            expect(name).toMatch(/^[A-Z][\w ]+ [A-Z][\w ]+$/);
        expect(dieselRibbonState(random).bands).toHaveLength(3);
        // Even a stuck random number gives one name rather than looping.
        expect(dieselBandNames(3, () => 0)).toEqual(["Virginia Anthem"]);
    });

    it("puts the show and the window's own words on the board's card", () => {
        const english = written((g) =>
            paintBoardCard(g, 1024, 560, { title: "Finals" }),
        );
        expect(english).toContain("NOW PERFORMING | Finals");
        const translated = written((g) =>
            paintBoardCard(g, 1024, 560, {
                title: "",
                text: { heading: "On the field", untitled: "Nameless show" },
            }),
        );
        expect(translated).toContain("ON THE FIELD | Nameless show");
        const bare = written((g) =>
            paintBoardCard(g, 1024, 560, { title: "" }),
        );
        expect(bare).toContain("NOW PERFORMING | OpenMarch");
    });

    it("defaults the end zones to OpenMarch's, as every kit does", () => {
        expect(DIESEL_VENUE_PARAMS).toEqual(DEFAULT_VENUE_PARAMS);
        expect(DIESEL_VENUE_PARAMS).toEqual(KIT_VENUE_PARAMS.markDiesel);
        expect(DIESEL_VENUE_PARAMS.endZoneText).toBe("OPENMARCH");
    });
});

describe("Mark Diesel midfield art", () => {
    const fieldProperties =
        FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
    const params: VenueParams = { ...DIESEL_VENUE_PARAMS };

    it("paints the helmet at the drawings' 27 ft, between the hashes", () => {
        const plain = planField({ fieldProperties, style: "turf", params });
        expect(plain.items.filter((i) => i.type === "logo")).toHaveLength(1);

        const plan = planField({
            fieldProperties,
            style: "turf",
            params,
            centerArt: dieselFieldArt,
        });
        expect(plan.items.some((i) => i.type === "logo")).toBe(false);
        const art = plan.items.filter((i) => i.type === "art");
        expect(art).toHaveLength(1);
        const [item] = art;
        if (item.type !== "art") throw new Error("no art");
        const f = plan.footprint;
        expect(item.x).toBe(0);
        expect(item.z).toBeCloseTo((f.minZ + f.maxZ) / 2);
        // The turf drawings' midfield logo: 27 ft across.
        expect(item.width).toBeCloseTo(27 * 0.3048);
        expect(item.height).toBeCloseTo(item.width / 0.9753);
        expect(written((g) => dieselFieldArt.paint(g, 256, 256))).toBe(
            "[marcher]",
        );
        // The end zones say OPENMARCH.
        const zones = plan.items.filter((i) => i.role === "endZoneText");
        expect(zones).toHaveLength(2);
        expect(
            zones.every((z) => z.type === "text" && z.text === "OPENMARCH"),
        ).toBe(true);
    });

    it("leaves other surfaces alone", () => {
        const plan = planField({
            fieldProperties,
            style: "theme",
            params,
            centerArt: dieselFieldArt,
        });
        expect(plan.items.some((i) => i.type === "art")).toBe(false);
    });
});

describe("Mark Diesel monument signs", () => {
    const { BUILDING } = frame;

    it("stands one by each avenue on the plaza, facing the street", () => {
        const spots = dieselMonumentSpots(BUILDING.halfX, BUILDING.halfZ);
        expect(spots).toHaveLength(4);
        const trees = dieselTreeSpots(BUILDING.halfX, BUILDING.halfZ);
        for (const { x, z, yaw } of spots) {
            const outside =
                Math.abs(x) > BUILDING.halfX + 10 ||
                Math.abs(z) > BUILDING.halfZ + 10;
            expect(outside).toBe(true);
            // The front looks away from the building.
            const front = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
            expect(front.dot(new Vector3(x, 0, z))).toBeGreaterThan(0);
            for (const [tx, tz] of trees)
                expect(Math.hypot(tx - x, tz - z)).toBeGreaterThan(5);
        }
    });

    it("builds them at high quality only", () => {
        const high = keep(buildDieselSite(context("high")));
        expect(
            high.object.getObjectByName("diesel.site.monumentFaces"),
        ).toBeDefined();
        expect(() => high.setLighting("night")).not.toThrow();
        const low = keep(buildDieselSite(context("low")));
        expect(
            low.object.getObjectByName("diesel.site.monumentFaces"),
        ).toBeUndefined();
    });
});

describe("Mark Diesel LED ribbons", () => {
    it("builds a seamless band that faces the field and reads left to right", () => {
        const ring = bowlOutline(frame.BOWL.outline);
        const { geometry, tiles } = ringStrip(
            ring(0, 0),
            ring(0, 2),
            DIESEL_RING.all,
            40,
        );
        const pos = geometry.getAttribute("position");
        const uv = geometry.getAttribute("uv");
        const normal = geometry.getAttribute("normal");
        // A whole number of tiles round the closed ring.
        let length = 0;
        const points = ring(0, 0);
        points.forEach((p, i) => {
            length += p.distanceTo(points[(i + 1) % points.length]);
        });
        expect(length / tiles[0]).toBeCloseTo(Math.round(length / 40), 6);
        expect(uv.getX(uv.count - 1)).toBeCloseTo(-Math.round(length / 40), 6);
        for (let i = 0; i < pos.count; i += 3) {
            // Every face looks inward, at the field.
            const toCenter = new Vector3(-pos.getX(i), 0, -pos.getZ(i));
            const n = new Vector3(
                normal.getX(i),
                normal.getY(i),
                normal.getZ(i),
            );
            expect(n.dot(toCenter)).toBeGreaterThan(0);
        }
        // On the front sideline (+Z) someone on the field looks toward +Z,
        // with +X on their left: U must rise as X falls.
        const [a, b] = [0, 2];
        expect(pos.getZ(a)).toBeGreaterThan(0);
        expect(Math.sign(uv.getX(b) - uv.getX(a))).toBe(
            Math.sign(pos.getX(a) - pos.getX(b)),
        );
        geometry.dispose();
    });

    it("hangs both ribbons just proud of the bowl's fascias", () => {
        const part = keep(buildDieselRibbons(context("high")));
        const { BOWL } = frame;
        const lower = box(part.object, "markDiesel.ledRibbon1");
        expect(lower.min.y).toBeCloseTo(BOWL.ribbon.bottom, 5);
        expect(lower.max.y).toBeCloseTo(BOWL.ribbon.top, 5);
        expect(lower.max.z).toBeCloseTo(
            BOWL.halfZ + BOWL.ribbon.offset - RIBBON_PROUD,
            3,
        );
        expect(lower.min.z).toBeCloseTo(-lower.max.z, 3);
        const upper = box(part.object, "markDiesel.ledRibbon2");
        expect(upper.min.y).toBeCloseTo(BOWL.ribbon2.bottom, 5);
        expect(upper.max.y).toBeCloseTo(BOWL.ribbon2.top, 5);
        expect(upper.max.x).toBeCloseTo(
            BOWL.halfX + BOWL.ribbon2.offset - RIBBON_PROUD,
            3,
        );
    });

    it("crawls with the frame time, never jumping after a pause", () => {
        const part = keep(buildDieselRibbons(context("high")));
        const mesh = part.object.getObjectByName(
            "markDiesel.ledRibbon1",
        ) as Mesh;
        const scroll = (
            mesh.material as unknown as {
                uniforms: { scroll: { value: number } };
            }
        ).uniforms.scroll;
        expect(scroll.value).toBe(0);
        part.onFrame?.({ cameraPosition: [0, 5, 40], dt: 1 / 60 });
        const step = scroll.value;
        expect(step).toBeGreaterThan(0);
        expect(step).toBeLessThan(0.001);
        // A paused show's next frame comes seconds later.
        part.onFrame?.({ cameraPosition: [0, 5, 40], dt: 30 });
        expect(scroll.value - step).toBeCloseTo(step * 6, 8);
        part.onFrame?.({ cameraPosition: [0, 5, 40], dt: 0 });
        expect(scroll.value - step).toBeCloseTo(step * 6, 8);
    });

    it("draws its bands once, not on every frame or title", () => {
        const random = vi.fn(() => 0.5);
        const part = keep(buildDieselRibbons(context("low"), { random }));
        const drawn = random.mock.calls.length;
        expect(drawn).toBeGreaterThan(0);
        for (let i = 0; i < 3; i++)
            part.onFrame?.({ cameraPosition: [0, 5, 40], dt: 1.1 });
        part.setCredits({ title: "Finals" });
        expect(random).toHaveBeenCalledTimes(drawn);
    });
});

describe("Mark Diesel field surround", () => {
    it("pads the wall everywhere but under the drape", () => {
        const part = keep(buildDieselBoards(context("low")));
        const { BOWL } = frame;
        const pads = box(part.object, "markDiesel.wallPads");
        expect(pads.max.y).toBeCloseTo(BOWL.fieldWall, 5);
        expect(pads.min.y).toBeGreaterThan(0);
        // The front straight, just proud of the wall.
        expect(pads.max.z).toBeCloseTo(BOWL.halfZ - WALL_PROUD, 3);
        // Not the back straight: the wall under the drape stays black.
        expect(pads.min.z).toBeGreaterThan(-BOWL.halfZ + 1);
        // The south end's wall stands 2 m further back than the north's.
        expect(pads.max.x).toBeCloseTo(BOWL.wallX.south - WALL_PROUD, 3);
        expect(pads.min.x).toBeCloseTo(BOWL.wallX.north + WALL_PROUD, 3);
    });

    it("leaves the corner tunnels' mouths open, and squares the wall's corners", () => {
        const part = keep(buildDieselBoards(context("low")));
        const { BOWL } = frame;
        const pads = (
            part.object.getObjectByName("markDiesel.wallPads") as Mesh
        ).geometry.getAttribute("position");
        // The pads near each corner's 45 degree line, at the wall.
        const corners = [
            [BOWL.wallX.south, BOWL.halfZ],
            [BOWL.wallX.south, -BOWL.halfZ],
            [BOWL.wallX.north, BOWL.halfZ],
            [BOWL.wallX.north, -BOWL.halfZ],
        ];
        const r = BOWL.front.cornerRadius;
        for (const [cx, cz] of corners) {
            const sx = Math.sign(cx);
            const sz = Math.sign(cz);
            // The wall's corner: its arc's middle, 45 degrees round.
            const mx = cx - sx * r * (1 - Math.SQRT1_2);
            const mz = cz - sz * r * (1 - Math.SQRT1_2);
            let near = 0;
            for (let i = 0; i < pads.count; i++)
                if (
                    Math.hypot(pads.getX(i) - mx, pads.getZ(i) - mz) <
                    BOWL.cornerTunnels.width / 2 - 0.5
                )
                    near++;
            expect(near, `${cx}, ${cz}`).toBe(0);
        }
        // Along the straights the pads run nearly into the corner: the
        // wall's corner radius is 6 m, not the stands' 16.
        let reach = 0;
        for (let i = 0; i < pads.count; i++)
            if (pads.getZ(i) > BOWL.halfZ - 0.5)
                reach = Math.max(reach, pads.getX(i));
        expect(reach).toBeGreaterThan(BOWL.wallX.south - r - 0.5);
    });

    it("stands the sponsor boards along the back sideline, facing the audience", () => {
        const part = keep(buildDieselBoards(context("low")));
        const { BOWL, FIELD_HALF_WIDTH } = frame;
        const strip = box(part.object, "markDiesel.sponsorStrip");
        expect(strip.max.z).toBeLessThan(-FIELD_HALF_WIDTH);
        expect(strip.min.z).toBeGreaterThan(-BOWL.halfZ);
        expect(strip.max.y).toBeLessThan(BOWL.fieldWall);
        expect(strip.min.x).toBeCloseTo(-strip.max.x, 5);
        const row = sponsorRow(frame);
        expect(row).toHaveLength(SPONSOR_PANELS.length);
        // In order, without overlapping.
        row.slice(1).forEach((board, i) => {
            const before = row[i];
            expect(board.x - board.panel.width / 2).toBeGreaterThan(
                before.x + before.panel.width / 2,
            );
        });
        const mesh = part.object.getObjectByName(
            "markDiesel.sponsorStrip",
        ) as Mesh;
        const normal = mesh.geometry.getAttribute("normal");
        expect(normal.getZ(0)).toBeGreaterThan(0.9);
    });

    it("drops boards from both ends on a short field", () => {
        const short = dieselFrame(small);
        const row = sponsorRow(short);
        const room = 2 * (short.BOWL.halfX - short.BOWL.outline.cornerRadius);
        expect(row.length).toBeLessThan(SPONSOR_PANELS.length);
        expect(row.length).toBeGreaterThan(0);
        const first = row[0];
        const last = row[row.length - 1];
        expect(last.x + last.panel.width / 2).toBeLessThanOrEqual(room / 2);
        expect(first.x - first.panel.width / 2).toBeGreaterThanOrEqual(
            -room / 2,
        );
        // The marks in the middle are the last to go.
        expect(row.some((b) => b.panel.face === "site")).toBe(true);
    });

    it("packs each distinct board once, inside the atlas", () => {
        const { cells, height } = packSponsorAtlas(SPONSOR_PANELS);
        expect(cells).toHaveLength(new Set(SPONSOR_PANELS).size);
        for (const cell of cells) {
            expect(cell.x + cell.w).toBeLessThanOrEqual(2048);
            expect(cell.y + cell.h).toBeLessThanOrEqual(height);
        }
        cells.forEach((a, i) =>
            cells.slice(i + 1).forEach((b) => {
                const apart =
                    a.x + a.w <= b.x ||
                    b.x + b.w <= a.x ||
                    a.y + a.h <= b.y ||
                    b.y + b.h <= a.y;
                expect(apart).toBe(true);
            }),
        );
    });
});

describe("Mark Diesel rafter banners", () => {
    it("hangs a row under each inner transverse truss", () => {
        const layout = rafterBannerLayout(frame);
        expect(layout).toHaveLength(2 * DIESEL_RAFTER.perTruss);
        const xs = [...new Set(layout.map((b) => b.top[0]))];
        expect(xs).toEqual([
            frame.ROOF.transverse.xs[1],
            frame.ROOF.transverse.xs[3],
        ]);
        for (const { top, design } of layout) {
            expect(top[1]).toBeCloseTo(
                transverseChordBottom(frame, top[2]) - DIESEL_RAFTER.drop,
            );
            // Clear of the lights and the speaker cluster below.
            expect(top[1] - DIESEL_RAFTER.height).toBeGreaterThan(
                frame.CATWALK_Y,
            );
            expect(design).toBeLessThan(RAFTER_BANNERS.length);
        }
        // The two rows don't show the same banner side by side.
        expect(layout[0].design).not.toBe(
            layout[DIESEL_RAFTER.perTruss].design,
        );
    });

    it("prints each banner on both sides", () => {
        const part = keep(buildDieselBoards(context("low")));
        const mesh = part.object.getObjectByName(
            "markDiesel.rafterBanners",
        ) as Mesh;
        const count = mesh.geometry.getAttribute("position").count;
        expect(count).toBe(2 * DIESEL_RAFTER.perTruss * 2 * 6);
        const normal = mesh.geometry.getAttribute("normal");
        expect(normal.getX(0)).toBeCloseTo(1);
        expect(normal.getX(6)).toBeCloseTo(-1);
    });
});

describe("Mark Diesel video boards", () => {
    it("hangs a 97 by 53 ft screen in two corners, over the upper ribbon", () => {
        const part = keep(buildDieselBoards(context("high")));
        expect(DIESEL_BOARD.width).toBeCloseTo(ft(97));
        expect(DIESEL_BOARD.height).toBeCloseTo(ft(53));
        const spots = dieselBoardSpots(frame);
        expect(spots.map((s) => s.id)).toEqual(
            frame.VIDEO_BOARDS.map((s) => s.id),
        );
        spots.forEach((spot, i) => {
            // The corner the frame names: south-east and north-west.
            const corner = frame.VIDEO_BOARDS[i];
            expect(Math.sign(spot.x)).toBe(Math.sign(corner.x));
            expect(Math.sign(spot.z)).toBe(Math.sign(corner.z));
            expect(Math.abs(spot.x)).toBeGreaterThan(frame.BOWL.halfX);
            expect(spot.y).toBe(dieselBoardCenterY(frame));

            const board = part.object.getObjectByName(
                `markDiesel.videoBoard.${spot.id}`,
            )!;
            expect(board.position.toArray()).toEqual([spot.x, spot.y, spot.z]);
            expect(board.rotation.y).toBeCloseTo(dieselBoardYaw(spot));
            // It faces the field's center.
            const normal = new Vector3(0, 0, 1).applyEuler(board.rotation);
            const toCenter = new Vector3(-spot.x, 0, -spot.z).normalize();
            expect(normal.dot(toCenter)).toBeCloseTo(1, 5);

            const screen = box(
                part.object,
                `markDiesel.videoScreen.${spot.id}`,
            );
            expect(screen.min.y).toBeGreaterThan(frame.BOWL.ribbon2.top);
            expect(screen.max.y - screen.min.y).toBeCloseTo(ft(53), 3);
            // It hangs across the corner, past the end of the light row:
            // the whole cabinet is beyond the catwalk's last block, it
            // stands outside the superframe's line, and the sign's top is
            // under the bottom chord.
            const reach = Math.abs(frame.CATWALK_CORNERS[0][0]) + 2;
            const across = new Vector3(1, 0, 0).applyEuler(board.rotation);
            const halfWidth = DIESEL_BOARD.width / 2 + DIESEL_BOARD.margin;
            expect(
                Math.abs(spot.x) - halfWidth * Math.abs(across.x),
            ).toBeGreaterThan(reach);
            expect(Math.abs(spot.z)).toBeGreaterThan(frame.ROOF.superframes.z);
            const signTop =
                spot.y +
                DIESEL_BOARD.height / 2 +
                DIESEL_BOARD.margin +
                DIESEL_BOARD.headerGap +
                DIESEL_BOARD.header;
            expect(signTop).toBeLessThan(
                dieselSuperframeBottom(frame, spot.x) - 0.5,
            );
            expect(signTop).toBeGreaterThan(frame.CATWALK_Y - 2);
            // The signs (one mesh) stand over the screens, under the roof.
            const signs = box(part.object, "markDiesel.boardSigns");
            expect(signs.min.y).toBeGreaterThan(screen.max.y);
            expect(signs.max.y).toBeLessThan(frame.ROOF.superframes.top);
            expect(Math.abs(signs.max.x)).toBeGreaterThan(Math.abs(spot.x));
        });
    });

    it("shows a live picture at high quality only", () => {
        const high = keep(buildDieselBoards(context("high")));
        expect(high.feed).not.toBeNull();
        expect(
            high.object.getObjectByName("markDiesel.feedCamera"),
        ).toBeDefined();
        const low = keep(buildDieselBoards(context("low")));
        expect(low.feed).toBeNull();
        expect(
            low.object.getObjectByName("markDiesel.feedCamera"),
        ).toBeUndefined();
        for (const part of [high, low]) {
            expect(() => part.setCredits({ title: "Finals" })).not.toThrow();
            expect(() => part.setLighting("day")).not.toThrow();
        }
    });
});

describe("Mark Diesel live feed", () => {
    /** A renderer that records what the feed asks of it. */
    function fakeRenderer(onRender: () => void = () => {}) {
        const state = {
            target: null as unknown,
            renders: 0,
            shadowsDuring: null as boolean | null,
            targetDuring: null as unknown,
        };
        const renderer = {
            xr: { enabled: true },
            shadowMap: { autoUpdate: true },
            state: { buffers: { depth: { setMask: () => {} } } },
            getRenderTarget: () => state.target,
            setRenderTarget: (t: unknown) => void (state.target = t),
            getActiveCubeFace: () => 0,
            getActiveMipmapLevel: () => 0,
            clear: () => {},
            render: () => {
                state.renders++;
                state.shadowsDuring = renderer.shadowMap.autoUpdate;
                state.targetDuring = state.target;
                onRender();
            },
        };
        return {
            renderer: renderer as unknown as FeedRenderer,
            state,
            raw: renderer,
        };
    }
    const scene = {} as Scene;
    const inside: [number, number, number] = [0, 7, 46];

    it("is due at once, then once an interval of frame time", () => {
        const throttle = new FeedThrottle(1 / 12);
        expect(throttle.due).toBe(true);
        throttle.drawn();
        expect(throttle.due).toBe(false);
        for (let i = 0; i < 4; i++) throttle.tick(1 / 60);
        expect(throttle.due).toBe(false);
        throttle.tick(1 / 60);
        throttle.tick(-1);
        expect(throttle.due).toBe(true);
        throttle.drawn();
        throttle.invalidate();
        expect(throttle.due).toBe(true);
    });

    it("draws at most twelve pictures a second, whatever the frame rate", () => {
        const feed = createBoardFeed(frame, 97 / 53);
        const { renderer, state } = fakeRenderer();
        for (let frameNo = 0; frameNo < 120; frameNo++) {
            feed.tick(1 / 120, inside);
            // Both screens are in view, and a bloom pass draws them again.
            for (let pass = 0; pass < 4; pass++) feed.draw(renderer, scene);
        }
        expect(state.renders).toBeGreaterThanOrEqual(DIESEL_FEED.fps - 1);
        expect(state.renders).toBeLessThanOrEqual(DIESEL_FEED.fps + 1);
        expect(feed.stats.pictures).toBe(state.renders);
        feed.dispose();
    });

    it("draws nothing while no screen is drawn or the view is outside", () => {
        const feed = createBoardFeed(frame, 97 / 53);
        const { renderer, state } = fakeRenderer();
        // No screen in the view's frustum: `draw` is never called.
        for (let i = 0; i < 60; i++) feed.tick(1 / 60, inside);
        expect(state.renders).toBe(0);
        // From the blimp the roof hides the boards.
        feed.tick(1 / 60, [-189, 195, 183]);
        expect(feed.draw(renderer, scene)).toBe(false);
        feed.tick(1 / 60, inside);
        expect(feed.draw(renderer, scene)).toBe(true);
        expect(state.renders).toBe(1);
        feed.dispose();
    });

    it("hides the screens, skips shadows and restores the renderer", () => {
        const feed = createBoardFeed(frame, 97 / 53);
        const screens = [new Mesh(), new Mesh()];
        screens.forEach((s) => feed.attach(s));
        const hiddenDuring: boolean[] = [];
        const fake = fakeRenderer(() => {
            hiddenDuring.push(...screens.map((s) => !s.visible));
            // The picture's own pass reaches the screens' hooks again.
            expect(feed.draw(fake.renderer, scene)).toBe(false);
        });
        const main = { name: "main target" };
        fake.state.target = main;
        feed.tick(1 / 60, inside);
        // Three calls the hook of a screen it is about to draw.
        const hook = screens[0].onBeforeRender as unknown as (
            renderer: unknown,
            scene: unknown,
        ) => void;
        hook(fake.renderer, scene);
        expect(fake.state.renders).toBe(1);
        expect(hiddenDuring).toEqual([true, true]);
        expect(fake.state.shadowsDuring).toBe(false);
        expect(fake.state.targetDuring).not.toBe(main);
        expect(fake.state.target).toBe(main);
        expect(fake.raw.shadowMap.autoUpdate).toBe(true);
        expect(fake.raw.xr.enabled).toBe(true);
        expect(screens.every((s) => s.visible)).toBe(true);
        // The second screen, drawn on the same frame, reuses the picture.
        (screens[1].onBeforeRender as unknown as typeof hook)(
            fake.renderer,
            scene,
        );
        expect(fake.state.renders).toBe(1);
        feed.dispose();
    });

    it("restores the renderer when the picture's pass throws", () => {
        const feed = createBoardFeed(frame, 97 / 53);
        const screen = new Mesh();
        feed.attach(screen);
        const fake = fakeRenderer(() => {
            throw new Error("lost context");
        });
        feed.tick(1 / 60, inside);
        expect(() => feed.draw(fake.renderer, scene)).toThrow("lost context");
        expect(fake.state.target).toBeNull();
        expect(fake.raw.shadowMap.autoUpdate).toBe(true);
        expect(screen.visible).toBe(true);
        feed.dispose();
    });

    it("stands the broadcast camera at the upper deck's rail, looking down at the field", () => {
        const pose = feedCameraPose(frame);
        const { upper, halfZ } = frame.BOWL;
        expect(pose.position[0]).toBe(0);
        // Over the rail, in front of the first row's crowd and the portals.
        expect(pose.position[2]).toBeGreaterThan(halfZ + upper.offset);
        expect(pose.position[2]).toBeLessThan(
            halfZ + upper.offset + upper.depth,
        );
        expect(pose.position[1]).toBeGreaterThan(upper.base + 2);
        expect(Math.abs(pose.target[2])).toBeLessThan(frame.FIELD_HALF_WIDTH);
        expect(pose.target[1]).toBe(0);
    });

    it("knows a view inside the hall from one outside or above it", () => {
        expect(feedInView([0, 7, 46], frame)).toBe(true);
        expect(feedInView([0, 300, 0], frame)).toBe(false);
        expect(feedInView([frame.BUILDING.halfX + 5, 10, 0], frame)).toBe(
            false,
        );
        expect(feedInView([0, 10, -frame.BUILDING.halfZ - 5], frame)).toBe(
            false,
        );
    });
});
