import { webChannel } from "./webBuild";

/** Web channels built for developers and reviewers, not the public. */
const DEV_WEB_CHANNELS = new Set(["dev", "preview", "nightly"]);

/**
 * Whether this is a developer build: a Vite dev server (Electron or web), a
 * local web build (channel "dev"), the fork's preview Worker, or the nightly
 * Worker and its per-branch preview URLs. Stable, lab (tester) and packaged
 * Electron builds are not. Dev-only controls show only here.
 */
export function isDevBuildFor(env: {
    dev: boolean;
    webChannel: string | undefined;
}): boolean {
    return (
        env.dev ||
        (env.webChannel !== undefined && DEV_WEB_CHANNELS.has(env.webChannel))
    );
}

export const isDevBuild = isDevBuildFor({
    dev: import.meta.env.DEV,
    webChannel,
});
