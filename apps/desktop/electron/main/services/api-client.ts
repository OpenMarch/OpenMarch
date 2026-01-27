/**
 * API client utilities for making authenticated requests to the OpenMarch API from the main process.
 */

import { OPENMARCH_API_ENDPOINT } from "../../../src/global/Constants";
import { getValidAccessToken } from "../auth/token-manager";

/**
 * Gets the API endpoint from environment variable and ensures proper slash handling.
 * @throws {Error} If OPENMARCH_API_ENDPOINT is not defined
 */
function getApiEndpoint(): string {
    // Remove trailing slash if present
    return OPENMARCH_API_ENDPOINT.endsWith("/")
        ? OPENMARCH_API_ENDPOINT.slice(0, -1)
        : OPENMARCH_API_ENDPOINT;
}

/**
 * Makes an authenticated fetch request to the API.
 * Automatically includes the Authorization header with a valid access token.
 *
 * @param path - The API path (e.g., 'v1/ensembles' or '/v1/ensembles')
 * @param options - Fetch options (method, body, headers, etc.)
 * @returns The fetch Response
 * @throws {Error} If authentication fails or the endpoint is not configured
 */
export async function authenticatedFetch(
    path: string,
    options: RequestInit = {},
): Promise<Response> {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
        throw new Error(
            "Authentication required. Please sign in to make API requests.",
        );
    }

    const endpoint = getApiEndpoint();
    // Construct URL: if path is empty, use endpoint directly; otherwise ensure path starts with /
    const normalizedPath =
        path.length > 0 ? (path.startsWith("/") ? path : `/${path}`) : "";
    const url = `${endpoint}${normalizedPath}`;

    const headers = new Headers(options.headers);

    // Only set Content-Type if not already set (important for FormData uploads)
    if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
    }

    headers.set("Authorization", `Bearer ${accessToken}`);

    const response = await fetch(url, {
        ...options,
        headers,
    });

    return response;
}
