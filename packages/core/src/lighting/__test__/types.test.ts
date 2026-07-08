import { describe, expect, it } from "vitest";
import {
    LightingDataSchema,
    LightingEffectGroupSchema,
    LightingEffectLayerSchema,
    LightingEffectSchema,
    LightingGroupMarcherSchema,
    LightingGroupSchema,
    LightingSceneSchema,
} from "../schema";

describe("LightingSceneSchema", () => {
    it("accepts a valid scene row", () => {
        expect(
            LightingSceneSchema.parse({
                id: 1,
                start_page_id: 10,
                name: "Scene A",
            }),
        ).toEqual({
            id: 1,
            start_page_id: 10,
            name: "Scene A",
        });
    });

    it("accepts null name", () => {
        expect(
            LightingSceneSchema.parse({
                id: 1,
                start_page_id: 10,
                name: null,
            }).name,
        ).toBeNull();
    });
});

describe("LightingGroupSchema", () => {
    it("accepts a valid group row", () => {
        expect(
            LightingGroupSchema.parse({
                id: 2,
                scene_id: 1,
                name: "Group A",
            }),
        ).toMatchObject({ id: 2, scene_id: 1 });
    });
});

describe("LightingGroupMarcherSchema", () => {
    it("accepts a valid group marcher row", () => {
        expect(
            LightingGroupMarcherSchema.parse({
                id: 3,
                group_id: 2,
                marcher_id: 5,
                scene_id: 1,
            }),
        ).toMatchObject({ marcher_id: 5 });
    });
});

describe("LightingEffectSchema", () => {
    const baseEffect = {
        id: 4,
        scene_id: 1,
        name: null,
        start_offset_beats: 0,
        duration_beats: 4,
    };

    it("accepts valid solid args", () => {
        expect(
            LightingEffectSchema.parse({
                ...baseEffect,
                type: "solid",
                args: JSON.stringify({ color: "#ff0000" }),
            }).type,
        ).toBe("solid");
    });

    it("accepts valid strobe args via solid schema", () => {
        expect(
            LightingEffectSchema.parse({
                ...baseEffect,
                type: "strobe",
                args: JSON.stringify({ color: "#00ff00" }),
            }).type,
        ).toBe("strobe");
    });

    it("accepts valid fade args", () => {
        expect(
            LightingEffectSchema.parse({
                ...baseEffect,
                type: "fade",
                args: JSON.stringify({
                    changeDurationMs: 1000,
                    colors: ["#000000", "#ffffff"],
                }),
            }).type,
        ).toBe("fade");
    });

    it("accepts valid wipe args", () => {
        expect(
            LightingEffectSchema.parse({
                ...baseEffect,
                type: "wipe",
                args: JSON.stringify({
                    color: "#0000ff",
                    directionDegrees: 90,
                }),
            }).type,
        ).toBe("wipe");
    });

    it("rejects invalid JSON args", () => {
        const result = LightingEffectSchema.safeParse({
            ...baseEffect,
            type: "solid",
            args: "not-json",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(
                result.error.issues.some((i) => i.path.includes("args")),
            ).toBe(true);
        }
    });

    it("rejects args with wrong shape for type", () => {
        const result = LightingEffectSchema.safeParse({
            ...baseEffect,
            type: "solid",
            args: JSON.stringify({ colors: ["#ff0000"] }),
        });
        expect(result.success).toBe(false);
    });

    it("rejects negative start_offset_beats", () => {
        expect(
            LightingEffectSchema.safeParse({
                ...baseEffect,
                type: "solid",
                args: JSON.stringify({ color: "#ff0000" }),
                start_offset_beats: -1,
            }).success,
        ).toBe(false);
    });

    it("rejects negative duration_beats", () => {
        expect(
            LightingEffectSchema.safeParse({
                ...baseEffect,
                type: "solid",
                args: JSON.stringify({ color: "#ff0000" }),
                duration_beats: -1,
            }).success,
        ).toBe(false);
    });

    it("rejects invalid effect type", () => {
        expect(
            LightingEffectSchema.safeParse({
                ...baseEffect,
                type: "pulse",
                args: JSON.stringify({ color: "#ff0000" }),
            }).success,
        ).toBe(false);
    });
});

describe("LightingEffectGroupSchema", () => {
    it("accepts a valid effect group row", () => {
        expect(
            LightingEffectGroupSchema.parse({
                id: 5,
                lighting_effect_id: 4,
                lighting_group_id: 2,
            }),
        ).toMatchObject({ lighting_effect_id: 4 });
    });
});

describe("LightingEffectLayerSchema", () => {
    it("accepts a valid effect layer row", () => {
        expect(
            LightingEffectLayerSchema.parse({
                id: 6,
                lighting_effect_id: 4,
                top: 0,
                left: 10,
                height: 50,
                width: 100,
            }),
        ).toMatchObject({ width: 100 });
    });

    it("rejects negative layer dimensions", () => {
        expect(
            LightingEffectLayerSchema.safeParse({
                id: 6,
                lighting_effect_id: 4,
                top: -1,
                left: 0,
                height: 50,
                width: 100,
            }).success,
        ).toBe(false);
    });
});

describe("LightingDataSchema", () => {
    it("parses a realistic multi-table fixture", () => {
        const data = {
            scenes: [{ id: 1, start_page_id: 1, name: "Scene" }],
            groups: [{ id: 2, scene_id: 1, name: "Group" }],
            group_marchers: [
                { id: 3, group_id: 2, marcher_id: 10, scene_id: 1 },
            ],
            effects: [
                {
                    id: 4,
                    scene_id: 1,
                    type: "wipe",
                    args: JSON.stringify({
                        color: "#ff0000",
                        directionDegrees: 0,
                    }),
                    name: "Wipe",
                    start_offset_beats: 2,
                    duration_beats: 8,
                },
            ],
            effect_groups: [
                { id: 5, lighting_effect_id: 4, lighting_group_id: 2 },
            ],
            effect_layers: [
                {
                    id: 6,
                    lighting_effect_id: 4,
                    top: 0,
                    left: 0,
                    height: 100,
                    width: 200,
                },
            ],
        };

        const parsed = LightingDataSchema.parse(data);
        expect(parsed.scenes).toHaveLength(1);
        expect(parsed.effects[0]?.type).toBe("wipe");
        expect(parsed.effect_layers[0]?.width).toBe(200);
    });
});
