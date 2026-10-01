import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { DbConnection } from "@/db-functions/types";
import { useTimelineDevApi } from "../TimelineResolverHost";

// The hook only hands the connection to the API it installs; nothing here touches a database.
const database = {} as DbConnection;

function wrapper({ children }: { children: ReactNode }) {
    return (
        <QueryClientProvider client={new QueryClient()}>
            {children}
        </QueryClientProvider>
    );
}

describe("useTimelineDevApi", () => {
    it("installs window.openmarchTimeline while enabled and removes it on unmount", () => {
        expect(window.openmarchTimeline).toBeUndefined();
        const { unmount } = renderHook(
            () => useTimelineDevApi(database, true),
            { wrapper },
        );
        expect(window.openmarchTimeline).toBeDefined();
        unmount();
        expect(window.openmarchTimeline).toBeUndefined();
    });

    it("installs nothing while disabled", () => {
        const { unmount } = renderHook(
            () => useTimelineDevApi(database, false),
            { wrapper },
        );
        expect(window.openmarchTimeline).toBeUndefined();
        unmount();
    });

    it("removes the API when it's turned off", () => {
        const { rerender, unmount } = renderHook(
            ({ on }: { on: boolean }) => useTimelineDevApi(database, on),
            { wrapper, initialProps: { on: true } },
        );
        expect(window.openmarchTimeline).toBeDefined();
        rerender({ on: false });
        expect(window.openmarchTimeline).toBeUndefined();
        unmount();
    });
});
