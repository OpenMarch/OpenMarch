/**
 * Diagnostic events the app sends to Sentry by itself (a leftover journal that stopped an open,
 * working-copy save numbers) carry no paths or show names, and are sent only while analytics
 * are allowed.
 *
 * The main-process SDK records `console.*` calls as breadcrumbs and attaches them to every
 * event, and the app's logs name files and shows. So diagnostic events are tagged, and
 * {@link stripDiagnosticBreadcrumbs} (the SDK's `beforeSend`) drops their breadcrumbs.
 */

/** The tag that marks an event as one of the app's own diagnostics. */
export const DIAGNOSTIC_TAG = "diagnostic";

/** `tags` with the diagnostic mark added, for `captureMessage`. */
export function diagnosticTags<T extends Record<string, string | boolean>>(
    tags: T,
): T & { [DIAGNOSTIC_TAG]: "true" } {
    return { ...tags, [DIAGNOSTIC_TAG]: "true" };
}

/** Drops the breadcrumbs of a diagnostic event; other events pass through unchanged. */
export function stripDiagnosticBreadcrumbs<
    E extends { tags?: Record<string, unknown>; breadcrumbs?: unknown[] },
>(event: E): E {
    if (event.tags?.[DIAGNOSTIC_TAG] === undefined) return event;
    const { breadcrumbs: _dropped, ...rest } = event;
    return rest as E;
}
