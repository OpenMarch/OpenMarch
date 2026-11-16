/**
 * The model import worker's own CSP on desktop (fork #998; ADR 0010 amendment 2026-11-15). A
 * worker loaded by URL takes its policy only from its own response, never from the page, so
 * `onHeadersReceived` puts `MODEL_IMPORT_WORKER_CSP` on that one script's response in place of
 * the page's policy. The page's policy doesn't change.
 *
 * This covers the app over http (dev). The packaged app loads from `file://`, whose responses
 * carry no headers: neither `onHeadersReceived` nor a `file:` protocol handler sees a worker's
 * script there (tried; the handler sees the page's files but not the worker's), so the worker
 * runs with no policy until the renderer is served from a custom scheme (fork #1011).
 */
import {
    isModelImportWorkerUrl,
    MODEL_IMPORT_WORKER_CSP,
} from "../../src/showAssets/modelImport/protocol";

type HeaderMap = Record<string, string | string[]>;

/**
 * The response headers with the app's CSP: the page's policy added as before, except on the
 * import worker's script, whose headers get the worker's policy as their only CSP. Header names
 * are case-insensitive and two policies would both apply, so any CSP already on the worker's
 * response (the dev server sends one) is replaced.
 */
export function withAppCsp(
    url: string,
    headers: HeaderMap | undefined,
    pagePolicy: string,
): HeaderMap {
    if (!isModelImportWorkerUrl(url))
        return { ...headers, "Content-Security-Policy": [pagePolicy] };
    const out: HeaderMap = {};
    for (const [name, value] of Object.entries(headers ?? {}))
        if (name.toLowerCase() !== "content-security-policy") out[name] = value;
    out["Content-Security-Policy"] = [MODEL_IMPORT_WORKER_CSP];
    return out;
}
