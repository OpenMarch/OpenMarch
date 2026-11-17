/**
 * Venue picker and lighting presets for the settings panel (ui.md UI-2), and
 * the hook every venue control uses. Every change goes to the editor through
 * `window.view3d.requestVenueChange` with the full, validated settings; the
 * editor saves it with undo, and the relayed invalidation updates the scene.
 */
import { useCallback } from "react";
import { useTranslate } from "@tolgee/react";
import { useVenueSettings } from "@/hooks/queries/useVenueSettings";
import type { LightingPreset, VenueKitId } from "@/view3d/core/types";
import {
    KIT_LIGHTING,
    VENUE_KIT_IDS,
    lightingForKit,
    type VenueSettings,
} from "@/view3d/core/venueSettings";
import {
    GUARD_UNIFORM_PRESET_IDS,
    UNIFORM_PRESET_IDS,
    guardUniformPresetOf,
    uniformPresetOf,
    type GuardUniformPresetId,
    type UniformPresetId,
} from "@/view3d/core/marchers/uniformPresets";
import {
    FINISHES,
    TUBA_MODELS,
    type Finish,
    type TubaModelId,
} from "@/view3d/core/instruments/catalog";
import { brassFinishOf, tubaModelOf } from "@/view3d/core/venueSettings";
import {
    SILK_SHAPE_IDS,
    silkShape,
    silkShapeOf,
    type SilkShapeId,
} from "@/view3d/core/sizes/silkShapes";
import { cutPathBounds, cutPathData } from "@/view3d/core/sizes/silkCuts";
import { ToggleGroup, ToggleGroupItem } from "@openmarch/ui";
import { Segmented } from "./Panel";
import {
    applyVenueChange,
    venueChanged,
    type VenueChange,
} from "./venueChange";

/**
 * The show's venue settings and a function that asks the editor to change
 * them. `request` does nothing until the settings have loaded, or when the
 * change wouldn't change anything.
 */
export function useVenueRequest(): {
    settings: VenueSettings | undefined;
    request: (change: VenueChange) => void;
} {
    const { data: settings } = useVenueSettings();
    const request = useCallback(
        (change: VenueChange) => {
            if (!settings) return;
            try {
                const next = applyVenueChange(settings, change);
                if (venueChanged(settings, next)) {
                    window.view3d.requestVenueChange(next);
                }
            } catch (error) {
                console.error("3D View: invalid venue change", error);
            }
        },
        [settings],
    );
    return { settings, request };
}

/** The venue kits, two to a row. */
export function VenuePicker() {
    const { t } = useTranslate();
    const { settings, request } = useVenueRequest();
    return (
        <Segmented
            value={settings?.kit ?? null}
            options={VENUE_KIT_IDS.map((kit) => ({
                value: kit,
                label: t(`view3d.kit.${kit}`),
            }))}
            onChange={(kit: VenueKitId) => request({ kind: "kit", kit })}
            label={t("view3d.overlay.venue")}
            testId="view3d-venue-picker"
            className="grid! grid-cols-2 [&>*]:justify-start"
        />
    );
}

/** The current kit's lighting presets. */
export function LightingControl() {
    const { t } = useTranslate();
    const { settings, request } = useVenueRequest();
    if (!settings) return null;

    const presets = KIT_LIGHTING[settings.kit].presets;
    const active = lightingForKit(settings.kit, settings.lighting);
    return (
        <Segmented
            value={active}
            options={presets.map((preset) => ({
                value: preset,
                label: t(`view3d.lighting.${preset}`),
            }))}
            onChange={(lighting: LightingPreset) =>
                request({ kind: "lighting", lighting })
            }
            label={t("view3d.overlay.lighting")}
            testId="view3d-lighting-picker"
        />
    );
}

/** The band's uniform: every built-in preset, two to a row. */
export function UniformPicker() {
    const { t } = useTranslate();
    const { settings, request } = useVenueRequest();
    return (
        <Segmented
            value={settings ? uniformPresetOf(settings.uniforms) : null}
            options={UNIFORM_PRESET_IDS.map((preset) => ({
                value: preset,
                label: t(`view3d.uniformPreset.${preset}`),
            }))}
            onChange={(uniforms: UniformPresetId) =>
                request({ kind: "uniforms", uniforms })
            }
            label={t("view3d.settings.uniforms")}
            testId="view3d-uniform-picker"
            className="grid! grid-cols-2 [&>*]:justify-start"
        />
    );
}

/** The guard's uniform: the presets with a guard look, two to a row. */
export function GuardUniformPicker() {
    const { t } = useTranslate();
    const { settings, request } = useVenueRequest();
    return (
        <Segmented
            value={
                settings ? guardUniformPresetOf(settings.guardUniforms) : null
            }
            options={GUARD_UNIFORM_PRESET_IDS.map((preset) => ({
                value: preset,
                label: t(`view3d.uniformPreset.${preset}`),
            }))}
            onChange={(guardUniforms: GuardUniformPresetId) =>
                request({ kind: "guardUniforms", guardUniforms })
            }
            label={t("view3d.settings.guardUniforms")}
            testId="view3d-guard-uniform-picker"
            className="grid! grid-cols-2 [&>*]:justify-start"
        />
    );
}

/** The brass line's finish: gold lacquer or silver plate. */
export function BrassFinishPicker() {
    const { t } = useTranslate();
    const { settings, request } = useVenueRequest();
    return (
        <Segmented
            value={settings ? brassFinishOf(settings.brassFinish) : null}
            options={FINISHES.map((finish) => ({
                value: finish,
                label: t(`view3d.brassFinish.${finish}`),
            }))}
            onChange={(brassFinish: Finish) =>
                request({ kind: "brassFinish", brassFinish })
            }
            label={t("view3d.settings.brassFinish")}
            testId="view3d-brass-finish-picker"
        />
    );
}

/** What the Tuba section carries: marching tubas or sousaphones. */
export function TubaPicker() {
    const { t } = useTranslate();
    const { settings, request } = useVenueRequest();
    return (
        <Segmented
            value={settings ? tubaModelOf(settings.tuba) : null}
            options={TUBA_MODELS.map((tuba) => ({
                value: tuba,
                label: t(`view3d.tuba.${tuba}`),
            }))}
            onChange={(tuba: TubaModelId) => request({ kind: "tuba", tuba })}
            label={t("view3d.settings.tuba")}
            testId="view3d-tuba-picker"
        />
    );
}

/**
 * A silk shape's outline as a small picture: the pole edge on the left,
 * drawn at the shape's own proportions inside a fixed box.
 */
export function SilkShapeIcon({
    shape,
    className,
}: {
    shape: SilkShapeId;
    className?: string;
}) {
    const { path } = silkShape(shape);
    const b = cutPathBounds(path);
    // a stroke that stays about 1.5 px wide at the icon's size
    const stroke = Math.max(b.maxX, b.maxY) / 28;
    const pad = stroke;
    return (
        <svg
            viewBox={`${-pad} ${-pad} ${b.maxX + 2 * pad} ${b.maxY + 2 * pad}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
            className={className}
        >
            <path
                d={cutPathData(path)}
                fill="currentColor"
                fillOpacity={0.25}
                stroke="currentColor"
                strokeWidth={stroke}
                strokeLinejoin="round"
                fillRule="evenodd"
            />
        </svg>
    );
}

/**
 * The guard's flag silk shape (fork #973): every shape on the owner's
 * chart, as its outline and its name, three to a row.
 */
export function SilkShapePicker() {
    const { t } = useTranslate();
    const { settings, request } = useVenueRequest();
    const value = settings ? silkShapeOf(settings.silkShape) : "";
    return (
        <ToggleGroup
            type="single"
            value={value}
            // Radix sends "" when the active item is clicked again; keep it.
            onValueChange={(next: string) => {
                if (next)
                    request({
                        kind: "silkShape",
                        silkShape: next as SilkShapeId,
                    });
            }}
            aria-label={t("view3d.settings.silkShape")}
            data-testid="view3d-silk-shape-picker"
            className="grid! h-auto! shrink-0 grid-cols-3 gap-2 border-0! bg-transparent! bg-none!"
        >
            {SILK_SHAPE_IDS.map((shape) => (
                <ToggleGroupItem
                    key={shape}
                    value={shape}
                    data-value={shape}
                    className="text-sub rounded-4! hover:bg-text/10! data-[state=on]:bg-accent! data-[state=on]:hover:bg-accent! data-[state=on]:text-text-invert! flex h-auto! flex-col items-center gap-4 border-0! px-4! py-6! text-center leading-tight whitespace-normal"
                >
                    <SilkShapeIcon shape={shape} className="h-32 w-56" />
                    <span>{t(`view3d.silkShape.${shape}`)}</span>
                </ToggleGroupItem>
            ))}
        </ToggleGroup>
    );
}
