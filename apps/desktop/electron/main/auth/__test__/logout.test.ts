import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthTokens } from "../types";
import { AUTH_IPC_CHANNELS } from "../../../../src/global/auth/constants";
import { initAuthAfterReady } from "../index";
import { getStoredTokens, storeTokens } from "../token-manager";

const { handlers, revokeRefreshToken, storeData } = vi.hoisted(() => ({
    handlers: new Map<string, () => Promise<unknown>>(),
    revokeRefreshToken: vi.fn(),
    storeData: new Map<string, unknown>(),
}));

// Hoisted above the imports by vitest.
vi.mock("electron-store", () => ({
    default: class {
        get(key: string) {
            return storeData.get(key);
        }
        set(key: string, value: unknown) {
            storeData.set(key, value);
        }
        delete(key: string) {
            storeData.delete(key);
        }
    },
}));
vi.mock("electron", () => ({
    ipcMain: {
        handle: (channel: string, handler: () => Promise<unknown>) =>
            handlers.set(channel, handler),
    },
    BrowserWindow: class {},
    safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (value: string) => Buffer.from(value, "utf-8"),
        decryptString: (buffer: Buffer) => buffer.toString("utf-8"),
    },
}));
vi.mock("../protocol-handler", () => ({
    registerProtocolHandler: vi.fn(),
    setupProtocolListeners: vi.fn(),
    handleSecondInstanceUrl: vi.fn(),
    parseCallbackUrl: vi.fn(),
}));
vi.mock("../oauth-flow", () => ({
    initiateOAuthFlow: vi.fn(),
    exchangeCodeForTokens: vi.fn(),
    refreshAccessToken: vi.fn(),
    revokeRefreshToken,
}));

const TOKENS: AuthTokens = {
    accessToken: "access-1",
    refreshToken: "refresh-1",
    idToken: "header.payload.sig",
    expiresAt: Date.now() + 60 * 60 * 1000,
    tokenType: "bearer",
};

function logout() {
    return handlers.get(AUTH_IPC_CHANNELS.LOGOUT)!();
}

describe("the sign-out handler", () => {
    beforeEach(() => {
        storeData.clear();
        handlers.clear();
        revokeRefreshToken.mockReset();
        vi.spyOn(console, "log").mockImplementation(() => {});
        initAuthAfterReady(() => null);
    });

    it("revokes the refresh token it held and clears the tokens", async () => {
        revokeRefreshToken.mockResolvedValue(undefined);
        storeTokens(TOKENS);

        await expect(logout()).resolves.toEqual({ success: true });

        expect(revokeRefreshToken).toHaveBeenCalledExactlyOnceWith("refresh-1");
        expect(getStoredTokens()).toBeNull();
    });

    it("has nothing to revoke when signed out", async () => {
        await expect(logout()).resolves.toEqual({ success: true });

        expect(revokeRefreshToken).not.toHaveBeenCalled();
    });

    it("doesn't wait for Clerk", async () => {
        revokeRefreshToken.mockReturnValue(new Promise(() => {}));
        storeTokens(TOKENS);

        await expect(logout()).resolves.toEqual({ success: true });

        expect(getStoredTokens()).toBeNull();
    });
});
