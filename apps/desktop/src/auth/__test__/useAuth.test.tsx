import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { AuthState } from "../../../electron/main/auth/types";
import { isEditorApiQuery, useAuth } from "../useAuth";

const SIGNED_IN: AuthState = {
    isAuthenticated: true,
    isLoading: false,
    user: {
        id: "user_1",
        email: null,
        firstName: null,
        lastName: null,
        imageUrl: null,
    },
    error: null,
};

describe("useAuth", () => {
    it("drops editor API answers from the old sign-in when it changes", async () => {
        let fireStateChanged: (state: AuthState) => void = () => {};
        vi.stubGlobal("electron", {
            auth: {
                getState: async () => ({
                    ...SIGNED_IN,
                    isAuthenticated: false,
                    user: null,
                }),
                onStateChanged: (callback: (state: AuthState) => void) => {
                    fireStateChanged = callback;
                    return () => {};
                },
                onError: () => () => {},
            },
        });
        const queryClient = new QueryClient();
        const productionKey = ["/api/editor/v1/productions", 7];
        const otherKey = ["pages"];
        // A 401 fetched under the old sign-in, and something unrelated.
        await queryClient
            .fetchQuery({
                queryKey: productionKey,
                queryFn: () => Promise.reject(new Error("401")),
                retry: false,
            })
            .catch(() => {});
        queryClient.setQueryData(otherKey, ["page 1"]);
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
        renderHook(() => useAuth(), { wrapper });
        expect(queryClient.getQueryState(productionKey)?.error).toBeTruthy();

        act(() => fireStateChanged(SIGNED_IN));

        await waitFor(() =>
            expect(queryClient.getQueryState(productionKey)?.error).toBeNull(),
        );
        expect(queryClient.getQueryData(otherKey)).toEqual(["page 1"]);
        vi.unstubAllGlobals();
    });

    it("matches only the editor API's queries", () => {
        expect(
            isEditorApiQuery({ queryKey: ["/api/editor/v1/ensembles", 1] }),
        ).toBe(true);
        expect(isEditorApiQuery({ queryKey: ["needs-auth", "x"] })).toBe(false);
        expect(isEditorApiQuery({ queryKey: [42] })).toBe(false);
    });
});
