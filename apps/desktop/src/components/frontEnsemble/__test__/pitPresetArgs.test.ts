// @vitest-environment node
import { describe, expect, it } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { pitPreset } from "@/view3d/core/pit/presets";
import { pitPresetApplyArgs } from "../pitPresetArgs";

const field = FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;

describe("pitPresetApplyArgs", () => {
    it("places the preset's equipment in front of the field, named by family", () => {
        const args = pitPresetApplyArgs({
            size: "medium",
            field,
            beatId: 7,
            addPerformers: true,
            familyName: (family) => `F:${family}`,
        });
        const preset = pitPreset("medium");
        expect(args.beatId).toBe(7);
        expect(args.equipment).toHaveLength(preset.equipment.length);
        expect(args.equipment.map((e) => e.variant.modelId)).toEqual(
            preset.equipment.map((e) => e.variantId),
        );
        expect(args.equipment[0].baseName).toBe(
            `F:${preset.equipment[0].familyId}`,
        );
        // Past the front sideline, toward the audience
        for (const e of args.equipment)
            expect(e.home[1]).toBeGreaterThan(field.centerFrontPoint.yPixels);
        expect(args.performers).toHaveLength(preset.performers.length);
        expect(args.performerReach).toBeGreaterThan(0);
    });

    it("adds no performers without them", () => {
        const args = pitPresetApplyArgs({
            size: "small",
            field,
            beatId: 1,
            addPerformers: false,
            familyName: String,
        });
        expect(args.performers).toEqual([]);
        expect(args.equipment.length).toBeGreaterThan(0);
    });
});
