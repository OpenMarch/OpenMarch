// @vitest-environment node
import { describe, expect, it } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { pitVariant } from "../catalog";
import { isOnPlayingSpot, playingSpotOf } from "../playingSpot";
import {
    FEET,
    PIT_PRESET_SIZES,
    pitPreset,
    pitPresetContents,
    pitPresetOnCanvas,
    type PitPreset,
    type PitPresetEquipment,
    type PitPresetSize,
} from "../presets";

const countOf = (preset: PitPreset, familyId: string) =>
    preset.equipment.filter((e) => e.familyId === familyId).length;

const footprintOf = (e: PitPresetEquipment) =>
    pitVariant(e.variantId)!.footprint;

/** The box an item covers: x across, z toward the audience, meters */
const box = (e: PitPresetEquipment) => {
    const { width, depth } = footprintOf(e);
    return {
        left: e.x - width / 2,
        right: e.x + width / 2,
        near: e.z - depth / 2,
        far: e.z + depth / 2,
    };
};

const of = (preset: PitPreset, familyId: string) =>
    preset.equipment.filter((e) => e.familyId === familyId);

/** The yard line (50, 45, ... 0) an x in meters from the 50 stands on */
const yardLine = (x: number) => 50 - Math.abs(x) / (15 * FEET) / (1 / 5);

describe("pitPreset", () => {
    it.each<[PitPresetSize, Record<string, number>]>([
        [
            "small",
            {
                marimba: 2,
                vibraphone: 2,
                xylophone: 0,
                glockenspiel: 0,
                auxRack: 1,
                drumSet: 0,
                synth: 1,
                speaker: 2,
                mixer: 1,
                podium: 1,
            },
        ],
        [
            "medium",
            {
                marimba: 4,
                vibraphone: 3,
                xylophone: 1,
                glockenspiel: 1,
                auxRack: 1,
                drumSet: 1,
                synth: 1,
                speaker: 4,
                mixer: 1,
                podium: 1,
            },
        ],
        [
            "large",
            {
                marimba: 6,
                vibraphone: 4,
                xylophone: 1,
                glockenspiel: 1,
                auxRack: 2,
                drumSet: 1,
                synth: 2,
                speaker: 6,
                mixer: 1,
                podium: 1,
            },
        ],
    ])("has the design's equipment for %s", (size, counts) => {
        const preset = pitPreset(size);
        for (const [familyId, count] of Object.entries(counts))
            expect(countOf(preset, familyId), familyId).toBe(count);
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        expect(preset.equipment).toHaveLength(total);
    });

    it("uses each family's default variant but the marimbas, unturned", () => {
        for (const size of PIT_PRESET_SIZES)
            for (const e of pitPreset(size).equipment) {
                const variant = pitVariant(e.variantId);
                expect(variant?.family).toBe(e.familyId);
                expect(e.rotation).toBe(0);
            }
        // 4.3-octave marimbas in Small and Medium, 4.6 in Large, never the 5.0 (owner, 2026-11-15)
        const marimbas = (size: PitPresetSize) =>
            new Set(of(pitPreset(size), "marimba").map((e) => e.variantId));
        expect(marimbas("small")).toEqual(new Set(["pit/marimba-4.3"]));
        expect(marimbas("medium")).toEqual(new Set(["pit/marimba-4.3"]));
        expect(marimbas("large")).toEqual(new Set(["pit/marimba-4.6"]));
        // Always the 3.0-octave vibes
        for (const size of PIT_PRESET_SIZES)
            for (const e of of(pitPreset(size), "vibraphone"))
                expect(e.variantId).toBe("pit/vibraphone-3.0");
    });

    it.each(PIT_PRESET_SIZES)("overlaps nothing at %s", (size) => {
        const boxes = pitPreset(size).equipment.map(box);
        for (const [i, a] of boxes.entries())
            for (const b of boxes.slice(i + 1)) {
                const apart =
                    a.right <= b.left ||
                    b.right <= a.left ||
                    a.far <= b.near ||
                    b.far <= a.near;
                expect(apart).toBe(true);
            }
    });

    it.each(PIT_PRESET_SIZES)(
        "keeps everything in front of the front sideline at %s",
        (size) => {
            for (const e of pitPreset(size).equipment)
                expect(box(e).near).toBeGreaterThan(0);
        },
    );

    it("starts the back line 3 ft out, and the keyboards 3 ft past its deepest item", () => {
        const medium = pitPreset("medium");
        const back = [
            "drumSet",
            "xylophone",
            "glockenspiel",
            "auxRack",
            "synth",
        ];
        for (const familyId of back)
            for (const e of of(medium, familyId))
                expect(box(e).near).toBeCloseTo(3 * FEET);
        const drumSet = of(medium, "drumSet")[0];
        for (const familyId of ["marimba", "vibraphone"])
            for (const e of of(medium, familyId))
                expect(box(e).near).toBeCloseTo(box(drumSet).far + 3 * FEET);
        // The doc's "about 11.6 ft out" with a drum set
        expect(box(of(medium, "marimba")[0]).near / FEET).toBeCloseTo(11.6, 0);
    });

    it("puts the drum set at center with the xylophone and glockenspiel either side", () => {
        const medium = pitPreset("medium");
        const [drumSet] = of(medium, "drumSet");
        const [xylophone] = of(medium, "xylophone");
        const [glockenspiel] = of(medium, "glockenspiel");
        expect(drumSet.x).toBeCloseTo(0);
        expect(Math.sign(xylophone.x)).toBe(-Math.sign(glockenspiel.x));
        const backLine = medium.equipment
            .filter((e) => box(e).near < 4 * FEET)
            .sort((a, b) => a.x - b.x)
            .map((e) => e.familyId);
        expect(backLine).toEqual([
            "auxRack",
            "xylophone",
            "drumSet",
            "glockenspiel",
            "synth",
        ]);
    });

    it("puts one rack and one synth at each outer edge of the back line with two of each", () => {
        const large = pitPreset("large");
        const backLine = large.equipment
            .filter((e) => box(e).near < 4 * FEET)
            .sort((a, b) => a.x - b.x)
            .map((e) => e.familyId);
        expect(backLine.slice(0, 2).sort()).toEqual(["auxRack", "synth"]);
        expect(backLine.slice(-2).sort()).toEqual(["auxRack", "synth"]);
        expect(backLine.slice(2, -2)).toEqual([
            "xylophone",
            "drumSet",
            "glockenspiel",
        ]);
    });

    it("puts the marimbas in the center of the keyboard row, the odd vibe on the left", () => {
        const medium = pitPreset("medium");
        const row = [...of(medium, "marimba"), ...of(medium, "vibraphone")]
            .sort((a, b) => a.x - b.x)
            .map((e) => e.familyId);
        expect(row).toEqual([
            "vibraphone",
            "vibraphone",
            "marimba",
            "marimba",
            "marimba",
            "marimba",
            "vibraphone",
        ]);
    });

    it("leaves about 2 ft between neighbors in a row", () => {
        const keyboards = [
            ...of(pitPreset("large"), "marimba"),
            ...of(pitPreset("large"), "vibraphone"),
        ]
            .map(box)
            .sort((a, b) => a.left - b.left);
        for (const [i, b] of keyboards.slice(1).entries())
            expect(b.left - keyboards[i].right).toBeCloseTo(2 * FEET);
    });

    it.each<[PitPresetSize, number[]]>([
        ["small", [40]],
        ["medium", [40, 35]],
        ["large", [35, 30, 25]],
    ])(
        "stands %s's speakers on consecutive 5-yard lines past the pit: %j",
        (size, lines) => {
            const preset = pitPreset(size);
            const speakers = of(preset, "speaker");
            for (const side of [-1, 1]) {
                const onSide = speakers
                    .filter((s) => Math.sign(s.x) === side)
                    .map((s) => Math.round(yardLine(s.x) * 1000) / 1000)
                    .sort((a, b) => b - a);
                expect(onSide).toEqual(lines);
            }
            const pitEnd = Math.max(
                ...preset.equipment
                    .filter(
                        (e) =>
                            !["speaker", "mixer", "podium"].includes(
                                e.familyId,
                            ),
                    )
                    .map((e) => Math.abs(box(e).right)),
                ...preset.equipment
                    .filter(
                        (e) =>
                            !["speaker", "mixer", "podium"].includes(
                                e.familyId,
                            ),
                    )
                    .map((e) => Math.abs(box(e).left)),
            );
            for (const s of speakers)
                expect(Math.abs(s.x)).toBeGreaterThanOrEqual(pitEnd + 2 * FEET);
            // On the keyboard row's line
            const keyboardLine = box(of(preset, "marimba")[0]).near;
            for (const s of speakers)
                expect(box(s).near).toBeCloseTo(keyboardLine);
        },
    );

    it.each(PIT_PRESET_SIZES)(
        "puts the podium on the 50, 3 ft past the keyboard row, its drum major closest to the audience at %s",
        (size) => {
            const preset = pitPreset(size);
            const [podium] = of(preset, "podium");
            expect(podium.x).toBeCloseTo(0);
            const keyboardsEnd = Math.max(
                ...of(preset, "marimba").map((e) => box(e).far),
            );
            expect(box(podium).near).toBeCloseTo(keyboardsEnd + 3 * FEET);

            const drumMajor = preset.performers.find(
                (p) => p.section === "Drum Major",
            )!;
            expect(drumMajor).toMatchObject({ x: podium.x, z: podium.z });
            expect(drumMajor.facing).toBe(180);
            const others = preset.performers.filter((p) => p !== drumMajor);
            for (const p of others) expect(p.z).toBeLessThan(drumMajor.z);
        },
    );

    it("puts the mixer behind the pit, off center", () => {
        for (const size of PIT_PRESET_SIZES) {
            const preset = pitPreset(size);
            const [mixer] = of(preset, "mixer");
            const keyboardsEnd = Math.max(
                ...of(preset, "marimba").map((e) => box(e).far),
            );
            expect(box(mixer).near).toBeCloseTo(keyboardsEnd + 6 * FEET);
            expect(mixer.x).toBeCloseTo(16 * FEET);
        }
    });

    it.each(PIT_PRESET_SIZES)(
        "puts a player on each instrument's playing spot at %s, facing the audience",
        (size) => {
            const preset = pitPreset(size);
            const sections: Record<string, string> = {
                marimba: "Marimba",
                vibraphone: "Vibraphone",
                xylophone: "Xylophone",
                glockenspiel: "Glockenspiel",
                drumSet: "Drum Set",
                auxRack: "Rack",
                synth: "Synthesizer",
            };
            const instruments = preset.equipment.filter(
                (e) => e.familyId in sections,
            );
            const players = preset.performers.filter(
                (p) => p.section !== "Drum Major",
            );
            expect(players).toHaveLength(instruments.length);
            for (const e of instruments) {
                const spot = {
                    x: e.x,
                    z: e.z - footprintOf(e).depth / 2 - 1 * FEET,
                };
                const player = players.find(
                    (p) =>
                        Math.abs(p.x - spot.x) < 1e-9 &&
                        Math.abs(p.z - spot.z) < 1e-9,
                );
                expect(player?.section).toBe(sections[e.familyId]);
                expect(player?.facing).toBe(0);
            }
        },
    );
});

describe("pitPresetContents", () => {
    it("lists what the Medium preset places, by family, in reading order", () => {
        expect(pitPresetContents("medium")).toEqual([
            { familyId: "marimba", count: 4 },
            { familyId: "vibraphone", count: 3 },
            { familyId: "xylophone", count: 1 },
            { familyId: "glockenspiel", count: 1 },
            { familyId: "drumSet", count: 1 },
            { familyId: "auxRack", count: 1 },
            { familyId: "synth", count: 1 },
            { familyId: "speaker", count: 4 },
            { familyId: "podium", count: 1 },
            { familyId: "mixer", count: 1 },
        ]);
    });

    it("counts every piece each preset places", () => {
        for (const size of PIT_PRESET_SIZES) {
            const total = pitPresetContents(size).reduce(
                (sum, { count }) => sum + count,
                0,
            );
            expect(total).toBe(pitPreset(size).equipment.length);
        }
    });
});

describe("pitPresetOnCanvas", () => {
    const field =
        FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
    const pixelsPerMeter =
        field.pixelsPerStep / (field.stepSizeInches * 0.0254);

    it("puts the preset's meters on the canvas from the front sideline at the 50", () => {
        const preset = pitPreset("medium");
        const onCanvas = pitPresetOnCanvas(preset, field);
        const [drumSet] = of(preset, "drumSet");
        const drumSetOnCanvas = onCanvas.equipment.find(
            (e) => e.familyId === "drumSet",
        )!;
        expect(drumSetOnCanvas.home[0]).toBeCloseTo(
            field.centerFrontPoint.xPixels,
        );
        expect(drumSetOnCanvas.home[1]).toBeCloseTo(
            field.centerFrontPoint.yPixels + drumSet.z * pixelsPerMeter,
        );
        // 5 yards on the canvas: 8 steps of 8-to-5
        const speaker = onCanvas.equipment.find(
            (e) =>
                e.familyId === "speaker" &&
                e.home[0] > field.centerFrontPoint.xPixels,
        )!;
        expect(speaker.home[0] - field.centerFrontPoint.xPixels).toBeCloseTo(
            2 * 8 * field.pixelsPerStep,
        );
        // A player is on a spot within about a foot of it
        expect(onCanvas.reach).toBeCloseTo(FEET * pixelsPerMeter);
        expect(onCanvas.performers).toHaveLength(preset.performers.length);
        expect(onCanvas.performers[0].section).toBe(
            preset.performers[0].section,
        );
    });
});

describe("a preset's players on the canvas", () => {
    const field =
        FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
    const pixelsPerMeter =
        field.pixelsPerStep / (field.stepSizeInches * 0.0254);

    it.each(PIT_PRESET_SIZES)(
        "stand on their instruments' playing spots at %s, so the 3D View snaps them",
        (size) => {
            const onCanvas = pitPresetOnCanvas(pitPreset(size), field);
            const players = onCanvas.performers.filter(
                (p) => p.section !== "Drum Major",
            );
            const instruments = onCanvas.equipment.flatMap((e) => {
                const spot = playingSpotOf(
                    e.variantId,
                    {
                        center: { x: e.home[0], y: e.home[1] },
                        depth: pitVariant(e.variantId)!.footprint.depth,
                        rotation: e.rotation,
                    },
                    pixelsPerMeter,
                );
                return spot ? [spot] : [];
            });
            expect(instruments).toHaveLength(players.length);
            for (const spot of instruments) {
                const on = players.filter((p) =>
                    isOnPlayingSpot({ x: p.home[0], y: p.home[1] }, spot),
                );
                expect(on).toHaveLength(1);
                expect(on[0].facing).toBe(spot.facing);
                // Well inside the tolerance, not at its edge
                expect(
                    Math.hypot(on[0].home[0] - spot.x, on[0].home[1] - spot.y),
                ).toBeLessThan(spot.reach / 100);
            }
        },
    );
});
