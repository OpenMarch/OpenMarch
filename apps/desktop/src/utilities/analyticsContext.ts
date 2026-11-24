import type { PostHog } from "posthog-js";
import { version } from "../../package.json";
import { useEditorModeStore } from "@/stores/EditorModeStore";
import { scrubUserPaths } from "./scrubUserPaths";

/**
 * The release channel a version belongs to: the first word of its pre-release tag (`beta` for
 * `0.2.0-beta.6`, `nightly` for `0.2.0-nightly.20261122.268`), or `release` for a plain version.
 */
export function releaseChannelOf(appVersion: string): string {
    const core = appVersion.split("+")[0];
    const dash = core.indexOf("-");
    if (dash < 0) return "release";
    return core.slice(dash + 1).split(".")[0] || "release";
}

/** Where PostHog keeps the URL of the first page it saw, sent with every feature flag request. */
const INITIAL_PERSON_INFO = "$initial_person_info";

/**
 * Forgets a stored first-page URL that names the computer's user. Builds that loaded from
 * `file://` (0.1.7) stored `file:///C:/Users/<name>/...`, and the storage move carries it to
 * this build. Feature flag requests send it without passing `before_send`. PostHog stores the
 * current URL again at the next event.
 */
export function forgetStoredUserPaths(
    posthog: Pick<PostHog, "get_property" | "unregister">,
): void {
    const stored: unknown = posthog.get_property(INITIAL_PERSON_INFO);
    if (stored !== undefined && scrubUserPaths(stored) !== stored)
        posthog.unregister(INITIAL_PERSON_INFO);
}

/**
 * Adds the app version, its release channel and Basic or Expert to every analytics event, so
 * events can be told apart by build and by kind of user. Keeps the mode current as it changes.
 */
export function registerAnalyticsContext(posthog: PostHog): void {
    posthog.register({
        app_version: version,
        release_channel: releaseChannelOf(version),
    });
    const registerMode = (mode: string | null) => {
        if (mode) posthog.register({ editor_mode: mode });
    };
    registerMode(useEditorModeStore.getState().mode);
    useEditorModeStore.subscribe((state, previous) => {
        if (state.mode !== previous.mode) registerMode(state.mode);
    });
}
