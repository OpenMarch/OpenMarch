/**
 * Builds the full venue settings the overlay sends with
 * `window.view3d.requestVenueChange` (ui.md UI-2). The editor validates them
 * again and saves them with undo.
 */
import type {
    LightingPreset,
    VenueKitId,
    VenueParams,
} from "@/view3d/core/types";
import {
    brassFinishOf,
    lightingForKit,
    parseVenueSettings,
    tubaModelOf,
    type VenueSettings,
} from "@/view3d/core/venueSettings";
import type { Finish, TubaModelId } from "@/view3d/core/instruments/catalog";
import {
    guardUniformPresetOf,
    uniformPresetOf,
    type GuardUniformPresetId,
    type UniformPresetId,
} from "@/view3d/core/marchers/uniformPresets";

export type VenueChange =
    | { kind: "kit"; kit: VenueKitId }
    | { kind: "lighting"; lighting: LightingPreset }
    | { kind: "crowd"; crowd: boolean }
    | { kind: "params"; params: Partial<VenueParams> }
    | { kind: "uniforms"; uniforms: UniformPresetId }
    | { kind: "guardUniforms"; guardUniforms: GuardUniformPresetId }
    | { kind: "brassFinish"; brassFinish: Finish }
    | { kind: "tuba"; tuba: TubaModelId };

/**
 * Applies one change to the current settings and validates the result.
 * Switching kits keeps the lighting when the new kit supports it, and
 * otherwise uses the new kit's default. Params are kept.
 *
 * @throws a ZodError if the result isn't valid venue settings
 */
export function applyVenueChange(
    current: VenueSettings,
    change: VenueChange,
): VenueSettings {
    switch (change.kind) {
        case "kit":
            return parseVenueSettings({
                ...current,
                kit: change.kit,
                lighting: lightingForKit(change.kit, current.lighting),
            });
        case "lighting":
            return parseVenueSettings({
                ...current,
                lighting: change.lighting,
            });
        case "crowd":
            return parseVenueSettings({ ...current, crowd: change.crowd });
        case "uniforms":
            return parseVenueSettings({
                ...current,
                uniforms: change.uniforms,
            });
        case "guardUniforms":
            return parseVenueSettings({
                ...current,
                guardUniforms: change.guardUniforms,
            });
        case "brassFinish":
            return parseVenueSettings({
                ...current,
                brassFinish: change.brassFinish,
            });
        case "tuba":
            return parseVenueSettings({ ...current, tuba: change.tuba });
        case "params":
            return parseVenueSettings({
                ...current,
                params: { ...current.params, ...change.params },
            });
    }
}

/** True when the settings differ in anything the overlay can change. */
export function venueChanged(a: VenueSettings, b: VenueSettings): boolean {
    return (
        a.kit !== b.kit ||
        a.lighting !== b.lighting ||
        a.crowd !== b.crowd ||
        uniformPresetOf(a.uniforms) !== uniformPresetOf(b.uniforms) ||
        guardUniformPresetOf(a.guardUniforms) !==
            guardUniformPresetOf(b.guardUniforms) ||
        brassFinishOf(a.brassFinish) !== brassFinishOf(b.brassFinish) ||
        tubaModelOf(a.tuba) !== tubaModelOf(b.tuba) ||
        a.params.homeColor !== b.params.homeColor ||
        a.params.awayColor !== b.params.awayColor ||
        a.params.endZoneText !== b.params.endZoneText ||
        a.params.endZoneColor !== b.params.endZoneColor
    );
}
