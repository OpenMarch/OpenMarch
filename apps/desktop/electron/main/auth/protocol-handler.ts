/* eslint-disable no-console */
/**
 * Custom protocol handler for OAuth callbacks.
 * Registers openmarch:// protocol and handles OAuth redirects.
 */

import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import {
    PROTOCOL_SCHEME,
    AUTH_CALLBACK_PATH,
} from "../../../src/global/auth/constants";

/** Callback handler for auth URLs */
let callbackHandler: ((url: string) => void) | null = null;

/**
 * Registers the openmarch:// protocol handler.
 * Must be called before app.whenReady() for proper registration.
 */
export function registerProtocolHandler(): void {
    // In development mode with process.defaultApp, we need to pass
    // the current script path to properly handle the protocol
    if (process.defaultApp) {
        if (process.argv.length >= 2) {
            app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [
                join(process.argv[1]),
            ]);
        }
    } else {
        // Packaged app - simple registration
        app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
    }

    console.log(`[Auth] Registered protocol handler for ${PROTOCOL_SCHEME}://`);
}

/**
 * Sets up event listeners for protocol callbacks.
 * @param getWindow - Function to get the main BrowserWindow
 * @param onCallback - Handler function for auth callback URLs
 */
export function setupProtocolListeners(
    getWindow: () => BrowserWindow | null,
    onCallback: (url: string) => void,
): void {
    callbackHandler = onCallback;

    // macOS: Handle open-url event
    // This event fires when the app is already running or launched via URL
    app.on("open-url", (event, url) => {
        event.preventDefault();
        handleProtocolUrl(url, getWindow);
    });
}

/**
 * Handles second-instance event for Windows/Linux OAuth callbacks.
 * Should be called from the existing second-instance handler in main/index.ts.
 * @param commandLine - Command line arguments from second instance
 * @param getWindow - Function to get the main BrowserWindow
 * @returns true if URL was an auth callback, false otherwise
 */
export function handleSecondInstanceUrl(
    commandLine: string[],
    getWindow: () => BrowserWindow | null,
): boolean {
    // Look for openmarch:// URL in command line args
    const url = commandLine.find((arg) =>
        arg.startsWith(`${PROTOCOL_SCHEME}://`),
    );

    if (url) {
        handleProtocolUrl(url, getWindow);
        return true;
    }

    return false;
}

/**
 * Parses and handles a protocol URL.
 */
function handleProtocolUrl(
    url: string,
    getWindow: () => BrowserWindow | null,
): void {
    console.log("[Auth] Received protocol URL:", url);

    try {
        const parsedUrl = new URL(url);

        // Check if this is an auth callback
        // Support both formats:
        // - openmarch://auth/callback?code=...
        // - openmarch://auth/callback?code=... (where host is "auth" and path is "/callback")
        const isAuthCallback =
            parsedUrl.pathname === AUTH_CALLBACK_PATH ||
            (parsedUrl.host === "auth" && parsedUrl.pathname === "/callback");

        if (isAuthCallback) {
            // Focus the main window
            const win = getWindow();
            if (win) {
                if (win.isMinimized()) win.restore();
                win.focus();
            }

            // Call the registered handler
            if (callbackHandler) {
                callbackHandler(url);
            }
        } else {
            console.log(
                "[Auth] Ignoring non-auth protocol URL:",
                parsedUrl.pathname,
            );
        }
    } catch (error) {
        console.error("[Auth] Failed to parse protocol URL:", error);
    }
}

/**
 * Parses OAuth callback URL to extract code and state.
 * @param url - The callback URL
 * @returns Object with code and state, or null if parsing failed
 */
export function parseCallbackUrl(
    url: string,
): { code: string; state: string } | null {
    try {
        const parsedUrl = new URL(url);
        const code = parsedUrl.searchParams.get("code");
        const state = parsedUrl.searchParams.get("state");

        if (code && state) {
            return { code, state };
        }

        // Check for error response from OAuth provider
        const error = parsedUrl.searchParams.get("error");
        const errorDescription =
            parsedUrl.searchParams.get("error_description");

        if (error) {
            console.error(
                "[Auth] OAuth error in callback:",
                error,
                errorDescription,
            );
        }

        return null;
    } catch (error) {
        console.error("[Auth] Failed to parse callback URL:", error);
        return null;
    }
}
