import { beforeAll, describe, expect, it } from "vitest";
import {
    FieldProperties,
    fieldFootprint,
    stepMeters,
    type FieldFootprint,
} from "@openmarch/core";
import { PlaneGeometry, SRGBColorSpace, type CanvasTexture } from "three";
import FieldPropertiesTemplates from "../../../../global/classes/FieldProperties.templates";
import { setTexturePainting } from "../../environment";
import {
    FIELD_SURFACE_Y,
    buildFieldSurface,
    paintPlan,
    planField,
    textureLayout,
    textureLongSide,
    type FieldPlan,
    type FieldRole,
    type FieldSurfaceInput,
    type FieldSurfaceStyle,
} from "..";
import { FIVE_YARDS } from "../turfPlan";

beforeAll(() => setTexturePainting(false));

const T = FieldPropertiesTemplates;
const params = {
    homeColor: "#6442ff",
    awayColor: "#c23b3b",
    endZoneText: "OPENMARCH",
    endZoneColor: "#1f2a5c",
};

const plan = (
    fp: FieldProperties,
    style: FieldSurfaceStyle,
    extra: Partial<FieldSurfaceInput> = {},
): FieldPlan => planField({ fieldProperties: fp, style, params, ...extra });

const count = (p: FieldPlan, role: FieldRole) =>
    p.items.filter((i) => i.role === role).length;

const visibleCount = (cs: { visible: boolean }[]) =>
    cs.filter((c) => c.visible).length;

/** A fake image: only its size matters to the plan. */
const fakeImage = (width: number, height: number) =>
    ({
        width,
        height,
        naturalWidth: width,
        naturalHeight: height,
    }) as unknown as HTMLImageElement;

/** Records every call made on a 2D context. */
function recordingContext() {
    const calls: { name: string; args: unknown[] }[] = [];
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
        createRadialGradient: () => gradient,
    };
    const g = new Proxy(target, {
        get(obj, key: string) {
            if (key in obj && typeof obj[key] !== "function") return obj[key];
            return (...args: unknown[]) => {
                calls.push({ name: key, args });
                const fn = obj[key];
                return typeof fn === "function" ? fn(...args) : undefined;
            };
        },
        set(obj, key: string, value) {
            obj[key] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
    const named = (name: string) => calls.filter((c) => c.name === name);
    return { g, calls, named };
}

function expectInside(p: FieldPlan, f: FieldFootprint) {
    for (const item of p.items) {
        if (item.type !== "rect") continue;
        for (const v of [item.minX, item.maxX, item.minZ, item.maxZ])
            expect(Number.isFinite(v)).toBe(true);
        expect(item.minX).toBeGreaterThanOrEqual(f.minX - 1e-9);
        expect(item.maxX).toBeLessThanOrEqual(f.maxX + 1e-9);
        expect(item.minZ).toBeGreaterThanOrEqual(f.minZ - 1e-9);
        expect(item.maxZ).toBeLessThanOrEqual(f.maxZ + 1e-9);
    }
}

describe("turf on football fields", () => {
    const fields = {
        HS: T.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES,
        college: T.COLLEGE_FOOTBALL_FIELD_WITH_END_ZONES,
        NFL: T.PRO_FOOTBALL_FIELD_WITH_END_ZONES,
    };
    for (const [name, fp] of Object.entries(fields)) {
        describe(name, () => {
            const p = plan(fp, "turf");

            it("draws a line at every visible yard-line checkpoint", () => {
                expect(count(p, "yardLine")).toBe(
                    visibleCount(fp.xCheckpoints),
                );
                expect(count(p, "yardLine")).toBe(23);
            });

            it("paints both end zones with the end-zone text", () => {
                expect(count(p, "endZone")).toBe(2);
                const texts = p.items.filter((i) => i.role === "endZoneText");
                expect(texts).toHaveLength(2);
                for (const t of texts)
                    if (t.type === "text") {
                        expect(t.text).toBe("OPENMARCH");
                        expect(Math.abs(t.rotation)).toBeCloseTo(Math.PI / 2);
                    }
            });

            it("has 20 mowing stripes between the goal lines", () => {
                const stripes = p.items.filter((i) => i.role === "stripe");
                expect(stripes).toHaveLength(20);
                for (const s of stripes)
                    if (s.type === "rect")
                        expect(s.maxX - s.minX).toBeCloseTo(FIVE_YARDS, 2);
            });

            it("puts hashes on the 21 lines of play at the two real hashes", () => {
                expect(count(p, "hash")).toBe(21 * 2);
                // 4 one-yard marks per 5 yards, at both hashes and sidelines
                expect(count(p, "tick")).toBe(20 * 4 * 4);
            });

            it("draws yard numbers digit by digit, home and away", () => {
                const numbers = p.items.filter((i) => i.role === "yardNumber");
                // 10..40 twice and 50 once, two digits, two sidelines
                expect(numbers).toHaveLength(9 * 2 * 2);
                const rotations = new Set(
                    numbers.map((n) => (n.type === "text" ? n.rotation : -1)),
                );
                expect(rotations).toEqual(new Set([0, Math.PI]));
                // arrows on every labeled line except the 50
                expect(count(p, "arrow")).toBe(8 * 2);
            });

            it("keeps every rectangle inside the footprint", () => {
                expectInside(p, fieldFootprint(fp));
            });
        });
    }

    it("places the home numbers from yardNumberCoordinates", () => {
        const fp = T.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES;
        const m = stepMeters(fp);
        const p = plan(fp, "turf");
        const home = p.items.find(
            (i) =>
                i.type === "text" &&
                i.role === "yardNumber" &&
                i.rotation === 0,
        );
        expect(home?.type).toBe("text");
        if (home?.type !== "text") return;
        expect(home.z).toBeCloseTo(-((11.2 + 14.4) / 2) * m, 6);
        expect(home.height).toBeCloseTo(3.2 * m, 6);
        const away = p.items.find(
            (i) =>
                i.type === "text" &&
                i.role === "yardNumber" &&
                i.rotation !== 0,
        );
        if (away?.type !== "text") throw new Error("no away number");
        expect(away.z).toBeCloseTo(-(74.1333 - 1.6) * m, 4);
    });

    it("splits the digits around the line and mirrors them for away", () => {
        const fp = T.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES;
        const p = plan(fp, "turf");
        const forty = p.items.filter(
            (i) =>
                i.type === "text" &&
                i.role === "yardNumber" &&
                Math.abs(i.x - -16 * stepMeters(fp)) < 2,
        );
        const home = forty.filter((i) => i.type === "text" && i.rotation === 0);
        const away = forty.filter((i) => i.type === "text" && i.rotation !== 0);
        const firstX = (items: typeof forty) =>
            items[0].type === "text" ? items[0].x : 0;
        const x = -16 * stepMeters(fp);
        expect(home.map((i) => (i.type === "text" ? i.text : ""))).toEqual([
            "4",
            "0",
        ]);
        expect(firstX(home)).toBeLessThan(x);
        expect(firstX(away)).toBeGreaterThan(x);
    });

    it("skips end-zone text when it is empty and end zones when there are none", () => {
        const fp = T.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES;
        const empty = planField({
            fieldProperties: fp,
            style: "turf",
            params: { ...params, endZoneText: "  " },
        });
        expect(count(empty, "endZone")).toBe(2);
        expect(count(empty, "endZoneText")).toBe(0);

        const noEz = plan(T.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES, "turf");
        expect(count(noEz, "endZone")).toBe(0);
        expect(count(noEz, "endZoneText")).toBe(0);
        expect(count(noEz, "stripe")).toBe(20);
        expect(count(noEz, "yardLine")).toBe(21);
    });

    it("paints the NCAA real back hash instead of the grid one", () => {
        const fp = T.COLLEGE_FOOTBALL_FIELD_WITH_END_ZONES;
        const m = stepMeters(fp);
        const zs = new Set(
            plan(fp, "turf")
                .items.filter((i) => i.role === "hash" && i.type === "rect")
                .map((i) =>
                    i.type === "rect" ? +((i.minZ + i.maxZ) / 2).toFixed(3) : 0,
                ),
        );
        expect(zs).toEqual(
            new Set([+(-32 * m).toFixed(3), +(-53.33 * m).toFixed(3)]),
        );
    });
});

describe("theme style mirrors the 2D canvas", () => {
    it("draws grid, half lines, checkpoints, hashes and numbers on football", () => {
        const fp = T.COLLEGE_FOOTBALL_FIELD_WITH_END_ZONES;
        const p = plan(fp, "theme");
        const ys = visibleCount(fp.yCheckpoints);
        expect(count(p, "yardLine")).toBe(23);
        // 2D draws a hash for every visible y checkpoint, grid ones included
        expect(count(p, "hash")).toBe(23 * ys);
        expect(count(p, "yLine")).toBe(0);
        // one line per step: 192 steps wide (edges excluded), and from the
        // front sideline back to the last whole step before 85.33
        expect(count(p, "grid")).toBe(191 + 86);
        expect(count(p, "halfLine")).toBeGreaterThan(40);
        // whole labels, home and away
        expect(count(p, "yardNumber")).toBe(9 * 2);
        expect(count(p, "border")).toBe(4);
        expect(count(p, "endZone")).toBe(0);
        expect(count(p, "stripe")).toBe(0);
        const bg = p.items[0];
        expect(bg.type === "rect" && bg.color).toBe("rgba(255, 255, 255, 1)");
    });

    it("draws y lines instead of hashes on an indoor grid", () => {
        const fp = T.INDOOR_50x70_8to5;
        const p = plan(fp, "theme");
        expect(count(p, "yardLine")).toBe(visibleCount(fp.xCheckpoints));
        expect(count(p, "yLine")).toBe(visibleCount(fp.yCheckpoints));
        expect(count(p, "hash")).toBe(0);
        expect(count(p, "yardNumber")).toBe(0);
        expectInside(p, fieldFootprint(fp));
    });

    it("draws the field image under the grid when it is shown", () => {
        const fp = T.INDOOR_50x70_8to5;
        const p = plan(fp, "theme", { image: fakeImage(1000, 500) });
        const order = p.items.map((i) => i.role);
        expect(order.indexOf("image")).toBe(1);
        expect(order.indexOf("grid")).toBeGreaterThan(1);
        const hidden = new FieldProperties({ ...fp, showFieldImage: false });
        expect(
            count(
                plan(hidden, "theme", { image: fakeImage(1000, 500) }),
                "image",
            ),
        ).toBe(0);
    });

    it("uses the theme passed in over the field's", () => {
        const fp = T.INDOOR_50x70_8to5;
        const p = plan(fp, "theme", {
            theme: { ...fp.theme, background: { r: 1, g: 2, b: 3, a: 1 } },
        });
        const bg = p.items[0];
        expect(bg.type === "rect" && bg.color).toBe("rgba(1, 2, 3, 1)");
    });
});

describe("tarp style", () => {
    const fp = T.INDOOR_50x70_8to5;

    it("generates a dark tarp with 5-step marks without an image", () => {
        const p = plan(fp, "tarp");
        expect(p.items[0].role).toBe("tarpArt");
        // 35 x 25 steps: 7 marks across, 4 deep, on both edges of each axis
        expect(count(p, "tick")).toBe(7 * 2 + 4 * 2);
        expect(count(p, "dot")).toBe(7 * 4);
        expect(count(p, "image")).toBe(0);
        expect(count(p, "yardLine")).toBe(0);
        expectInside(p, fieldFootprint(fp));
    });

    it("uses the field image, fit inside the field", () => {
        const f = fieldFootprint(fp);
        // wider than the 35:25 field: fits the width, centered in depth
        const p = plan(fp, "tarp", { image: fakeImage(2000, 1000) });
        expect(count(p, "tarpArt")).toBe(0);
        expect(count(p, "tick")).toBe(0);
        const img = p.items.find((i) => i.type === "image");
        if (img?.type !== "image") throw new Error("no image");
        expect(img.opacity).toBe(1);
        expect(img.minX).toBeCloseTo(f.minX, 6);
        expect(img.maxX).toBeCloseTo(f.maxX, 6);
        const width = f.maxX - f.minX;
        expect(img.maxZ - img.minZ).toBeCloseTo(width / 2, 6);
        expect((img.minZ + img.maxZ) / 2).toBeCloseTo((f.minZ + f.maxZ) / 2, 6);
    });

    it("covers the field with the image when set to fill", () => {
        const f = fieldFootprint(fp);
        const fill = new FieldProperties({ ...fp, imageFillOrFit: "fill" });
        const p = plan(fill, "tarp", { image: fakeImage(2000, 1000) });
        const img = p.items.find((i) => i.type === "image");
        if (img?.type !== "image") throw new Error("no image");
        expect(img.minZ).toBeCloseTo(f.minZ, 6);
        expect(img.maxZ).toBeCloseTo(f.maxZ, 6);
        expect(img.maxX - img.minX).toBeCloseTo((f.maxZ - f.minZ) * 2, 6);
        expect(img.minX).toBeLessThan(f.minX);
    });
});

describe("painting", () => {
    it("paints every planned item into a 2D context", () => {
        const fp = T.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES;
        const p = plan(fp, "turf");
        const layout = textureLayout(p.footprint, 4096);
        const rec = recordingContext();
        paintPlan(rec.g, p, layout);
        const rects = p.items.filter((i) => i.type === "rect").length;
        const texts = p.items.filter((i) => i.type === "text").length;
        expect(rec.named("fillRect")).toHaveLength(rects);
        expect(rec.named("fillText")).toHaveLength(texts);
        expect(rec.named("fill")).toHaveLength(count(p, "arrow"));
        for (const c of rec.named("fillRect"))
            for (const v of c.args) expect(Number.isFinite(v)).toBe(true);
    });

    it("maps the back of the field to the top of the texture", () => {
        const fp = T.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES;
        const p = plan(fp, "turf");
        const layout = textureLayout(p.footprint, 4096);
        const rec = recordingContext();
        paintPlan(rec.g, p, layout);
        const [x, y, w, h] = rec.named("fillRect")[0].args as number[];
        expect([x, y]).toEqual([0, 0]);
        expect(w).toBeCloseTo(layout.width, 6);
        expect(h).toBeCloseTo(layout.height, 6);
        // The first yard line (side 1 end line) sits at the left edge.
        const yard = p.items.find((i) => i.role === "yardLine");
        if (yard?.type !== "rect") throw new Error("no yard line");
        expect(yard.minX).toBeCloseTo(p.footprint.minX, 6);
    });

    it("draws the image and the tarp artwork when asked", () => {
        const fp = T.INDOOR_50x70_8to5;
        const withImage = plan(fp, "tarp", { image: fakeImage(800, 600) });
        const layout = textureLayout(withImage.footprint, 4096);
        const rec = recordingContext();
        paintPlan(rec.g, withImage, layout, fakeImage(800, 600));
        expect(rec.named("drawImage")).toHaveLength(1);

        const generated = plan(fp, "tarp");
        const rec2 = recordingContext();
        paintPlan(rec2.g, generated, layout);
        expect(rec2.named("createLinearGradient")).toHaveLength(1);
        expect(rec2.named("arc").length).toBeGreaterThan(0);
        expect(rec2.named("drawImage")).toHaveLength(0);
    });

    it("shrinks long end-zone text to fit the field's depth", () => {
        const fp = T.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES;
        const p = planField({
            fieldProperties: fp,
            style: "turf",
            params: {
                ...params,
                endZoneText: "A VERY LONG END ZONE NAME INDEED",
            },
        });
        const layout = textureLayout(p.footprint, 4096);
        const rec = recordingContext();
        const fonts: string[] = [];
        const g = new Proxy(rec.g as unknown as object, {
            set(obj, key, value) {
                if (key === "font") fonts.push(value as string);
                return Reflect.set(obj, key, value);
            },
        }) as CanvasRenderingContext2D;
        paintPlan(g, p, layout);
        const size = (font: string) => parseFloat(font.split(" ")[1]);
        const ez = fonts.filter((f) => f.startsWith("700"));
        // set once, then shrunk
        expect(ez.length).toBe(4);
        expect(size(ez[1])).toBeLessThan(size(ez[0]));
    });
});

describe("buildFieldSurface", () => {
    const cases = {
        HS: T.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES,
        NFL: T.PRO_FOOTBALL_FIELD_WITH_END_ZONES,
        indoor: T.INDOOR_50x70_8to5,
    };
    for (const [name, fp] of Object.entries(cases))
        for (const style of ["turf", "theme", "tarp"] as const)
            it(`${name} ${style}: a plane over the footprint at y = 0.02`, () => {
                const f = fieldFootprint(fp);
                const s = buildFieldSurface({
                    fieldProperties: fp,
                    style,
                    params,
                });
                const g = s.mesh.geometry as PlaneGeometry;
                expect(g.parameters.width).toBeCloseTo(f.maxX - f.minX, 9);
                expect(g.parameters.height).toBeCloseTo(f.maxZ - f.minZ, 9);
                expect(s.mesh.rotation.x).toBeCloseTo(-Math.PI / 2, 9);
                expect(s.mesh.position.x).toBeCloseTo((f.minX + f.maxX) / 2, 9);
                expect(s.mesh.position.y).toBe(FIELD_SURFACE_Y);
                expect(s.mesh.position.z).toBeCloseTo((f.minZ + f.maxZ) / 2, 9);
                // world bounds after the rotation
                s.mesh.updateMatrixWorld();
                g.computeBoundingBox();
                const box = g
                    .boundingBox!.clone()
                    .applyMatrix4(s.mesh.matrixWorld);
                expect(box.min.x).toBeCloseTo(f.minX, 4);
                expect(box.max.x).toBeCloseTo(f.maxX, 4);
                expect(box.min.z).toBeCloseTo(f.minZ, 4);
                expect(box.max.z).toBeCloseTo(f.maxZ, 4);
                expect(s.mesh.receiveShadow).toBe(true);
                s.dispose();
            });

    it("makes an sRGB texture, 4096 px long, with high anisotropy", () => {
        const fp = T.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES;
        const s = buildFieldSurface({
            fieldProperties: fp,
            style: "turf",
            params,
        });
        const tex = s.mesh.material.map as CanvasTexture;
        const canvas = tex.image as HTMLCanvasElement;
        expect(tex.colorSpace).toBe(SRGBColorSpace);
        expect(tex.anisotropy).toBe(16);
        expect(canvas.width).toBe(4096);
        const f = fieldFootprint(fp);
        expect(canvas.height).toBe(
            Math.round((4096 * (f.maxZ - f.minZ)) / (f.maxX - f.minX)),
        );
        s.dispose();
    });

    it("uses 8192 px when the GPU allows it", () => {
        expect(textureLongSide()).toBe(4096);
        expect(textureLongSide(16384)).toBe(8192);
        expect(textureLongSide(8192)).toBe(8192);
        expect(textureLongSide(4096)).toBe(4096);
        expect(textureLongSide(2048)).toBe(2048);
        const s = buildFieldSurface({
            fieldProperties: T.INDOOR_50x70_8to5,
            style: "tarp",
            params,
            maxTextureSize: 16384,
            anisotropy: 4,
        });
        const tex = s.mesh.material.map as CanvasTexture;
        expect((tex.image as HTMLCanvasElement).width).toBe(8192);
        expect(tex.anisotropy).toBe(4);
        s.dispose();
    });

    it("disposes its geometry, material and texture", () => {
        const s = buildFieldSurface({
            fieldProperties: T.PRO_FOOTBALL_FIELD_WITH_END_ZONES,
            style: "turf",
            params,
        });
        const disposed: string[] = [];
        s.mesh.geometry.addEventListener("dispose", () =>
            disposed.push("geometry"),
        );
        s.mesh.material.addEventListener("dispose", () =>
            disposed.push("material"),
        );
        s.mesh.material.map!.addEventListener("dispose", () =>
            disposed.push("texture"),
        );
        s.dispose();
        expect(disposed.sort()).toEqual(["geometry", "material", "texture"]);
    });

    it("resolves ready without a font API", async () => {
        const s = buildFieldSurface({
            fieldProperties: T.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES,
            style: "turf",
            params,
        });
        await expect(s.ready).resolves.toBeUndefined();
        s.dispose();
    });
});
