/* eslint-disable no-console */
/**
 * Auth module entry point.
 * Initializes authentication and registers IPC handlers.
 */

import { ipcMain, BrowserWindow } from "electron";
import { AUTH_IPC_CHANNELS } from "../../../src/global/auth/constants";
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
} from "./oauth-flow";
import {
    storeTokens,
    storePendingFlow,
    clearPendingFlow,
    validateState,
    clearTokens,
    getAuthState,
    getValidAccessToken,
    setTokenRefreshCallback,
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
        storeTokens(tokens);

        // Clear pending flow
        clearPendingFlow();

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

        clearPendingFlow();
    }
}

/**
 * Token refresh callback for automatic token refresh.
 */
async function handleTokenRefresh(tokens: AuthTokens): Promise<AuthTokens> {
    const newTokens = await refreshAccessToken(tokens.refreshToken);

    // Notify renderer of updated auth state
    notifyAuthStateChanged({
        isAuthenticated: true,
        isLoading: false,
        user: getAuthState().user,
        error: null,
    });

    return newTokens;
}

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

    // Set up protocol listeners for OAuth callbacks
    setupProtocolListeners(getWindow, handleAuthCallback);

    // Register IPC handlers

    /**
     * Login handler - initiates OAuth flow.
     * Opens the system browser to Clerk's authorization endpoint.
     */
    ipcMain.handle(AUTH_IPC_CHANNELS.LOGIN, async () => {
        console.log("[Auth] Login requested");

        try {
            const pendingFlow = initiateOAuthFlow();
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
     * Logout handler - clears tokens and session.
     */
    ipcMain.handle(AUTH_IPC_CHANNELS.LOGOUT, async () => {
        console.log("[Auth] Logout requested");

        clearTokens();

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
