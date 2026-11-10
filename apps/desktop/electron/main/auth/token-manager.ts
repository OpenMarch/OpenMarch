/* eslint-disable no-console */
/**
 * Token management for Clerk OAuth authentication.
 * Handles encrypted storage, retrieval, and automatic refresh of auth tokens.
 */

import Store from "electron-store";
import { safeStorage } from "electron";
import type {
    AuthError,
    AuthTokens,
    AuthUser,
    AuthState,
    PendingAuthFlow,
} from "./types";
import { TOKEN_REFRESH_BUFFER_MS } from "../../../src/global/auth/constants";
import { TokenRefreshRejectedError } from "./errors";

/**
 * Store schema for auth data.
 */
interface AuthStoreSchema {
    /** Encrypted token data (base64 string) */
    encryptedTokens?: string;
    /** Pending OAuth flow data */
    pendingAuthFlow?: PendingAuthFlow;
}

const authStore = new Store<AuthStoreSchema>({
    name: "auth",
    defaults: {},
});

/** In-memory cached tokens for quick access */
let cachedTokens: AuthTokens | null = null;

/** Timer for scheduled token refresh */
let refreshTimer: NodeJS.Timeout | null = null;

/** Callback for token refresh - set by auth/index.ts */
let onTokenRefresh: ((tokens: AuthTokens) => Promise<AuthTokens>) | null = null;

/** Called when Clerk rejects the refresh token and the tokens are cleared */
let onSignedOut: (() => void) | null = null;

/** Called with tokens a refresh got for a session that has since ended */
let onTokensDiscarded: ((tokens: AuthTokens) => void) | null = null;

/** The refresh in progress, shared so only one runs at a time */
let refreshInFlight: Promise<AuthTokens | null> | null = null;

/**
 * Bumped whenever the stored tokens are cleared, so a refresh that finishes
 * after a sign-out doesn't store its tokens and sign the user back in.
 */
let tokenGeneration = 0;

/**
 * Why the last session ended, when it wasn't the user signing out; shown
 * with the signed-out state until the next sign-in.
 */
let signedOutReason: AuthError | null = null;

/** Clerk ended the session (rejected the refresh token). */
export const SESSION_EXPIRED: AuthError = {
    code: "TOKEN_EXPIRED",
    message: "Your session has expired. Please sign in again.",
};

/**
 * Sets the token refresh callback function.
 * This is called by auth/index.ts to inject the refresh implementation.
 */
export function setTokenRefreshCallback(
    callback: (tokens: AuthTokens) => Promise<AuthTokens>,
): void {
    onTokenRefresh = callback;
}

/**
 * Sets the function called when the session ends because Clerk rejected the
 * refresh token (not when the user signs out).
 */
export function setSignedOutCallback(callback: () => void): void {
    onSignedOut = callback;
}

/**
 * Sets the callback for tokens a refresh returned after their session ended
 * (signed out, or signed in again, while it was running).
 */
export function setTokensDiscardedCallback(
    callback: (tokens: AuthTokens) => void,
): void {
    onTokensDiscarded = callback;
}

/**
 * Encrypts and stores tokens securely.
 */
export function storeTokens(tokens: AuthTokens): void {
    cachedTokens = tokens;
    scheduleTokenRefresh(tokens);

    if (!safeStorage.isEncryptionAvailable()) {
        console.warn(
            "[Auth] Encryption not available; tokens kept in memory for this session only",
        );
        return;
    }

    const tokenString = JSON.stringify(tokens);
    const encrypted = safeStorage.encryptString(tokenString);
    authStore.set("encryptedTokens", encrypted.toString("base64"));
}

/**
 * Starts a new session with the tokens from a sign-in. A refresh still
 * running for an earlier session can't touch it.
 */
export function beginSession(tokens: AuthTokens): void {
    tokenGeneration++;
    signedOutReason = null;
    storeTokens(tokens);
}

/**
 * Retrieves and decrypts stored tokens.
 */
export function getStoredTokens(): AuthTokens | null {
    if (cachedTokens) {
        return cachedTokens;
    }

    if (!safeStorage.isEncryptionAvailable()) {
        return null;
    }

    const encrypted = authStore.get("encryptedTokens");
    if (!encrypted) {
        return null;
    }

    try {
        const buffer = Buffer.from(encrypted, "base64");
        const tokenString = safeStorage.decryptString(buffer);

        cachedTokens = JSON.parse(tokenString);

        if (cachedTokens) {
            scheduleTokenRefresh(cachedTokens);
        }

        return cachedTokens;
    } catch (error) {
        console.error("[Auth] Failed to decrypt tokens:", error);
        clearTokens();
        return null;
    }
}

/**
 * Clears all stored tokens and pending flows.
 */
export function clearTokens(): void {
    if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
    }

    cachedTokens = null;
    tokenGeneration++;
    signedOutReason = null;
    authStore.delete("encryptedTokens");
    authStore.delete("pendingAuthFlow");
}

/**
 * Stores the pending auth flow for callback validation.
 */
export function storePendingFlow(flow: PendingAuthFlow): void {
    authStore.set("pendingAuthFlow", flow);
}

/**
 * Retrieves and validates the pending auth flow.
 * Returns null if expired or not found.
 */
export function getPendingFlow(): PendingAuthFlow | null {
    const flow = authStore.get("pendingAuthFlow");

    if (!flow) {
        return null;
    }

    // Check if expired
    if (Date.now() > flow.expiresAt) {
        authStore.delete("pendingAuthFlow");
        return null;
    }

    return flow;
}

/**
 * Clears the pending auth flow.
 */
export function clearPendingFlow(): void {
    authStore.delete("pendingAuthFlow");
}

/**
 * Validates the state parameter from callback.
 * Returns the pending flow if valid, null otherwise.
 */
export function validateState(receivedState: string): PendingAuthFlow | null {
    const flow = getPendingFlow();

    if (!flow) {
        console.error("[Auth] No pending auth flow found");
        return null;
    }

    if (flow.state !== receivedState) {
        // Keep the pending flow: any web page can open an openmarch:// link,
        // and a stray one shouldn't cancel the sign-in the user started.
        console.error("[Auth] State mismatch - possible CSRF attack");
        return null;
    }

    return flow;
}

/**
 * Refreshes the tokens, sharing one request between all callers.
 *
 * Returns the new tokens, or null when the refresh failed. Only a rejection
 * from Clerk clears the stored tokens and ends the session; a temporary
 * failure (offline, timeout, server error) keeps them for the next try.
 */
async function refreshTokens(tokens: AuthTokens): Promise<AuthTokens | null> {
    if (refreshInFlight) return refreshInFlight;
    if (!onTokenRefresh) {
        console.error("[Auth] Token refresh callback not set");
        return null;
    }

    const refresh = onTokenRefresh;
    const generation = tokenGeneration;
    refreshInFlight = (async () => {
        try {
            const newTokens = await refresh(tokens);
            // Signed out while the refresh was running: drop the new tokens,
            // and don't leave them live at Clerk.
            if (generation !== tokenGeneration) {
                onTokensDiscarded?.(newTokens);
                return null;
            }
            storeTokens(newTokens);
            return newTokens;
        } catch (error) {
            if (generation !== tokenGeneration) return null;
            if (error instanceof TokenRefreshRejectedError) {
                console.error("[Auth] Refresh token rejected; signing out");
                clearTokens();
                signedOutReason = SESSION_EXPIRED;
                onSignedOut?.();
            } else {
                console.error("[Auth] Failed to refresh token:", error);
            }
            return null;
        } finally {
            refreshInFlight = null;
        }
    })();
    return refreshInFlight;
}

/**
 * Gets a valid token for API authentication, refreshing if necessary.
 *
 * Returns the ID token (JWT) instead of the access token because:
 * - Clerk's Ruby SDK verify_token() method expects a JWT with 'sub' claim
 * - The ID token is a JWT with user claims including 'sub' (subject/user ID)
 * - OAuth access tokens may be opaque and not directly verifiable by verify_token()
 *
 * Returns null when there is no valid token right now: signed out, or the
 * token expired and couldn't be refreshed (for example while offline).
 */
export async function getValidAccessToken(): Promise<string | null> {
    const tokens = getStoredTokens();

    if (!tokens) {
        return null;
    }

    const effectiveExpiry = getEffectiveTokenExpiry(tokens);

    if (Date.now() < effectiveExpiry - TOKEN_REFRESH_BUFFER_MS) {
        return tokens.idToken;
    }

    const newTokens = await refreshTokens(tokens);
    if (newTokens) return newTokens.idToken;

    // The refresh failed. The stored token (a new sign-in's, if one
    // happened meanwhile) still works if it hasn't expired; none is left if
    // the failed refresh ended the session.
    const current = getStoredTokens();
    if (current && Date.now() < getEffectiveTokenExpiry(current)) {
        return current.idToken;
    }
    return null;
}

/**
 * Schedules automatic token refresh.
 */
function scheduleTokenRefresh(tokens: AuthTokens): void {
    if (refreshTimer) {
        clearTimeout(refreshTimer);
    }

    const refreshAt = getEffectiveTokenExpiry(tokens) - TOKEN_REFRESH_BUFFER_MS;
    const delay = Math.max(0, refreshAt - Date.now());

    if (delay > 0 && onTokenRefresh) {
        console.log(
            `[Auth] Scheduling token refresh in ${Math.round(delay / 1000)} seconds`,
        );

        refreshTimer = setTimeout(() => {
            const currentTokens = getStoredTokens();
            if (currentTokens) void refreshTokens(currentTokens);
        }, delay);
    }
}

/**
 * Decodes the ID token to extract user info.
 * Note: This does NOT verify the signature - that should be done server-side.
 */
export function decodeIdToken(idToken: string): Record<string, unknown> | null {
    try {
        const parts = idToken.split(".");
        if (parts.length !== 3) return null;

        const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
        return JSON.parse(payload);
    } catch (error) {
        console.error("[Auth] Failed to decode ID token:", error);
        return null;
    }
}

function getEffectiveTokenExpiry(tokens: AuthTokens): number {
    const claims = decodeIdToken(tokens.idToken);
    const idTokenExpMs =
        typeof claims?.exp === "number" ? claims.exp * 1000 : tokens.expiresAt;
    return Math.min(tokens.expiresAt, idTokenExpMs);
}

/**
 * Extracts user info from stored tokens.
 */
export function getUserFromTokens(): AuthUser | null {
    const tokens = getStoredTokens();

    if (!tokens) {
        return null;
    }

    const claims = decodeIdToken(tokens.idToken);

    if (!claims) {
        return null;
    }

    return {
        id: claims.sub as string,
        email: (claims.email as string) || null,
        firstName: (claims.given_name as string) || null,
        lastName: (claims.family_name as string) || null,
        imageUrl: (claims.picture as string) || null,
    };
}

/**
 * Gets the current authentication state.
 */
export function getAuthState(): AuthState {
    const tokens = getStoredTokens();

    if (!tokens) {
        return {
            isAuthenticated: false,
            isLoading: false,
            user: null,
            error: signedOutReason,
        };
    }

    // An expired ID token isn't a sign-out: the stored refresh token gets a
    // new one on the next API call. The session only ends when Clerk rejects
    // the refresh token (see refreshTokens).
    return {
        isAuthenticated: true,
        isLoading: false,
        user: getUserFromTokens(),
        error: null,
    };
}
