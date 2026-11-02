import { TimelineWriteError } from "@/db-functions/timelineErrors";
import { translateTimelineText } from "@/timeline/translateTimelineText";

/**
 * A timeline refusal as the user reads it, after its code: "E-ARGS: T1 is in Page 3's move, …".
 * A refusal's own `message` is its key and arguments, for logs (`timelineTextForLog`); this
 * translates its text with Tolgee, in English in tests, as `timelineErrorMessage` does when it's
 * shown. Any other error gives its message.
 */
export function refusalText(error: unknown): string {
    if (error instanceof TimelineWriteError && error.text)
        return `${error.code}: ${translateTimelineText(error.text)}`;
    return error instanceof Error ? error.message : String(error);
}
