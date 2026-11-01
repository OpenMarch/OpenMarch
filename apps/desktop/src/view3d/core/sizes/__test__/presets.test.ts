// @vitest-environment node
import { describe, expect, it } from "vitest";
import { catalogEntry, silkDepthM } from "../catalog";
import {
    SIZE_PRESET_VERSION,
    makeSizePreset,
    parseSizePreset,
    presetFromCatalog,
} from "../presets";
import { enterLength, formatLength } from "../units";

const ID = "6f1c7a52-5f0e-4f3e-9b8a-2d7c1e4b9a10";
const AT = "2026-10-11T12:00:00.000Z";

describe("size presets", () => {
    it("round-trips a typed custom size through JSON", () => {
        const preset = makeSizePreset("silk", {
            id: ID,
            name: "  Ballad silk ",
            createdAt: AT,
            dims: {
                header: enterLength(`3' 1"`)!,
                fly: enterLength("55 1/2 in")!,
            },
        });
        expect(preset.name).toBe("Ballad silk");
        expect(preset.version).toBe(SIZE_PRESET_VERSION);

        const restored = parseSizePreset(JSON.parse(JSON.stringify(preset)));
        expect(restored).toEqual(preset);
        if (restored?.kind !== "silk") throw new Error("expected a silk");
        expect(formatLength(restored.dims.header, "metric")).toBe(`3' 1"`);
        expect(formatLength(restored.dims.fly, "imperial")).toBe("55 1/2 in");
    });

    it("keeps full-precision meters for metric input", () => {
        const preset = makeSizePreset("rifle", {
            id: ID,
            name: "Short rifle",
            createdAt: AT,
            dims: { length: enterLength("0.8123456 m")! },
        });
        const restored = parseSizePreset(JSON.parse(JSON.stringify(preset)));
        expect(restored?.dims).toEqual({ length: { m: 0.8123456 } });
    });

    it("starts from a catalog size", () => {
        const preset = presetFromCatalog(catalogEntry("t-pole-2-tier")!, {
            id: ID,
            name: "Our T-pole",
            createdAt: AT,
        });
        expect(parseSizePreset(preset)).toEqual(preset);
        if (preset.kind !== "tPole") throw new Error("expected a T-pole");
        expect(preset.dims.crossbars.map((c) => c.typed)).toEqual([
            "30 in",
            "36 in",
        ]);
    });

    it("rejects malformed presets", () => {
        const valid = makeSizePreset("floor", {
            id: ID,
            name: "Gym floor",
            createdAt: AT,
            dims: {
                width: enterLength("70 ft")!,
                depth: enterLength("50 ft")!,
            },
        });
        expect(parseSizePreset(valid)).not.toBeNull();
        for (const bad of [
            null,
            {},
            { ...valid, version: 2 },
            { ...valid, id: "not-a-uuid" },
            { ...valid, name: "  " },
            { ...valid, createdAt: "yesterday" },
            { ...valid, kind: "rifle" },
            { ...valid, kind: "unknown" },
            { ...valid, dims: { width: { m: -1 }, depth: { m: 1 } } },
            { ...valid, dims: { width: { m: Infinity }, depth: { m: 1 } } },
        ])
            expect(parseSizePreset(bad), JSON.stringify(bad)).toBeNull();
    });

    it("parses a silk's optional depth and sag (Q39, Q40)", () => {
        const hanging = makeSizePreset("silk", {
            id: ID,
            name: "Our oversized swing",
            createdAt: AT,
            dims: {
                header: enterLength("42 in")!,
                fly: enterLength("56 in")!,
                depth: enterLength("84 in")!,
            },
        });
        const restored = parseSizePreset(JSON.parse(JSON.stringify(hanging)));
        expect(restored).toEqual(hanging);
        if (restored?.kind !== "silk") throw new Error("expected a silk");
        expect(silkDepthM(restored.dims)).toBe(enterLength("84 in")!.m);

        const plain = parseSizePreset({
            ...hanging,
            dims: { header: hanging.dims.header, fly: hanging.dims.fly },
        });
        if (plain?.kind !== "silk") throw new Error("expected a silk");
        expect(plain.dims.depth).toBeUndefined();
        expect(plain.dims.sag).toBeUndefined();
        expect(silkDepthM(plain.dims)).toBe(plain.dims.header.m);

        const sagged = parseSizePreset({
            ...hanging,
            dims: {
                header: hanging.dims.header,
                fly: hanging.dims.fly,
                sag: enterLength("10 1/2 in")!,
            },
        });
        if (sagged?.kind !== "silk") throw new Error("expected a silk");
        expect(sagged.dims.sag?.typed).toBe("10 1/2 in");

        for (const dims of [
            { ...hanging.dims, depth: enterLength("40 in")! },
            { ...hanging.dims, depth: { m: -1 } },
            { ...hanging.dims, sag: { m: -1 } },
        ])
            expect(parseSizePreset({ ...hanging, dims })).toBeNull();
    });

    it("keeps a catalog Cut's depth when saved as a preset", () => {
        const preset = presetFromCatalog(
            catalogEntry("silk-super-swing-44x84")!,
            { id: ID, name: "Super swing", createdAt: AT },
        );
        expect(parseSizePreset(preset)).toEqual(preset);
        if (preset.kind !== "silk") throw new Error("expected a silk");
        expect(preset.dims.depth?.typed).toBe("84 in");
    });
});
