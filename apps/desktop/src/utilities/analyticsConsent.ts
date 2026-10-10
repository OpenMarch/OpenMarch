import posthog from "posthog-js";
import * as Sentry from "@sentry/electron/renderer";

const SENTRY_DSN =
    "https://72e6204c8e527c4cb7a680db2f9a1e0b@o4509010215239680.ingest.us.sentry.io/4509010222579712";

/** Applies the analytics choice to this renderer's PostHog and Sentry. Does not persist it. */
export function applyAnalyticsConsent(optOut: boolean) {
    if (optOut) posthog.opt_out_capturing();
    else posthog.opt_in_capturing();
    Sentry.init({ dsn: SENTRY_DSN, enabled: !optOut });
}
