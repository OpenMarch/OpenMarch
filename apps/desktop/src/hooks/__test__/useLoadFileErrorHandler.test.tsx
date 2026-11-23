import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import { useLoadFileErrorHandler } from "../useLoadFileErrorHandler";
import { useAlertModalStore } from "@/stores/AlertModalStore";
import AlertModal from "@/components/AlertModal";
import {
    NEEDS_CONVERSION_STATUS,
    OPEN_STOPPED_STATUS,
} from "@om-electron/database/convertOnOpenGate";
import { FILE_TOO_NEW_STATUS } from "@om-electron/database/fileVersion";
import { LEFTOVER_JOURNAL_STATUS } from "@om-electron/database/leftoverJournalStatus";

describe("useLoadFileErrorHandler", () => {
    let send: (code: number) => void;
    let refusal: number | null = null;
    let syncFolder: { service: "OneDrive"; filePath: string } | null = null;
    const original = window.electron;

    beforeEach(() => {
        useAlertModalStore.getState().setOpen(false);
        window.electron = {
            ...(original ?? {}),
            onLoadFileResponse: vi.fn((callback: (code: number) => void) => {
                send = callback;
                return () => {};
            }),
            takeLoadFileRefusal: vi.fn(async () => refusal),
            getLeftoverJournal: vi.fn(async () => "show.dots-journal"),
            recoverLeftoverJournal: vi.fn(async () => 200),
            getCloudSyncFolder: vi.fn(async () => syncFolder),
        } as typeof window.electron;
    });

    afterEach(() => {
        refusal = null;
        syncFolder = null;
        window.electron = original;
    });

    it.each([
        [200, false],
        // Convert on open (P9.3): the main process already showed a dialog.
        [OPEN_STOPPED_STATUS, false],
        // A page-era file: ConvertShowDialog asks instead.
        [NEEDS_CONVERSION_STATUS, false],
        [404, true],
        [FILE_TOO_NEW_STATUS, true],
        [LEFTOVER_JOURNAL_STATUS, true],
        [-1, true],
    ])("status %i opens the alert: %s", (code, opens) => {
        renderHook(() => useLoadFileErrorHandler());
        act(() => send(code));
        expect(useAlertModalStore.getState().isOpen).toBe(opens);
    });

    it("explains a refused open that reloaded the window to the launch page", async () => {
        refusal = 404;
        renderHook(() => useLoadFileErrorHandler());
        await act(async () => {});
        expect(useAlertModalStore.getState().isOpen).toBe(true);
    });

    it("opens nothing after a reload with no refusal", async () => {
        renderHook(() => useLoadFileErrorHandler());
        await act(async () => {});
        expect(useAlertModalStore.getState().isOpen).toBe(false);
    });

    it("says when the show with a leftover journal is in a synced folder", async () => {
        syncFolder = {
            service: "OneDrive",
            filePath: "C:\\OneDrive\\show.dots",
        };
        renderHook(() => useLoadFileErrorHandler());
        act(() => send(LEFTOVER_JOURNAL_STATUS));
        render(<AlertModal />);
        expect(
            await screen.findByText(/OneDrive|leftoverJournal\.syncFolder/),
        ).toBeTruthy();
    });

    it("offers to recover the show from a leftover journal", async () => {
        renderHook(() => useLoadFileErrorHandler());
        act(() => send(LEFTOVER_JOURNAL_STATUS));
        expect(useAlertModalStore.getState().actions).toBeTruthy();

        render(<AlertModal />);
        const recover = await screen.findByRole("button", {
            name: /recover and open|leftoverJournal\.recover/i,
        });
        act(() => recover.click());

        expect(window.electron.recoverLeftoverJournal).toHaveBeenCalled();
        expect(useAlertModalStore.getState().isOpen).toBe(false);
    });

    it("drops the leftover-journal buttons for the next refusal", () => {
        renderHook(() => useLoadFileErrorHandler());
        act(() => send(LEFTOVER_JOURNAL_STATUS));
        act(() => send(404));
        expect(useAlertModalStore.getState().actions).toBeUndefined();
    });
});
