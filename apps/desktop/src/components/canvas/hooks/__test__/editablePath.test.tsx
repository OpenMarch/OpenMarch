import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Line, Path } from "@openmarch/core";
import EditablePath from "@/global/classes/canvasObjects/EditablePath";

/**
 * The dormant editable-path writers write nothing in timeline mode
 * (docs/timeline/phases/07-page-parity.md P7.10), and write as before in page mode.
 */

const mocks = vi.hoisted(() => ({
    createPathway: vi.fn(),
    updatePathway: vi.fn(),
    timelineMode: false,
    settingsFail: false,
}));

vi.mock("@/hooks/queries", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/hooks/queries")>()),
    useCreatePathway: () => ({ mutate: mocks.createPathway }),
    useUpdatePathway: () => ({ mutate: mocks.updatePathway }),
}));

vi.mock("@/hooks/queries/useWorkspaceSettings", async (importOriginal) => ({
    ...(await importOriginal<
        typeof import("@/hooks/queries/useWorkspaceSettings")
    >()),
    readTimelineMode: () =>
        mocks.settingsFail
            ? Promise.reject(new Error("settings unavailable"))
            : Promise.resolve(mocks.timelineMode),
}));

const { default: useEditablePath } = await import("../editablePath");

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
        {children}
    </QueryClientProvider>
);

const path = () => new Path([new Line({ x: 0, y: 0 }, { x: 1, y: 1 })]);

afterEach(() => {
    mocks.createPathway.mockReset();
    mocks.updatePathway.mockReset();
    vi.spyOn(console, "log").mockRestore();
});

describe("useEditablePath", () => {
    it.each([
        [false, 1],
        [true, 0],
    ])("timeline mode %s: writes %i times", async (timelineMode, writes) => {
        mocks.timelineMode = timelineMode;
        vi.spyOn(console, "log").mockImplementation(() => {});
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        renderHook(() => useEditablePath(), { wrapper });

        await EditablePath.createPathway(path(), 7);
        await EditablePath.updatePathway(3, path());

        expect(mocks.createPathway).toHaveBeenCalledTimes(writes);
        expect(mocks.updatePathway).toHaveBeenCalledTimes(writes);
        expect(warn).toHaveBeenCalledTimes(timelineMode ? 2 : 0);
        warn.mockRestore();
    });

    it("keeps the page-mode write when the settings can't be read", async () => {
        mocks.timelineMode = true;
        mocks.settingsFail = true;
        try {
            vi.spyOn(console, "log").mockImplementation(() => {});
            renderHook(() => useEditablePath(), { wrapper });

            await EditablePath.createPathway(path(), 7);
            await EditablePath.updatePathway(3, path());

            expect(mocks.createPathway).toHaveBeenCalledTimes(1);
            expect(mocks.updatePathway).toHaveBeenCalledTimes(1);
        } finally {
            mocks.settingsFail = false;
        }
    });
});
