import { version } from "../../package.json";

/**
 * The website for an app version. Released versions (`0.1.7`) use
 * openmarch.com. Pre-release versions (`0.2.0-beta.1`, nightlies) use
 * preview.openmarch.com, which is built from the same `prerelease/*` branch,
 * so Help and the guide links show the docs for what the user is running.
 */
export const siteUrlFor = (appVersion: string) =>
    /^\d+\.\d+\.\d+-/.test(appVersion)
        ? "https://preview.openmarch.com"
        : "https://openmarch.com";

/** The website for this build. */
export const SITE_URL = siteUrlFor(version);

/** A page on {@link SITE_URL}; `path` starts with "/". */
export const siteUrl = (path: string) => `${SITE_URL}${path}`;
