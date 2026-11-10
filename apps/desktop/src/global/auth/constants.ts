/**
 * Shared constants for Clerk OAuth authentication.
 * Used by both main and renderer processes.
 */

import { isWebBuild } from "../../utilities/webBuild";

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

/** OAuth token endpoint request timeout in milliseconds */
export const OAUTH_TOKEN_REQUEST_TIMEOUT_MS = 30 * 1000;

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

/**
 * The web build's Clerk publishable key: the production instance's
 * (`pk_live_…`) on the sites, a development instance's (`pk_test_…`) in
 * local development, or empty (the examples build, or dev without one). The web build signs in with ClerkJS (web/renderer/auth.ts)
 * instead of the desktop app's OAuth flow.
 */
export const WEB_CLERK_PUBLISHABLE_KEY: string =
    import.meta.env.VITE_PUBLIC_WEB_CLERK_PUBLISHABLE_KEY ?? "";

/**
 * Whether this page is on the site the Clerk instance serves: the domain its
 * Frontend API host is under (clerk.openmarch.com → openmarch.com). A
 * production instance turns other sites down, such as the `workers.dev`
 * preview URLs Cloudflare gives each branch of the nightly build.
 */
export function isOnClerkSite(publishableKey: string, hostname: string) {
    let host: string;
    try {
        host = atob(publishableKey.split("_")[2] ?? "").replace(/\$$/, "");
    } catch {
        return false;
    }
    const site = host.split(".").slice(1).join(".");
    return site !== "" && (hostname === site || hostname.endsWith(`.${site}`));
}

/**
 * Whether the web build can sign in with this key on this site: a
 * development instance's key (`pk_test_…`, local development) runs anywhere,
 * a production key only on its own site.
 */
export function canSignInHere(publishableKey: string, hostname: string) {
    if (publishableKey === "") return false;
    return (
        publishableKey.startsWith("pk_test_") ||
        isOnClerkSite(publishableKey, hostname)
    );
}

/**
 * True when sign-in is configured: both Clerk env vars in the desktop app;
 * in the web build, a publishable key that works on this site.
 * Sign-in is disabled when false.
 */
export const isSignInEnabled = isWebBuild
    ? typeof globalThis.location !== "undefined" &&
      canSignInHere(WEB_CLERK_PUBLISHABLE_KEY, globalThis.location.hostname)
    : CLERK_CONFIG !== null;

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
 * Gets the Clerk OAuth revocation endpoint URL (RFC 7009), as the instance's
 * OpenID configuration lists it.
 * Only call when isSignInEnabled is true (CLERK_CONFIG is non-null).
 */
export function getClerkRevocationEndpoint(): string {
    if (!CLERK_CONFIG) return "";
    return `https://${CLERK_CONFIG.DOMAIN}/oauth/token/revoke`;
}

/**
 * Gets the Clerk accounts sign-up URL.
 * Only call when isSignInEnabled is true (CLERK_CONFIG is non-null).
 * Returns null when VITE_SIGN_UP_URL is unset.
 */
export function getClerkSignUpUrl(): string | null {
    const signUpUrl = import.meta.env.VITE_SIGN_UP_URL;
    if (typeof signUpUrl === "string" && signUpUrl.length > 0) return signUpUrl;
    return null;
}

/**
 * Gets the OAuth redirect URI.
 */
export function getRedirectUri(): string {
    return `${PROTOCOL_SCHEME}://auth/callback`;
}
