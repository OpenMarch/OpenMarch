/* eslint-disable no-console */
/**
 * Auth module entry point.
 * Initializes authentication and registers IPC handlers.
 */

import { ipcMain, BrowserWindow } from "electron";
import {
    AUTH_IPC_CHANNELS,
    isSignInEnabled,
} from "../../../src/global/auth/constants";
import {
    registerProtocolHandler,
    setupProtocolListeners,
    handleSecondInstanceUrl,
    parseCallbackUrl,
} from "./protocol-handler";
import {
    initiateOAuthFlow,
    exchangeCodeForTokens,
    refreshAccessToken,
    revokeRefreshToken,
} from "./oauth-flow";
import {
    beginSession,
    SESSION_EXPIRED,
    storePendingFlow,
    clearPendingFlow,
    validateState,
    clearTokens,
    getStoredTokens,
    getAuthState,
    getValidAccessToken,
    setTokenRefreshCallback,
    setSignedOutCallback,
    setTokensDiscardedCallback,
} from "./token-manager";
import type { AuthState, AuthError, AuthTokens } from "./types";

/** Reference to main window for IPC notifications */
let mainWindow: BrowserWindow | null = null;

/**
 * Sends auth state change notification to renderer.
 */
function notifyAuthStateChanged(state: AuthState): void {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(AUTH_IPC_CHANNELS.STATE_CHANGED, state);
    }
}

/**
 * Sends auth error notification to renderer.
 */
function notifyAuthError(error: AuthError): void {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(AUTH_IPC_CHANNELS.ERROR, error);
    }
}

/**
 * Handles the OAuth callback URL after user authenticates.
 */
async function handleAuthCallback(url: string): Promise<void> {
    const callbackData = parseCallbackUrl(url);

    if (!callbackData) {
        notifyAuthError({
            code: "INVALID_CALLBACK",
            message: "Invalid authentication callback received.",
        });
        return;
    }

    const { code, state } = callbackData;

    // Validate state to prevent CSRF attacks
    const pendingFlow = validateState(state);

    if (!pendingFlow) {
        notifyAuthError({
            code: "INVALID_STATE",
            message:
                "Authentication request expired or was tampered with. Please try again.",
        });
        return;
    }

    // One use only: a repeated callback link can't start a second exchange.
    clearPendingFlow();

    // Notify loading state
    notifyAuthStateChanged({
        isAuthenticated: false,
        isLoading: true,
        user: null,
        error: null,
    });

    try {
        // Exchange authorization code for tokens
        const tokens = await exchangeCodeForTokens(
            code,
            pendingFlow.codeVerifier,
        );

        // Store tokens securely
        beginSession(tokens);

        // Notify success
        notifyAuthStateChanged(getAuthState());

        console.log("[Auth] Authentication successful");
    } catch (error) {
        console.error("[Auth] Token exchange failed:", error);

        notifyAuthError({
            code: "TOKEN_EXCHANGE_FAILED",
            message: "Failed to complete authentication. Please try again.",
            details: error instanceof Error ? error.message : error,
        });
    }
}

/**
 * Token refresh callback for automatic token refresh.
 * A refresh keeps the same user, so the renderer isn't told: a state change
 * makes it reload every signed-in query.
 */
async function handleTokenRefresh(tokens: AuthTokens): Promise<AuthTokens> {
    return refreshAccessToken(tokens.refreshToken);
}

/**
 * Clerk rejected the refresh token, so the session is over.
 */
function handleSignedOut(): void {
    notifyAuthStateChanged({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: SESSION_EXPIRED,
    });
}

/** How long the state check waits on a token refresh before answering. */
const STATE_REFRESH_WAIT_MS = 5000;

/**
 * Initializes the auth module before app is ready.
 * Must be called before app.whenReady() for protocol registration.
 */
export function initAuthBeforeReady(): void {
    registerProtocolHandler();
}

/**
 * Sets up auth after the app is ready.
 * Registers IPC handlers and protocol listeners.
 * @param getWindow - Function to get the main BrowserWindow
 */
export function initAuthAfterReady(
    getWindow: () => BrowserWindow | null,
): void {
    mainWindow = getWindow();

    // Set up token refresh callback
    setTokenRefreshCallback(handleTokenRefresh);
    setSignedOutCallback(handleSignedOut);
    setTokensDiscardedCallback(
        (tokens) => void revokeRefreshToken(tokens.refreshToken),
    );

    // Set up protocol listeners for OAuth callbacks
    setupProtocolListeners(getWindow, handleAuthCallback);

    // Register IPC handlers

    /**
     * Login handler - initiates OAuth flow.
     * Opens the system browser to Clerk's authorization endpoint.
     */
    ipcMain.handle(AUTH_IPC_CHANNELS.LOGIN, async () => {
        console.log("[Auth] Login requested");

        if (!isSignInEnabled) {
            return {
                success: false,
                error: {
                    code: "SIGN_IN_DISABLED",
                    message: "Sign-in is not configured.",
                },
            };
        }

        try {
            const pendingFlow = await initiateOAuthFlow();
            storePendingFlow(pendingFlow);

            return { success: true };
        } catch (error) {
            console.error("[Auth] Failed to initiate OAuth flow:", error);

            return {
                success: false,
                error: {
                    code: "OAUTH_INIT_FAILED",
                    message: "Failed to start authentication.",
                },
            };
        }
    });

    /**
     * Logout handler - clears tokens and session, and revokes the refresh
     * token at Clerk.
     */
    ipcMain.handle(AUTH_IPC_CHANNELS.LOGOUT, async () => {
        console.log("[Auth] Logout requested");

        const refreshToken = getStoredTokens()?.refreshToken;
        clearTokens();
        // Signed out here at once; Clerk hears about it in the background
        // (offline, the token just runs out at Clerk instead).
        if (refreshToken) void revokeRefreshToken(refreshToken);

        notifyAuthStateChanged({
            isAuthenticated: false,
            isLoading: false,
            user: null,
            error: null,
        });

        return { success: true };
    });

    /**
     * Get current auth state handler.
     */
    ipcMain.handle(AUTH_IPC_CHANNELS.GET_STATE, async () => {
        // Refresh first if the token is due, so a session Clerk has ended
        // shows as signed out rather than failing on the first upload. A
        // slow network doesn't hold the answer up: a later rejection still
        // reaches the renderer as a state change.
        let timer: NodeJS.Timeout | undefined;
        await Promise.race([
            getValidAccessToken(),
            new Promise((resolve) => {
                timer = setTimeout(resolve, STATE_REFRESH_WAIT_MS);
            }),
        ]);
        clearTimeout(timer);
        return getAuthState();
    });

    /**
     * Get valid access token handler.
     * Returns a valid (potentially refreshed) access token for API calls.
     */
    ipcMain.handle(AUTH_IPC_CHANNELS.GET_ACCESS_TOKEN, async () => {
        const token = await getValidAccessToken();
        return { token };
    });

    console.log("[Auth] Auth module initialized");
}

/**
 * Handles second-instance event for Windows/Linux OAuth callbacks.
 * Should be called from the second-instance handler in main/index.ts.
 * @param commandLine - Command line arguments
 * @param getWindow - Function to get main window
 * @returns true if this was an auth callback, false otherwise
 */
export function handleAuthSecondInstance(
    commandLine: string[],
    getWindow: () => BrowserWindow | null,
): boolean {
    return handleSecondInstanceUrl(commandLine, getWindow);
}

// Re-export types for convenience
export type { AuthState, AuthError, AuthUser } from "./types";
