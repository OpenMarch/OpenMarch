import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
    BODY_TYPES,
    bassOptions,
    HEIGHT_CLASSES,
    SKIN_TONES,
    classSuffix,
    classTag,
    defaultPerformerBody,
    heightClassFor,
    PART,
    partVisible,
    sectionUniform,
    uniformKey,
} from "../looks";
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
            expect(sectionUniform(g, null).options.hat).toBe(false);
        for (const b of ["Trumpet", "Snare", "Flute", "Drum Major", "Unknown"])
            expect(sectionUniform(b, null).options.hat).toBe(true);
    });

    it("puts the section's carry, gold lacquer and the hold in the look", () => {
        const u = sectionUniform("Trumpet", null);
        expect(u.options.carry).toEqual({ model: "trumpet", family: "brass" });
        expect(u.options.finish).toBe("brass");
        expect(u.options.hold).toBe("up");
        expect(u.options.instrument).toBe("none");
        expect(sectionUniform("Trumpet", null, "carry").options.hold).toBe(
            "carry",
        );
        expect(sectionUniform("Drum Major", null).options.carry).toBeNull();
    });

    it("gives every guard section the chosen equipment, and no one else", () => {
        const pick = (section: string, guard?: GuardModelId) =>
            sectionUniform(section, null, "up", undefined, guard).options.carry;
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
                expect(partVisible(sectionUniform(s, null), part)).toBe(false);
    });

    it("keys looks by carry, finish and hold", () => {
        const a = uniformKey(sectionUniform("Trumpet", null, "up"));
        const b = uniformKey(sectionUniform("Trumpet", null, "carry"));
        expect(a).not.toBe(b);
    });

    it("uses the section's fill color for the jacket and hat", () => {
        const u = sectionUniform("Trumpet", { r: 200, g: 16, b: 46, a: 1 });
        expect(u.colors.primary).toBe(0xc8102e);
        expect(u.colors.hat).toBe(0xc8102e);
    });

    it("shares one look between sections that only differ in name when the instrument matches", () => {
        const fill = { r: 10, g: 20, b: 30, a: 1 };
        expect(uniformKey(sectionUniform("Drum Major", fill))).toBe(
            uniformKey(sectionUniform("Soloist", fill)),
        );
        expect(uniformKey(sectionUniform("Drum Major", fill))).not.toBe(
            uniformKey(sectionUniform("Trumpet", fill)),
        );
    });

    it("hides exactly the parts the shader would discard", () => {
        const visible = (section: string) =>
            Array.from({ length: 16 }, (_, p) => p).filter((p) =>
                partVisible(sectionUniform(section, null), p),
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
        const a = sectionUniform("Bass Drum", null, "up", { bassInches: 18 });
        const b = sectionUniform("Bass Drum", null, "up", { bassInches: 32 });
        expect(a.options.carry?.options?.bassInches).toBe(18);
        expect(uniformKey(a)).not.toBe(uniformKey(b));
    });
});
