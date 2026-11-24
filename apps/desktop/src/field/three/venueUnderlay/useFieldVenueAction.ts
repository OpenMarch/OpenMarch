import type { FieldSurfaceStyle } from "@/view3d/core/field";
import { useActionHandler } from "@/shortcuts/useActionHandler";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import tolgee from "@/global/singletons/Tolgee";
import { setFieldVenue, venueShows } from "./fieldVenue";

/**
 * Show or hide venue on field (#1207): off, or back to the look last picked.
 * The palette names what it will do; on a Field only venue it's greyed out
 * with the Venue menu's reason. Registered by the field, which knows the
 * show's venue.
 */
export function useFieldVenueAction(style: FieldSurfaceStyle): void {
    const settings = () => useUiSettingsStore.getState().uiSettings;
    const on = () => (settings().fieldVenue ?? "off") !== "off";
    const shows = venueShows(style);
    useActionHandler(
        "toggleFieldVenue",
        () =>
            setFieldVenue(
                on() ? "off" : (settings().fieldVenueLast ?? "faint"),
            ),
        {
            enabled: shows,
            disabledReason: shows
                ? undefined
                : () => tolgee.t("toolbar.view.venueBlank"),
            label: () =>
                tolgee.t(
                    shows && on()
                        ? "actions.ui.hideFieldVenue"
                        : "actions.ui.showFieldVenue",
                ),
        },
    );
}
