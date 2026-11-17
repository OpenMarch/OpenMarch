import { afterEach, describe, expect, it, vi } from "vitest";
import { revokeRefreshToken } from "../oauth-flow";

// Hoisted above the imports by vitest.

vi.mock("electron", () => ({ shell: { openExternal: vi.fn() } }));
vi.mock("../../../../src/global/auth/constants", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    CLERK_CONFIG: { DOMAIN: "clerk.example.test", CLIENT_ID: "client_1" },
    getClerkRevocationEndpoint: () =>
        "https://clerk.example.test/oauth/token/revoke",
}));

describe("revokeRefreshToken", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("asks Clerk's revocation endpoint to revoke the refresh token", async () => {
        const fetchMock = vi.fn(
            async () => new Response(null, { status: 200 }),
        );
        vi.stubGlobal("fetch", fetchMock);

        await revokeRefreshToken("refresh-1");

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as unknown as [
            string,
            RequestInit,
        ];
        expect(url).toBe("https://clerk.example.test/oauth/token/revoke");
        expect(init.method).toBe("POST");
        const body = new URLSearchParams(init.body as URLSearchParams);
        expect(Object.fromEntries(body)).toEqual({
            client_id: "client_1",
            token: "refresh-1",
            token_type_hint: "refresh_token",
        });
    });

    it("logs Clerk's answer, without throwing, when Clerk turns it down", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response('{"error":"invalid_client"}', { status: 401 }),
            ),
        );
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        await expect(revokeRefreshToken("refresh-1")).resolves.toBeUndefined();

        expect(warn).toHaveBeenCalledWith(
            expect.any(String),
            401,
            '{"error":"invalid_client"}',
        );
    });

    it("logs, without throwing, when offline", async () => {
        const failure = new TypeError("fetch failed");
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw failure;
            }),
        );
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        await expect(revokeRefreshToken("refresh-1")).resolves.toBeUndefined();

        expect(warn).toHaveBeenCalledWith(expect.any(String), failure);
    });
});
