// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
    BODY_TYPES,
    bassOptions,
    fillToNumber,
    HEIGHT_CLASSES,
    SKIN_TONES,
    classSuffix,
    classTag,
    defaultPerformerBody,
    heightClassFor,
    PART,
    bodyKey,
    partVisible,
    sectionUniform,
    uniformKey,
} from "../looks";
import {
    DEFAULT_GUARD_UNIFORM_PRESET,
    DEFAULT_UNIFORM_PRESET,
    GUARD_UNIFORM_PRESET_IDS,
    UNIFORM_PRESETS,
    UNIFORM_PRESET_IDS,
    guardLookOf,
    guardUniformPresetOf,
    uniformPresetOf,
} from "../uniformPresets";
import type { GuardModelId } from "../../instruments/model";

const assets = path.resolve(__dirname, "../../../assets/om-pose");
const manifest = JSON.parse(
    fs.readFileSync(path.join(assets, "manifest.json"), "utf8"),
) as { clips: { name: string; base: string; height: number }[] };

describe("performer bodies", () => {
    it("derives the same body for the same marcher every time", () => {
        expect(defaultPerformerBody(42)).toEqual(defaultPerformerBody(42));
    });

    it("spreads 2,000 marchers over every body type and skin tone", () => {
        const types = new Map<string, number>();
        const tones = new Map<number, number>();
        for (let id = 1; id <= 2000; id++) {
            const b = defaultPerformerBody(id);
            types.set(b.bodyType, (types.get(b.bodyType) ?? 0) + 1);
            tones.set(b.skinTone, (tones.get(b.skinTone) ?? 0) + 1);
            expect(b.heightClass).toBe(1); // the low tier: one height
        }
        expect(types.size).toBe(BODY_TYPES.length);
        expect(tones.size).toBe(SKIN_TONES.length);
        // roughly even: every type within 30% of 2000 / 7
        for (const n of types.values())
            expect(Math.abs(n - 2000 / 7)).toBeLessThan((0.3 * 2000) / 7);
    });

    it("varies heights a quarter short, half middle, a quarter tall at high quality", () => {
        const n = new Map<number, number>();
        for (let id = 1; id <= 2000; id++) {
            const h = defaultPerformerBody(id, {
                varyHeight: true,
            }).heightClass;
            n.set(h, (n.get(h) ?? 0) + 1);
        }
        expect([...n.keys()].sort()).toEqual([0.95, 1, 1.05]);
        expect(Math.abs(n.get(0.95)! / 2000 - 0.25)).toBeLessThan(0.03);
        expect(Math.abs(n.get(1)! / 2000 - 0.5)).toBeLessThan(0.03);
        expect(Math.abs(n.get(1.05)! / 2000 - 0.25)).toBeLessThan(0.03);
    });

    it("keeps a marcher's body type and skin tone whatever the tier", () => {
        for (let id = 1; id <= 50; id++) {
            const low = defaultPerformerBody(id);
            const high = defaultPerformerBody(id, { varyHeight: true });
            expect(high.bodyType).toBe(low.bodyType);
            expect(high.skinTone).toBe(low.skinTone);
        }
    });

    it("picks the height class nearest height / 1.80 m", () => {
        expect(heightClassFor(1.8)).toBe(1);
        expect(heightClassFor(1.62)).toBe(0.9);
        expect(heightClassFor(1.5)).toBe(0.9);
        expect(heightClassFor(1.71)).toBe(0.95);
        expect(heightClassFor(1.89)).toBe(1.05);
        expect(heightClassFor(2.1)).toBe(1.1);
    });

    it("names every class's clips the way the manifest does", () => {
        for (const h of HEIGHT_CLASSES) {
            const name = `attention${classSuffix(h)}`;
            const clip = manifest.clips.find((c) => c.name === name);
            expect(clip?.height).toBe(h);
        }
        expect(classTag(0.9)).toBe("h090");
        expect(classTag(1)).toBe("h100");
        expect(classTag(1.1)).toBe("h110");
    });

    it("has a bundled body for every body type and a pack for every class", () => {
        for (const t of BODY_TYPES)
            expect(fs.existsSync(path.join(assets, "bodies", `${t}.glb`))).toBe(
                true,
            );
        for (const h of HEIGHT_CLASSES)
            expect(
                fs.existsSync(
                    path.join(assets, "clips", `clips-${classTag(h)}.glb`),
                ),
            ).toBe(true);
    });
});

describe("section uniforms", () => {
    it("leaves the shako off the guard sections only", () => {
        for (const g of ["Color Guard", "Rifle", "Flag", "Dancer", "Twirler"])
            expect(sectionUniform(g).options.hat).toBe(false);
        for (const b of ["Trumpet", "Snare", "Flute", "Drum Major", "Unknown"])
            expect(sectionUniform(b).options.hat).toBe(true);
    });

    it("puts the section's carry, gold lacquer and the hold in the look", () => {
        const u = sectionUniform("Trumpet");
        expect(u.options.carry).toEqual({ model: "trumpet", family: "brass" });
        expect(u.options.finish).toBe("brass");
        expect(u.options.hold).toBe("up");
        expect(u.options.instrument).toBe("none");
        expect(sectionUniform("Trumpet", "carry").options.hold).toBe("carry");
        expect(sectionUniform("Drum Major").options.carry).toBeNull();
    });

    it("gives every guard section the chosen equipment, and no one else", () => {
        const pick = (section: string, guard?: GuardModelId) =>
            sectionUniform(section, "up", undefined, undefined, guard).options
                .carry;
        expect(pick("Color Guard")).toEqual({ model: "flag6", family: "flag" });
        expect(pick("Rifle")).toEqual({ model: "rifle", family: "rifle" });
        expect(pick("Color Guard", "sabre")).toEqual({
            model: "sabre",
            family: "sabre",
        });
        expect(pick("Rifle", "doubleSwingFlag")).toEqual({
            model: "doubleSwingFlag",
            family: "doubleSwingFlag",
        });
        expect(pick("Dancer", "swingFlag")).toEqual({
            model: "swingFlag",
            family: "swingFlag",
        });
        expect(pick("Flag", "rifle")).toEqual({
            model: "rifle",
            family: "rifle",
        });
        expect(pick("Trumpet", "sabre")).toEqual({
            model: "trumpet",
            family: "brass",
        });
    });

    it("never shows the placeholder instruments, for any section", () => {
        for (const s of ["Trumpet", "Mellophone", "Baritone", "Flute"])
            for (const part of PART.instruments)
                expect(partVisible(sectionUniform(s), part)).toBe(false);
    });

    it("keys looks by carry, finish and hold", () => {
        const a = uniformKey(sectionUniform("Trumpet", "up"));
        const b = uniformKey(sectionUniform("Trumpet", "carry"));
        expect(a).not.toBe(b);
    });

    it("keys what a look draws on the body, whatever it carries or holds", () => {
        expect(bodyKey(sectionUniform("Trumpet", "up"))).toBe(
            bodyKey(sectionUniform("Trumpet", "carry")),
        );
        // the carry and its fill color don't reach the body
        expect(bodyKey(sectionUniform("Trumpet"))).toBe(
            bodyKey(sectionUniform("Snare Drum", "up", undefined, 0xc8102e)),
        );
        expect(bodyKey(sectionUniform("Dancer"))).not.toBe(
            bodyKey(sectionUniform("Drum Major")),
        );
        const red = sectionUniform("Trumpet");
        red.colors.primary = 0xff0000;
        expect(bodyKey(red)).not.toBe(bodyKey(sectionUniform("Trumpet")));
    });

    it("dresses band sections in the band preset's look, West Point by default", () => {
        expect(DEFAULT_UNIFORM_PRESET).toBe("westPoint");
        for (const b of [
            "Trumpet",
            "Snare",
            "Flute",
            "Drum Major",
            "Unknown",
        ]) {
            const u = sectionUniform(b);
            expect(u.style).toBe("cadet");
            expect(u.colors).toEqual(UNIFORM_PRESETS.westPoint.band.colors);
            expect(u.colors.primary).toBe(0x6442ff);
            expect(u.options).toMatchObject(
                UNIFORM_PRESETS.westPoint.band.options,
            );
            for (const id of UNIFORM_PRESET_IDS) {
                const p = sectionUniform(
                    b,
                    "up",
                    undefined,
                    undefined,
                    undefined,
                    id,
                );
                expect(p.style).toBe(UNIFORM_PRESETS[id].band.style);
                expect(p.colors).toEqual(UNIFORM_PRESETS[id].band.colors);
            }
        }
    });

    it("dresses guard sections in the guard preset's look, Royal Sash by default: plain, bare hands, no hat", () => {
        expect(DEFAULT_GUARD_UNIFORM_PRESET).toBe("sash");
        for (const g of ["Color Guard", "Rifle", "Flag", "Dancer", "Twirler"]) {
            expect(sectionUniform(g).colors).toEqual(
                UNIFORM_PRESETS.sash.guard!.colors,
            );
            for (const id of GUARD_UNIFORM_PRESET_IDS) {
                const u = sectionUniform(
                    g,
                    "up",
                    undefined,
                    undefined,
                    undefined,
                    "westPoint",
                    id,
                );
                expect(u.colors).toEqual(guardLookOf(id).colors);
                expect(u.options).toMatchObject({
                    stripe: false,
                    collar: false,
                    cuffs: false,
                    gloves: false,
                    hat: false,
                });
            }
        }
    });

    it("picks the band's and the guard's presets apart", () => {
        const at = (
            section: string,
            band: "fade" | "military",
            guard: "fade" | "military",
        ) =>
            sectionUniform(
                section,
                "up",
                undefined,
                undefined,
                undefined,
                band,
                guard,
            );
        // the band preset never dresses the guard, nor the guard preset the band
        expect(at("Trumpet", "fade", "military").colors).toEqual(
            at("Trumpet", "fade", "fade").colors,
        );
        expect(at("Color Guard", "fade", "military").colors).toEqual(
            at("Color Guard", "military", "military").colors,
        );
        // drum shells take the band's carry, silks the guard's
        expect(at("Snare", "fade", "military").options.carryColor).toBe(
            UNIFORM_PRESETS.fade.carry,
        );
        expect(at("Flag", "fade", "military").options.carryColor).toBe(
            UNIFORM_PRESETS.military.carry,
        );
        expect(at("Flag", "fade", "military").options.silk).toBe("military");
    });

    it("offers every preset to the band and only those with a guard look to the guard", () => {
        for (const id of UNIFORM_PRESET_IDS)
            expect(Boolean(UNIFORM_PRESETS[id].guard), id).toBe(
                (GUARD_UNIFORM_PRESET_IDS as readonly string[]).includes(id),
            );
        expect(GUARD_UNIFORM_PRESET_IDS).not.toContain("westPoint");
        expect(() => guardLookOf("westPoint" as never)).toThrow();
        expect(uniformPresetOf("westPoint")).toBe("westPoint");
        expect(uniformPresetOf("plaid")).toBe("westPoint");
        expect(guardUniformPresetOf("westPoint")).toBe("sash");
        expect(guardUniformPresetOf(undefined)).toBe("sash");
        expect(guardUniformPresetOf("prism")).toBe("prism");
    });

    it("groups looks by band vs guard, never by section name or fill", () => {
        // no carry: every band section shares one look, every guard section another
        expect(uniformKey(sectionUniform("Drum Major"))).toBe(
            uniformKey(sectionUniform("Soloist")),
        );
        expect(
            uniformKey(sectionUniform("Drum Major", "up", undefined, 0xc8102e)),
        ).toBe(
            uniformKey(sectionUniform("Soloist", "up", undefined, 0x10ff10)),
        );
        expect(
            uniformKey(sectionUniform("Dancer", "up", undefined, 0xc8102e)),
        ).toBe(uniformKey(sectionUniform("Dancer")));
        expect(sectionUniform("Color Guard").colors).toEqual(
            sectionUniform("Dancer").colors,
        );
        expect(uniformKey(sectionUniform("Dancer"))).not.toBe(
            uniformKey(sectionUniform("Drum Major")),
        );
        expect(uniformKey(sectionUniform("Drum Major"))).not.toBe(
            uniformKey(sectionUniform("Trumpet")),
        );
    });

    it("keeps the 2D fill off the uniform; it only colors what the section carries", () => {
        const red = sectionUniform("Snare", "up", undefined, 0xc8102e);
        expect(red.colors).toEqual(sectionUniform("Snare").colors);
        expect(red.options.carryColor).toBe(0xc8102e);
        expect(sectionUniform("Snare").options.carryColor).toBe(
            UNIFORM_PRESETS.westPoint.carry,
        );
        expect(
            sectionUniform("Drum Major", "up", undefined, 0xc8102e).options
                .carryColor,
        ).toBeNull();
    });

    it("paints the preset's silk pattern only on carries without a fill", () => {
        expect(sectionUniform("Color Guard").options.silk).toBe("sash");
        expect(
            sectionUniform("Color Guard", "up", undefined, 0xc8102e).options
                .silk,
        ).toBeNull();
        expect(sectionUniform("Drum Major").options.silk).toBeNull();
        for (const id of GUARD_UNIFORM_PRESET_IDS) {
            const silk = UNIFORM_PRESETS[id].silk;
            expect(
                sectionUniform(
                    "Flag",
                    "up",
                    undefined,
                    undefined,
                    undefined,
                    "westPoint",
                    id,
                ).options.silk,
            ).toBe(silk ? id : null);
        }
    });

    it("gives every silk pattern an sRGB color across the whole silk", () => {
        for (const id of UNIFORM_PRESET_IDS) {
            const silk = UNIFORM_PRESETS[id].silk;
            if (!silk) continue;
            for (let u = 0; u <= 1; u += 0.05)
                for (let v = 0; v <= 1; v += 0.05) {
                    const c = silk(u, v);
                    expect(Number.isInteger(c)).toBe(true);
                    expect(c).toBeGreaterThanOrEqual(0);
                    expect(c).toBeLessThanOrEqual(0xffffff);
                }
        }
    });

    it("turns a 2D fill into an sRGB number", () => {
        expect(fillToNumber({ r: 200, g: 16, b: 46, a: 1 })).toBe(0xc8102e);
    });

    it("hides exactly the parts the shader would discard", () => {
        const visible = (section: string) =>
            Array.from({ length: 16 }, (_, p) => p).filter((p) =>
                partVisible(sectionUniform(section), p),
            );
        // body parts 0-6 always; shako 7-9; the placeholder instruments 13-15 never
        expect(visible("Trumpet")).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(visible("Mellophone")).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(visible("Baritone")).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(visible("Flute")).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(visible("Color Guard")).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });
});

describe("bass drum sizes", () => {
    it("spreads the Bass Drum section over the sizes in marcher order", () => {
        const ids = [5, 9, 2, 7, 11];
        const sections = [
            "Bass Drum",
            "Trumpet",
            "Bass Drum",
            "Flub Drum",
            "Bass Drum",
        ];
        const o = bassOptions(ids, sections);
        expect(o[1]).toBeUndefined();
        // four bass players: 18, 22, 28, 32 in id order 2, 5, 7, 11
        expect(o[2]?.bassInches).toBe(18);
        expect(o[0]?.bassInches).toBe(22);
        expect(o[3]?.bassInches).toBe(28);
        expect(o[4]?.bassInches).toBe(32);
    });

    it("gives a lone bass drum the middle size", () => {
        expect(bassOptions([1], ["Bass Drum"])[0]?.bassInches).toBe(26);
    });

    it("carries the size into the look so sizes get their own meshes", () => {
        const a = sectionUniform("Bass Drum", "up", { bassInches: 18 });
        const b = sectionUniform("Bass Drum", "up", { bassInches: 32 });
        expect(a.options.carry?.options?.bassInches).toBe(18);
        expect(uniformKey(a)).not.toBe(uniformKey(b));
    });
});
