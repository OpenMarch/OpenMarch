import * as Popover from "@radix-ui/react-popover";
import { CheckIcon, MapTrifoldIcon } from "@phosphor-icons/react";
import { useTranslate } from "@tolgee/react";
import { useId, useState } from "react";
import clsx from "clsx";
import { useShallow } from "zustand/react/shallow";
import { ShortcutTooltip } from "@/components/timeline/ShortcutTooltip";
import {
    MENU_BUTTON_CLASS,
    MENU_LABEL_CLASS,
    MENU_SEPARATOR_CLASS,
    POPOVER_CLASS,
} from "@/components/ui/popupClasses";
import {
    useUiSettingsStore,
    type FieldVenueAround,
    type FieldVenueLook,
    type UiSettings,
} from "@/stores/UiSettingsStore";
import { useVenueFieldStyle } from "@/hooks/queries/useVenueFieldStyle";
import {
    setFieldVenue,
    venueAround,
    venueShows,
} from "@/field/three/venueUnderlay/fieldVenue";
import { DISPLAY_BUTTON_CLASS } from "./displayButton";

const LOOKS: readonly { value: FieldVenueLook; key: string }[] = [
    { value: "off", key: "toolbar.view.venueOff" },
    { value: "faint", key: "toolbar.view.venueFaint" },
    { value: "soft", key: "toolbar.view.venueSoft" },
    { value: "markings", key: "toolbar.view.venueMarkings" },
    { value: "full", key: "toolbar.view.venueFull" },
];
const AROUND: readonly { value: FieldVenueAround; key: string }[] = [
    { value: "field", key: "toolbar.view.venueAroundField" },
    { value: "edge", key: "toolbar.view.venueAroundEdge" },
    { value: "stands", key: "toolbar.view.venueAroundStands" },
];

const REASON_CLASS = "text-sub text-text-subtitle px-8 pb-4 leading-snug";

const change = (patch: Partial<UiSettings>) => {
    const { uiSettings, setUiSettings } = useUiSettingsStore.getState();
    setUiSettings({ ...uiSettings, ...patch });
};

/**
 * The venue on the field (fork #1207): the show's 3D venue under the 2D grid,
 * in a look from faint to full color, with what's around the field, and the 3D
 * View's camera. Off by default. A blank venue has nothing to show, and only
 * stadium turf has an edge; each says so where it's greyed out.
 */
export default function VenueButton() {
    const { t } = useTranslate();
    const [open, setOpen] = useState(false);
    const looksId = useId();
    const aroundId = useId();
    const { look, around, camera } = useUiSettingsStore(
        useShallow((s) => ({
            look: s.uiSettings.fieldVenue ?? "off",
            around: s.uiSettings.fieldVenueAround,
            camera: s.uiSettings.view3dCameraOnField === true,
        })),
    );
    const style = useVenueFieldStyle();
    const blank = !venueShows(style);
    // What's drawn: Turf edge reads as None where there's no turf
    const drawnAround = venueAround(around, style);
    const label = t("toolbar.view.venue");
    const current = t(LOOKS.find((l) => l.value === look)?.key ?? "");
    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <ShortcutTooltip
                label={label}
                hint={current}
                side="left"
                action="toggleFieldVenue"
            >
                <Popover.Trigger asChild>
                    <button
                        type="button"
                        aria-label={t("fieldDisplay.valueLabel", {
                            label,
                            value: current,
                        })}
                        data-testid="field-display-venue"
                        className={clsx(
                            DISPLAY_BUTTON_CLASS,
                            look === "off" ? "text-text-disabled" : "text-text",
                        )}
                    >
                        <MapTrifoldIcon size={16} />
                    </button>
                </Popover.Trigger>
            </ShortcutTooltip>
            <Popover.Portal>
                <Popover.Content
                    side="left"
                    align="start"
                    sideOffset={6}
                    aria-label={label}
                    className={clsx(
                        POPOVER_CLASS,
                        "z-50 flex w-[240px] flex-col gap-4",
                    )}
                >
                    <h3 id={looksId} className={MENU_LABEL_CLASS}>
                        {label}
                    </h3>
                    {blank && (
                        <p className={REASON_CLASS}>
                            {t("toolbar.view.venueBlank")}
                        </p>
                    )}
                    <div
                        role="radiogroup"
                        aria-labelledby={looksId}
                        className="flex flex-col gap-4"
                    >
                        {LOOKS.map((choice) => (
                            <button
                                key={choice.value}
                                type="button"
                                role="radio"
                                aria-checked={look === choice.value}
                                disabled={blank && choice.value !== "off"}
                                data-testid={`field-display-venue-${choice.value}`}
                                onClick={() => setFieldVenue(choice.value)}
                                className={clsx(
                                    MENU_BUTTON_CLASS,
                                    look === choice.value && "text-accent",
                                )}
                            >
                                {t(choice.key)}
                            </button>
                        ))}
                    </div>
                    <h3 id={aroundId} className={MENU_LABEL_CLASS}>
                        {t("toolbar.view.venueAround")}
                    </h3>
                    <div
                        role="radiogroup"
                        aria-labelledby={aroundId}
                        className="flex flex-col gap-4"
                    >
                        {AROUND.map((choice) => (
                            <button
                                key={choice.value}
                                type="button"
                                role="radio"
                                aria-checked={drawnAround === choice.value}
                                disabled={
                                    blank ||
                                    (choice.value === "edge" &&
                                        style !== "turf")
                                }
                                data-testid={`field-display-venue-around-${choice.value}`}
                                onClick={() =>
                                    change({ fieldVenueAround: choice.value })
                                }
                                className={clsx(
                                    MENU_BUTTON_CLASS,
                                    drawnAround === choice.value &&
                                        "text-accent",
                                )}
                            >
                                {t(choice.key)}
                            </button>
                        ))}
                    </div>
                    {!blank && style !== "turf" && (
                        <p className={REASON_CLASS}>
                            {t("toolbar.view.venueEdgeStadiumOnly")}
                        </p>
                    )}
                    <div role="separator" className={MENU_SEPARATOR_CLASS} />
                    <button
                        type="button"
                        role="switch"
                        aria-checked={camera}
                        data-testid="field-display-venue-camera"
                        onClick={() => change({ view3dCameraOnField: !camera })}
                        className={clsx(MENU_BUTTON_CLASS, "justify-between")}
                    >
                        {t("toolbar.view.venueCamera")}
                        {camera && <CheckIcon size={14} />}
                    </button>
                    <p className={REASON_CLASS}>
                        {t("toolbar.view.venueCameraHint")}
                    </p>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
