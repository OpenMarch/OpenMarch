/**
 * The token endpoint turned the refresh token down (OAuth `invalid_grant`,
 * a revoked or expired refresh token, or a bad client), so signing in again
 * is the only way back. Other refresh failures (offline, timeouts, server
 * errors) are temporary and keep the stored tokens.
 */
export class TokenRefreshRejectedError extends Error {
    constructor(readonly status: number) {
        super(`Token refresh rejected: ${status}`);
        this.name = "TokenRefreshRejectedError";
    }
}

/** OAuth error codes (RFC 6749 §5.2) that mean the refresh token is done. */
const REJECTED_ERRORS = new Set([
    "invalid_grant",
    "invalid_client",
    "unauthorized_client",
]);

/** HTTP statuses that are worth trying again later. */
const TEMPORARY_STATUSES = new Set([408, 425, 429]);

/**
 * Whether a failed token response means the refresh token will never work
 * again. The OAuth error code decides when the body has one; otherwise a
 * 4xx is final, except timeouts and rate limits, and a 5xx is temporary.
 */
export function isRefreshRejected(status: number, body: string): boolean {
    try {
        const error = (JSON.parse(body) as { error?: unknown }).error;
        if (typeof error === "string") return REJECTED_ERRORS.has(error);
    } catch {
        // Not JSON: go by the status.
    }
    return status >= 400 && status < 500 && !TEMPORARY_STATUSES.has(status);
}
