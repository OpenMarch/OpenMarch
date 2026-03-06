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
 * Clerk OAuth configuration from environment.
 * Sign-in is enabled only when both VITE_CLERK_AUTHORIZATION_DOMAIN and
 * VITE_CLERK_CLIENT_ID are set; otherwise this is null and sign-in is disabled.
 */
const domain = import.meta.env.VITE_CLERK_AUTHORIZATION_DOMAIN;
const clientId = import.meta.env.VITE_CLERK_CLIENT_ID;
export const CLERK_CONFIG: { DOMAIN: string; CLIENT_ID: string } | null =
    typeof domain === "string" &&
    domain.length > 0 &&
    typeof clientId === "string" &&
    clientId.length > 0
        ? { DOMAIN: domain, CLIENT_ID: clientId }
        : null;

/** True when both Clerk env vars are set; sign-in is disabled when false. */
export const isSignInEnabled = CLERK_CONFIG !== null;

/**
 * Gets the Clerk OAuth authorization endpoint URL.
 * Only call when isSignInEnabled is true (CLERK_CONFIG is non-null).
 */
export function getClerkAuthorizationEndpoint(): string {
    if (!CLERK_CONFIG) return "";
    return `https://${CLERK_CONFIG.DOMAIN}/oauth/authorize`;
}

/**
 * Gets the Clerk OAuth token endpoint URL.
 * Only call when isSignInEnabled is true (CLERK_CONFIG is non-null).
 */
export function getClerkTokenEndpoint(): string {
    if (!CLERK_CONFIG) return "";
    return `https://${CLERK_CONFIG.DOMAIN}/oauth/token`;
}

/**
 * Gets the OAuth redirect URI.
 */
export function getRedirectUri(): string {
    return `${PROTOCOL_SCHEME}://auth/callback`;
}
