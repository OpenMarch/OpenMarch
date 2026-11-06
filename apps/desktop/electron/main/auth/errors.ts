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
