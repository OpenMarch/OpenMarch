// @vitest-environment node
import { describe, expect, it } from "vitest";
import { compileCues, type CueInput } from "@openmarch/core";
import type { ShowLibraryItem } from "@/db-functions/showLibrary";
import {
    cueLibraryItemsOf,
    cueSectionsOf,
    flagEquipmentOf,
    silkCutAspect,
} from "../cueAspects";

const INCH = 0.0254;

function artwork(
    itemId: string,
    surface: string,
    widthIn: number,
    heightIn: number,
): ShowLibraryItem {
    return {
        itemId,
        versionHash: "a1b2c3",
        kind: "artwork",
        name: `Artwork ${itemId}`,
        builtIn: false,
        metadata: {} as ShowLibraryItem["metadata"],
        pins: [],
        parts: {},
        embeddedAt: "2026-10-18T00:00:00Z",
        sidecar: {
            schemaVersion: 1,
            type: "openmarch-artwork",
            surface,
            original: {
                format: "png",
                page: null,
                pixels: { width: 1000, height: 1000 },
                colorSpace: "srgb",
            },
            size: {
                width: { m: widthIn * INCH, typed: `${widthIn} in` },
                height: { m: heightIn * INCH, typed: `${heightIn} in` },
                source: "template",
                templateId: null,
            },
            nativeDpi: 150,
            display: { width: 1000, height: 1000, format: "png" },
            importNotes: [],
            badges: [],
        },
    };
}

describe("silkCutAspect", () => {
    it("is the template's fly ÷ overall depth", () => {
        expect(silkCutAspect("silk-6ft-36x54")).toBeCloseTo(54 / 36);
        expect(silkCutAspect("silk-swing-44x66")).toBeCloseTo(66 / 44);
    });

    it("uses the trim box for a Cut that hangs below the pole", () => {
        // Teardrop: header 44, fly 74, overall depth 79.625
        expect(silkCutAspect("silk-teardrop-44x74")).toBeCloseTo(74 / 79.625);
    });

    it("is undefined for an unknown or non-silk entry", () => {
        expect(silkCutAspect("nope")).toBeUndefined();
    });
});

describe("cueLibraryItemsOf", () => {
    it("gives each Silk Artwork Version its chosen size's aspect", () => {
        expect(
            cueLibraryItemsOf([
                artwork("silk-1", "silk", 54, 36),
                artwork("floor-1", "baseFloor", 100, 50),
                { ...artwork("bad", "silk", 1, 1), sidecar: null },
            ]),
        ).toEqual([
            {
                id: "library:silk-1@a1b2c3",
                channel: "silk",
                name: "Artwork silk-1",
                aspect: 54 / 36,
            },
        ]);
    });
});

describe("cueSectionsOf", () => {
    it("gives a section whose performers all carry one flag that flag", () => {
        const sections = cueSectionsOf([
            { section: "Trumpet", family: "brass" },
            { section: "Color Guard", family: "flag" },
            { section: "Color Guard", family: "flag" },
            { section: "Swing", family: "swingFlag" },
            { section: "Mixed", family: "flag" },
            { section: "Mixed", family: "rifle" },
        ]);

        expect(sections.map((s) => [s.name, s.equipment?.id])).toEqual([
            ["Color Guard", "builtin:model.flag6"],
            ["Swing", "builtin:model.swingFlag"],
        ]);
        expect(sections[0]!.equipment).toMatchObject({
            holds: "flag",
            aspect: silkCutAspect("silk-6ft-36x54"),
        });
    });

    it("gives no equipment for anything but a flag", () => {
        expect(flagEquipmentOf("rifle")).toBeUndefined();
        expect(flagEquipmentOf(null)).toBeUndefined();
    });
});

describe("the Silk aspect note from the show's Library and flags", () => {
    const marchers = [
        {
            id: 1,
            section: "Color Guard",
            tagIds: [],
            drillOrder: 0,
            carries: "flag" as const,
        },
    ];
    const silkCue = (id: number, value: string): CueInput => ({
        id,
        channel: "silk",
        kind: "state",
        beatId: 1,
        value,
        target: { kind: "band" },
    });
    const compile = (cues: CueInput[]) =>
        compileCues({
            beats: Array.from({ length: 8 }, (_, i) => ({
                id: i + 1,
                duration: 0.5,
            })),
            marchers,
            cues,
            libraryItems: cueLibraryItemsOf([
                artwork("matches", "silk", 54, 36),
                artwork("square", "silk", 36, 36),
            ]),
            sections: cueSectionsOf([
                { section: "Color Guard", family: "flag" },
            ]),
        });

    it("notes an Artwork of another aspect than the 6 ft flag's Cut", () => {
        expect(compile([silkCue(10, "library:square@a1b2c3")]).notes).toEqual([
            { kind: "silk_aspect", cueIds: [10], marcherIds: [1] },
        ]);
    });

    it("doesn't note an Artwork made on the Cut's template", () => {
        expect(compile([silkCue(11, "library:matches@a1b2c3")]).notes).toEqual(
            [],
        );
    });
});
