import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthTokens, PendingAuthFlow } from "../types";

// electron-store and safeStorage stand-ins that keep everything in memory.
const storeData = new Map<string, unknown>();
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
    safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (value: string) => Buffer.from(value, "utf-8"),
        decryptString: (buffer: Buffer) => buffer.toString("utf-8"),
    },
}));

const HOUR = 60 * 60 * 1000;

/** An unsigned JWT with the given expiry; the token manager only decodes it. */
function idTokenExpiringAt(ms: number, sub = "user_1"): string {
    const encode = (value: object) =>
        Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "none" })}.${encode({ sub, exp: Math.floor(ms / 1000) })}.sig`;
}

function tokensExpiringAt(ms: number, label = "old"): AuthTokens {
    return {
        accessToken: `access-${label}`,
        refreshToken: `refresh-${label}`,
        idToken: idTokenExpiringAt(ms),
        expiresAt: ms,
        tokenType: "bearer",
    };
}

type TokenManager = typeof import("../token-manager");

/** A fresh copy of the module, so its in-memory state starts empty. */
async function loadTokenManager(): Promise<TokenManager> {
    vi.resetModules();
    return import("../token-manager");
}

describe("token manager", () => {
    beforeEach(() => {
        storeData.clear();
        vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
        vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("sends one refresh request when several callers need a token at once", async () => {
        const tm = await loadTokenManager();
        const refreshed = tokensExpiringAt(Date.now() + HOUR, "new");
        const refresh = vi.fn(async () => refreshed);
        tm.setTokenRefreshCallback(refresh);
        tm.storeTokens(tokensExpiringAt(Date.now() + 60_000));

        const results = await Promise.all([
            tm.getValidAccessToken(),
            tm.getValidAccessToken(),
            tm.getValidAccessToken(),
        ]);

        expect(refresh).toHaveBeenCalledTimes(1);
        expect(results).toEqual([
            refreshed.idToken,
            refreshed.idToken,
            refreshed.idToken,
        ]);
    });

    it("keeps the tokens when a refresh fails while offline", async () => {
        const tm = await loadTokenManager();
        const signedOut = vi.fn();
        tm.setSignedOutCallback(signedOut);
        tm.setTokenRefreshCallback(async () => {
            throw new TypeError("fetch failed");
        });
        tm.storeTokens(tokensExpiringAt(Date.now() - 1000));

        expect(await tm.getValidAccessToken()).toBeNull();
        expect(tm.getStoredTokens()?.refreshToken).toBe("refresh-old");
        expect(tm.getAuthState().isAuthenticated).toBe(true);
        expect(signedOut).not.toHaveBeenCalled();
    });

    it("returns the current token when a refresh fails before it expires", async () => {
        const tm = await loadTokenManager();
        tm.setTokenRefreshCallback(async () => {
            throw new Error("Token refresh failed: 503");
        });
        const tokens = tokensExpiringAt(Date.now() + 60_000);
        tm.storeTokens(tokens);

        expect(await tm.getValidAccessToken()).toBe(tokens.idToken);
    });

    it("signs out when Clerk rejects the refresh token", async () => {
        const tm = await loadTokenManager();
        // The same copy of the error class the fresh module loaded.
        const { TokenRefreshRejectedError } = await import("../errors");
        const signedOut = vi.fn();
        tm.setSignedOutCallback(signedOut);
        tm.setTokenRefreshCallback(async () => {
            throw new TokenRefreshRejectedError(400);
        });
        tm.storeTokens(tokensExpiringAt(Date.now() + 60_000));

        expect(await tm.getValidAccessToken()).toBeNull();
        expect(tm.getStoredTokens()).toBeNull();
        expect(tm.getAuthState().isAuthenticated).toBe(false);
        // Says why, until the next sign-in.
        expect(tm.getAuthState().error?.code).toBe("TOKEN_EXPIRED");
        expect(signedOut).toHaveBeenCalledTimes(1);

        tm.beginSession(tokensExpiringAt(Date.now() + HOUR, "new"));
        expect(tm.getAuthState().error).toBeNull();
    });

    it("doesn't let an old session's rejected refresh end a new sign-in", async () => {
        const tm = await loadTokenManager();
        const { TokenRefreshRejectedError } = await import("../errors");
        let rejectRefresh: (error: Error) => void = () => {};
        tm.setTokenRefreshCallback(
            () => new Promise((_resolve, reject) => (rejectRefresh = reject)),
        );
        tm.storeTokens(tokensExpiringAt(Date.now() + 60_000));

        const pending = tm.getValidAccessToken();
        const fresh = tokensExpiringAt(Date.now() + HOUR, "new");
        tm.beginSession(fresh);
        rejectRefresh(new TokenRefreshRejectedError(400));

        // The caller gets the new session's token, not the old one's.
        expect(await pending).toBe(fresh.idToken);
        expect(tm.getStoredTokens()?.refreshToken).toBe("refresh-new");
    });

    it("stays signed in after the ID token expires while the app is closed", async () => {
        const first = await loadTokenManager();
        first.storeTokens(tokensExpiringAt(Date.now() + HOUR));

        // Reopen the app a day later: a new module reads the stored tokens.
        vi.setSystemTime(Date.now() + 24 * HOUR);
        const tm = await loadTokenManager();

        const state = tm.getAuthState();
        expect(state.isAuthenticated).toBe(true);
        expect(state.user?.id).toBe("user_1");
        expect(state.error).toBeNull();
    });

    it("doesn't sign back in when a refresh finishes after a sign-out", async () => {
        const tm = await loadTokenManager();
        let finishRefresh: (tokens: AuthTokens) => void = () => {};
        tm.setTokenRefreshCallback(
            () => new Promise((resolve) => (finishRefresh = resolve)),
        );
        tm.storeTokens(tokensExpiringAt(Date.now() + 60_000));

        const pending = tm.getValidAccessToken();
        tm.clearTokens();
        finishRefresh(tokensExpiringAt(Date.now() + HOUR, "new"));

        expect(await pending).toBeNull();
        expect(tm.getStoredTokens()).toBeNull();
        expect(storeData.has("encryptedTokens")).toBe(false);
    });

    it("hands over tokens a refresh got after a sign-out, to be revoked", async () => {
        const tm = await loadTokenManager();
        const discarded = vi.fn();
        tm.setTokensDiscardedCallback(discarded);
        let finishRefresh: (tokens: AuthTokens) => void = () => {};
        tm.setTokenRefreshCallback(
            () => new Promise((resolve) => (finishRefresh = resolve)),
        );
        tm.storeTokens(tokensExpiringAt(Date.now() + 60_000));

        const pending = tm.getValidAccessToken();
        tm.clearTokens();
        const late = tokensExpiringAt(Date.now() + HOUR, "new");
        finishRefresh(late);
        await pending;

        expect(discarded).toHaveBeenCalledExactlyOnceWith(late);
    });

    it("doesn't discard the tokens of an ordinary refresh", async () => {
        const tm = await loadTokenManager();
        const discarded = vi.fn();
        tm.setTokensDiscardedCallback(discarded);
        tm.setTokenRefreshCallback(async () =>
            tokensExpiringAt(Date.now() + HOUR, "new"),
        );
        tm.storeTokens(tokensExpiringAt(Date.now() + 60_000));

        await tm.getValidAccessToken();

        expect(discarded).not.toHaveBeenCalled();
    });

    it("keeps the pending sign-in when a callback has the wrong state", async () => {
        const tm = await loadTokenManager();
        const flow: PendingAuthFlow = {
            codeVerifier: "verifier",
            state: "expected",
            initiatedAt: Date.now(),
            expiresAt: Date.now() + 5 * 60_000,
        };
        tm.storePendingFlow(flow);

        expect(tm.validateState("forged")).toBeNull();
        expect(tm.validateState("expected")).toEqual(flow);
    });
});

describe("isRefreshRejected", () => {
    it("goes by the OAuth error code when the body has one", async () => {
        const { isRefreshRejected } = await import("../errors");
        expect(isRefreshRejected(400, '{"error":"invalid_grant"}')).toBe(true);
        expect(isRefreshRejected(403, '{"error":"invalid_client"}')).toBe(true);
        expect(
            isRefreshRejected(400, '{"error":"temporarily_unavailable"}'),
        ).toBe(false);
    });

    it("otherwise treats a 4xx as final, except timeouts and rate limits", async () => {
        const { isRefreshRejected } = await import("../errors");
        expect(isRefreshRejected(401, "")).toBe(true);
        expect(isRefreshRejected(422, "<html>")).toBe(true);
        expect(isRefreshRejected(429, "")).toBe(false);
        expect(isRefreshRejected(408, "")).toBe(false);
        expect(isRefreshRejected(503, "")).toBe(false);
    });
});
