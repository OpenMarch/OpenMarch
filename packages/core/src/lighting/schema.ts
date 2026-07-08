import { z } from "zod";
import { fadeEffectArgsSchema } from "./effect.fade";
import { solidEffectArgsSchema } from "./effect.solid";
import { wipeEffectArgsSchema } from "./effect.wipe";
import { LightingEffectTypes, type LightingEffectType } from "./types";

export const LightingEffectTypeSchema = z.enum(LightingEffectTypes);

function validateLightingEffectArgs(
    type: LightingEffectType,
    argsJson: string,
    ctx: z.RefinementCtx,
): void {
    let parsed: unknown;
    try {
        parsed = JSON.parse(argsJson);
    } catch {
        ctx.addIssue({
            code: "custom",
            message: "args must be valid JSON",
            path: ["args"],
        });
        return;
    }

    const schema =
        type === "fade"
            ? fadeEffectArgsSchema
            : type === "wipe"
              ? wipeEffectArgsSchema
              : solidEffectArgsSchema;

    const result = schema.safeParse(parsed);
    if (!result.success) {
        for (const issue of result.error.issues) {
            ctx.addIssue({
                ...issue,
                path: ["args", ...issue.path],
            });
        }
    }
}

export const LightingSceneSchema = z.object({
    id: z.number().int(),
    start_page_id: z.number().int(),
    name: z.string().nullable(),
});

export const LightingGroupSchema = z.object({
    id: z.number().int(),
    scene_id: z.number().int(),
    name: z.string().nullable(),
});

export const LightingGroupMarcherSchema = z.object({
    id: z.number().int(),
    group_id: z.number().int(),
    marcher_id: z.number().int(),
    scene_id: z.number().int(),
});

export const LightingEffectSchema = z
    .object({
        id: z.number().int(),
        scene_id: z.number().int(),
        type: LightingEffectTypeSchema,
        args: z.string(),
        name: z.string().nullable(),
        start_offset_beats: z.number().int().nonnegative(),
        duration_beats: z.number().int().nonnegative(),
    })
    .superRefine((effect, ctx) => {
        validateLightingEffectArgs(effect.type, effect.args, ctx);
    });

export const LightingEffectGroupSchema = z.object({
    id: z.number().int(),
    lighting_effect_id: z.number().int(),
    lighting_group_id: z.number().int(),
});

export const LightingEffectLayerSchema = z.object({
    id: z.number().int(),
    lighting_effect_id: z.number().int(),
    top: z.number().nonnegative(),
    left: z.number().nonnegative(),
    height: z.number().nonnegative(),
    width: z.number().nonnegative(),
});

export const LightingDataSchema = z.object({
    scenes: z.array(LightingSceneSchema),
    groups: z.array(LightingGroupSchema),
    group_marchers: z.array(LightingGroupMarcherSchema),
    effects: z.array(LightingEffectSchema),
    effect_groups: z.array(LightingEffectGroupSchema),
    effect_layers: z.array(LightingEffectLayerSchema),
});

export type LightingScene = z.infer<typeof LightingSceneSchema>;
export type LightingGroup = z.infer<typeof LightingGroupSchema>;
export type LightingGroupMarcher = z.infer<typeof LightingGroupMarcherSchema>;
export type LightingEffect = z.infer<typeof LightingEffectSchema>;
export type LightingEffectGroup = z.infer<typeof LightingEffectGroupSchema>;
export type LightingEffectLayer = z.infer<typeof LightingEffectLayerSchema>;
export type LightingData = z.infer<typeof LightingDataSchema>;
