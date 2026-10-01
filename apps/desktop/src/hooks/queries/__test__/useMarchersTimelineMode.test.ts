import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

/**
 * The marcher create and delete mutations read the timeline flag when they run, so one started
 * while the workspace settings are still loading still takes the timeline path (P7.3).
 */

const mocks = vi.hoisted(() => ({
    createMarchers: vi.fn(async () => []),
    deleteMarchers: vi.fn(async () => []),
    getSettings: vi.fn(),
}));

vi.mock("@/App", () => ({ queryClient: undefined }));
vi.mock("@/global/database/db", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    db: {},
}));
vi.mock("@/db-functions", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    createMarchers: mocks.createMarchers,
    deleteMarchers: mocks.deleteMarchers,
}));
vi.mock("@/db-functions/workspaceSettings", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    getWorkspaceSettingsParsed: mocks.getSettings,
}));

const { createMarchersMutationOptions, deleteMarchersMutationOptions } =
    await import("../useMarchers");
const { workspaceSettingsKeys } = await import("../useWorkspaceSettings");

const NEW = [{ section: "Trumpet", drill_prefix: "T", drill_order: 1 }];

/** A settings load that resolves only when `release` is called. */
const slowSettings = (timelineMode: boolean) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    mocks.getSettings.mockImplementation(async () => {
        await gate;
        return { timelineMode };
    });
    return () => release();
};

describe("marcher mutations read the timeline flag when they run", () => {
    beforeEach(() => {
        mocks.createMarchers.mockClear();
        mocks.deleteMarchers.mockClear();
        mocks.getSettings.mockReset();
    });

    it("a create started before the settings load waits for them and takes the timeline path", async () => {
        const qc = new QueryClient();
        const release = slowSettings(true);
        const running = createMarchersMutationOptions(qc).mutationFn!(
            NEW,
            undefined as never,
        );
        await Promise.resolve();
        expect(mocks.createMarchers).not.toHaveBeenCalled();
        release();
        await running;
        expect(mocks.createMarchers).toHaveBeenCalledWith(
            expect.objectContaining({ newMarchers: NEW, timelineMode: true }),
        );
    });

    it("a delete started before the settings load waits for them and takes the timeline path", async () => {
        const qc = new QueryClient();
        const release = slowSettings(true);
        const ids = new Set([3]);
        const running = deleteMarchersMutationOptions(qc).mutationFn!(
            ids,
            undefined as never,
        );
        await Promise.resolve();
        expect(mocks.deleteMarchers).not.toHaveBeenCalled();
        release();
        await running;
        expect(mocks.deleteMarchers).toHaveBeenCalledWith(
            expect.objectContaining({ marcherIds: ids, timelineMode: true }),
        );
    });

    it("uses the cached settings, and page mode when the flag is off", async () => {
        const qc = new QueryClient();
        qc.setQueryData(workspaceSettingsKeys.detail(), {
            timelineMode: false,
        });
        await createMarchersMutationOptions(qc).mutationFn!(
            NEW,
            undefined as never,
        );
        await deleteMarchersMutationOptions(qc).mutationFn!(
            new Set([1]),
            undefined as never,
        );
        expect(mocks.getSettings).not.toHaveBeenCalled();
        expect(mocks.createMarchers).toHaveBeenCalledWith(
            expect.objectContaining({ timelineMode: false }),
        );
        expect(mocks.deleteMarchers).toHaveBeenCalledWith(
            expect.objectContaining({ timelineMode: false }),
        );
    });
});
