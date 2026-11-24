/**
 * Venue picker and lighting presets for the settings panel (ui.md UI-2), and
 * the hook every venue control uses. Every change goes to the editor through
 * `window.view3d.requestVenueChange` with the full, validated settings; the
 * editor saves it with undo, and the relayed invalidation updates the scene.
 */
import { useCallback, useState } from "react";
import { useTranslate } from "@tolgee/react";
import { useQuery } from "@tanstack/react-query";
import { fieldFootprint } from "@openmarch/core";
import { fieldPropertiesQueryOptions } from "@/hooks/queries/useFieldProperties";
import { FT } from "@/view3d/core/environment/units";
import { useVenueSettings } from "@/hooks/queries/useVenueSettings";
import type { LightingPreset, VenueKitId } from "@/view3d/core/types";
import {
    KIT_FIXED_FLOOR,
    KIT_FIXED_FLOOR_FALLBACK,
    KIT_LIGHTING,
    REAL_VENUES,
    VENUE_KIT_IDS,
    fieldLinesFor,
    kitFitsField,
    lightingForKit,
    venueKind,
    type FieldLines,
    type VenueKind,
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

/** Meters to whole feet, for floor sizes. */
const feet = (meters: number) => Math.round(meters / FT);

/**
 * The venue kits, two to a row, in two groups: the venues sized to the
 * show's field, then the real venues (`REAL_VENUES`), each with its size as
 * a tooltip. A venue whose fixed floor the show's field doesn't fit is
 * dimmed; clicking it says why, under the picker. While the show's own
 * venue is one of those, a note says which venue shows instead.
 */
export function VenuePicker() {
    const { t } = useTranslate();
    const { settings, request } = useVenueRequest();
    const { data: field } = useQuery(fieldPropertiesQueryOptions());
    // The venue last refused; its reason is worked out afresh, so it goes when the field fits.
    const [refused, setRefused] = useState<VenueKitId | null>(null);
    const footprint = field ? fieldFootprint(field) : undefined;

    const fieldWidth = footprint ? feet(footprint.maxX - footprint.minX) : 0;
    const fieldDepth = footprint ? feet(footprint.maxZ - footprint.minZ) : 0;
    const floorOf = (kit: VenueKitId) => {
        const floor = KIT_FIXED_FLOOR[kit];
        return floor
            ? { width: feet(floor.width), depth: feet(floor.depth) }
            : undefined;
    };
    const reasonFor = (kit: VenueKitId): string | undefined => {
        if (!footprint || kitFitsField(kit, footprint)) return undefined;
        return t("view3d.venueFit.tooBig", {
            venue: t(`view3d.kit.${kit}`),
            ...floorOf(kit),
            fieldWidth,
            fieldDepth,
        });
    };
    const chosen = settings?.kit;
    const fallback =
        chosen && footprint && !kitFitsField(chosen, footprint)
            ? t("view3d.venueFit.fallback", {
                  venue: t(`view3d.kit.${chosen}`),
                  ...floorOf(chosen),
                  fallback: t(`view3d.kit.${KIT_FIXED_FLOOR_FALLBACK}`),
              })
            : null;
    const note = (refused && reasonFor(refused)) || fallback;
    const sizeOf = (kit: VenueKitId): string | undefined => {
        const real = REAL_VENUES[kit];
        if (!real) return undefined;
        return t(`view3d.venueKind.${real.surface}`, {
            venue: t(`view3d.kit.${kit}`),
            width: feet(real.width),
            depth: feet(real.depth),
        });
    };
    const group = (kind: VenueKind) => {
        const kits = VENUE_KIT_IDS.filter((kit) => venueKind(kit) === kind);
        return (
            <div
                className="flex flex-col gap-4"
                data-testid={`view3d-venue-group-${kind}`}
            >
                <p className="text-sub text-text/60">
                    {t(`view3d.venueKind.${kind}`)}
                </p>
                {kind === "real" && (
                    <p className="text-sub text-text/40">
                        {t("view3d.venueKind.realHint")}
                    </p>
                )}
                <Segmented
                    value={chosen && kits.includes(chosen) ? chosen : null}
                    options={kits.map((kit) => ({
                        value: kit,
                        label: t(`view3d.kit.${kit}`),
                        title: sizeOf(kit),
                        unavailable: reasonFor(kit),
                    }))}
                    onChange={(kit: VenueKitId) => {
                        setRefused(null);
                        request({ kind: "kit", kit });
                    }}
                    onUnavailable={(kit) => setRefused(kit)}
                    label={t(`view3d.venueKind.${kind}`)}
                    className="grid! grid-cols-2 [&>*]:justify-start"
                />
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-6">
            <div
                className="flex flex-col gap-12"
                data-testid="view3d-venue-picker"
            >
                {group("fitted")}
                {group("real")}
            </div>
            {note && (
                <p
                    className="text-sub text-text/60"
                    role="status"
                    data-testid="view3d-venue-fit-note"
                >
                    {note}
                </p>
            )}
        </div>
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

/**
 * Whose lines a venue with its own field paints: the show's field, or the
 * stadium's own, as they are on its turf. Marchers stay where they are.
 */
export function FieldLinesControl() {
    const { t } = useTranslate();
    const { settings, request } = useVenueRequest();
    if (!settings) return null;
    const lines = fieldLinesFor(settings.kit, settings.fieldLines);
    return (
        <div className="flex flex-col gap-6">
            <Segmented
                value={lines}
                options={(["show", "stadium"] as const).map((value) => ({
                    value,
                    label: t(`view3d.settings.fieldLinesOption.${value}`),
                }))}
                onChange={(fieldLines: FieldLines) =>
                    request({ kind: "fieldLines", fieldLines })
                }
                label={t("view3d.settings.fieldLines")}
                testId="view3d-field-lines-picker"
            />
            <p className="text-sub text-text/60">
                {lines === "stadium"
                    ? t("view3d.settings.fieldLinesStadiumNote")
                    : t("view3d.settings.fieldLinesShowNote")}
            </p>
        </div>
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
