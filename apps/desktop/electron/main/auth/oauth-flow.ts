/* eslint-disable no-console */
/**
 * OAuth PKCE flow implementation for Clerk authentication.
 * Handles authorization URL generation, token exchange, and token refresh.
 */

import { shell } from "electron";
import { randomBytes, createHash } from "node:crypto";
import type {
    PendingAuthFlow,
    ClerkOAuthConfig,
    TokenExchangeRequest,
    TokenRefreshRequest,
    ClerkTokenResponse,
    AuthTokens,
} from "./types";
import {
    AUTH_FLOW_TIMEOUT_MS,
    OAUTH_SCOPES,
    CLERK_CONFIG,
    getClerkAuthorizationEndpoint,
    getClerkTokenEndpoint,
    getRedirectUri,
} from "../../../src/global/auth/constants";

/**
 * Gets the Clerk OAuth configuration.
 */
function getClerkConfig(): ClerkOAuthConfig {
    return {
        clientId: CLERK_CONFIG.CLIENT_ID,
        authorizationEndpoint: getClerkAuthorizationEndpoint(),
        tokenEndpoint: getClerkTokenEndpoint(),
        redirectUri: getRedirectUri(),
        scopes: OAUTH_SCOPES,
    };
}

/**
 * Generates a cryptographically secure random string.
 * Returns base64url-encoded string (URL-safe, no padding).
 */
function generateRandomString(length: number): string {
    const bytes = randomBytes(length);
    return bytes.toString("base64url");
}

/**
 * Generates SHA256 hash of the code verifier for PKCE challenge.
 * Returns base64url-encoded hash (URL-safe, no padding).
 */
function generateCodeChallenge(codeVerifier: string): string {
    const hash = createHash("sha256").update(codeVerifier).digest();
    return hash.toString("base64url");
}

/**
 * Initiates the OAuth PKCE flow.
 * Generates PKCE values and opens the system browser to Clerk.
 * @returns The pending auth flow data to be stored
 */
export function initiateOAuthFlow(): PendingAuthFlow {
    const config = getClerkConfig();

    // Generate PKCE values
    // 32 bytes = 256 bits of entropy for code verifier
    const codeVerifier = generateRandomString(32);
    const codeChallenge = generateCodeChallenge(codeVerifier);
    // 16 bytes = 128 bits of entropy for state
    const state = generateRandomString(16);

    const now = Date.now();
    const pendingFlow: PendingAuthFlow = {
        codeVerifier,
        state,
        initiatedAt: now,
        expiresAt: now + AUTH_FLOW_TIMEOUT_MS,
    };

    // Build authorization URL
    const authUrl = new URL(config.authorizationEndpoint);
    authUrl.searchParams.set("client_id", config.clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", config.redirectUri);
    authUrl.searchParams.set("scope", config.scopes.join(" "));
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    console.log("[Auth] Opening browser for OAuth authorization");

    // Open system browser
    void shell.openExternal(authUrl.toString());

    return pendingFlow;
}

/**
 * Exchanges the authorization code for tokens.
 * @param code - Authorization code from callback
 * @param codeVerifier - PKCE code verifier from pending flow
 * @returns Parsed tokens
 */
export async function exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
): Promise<AuthTokens> {
    const config = getClerkConfig();

    const requestBody: TokenExchangeRequest = {
        client_id: config.clientId,
        code,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
    };

    console.log("[Auth] Exchanging authorization code for tokens...");

    const response = await fetch(config.tokenEndpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(
            requestBody as unknown as Record<string, string>,
        ),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(
            "[Auth] Token exchange failed:",
            response.status,
            errorText,
        );
        throw new Error(`Token exchange failed: ${response.status}`);
    }

    const data: ClerkTokenResponse = await response.json();

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        idToken: data.id_token,
        expiresAt: Date.now() + data.expires_in * 1000,
        tokenType: data.token_type,
    };
}

/**
 * Refreshes the access token using the refresh token.
 * @param refreshToken - Current refresh token
 * @returns New tokens
 */
export async function refreshAccessToken(
    refreshToken: string,
): Promise<AuthTokens> {
    const config = getClerkConfig();

    const requestBody: TokenRefreshRequest = {
        client_id: config.clientId,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
    };

    console.log("[Auth] Refreshing access token...");

    const response = await fetch(config.tokenEndpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(
            requestBody as unknown as Record<string, string>,
        ),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(
            "[Auth] Token refresh failed:",
            response.status,
            errorText,
        );
        throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data: ClerkTokenResponse = await response.json();

    return {
        accessToken: data.access_token,
        // Some providers don't rotate refresh tokens, keep the old one if not provided
        refreshToken: data.refresh_token || refreshToken,
        idToken: data.id_token,
        expiresAt: Date.now() + data.expires_in * 1000,
        tokenType: data.token_type,
    };
}
