/**
 * The app's CSP headers in desktop dev, where the renderer comes from the dev server over http
 * (fork #998, #1011). A worker loaded by URL takes its policy only from its own response, never
 * from the page, so `onHeadersReceived` puts each listed worker's policy (`src/security/appCsp.ts`)
 * on its script in place of the page's. The packaged app's `app://openmarch` handler
 * (`appProtocol.ts`) sends the same table.
 */
import { workerPolicyFor } from "../../src/security/appCsp";

type HeaderMap = Record<string, string | string[]>;

/**
 * The response headers with the app's CSP: the page's policy added as before, except on a
 * listed worker's script, whose headers get the worker's policy as their only CSP. Header names
 * are case-insensitive and two policies would both apply, so any CSP already on the worker's
 * response (the dev server sends one) is replaced.
 */
export function withAppCsp(
    url: string,
    headers: HeaderMap | undefined,
    pagePolicy: string,
): HeaderMap {
    const worker = workerPolicyFor(url);
    if (!worker) return { ...headers, "Content-Security-Policy": [pagePolicy] };
    const out: HeaderMap = {};
    for (const [name, value] of Object.entries(headers ?? {}))
        if (name.toLowerCase() !== "content-security-policy") out[name] = value;
    out["Content-Security-Policy"] = [worker.csp];
    return out;
}
