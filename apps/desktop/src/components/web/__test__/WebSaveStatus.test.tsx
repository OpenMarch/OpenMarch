import { act, cleanup, render } from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import { toast } from "sonner";
import tolgee from "@/global/singletons/Tolgee";
import { useWebLibraryStore } from "@/stores/WebLibraryStore";
import type { ShowSummary } from "@/utilities/webLibrary";
import WebSaveStatus from "../WebSaveStatus";

const show = (editedAt: number): ShowSummary => ({
    id: "a",
    name: "Halftime",
    createdAt: 0,
    editedAt,
    backedUpAt: null,
    changedSinceBackup: true,
    editDays: ["2026-10-20", "2026-10-21", "2026-10-22"],
    changedSinceVersion: true,
    versions: [],
});

const setShow = (entry: ShowSummary) => {
    act(() => {
        useWebLibraryStore.getState().set({
            storage: { kind: "opfs" },
            library: { shows: [entry], openId: entry.id, openFailed: null },
        });
    });
};

describe("the backup reminder", () => {
    beforeAll(async () => {
        await tolgee.run();
    });
    beforeEach(() => {
        Object.assign(window, { electron: { invoke: vi.fn() } });
    });
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it("comes once, even when every save replaces the show and storage is blocked", () => {
        // A private window: nothing can be remembered in localStorage
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("QuotaExceededError");
        });
        const info = vi.spyOn(toast, "info").mockImplementation(() => 1);
        setShow(show(1));
        render(
            <TolgeeProvider tolgee={tolgee} fallback="">
                <WebSaveStatus />
            </TolgeeProvider>,
        );
        for (let i = 2; i < 8; i++) setShow(show(i));
        expect(info).toHaveBeenCalledTimes(1);
    });
});
