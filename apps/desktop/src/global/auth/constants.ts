/**
 * Shared constants for Clerk OAuth authentication.
 * Used by both main and renderer processes.
 */

/**
 * IPC channel names for auth communication between main and renderer.
 */
export const AUTH_IPC_CHANNELS = {
    // Renderer -> Main
    LOGIN: "auth:login",
    LOGOUT: "auth:logout",
    GET_STATE: "auth:get-state",
    GET_ACCESS_TOKEN: "auth:get-access-token",

    // Main -> Renderer
    STATE_CHANGED: "auth:state-changed",
    ERROR: "auth:error",
} as const;

/** Auth flow timeout in milliseconds (5 minutes) */
export const AUTH_FLOW_TIMEOUT_MS = 5 * 60 * 1000;

/** Token refresh buffer - refresh 5 minutes before expiry */
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** Custom protocol scheme for OAuth callbacks */
export const PROTOCOL_SCHEME = "openmarch";

/** OAuth callback path */
export const AUTH_CALLBACK_PATH = "/auth/callback";

/** OAuth scopes to request from Clerk */
export const OAUTH_SCOPES = ["openid", "profile", "email"];

/**
 * Clerk OAuth configuration.
 * TODO: Replace these placeholder values with your actual Clerk credentials.
 */
export const CLERK_CONFIG = {
    DOMAIN: "trusty-monarch-66.clerk.accounts.dev",
    // cspell:disable-next-line
    CLIENT_ID: "0PjXIVfaEcRMEeva",
} as const;

/**
 * Gets the Clerk OAuth authorization endpoint URL.
 */
export function getClerkAuthorizationEndpoint(): string {
    return `https://${CLERK_CONFIG.DOMAIN}/oauth/authorize`;
}

/**
 * Gets the Clerk OAuth token endpoint URL.
 */
export function getClerkTokenEndpoint(): string {
    return `https://${CLERK_CONFIG.DOMAIN}/oauth/token`;
}

/**
 * Gets the OAuth redirect URI.
 */
export function getRedirectUri(): string {
    return `${PROTOCOL_SCHEME}://auth/callback`;
}
