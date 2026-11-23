/**
 * The app's Content Security Policies, in one table (fork #1011). A worker loaded by URL takes
 * its policy only from its own response's headers, never from the page, so each place that
 * serves the app sends them:
 *
 * - the packaged desktop app: `electron/main/appProtocol.ts`, which serves `app://openmarch`;
 * - desktop dev: main's `onHeadersReceived` (`electron/main/workerCsp.ts`);
 * - the dev servers: `vite.modelImport.mjs`;
 * - the web build: its `_headers` file (`vite.web.config.mts`).
 *
 * Every response that isn't a listed worker gets the page's policy, so a worker added later
 * without a row here still runs under the page's rules rather than none.
 */
import { MODEL_IMPORT_WORKER_CSP } from "../showAssets/modelImport/protocol";

/** The desktop editor page's policy, sent as a header. `index.html`'s meta tag also applies. */
export const DESKTOP_PAGE_CSP =
    "script-src 'self' 'unsafe-inline' https://app.glitchtip.com https://us-assets.i.posthog.com; worker-src 'self' data: blob:;";

/** Its own code and nothing else: no network, no `eval`, no WebAssembly */
const COMPUTE_ONLY = "default-src 'none'; script-src 'self'";

export interface WorkerPolicy {
    /** The worker's file name without its extension, as in `audioOffset.worker.ts` */
    file: string;
    csp: string;
}

/** Each URL worker's own policy, the narrowest it runs under */
export const WORKER_POLICIES: readonly WorkerPolicy[] = [
    // Reads files from the internet (fork #998): WebAssembly decoders, nothing else
    { file: "modelImport.worker", csp: MODEL_IMPORT_WORKER_CSP },
    // Trims and pads decoded music
    { file: "audioOffset.worker", csp: COMPUTE_ONLY },
    // Web build: writes a video export into the origin private file system
    { file: "videoFile.worker", csp: COMPUTE_ONLY },
    // Web build: the show's database (SQLite's WebAssembly, fetched from the app's own files)
    // and the services the desktop app runs in its main process. Network use follows the
    // desktop main process's, so only code is restricted.
    {
        file: "backend.worker",
        csp: "script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; object-src 'none'",
    },
];

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The worker a URL loads, by its path: the dev server's `/…/<file>.ts?worker_file…`, or the
 * built `assets/<file>-<hash>.js`. Null for anything else.
 */
export function workerPolicyFor(url: string): WorkerPolicy | null {
    let pathname: string;
    try {
        pathname = new URL(url).pathname;
    } catch {
        return null;
    }
    return (
        WORKER_POLICIES.find(({ file }) =>
            new RegExp(`/${escape(file)}(?:\\.ts|-[A-Za-z0-9_-]+\\.js)$`).test(
                pathname,
            ),
        ) ?? null
    );
}

/** The policy a response gets: its worker's, or else the page's */
export const cspFor = (url: string, pagePolicy: string): string =>
    workerPolicyFor(url)?.csp ?? pagePolicy;
