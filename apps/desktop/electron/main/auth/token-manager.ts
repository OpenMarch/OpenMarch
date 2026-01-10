/* eslint-disable no-console */
/**
 * Token management for Clerk OAuth authentication.
 * Handles encrypted storage, retrieval, and automatic refresh of auth tokens.
 */

import Store from "electron-store";
import { safeStorage } from "electron";
import type { AuthTokens, AuthUser, AuthState, PendingAuthFlow } from "./types";
import { TOKEN_REFRESH_BUFFER_MS } from "../../../src/global/auth/constants";

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
 * Encrypts and stores tokens securely.
 */
export function storeTokens(tokens: AuthTokens): void {
    const tokenString = JSON.stringify(tokens);

    // Use Electron's safeStorage for encryption if available
    if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(tokenString);
        authStore.set("encryptedTokens", encrypted.toString("base64"));
    } else {
        // Fallback: store as-is (less secure, but better than nothing)
        console.warn(
            "[Auth] Encryption not available, storing tokens unencrypted",
        );
        authStore.set(
            "encryptedTokens",
            Buffer.from(tokenString).toString("base64"),
        );
    }

    cachedTokens = tokens;
    scheduleTokenRefresh(tokens);
}

/**
 * Retrieves and decrypts stored tokens.
 */
export function getStoredTokens(): AuthTokens | null {
    if (cachedTokens) {
        return cachedTokens;
    }

    const encrypted = authStore.get("encryptedTokens");
    if (!encrypted) {
        return null;
    }

    try {
        const buffer = Buffer.from(encrypted, "base64");

        let tokenString: string;
        if (safeStorage.isEncryptionAvailable()) {
            tokenString = safeStorage.decryptString(buffer);
        } else {
            tokenString = buffer.toString("utf-8");
        }

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
        console.error("[Auth] State mismatch - possible CSRF attack");
        clearPendingFlow();
        return null;
    }

    return flow;
}

/**
 * Gets a valid token for API authentication, refreshing if necessary.
 *
 * Returns the ID token (JWT) instead of the access token because:
 * - Clerk's Ruby SDK verify_token() method expects a JWT with 'sub' claim
 * - The ID token is a JWT with user claims including 'sub' (subject/user ID)
 * - OAuth access tokens may be opaque and not directly verifiable by verify_token()
 *
 * Note: The token expiration check uses the access token's expiration time,
 * but we return the ID token which typically has a similar or shorter lifespan.
 */
export async function getValidAccessToken(): Promise<string | null> {
    const tokens = getStoredTokens();

    if (!tokens) {
        return null;
    }

    // Check if token is expired or about to expire
    const now = Date.now();
    const isExpired = now >= tokens.expiresAt;
    const needsRefresh = now >= tokens.expiresAt - TOKEN_REFRESH_BUFFER_MS;

    if (isExpired || needsRefresh) {
        if (!onTokenRefresh) {
            console.error("[Auth] Token refresh callback not set");
            if (isExpired) {
                clearTokens();
                return null;
            }
            // Return ID token for Rails SDK verification (JWT with sub claim)
            return tokens.idToken;
        }

        try {
            const newTokens = await onTokenRefresh(tokens);
            storeTokens(newTokens);
            // Return ID token for Rails SDK verification (JWT with sub claim)
            return newTokens.idToken;
        } catch (error) {
            console.error("[Auth] Failed to refresh token:", error);

            if (isExpired) {
                // Token is expired and refresh failed - user needs to re-authenticate
                clearTokens();
                return null;
            }

            // Token not yet expired, return current ID token
            return tokens.idToken;
        }
    }

    // Return ID token for Rails SDK verification (JWT with sub claim)
    // The ID token is a JWT that Clerk's Ruby SDK verify_token() can verify
    return tokens.idToken;
}

/**
 * Schedules automatic token refresh.
 */
function scheduleTokenRefresh(tokens: AuthTokens): void {
    if (refreshTimer) {
        clearTimeout(refreshTimer);
    }

    const refreshAt = tokens.expiresAt - TOKEN_REFRESH_BUFFER_MS;
    const delay = Math.max(0, refreshAt - Date.now());

    if (delay > 0 && onTokenRefresh) {
        console.log(
            `[Auth] Scheduling token refresh in ${Math.round(delay / 1000)} seconds`,
        );

        refreshTimer = setTimeout(async () => {
            try {
                const currentTokens = getStoredTokens();
                if (currentTokens && onTokenRefresh) {
                    const newTokens = await onTokenRefresh(currentTokens);
                    storeTokens(newTokens);
                    console.log("[Auth] Token refreshed successfully");
                }
            } catch (error) {
                console.error("[Auth] Scheduled token refresh failed:", error);
            }
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
            error: null,
        };
    }

    // Check if token is expired
    if (Date.now() >= tokens.expiresAt) {
        return {
            isAuthenticated: false,
            isLoading: false,
            user: null,
            error: {
                code: "TOKEN_EXPIRED",
                message: "Your session has expired. Please sign in again.",
            },
        };
    }

    return {
        isAuthenticated: true,
        isLoading: false,
        user: getUserFromTokens(),
        error: null,
    };
}
