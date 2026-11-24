import { describe, expect, it } from "vitest";
import { ShaderChunk, ShaderLib, MeshStandardMaterial } from "three";
import FieldPropertiesTemplates from "../../../../global/classes/FieldProperties.templates";
import { planField, type TurfColors } from "..";
import { hasBlockGlyphs } from "../blockDigits";
import {
    applyTurfSheen,
    patchTurfShader,
    TURF_SHEEN_CHUNKS,
    TURF_SPECULAR,
} from "../turfSheen";

const params = {
    homeColor: "#6442ff",
    awayColor: "#c23b3b",
    endZoneText: "",
    endZoneColor: "#1f2a5c",
};
const grass: TurfColors = {
    base: "#111111",
    stripeDark: "#222222",
    stripeLight: "#333333",
};
const grainOf = (turf?: TurfColors) =>
    planField({
        fieldProperties:
            FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES,
        style: "turf",
        params,
        turf,
    }).items.find((i) => i.type === "grain");

describe("synthetic turf", () => {
    it("grains the turf by its surface, grass by default", () => {
        expect(grainOf()).toMatchObject({ surface: "grass" });
        expect(grainOf(grass)).toMatchObject({ surface: "grass" });
        expect(grainOf({ ...grass, surface: "synthetic" })).toMatchObject({
            surface: "synthetic",
        });
    });

    it("has block numerals for every digit", () => {
        expect(hasBlockGlyphs("0123456789")).toBe(true);
        expect(hasBlockGlyphs("G")).toBe(false);
        expect(hasBlockGlyphs("")).toBe(false);
    });

    it("hooks shader chunks three still has", () => {
        const { vertexShader, fragmentShader } = ShaderLib.standard;
        for (const chunk of TURF_SHEEN_CHUNKS.vertex)
            expect(vertexShader).toContain(chunk);
        for (const chunk of TURF_SHEEN_CHUNKS.fragment)
            expect(fragmentShader).toContain(chunk);
        expect(ShaderChunk.map_fragment).toContain("diffuseColor");
        const shader = {
            vertexShader,
            fragmentShader,
            uniforms: {} as Record<string, { value: unknown }>,
        };
        patchTurfShader(shader, 0.02);
        expect(shader.uniforms.uTurfLay.value).toBe(0.02);
        expect(shader.vertexShader).toContain("vTurfWorld =");
        expect(shader.fragmentShader).toContain("uTurfLay * turfSide");
        expect(shader.fragmentShader).toContain("fwidth(turfTuft)");
        // The fibers' dull specular, set after three's own.
        const lit = shader.fragmentShader.indexOf(
            "#include <lights_physical_fragment>",
        );
        const dulled = shader.fragmentShader.indexOf("material.specularF90 *=");
        expect(lit).toBeGreaterThan(-1);
        expect(dulled).toBeGreaterThan(lit);
    });

    it("dulls the fibers' specular well below a plain dielectric's", () => {
        expect(TURF_SPECULAR).toBeGreaterThan(0);
        expect(TURF_SPECULAR).toBeLessThan(0.5);
    });

    it("gives the material its own program", () => {
        const m = new MeshStandardMaterial();
        applyTurfSheen(m);
        expect(m.customProgramCacheKey()).toMatch(/^turfSheen/);
    });
});
