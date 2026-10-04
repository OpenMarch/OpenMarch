/**
 * Venue picker, lighting presets and the crowd toggle (ui.md UI-2). Every
 * change goes to the editor through `window.view3d.requestVenueChange` with
 * the full, validated settings; the editor saves it with undo, and the
 * relayed invalidation updates the scene.
 */
import { useCallback } from "react";
import { useTranslate } from "@tolgee/react";
import { UsersIcon } from "@phosphor-icons/react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import { useVenueSettings } from "@/hooks/queries/useVenueSettings";
import type { LightingPreset, VenueKitId } from "@/view3d/core/types";
import {
    KIT_LIGHTING,
    VENUE_KIT_IDS,
    lightingForKit,
    type VenueSettings,
} from "@/view3d/core/venueSettings";
import { PanelLabel, Segmented, ToggleButton } from "./Panel";
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

/** Segmented kit names when wide, a Select when narrow. */
export function VenuePicker({ compact }: { compact: boolean }) {
    const { t } = useTranslate();
    const { settings, request } = useVenueRequest();
    const label = t("view3d.overlay.venue");
    const onChange = (kit: VenueKitId) => request({ kind: "kit", kit });
    const options = VENUE_KIT_IDS.map((kit) => ({
        value: kit,
        label: t(`view3d.kit.${kit}`),
    }));

    return (
        <>
            <PanelLabel>{label}</PanelLabel>
            {compact ? (
                <Select
                    value={settings?.kit}
                    onValueChange={(kit) => onChange(kit as VenueKitId)}
                    disabled={!settings}
                >
                    <SelectTriggerButton
                        label={label}
                        className="h-28 min-w-[10rem] justify-between gap-8 border-0 bg-transparent px-10"
                    />
                    <SelectContent>
                        {options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            ) : (
                <Segmented
                    value={settings?.kit ?? null}
                    options={options}
                    onChange={onChange}
                    label={label}
                    testId="view3d-venue-picker"
                />
            )}
        </>
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

/** Shows or hides the crowd; saved with the show. */
export function CrowdToggle() {
    const { t } = useTranslate();
    const { settings, request } = useVenueRequest();
    const on = settings?.crowd ?? false;
    return (
        <ToggleButton
            pressed={on}
            disabled={!settings}
            onClick={() => request({ kind: "crowd", crowd: !on })}
            icon={<UsersIcon size={16} />}
            label={t("view3d.overlay.crowd")}
            tooltip={t("view3d.overlay.crowdTooltip")}
            testId="view3d-crowd-toggle"
        />
    );
}
