import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AxiosAdapter } from "axios";
import {
    AXIOS_INSTANCE,
    EditorApiError,
    customInstance,
    editorApiStatus,
} from "../editor-client";

const getAccessToken = vi.fn();
const adapter = vi.fn<AxiosAdapter>();
const originalAdapter = AXIOS_INSTANCE.defaults.adapter;

beforeEach(() => {
    vi.stubGlobal("electron", { auth: { getAccessToken } });
    AXIOS_INSTANCE.defaults.adapter = adapter;
    adapter.mockReset();
    getAccessToken.mockReset();
});
afterEach(() => {
    AXIOS_INSTANCE.defaults.adapter = originalAdapter;
    vi.unstubAllGlobals();
});

function respond(status: number, data: unknown) {
    adapter.mockImplementation(async (config) => ({
        data,
        status,
        statusText: "",
        headers: {},
        config,
    }));
}

describe("editor API client", () => {
    it("sends nothing without a sign-in token, and the failure has no status", async () => {
        getAccessToken.mockResolvedValue({ token: null });
        respond(200, {});

        const error = await customInstance({ url: "/x" }).catch((e) => e);

        expect(error).toBeInstanceOf(EditorApiError);
        expect(editorApiStatus(error)).toBeUndefined();
        expect(adapter).not.toHaveBeenCalled();
    });

    it("keeps the server's status on a failed request", async () => {
        getAccessToken.mockResolvedValue({ token: "jwt" });
        respond(403, { error: "Forbidden" });

        const error = await customInstance({ url: "/x" }).catch((e) => e);

        expect(error).toBeInstanceOf(EditorApiError);
        expect(error.message).toBe("Forbidden");
        expect(editorApiStatus(error)).toBe(403);
        expect(adapter.mock.calls[0][0].headers.Authorization).toBe(
            "Bearer jwt",
        );
    });

    it("returns the body of a successful request", async () => {
        getAccessToken.mockResolvedValue({ token: "jwt" });
        respond(200, { ok: true });

        expect(await customInstance({ url: "/x" })).toEqual({ ok: true });
    });
});
