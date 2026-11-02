import tolgee from "@/global/singletons/Tolgee";
import {
    joinListIn,
    resolveTimelineText,
    type TimelineTextArg,
    type TimelineTextTranslate,
} from "./timelineText";

/**
 * A `TimelineText` (or a list or plain argument) in the app's language now, with the Tolgee
 * singleton; `translate` swaps the lookup (a component's `t`, a test's). Call it when the text is
 * shown, never at module load.
 */
export function translateTimelineText(
    value: TimelineTextArg,
    translate: TimelineTextTranslate = (key, params) => tolgee.t(key, params),
): string {
    return resolveTimelineText(value, translate, tolgee.getLanguage() ?? "en");
}

/** `items` joined as a list in the app's language now: "A", "A and B", "A, B and C". */
export const joinList = (items: readonly string[]): string =>
    joinListIn(items, tolgee.getLanguage() ?? "en");
