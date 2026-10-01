import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLoadFileErrorHandler } from "../useLoadFileErrorHandler";
import { useAlertModalStore } from "@/stores/AlertModalStore";
import { OPEN_STOPPED_STATUS } from "@om-electron/database/convertOnOpenGate";
import { FILE_TOO_NEW_STATUS } from "@om-electron/database/fileVersion";

describe("useLoadFileErrorHandler", () => {
    let send: (code: number) => void;
    const original = window.electron;

    beforeEach(() => {
        useAlertModalStore.getState().setOpen(false);
        window.electron = {
            ...(original ?? {}),
            onLoadFileResponse: vi.fn((callback: (code: number) => void) => {
                send = callback;
                return () => {};
            }),
        } as typeof window.electron;
    });

    afterEach(() => {
        window.electron = original;
    });

    it.each([
        [200, false],
        // Convert on open (P9.3): the main process already showed a dialog.
        [OPEN_STOPPED_STATUS, false],
        [404, true],
        [FILE_TOO_NEW_STATUS, true],
        [-1, true],
    ])("status %i opens the alert: %s", (code, opens) => {
        renderHook(() => useLoadFileErrorHandler());
        act(() => send(code));
        expect(useAlertModalStore.getState().isOpen).toBe(opens);
    });
});
