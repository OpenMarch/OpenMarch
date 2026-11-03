/**
 * Built-in cue values in the app's language. The cue library (`@openmarch/core`) names its
 * values in English, and cues store a value's id (`builtin:horn.up`), so the Visuals tabs word
 * them here, at display time, from the id. Library items and phrase assets keep the name their
 * author gave them. Resolved on each call, so call these where the text is shown or in data
 * rebuilt when the language changes (`useVisualsBandData`).
 */
import { cueLibraryValue } from "@openmarch/core";
import tolgee from "@/global/singletons/Tolgee";

const BUILTIN = "builtin:";
const FEET_STEP = "builtin:feet.step";

/** The built-in values the Visuals tabs (Feet, Horn/Equipment, Facing, Body) show: `visuals.values.<id>` */
const SHOWN_VALUES: ReadonlySet<string> = new Set([
    "feet.step",
    "horn.up",
    "horn.down",
    "horn.trail",
    "battery.playing",
    "battery.sticksIn",
    "battery.sticksDown",
    "flag.set",
    "flag.port",
    "flag.dropSpin",
    "flag.toss1",
    "rifle.portArms",
    "rifle.present",
    "rifle.dropSpin",
    "rifle.toss1",
    "rifle.toss2",
    "sabre.set",
    "sabre.toss1",
    "facing.front",
    "facing.back",
    "facing.side1",
    "facing.side2",
    "facing.travel",
    "facing.angle",
    "facing.point",
    "body.neutral",
    "body.kneel",
    "body.choreo",
]);

function valueKey(id: string): string | null {
    if (!id.startsWith(BUILTIN)) return null;
    const key = id.slice(BUILTIN.length);
    return SHOWN_VALUES.has(key) ? `visuals.values.${key}` : null;
}

/** A value's full name ("Horns up"), for pickers and sentences; undefined for a value the library doesn't have. */
export function cueValueName(id: string): string | undefined {
    const name = cueLibraryValue(id)?.name;
    if (name === undefined) return undefined;
    const key = valueKey(id);
    return key ? tolgee.t(`${key}.name`, name) : name;
}

/**
 * A value's short label on the timeline ("HU"), as compile labels its segments: Feet's Step by
 * its pace and what it does on holds ("½", "2×", "MT"). `fallback` is the label to show for a
 * value the app doesn't word itself.
 */
export function cueValueLabel(
    id: string | null,
    settings: Readonly<Record<string, unknown>> | undefined,
    fallback: string,
): string {
    if (id === null) return fallback;
    if (id === FEET_STEP && settings) {
        const short = feetStepLabel(settings);
        if (short) return short;
    }
    const key = valueKey(id);
    return key ? tolgee.t(`${key}.label`, fallback) : fallback;
}

/** Feet Step's label from its settings, or null for the plain label. */
export function feetStepLabel(
    settings: Readonly<Record<string, unknown>>,
): string | null {
    if (settings.pace === "half")
        return tolgee.t("visuals.values.feet.step.half", "½");
    if (settings.pace === "double")
        return tolgee.t("visuals.values.feet.step.double", "2×");
    if (settings.onHolds === "markTime" || settings.onHolds === "highMarkTime")
        return tolgee.t("visuals.values.feet.step.markTime", "MT");
    return null;
}

/** A cue channel's name, for a channel the Visuals tabs have; the id for any other. */
export function cueChannelName(channel: string): string {
    switch (channel) {
        case "feet":
            return tolgee.t("visuals.channels.feet", "Feet");
        case "horn_equipment":
            return tolgee.t(
                "visuals.channels.hornEquipment",
                "Horn / Equipment",
            );
        case "facing":
            return tolgee.t("visuals.channels.facing", "Facing");
        case "body":
            return tolgee.t("visuals.channels.body", "Body");
        default:
            return channel;
    }
}
