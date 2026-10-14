import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PendingConversion } from "@om-electron/database/convertOnOpenGate";
import type { ConvertProgress } from "@om-electron/database/convertOnOpenProtocol";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import ConvertShowDialog from "../ConvertShowDialog";

const PENDING: PendingConversion = {
    filePath: "/shows/Fall Show.dots",
    fileName: "Fall Show.dots",
    backupPath: "/shows/Fall Show.pre-conversion.dots",
    backupFileName: "Fall Show.pre-conversion.dots",
    folder: "/shows",
};

describe("ConvertShowDialog", () => {
    const original = window.electron;
    let finishConfirm: (status: number) => void;
    let sendProgress: ((p: ConvertProgress) => void) | undefined;
    let sendPending: ((p: PendingConversion | null) => void) | undefined;
    let api: {
        getPendingConversion: ReturnType<typeof vi.fn>;
        confirmConversion: ReturnType<typeof vi.fn>;
        cancelConversion: ReturnType<typeof vi.fn>;
        onConversionProgress: ReturnType<typeof vi.fn>;
        onPendingConversion: ReturnType<typeof vi.fn>;
    };

    const mount = (pending: PendingConversion | null) => {
        api.getPendingConversion.mockResolvedValue(pending);
        render(
            <TolgeeProvider tolgee={tolgee} fallback="Loading...">
                <ConvertShowDialog />
            </TolgeeProvider>,
        );
    };

    beforeEach(() => {
        sendProgress = undefined;
        sendPending = undefined;
        api = {
            getPendingConversion: vi.fn(),
            confirmConversion: vi.fn(
                () =>
                    new Promise<number>((resolve) => (finishConfirm = resolve)),
            ),
            cancelConversion: vi.fn(async () => {}),
            onConversionProgress: vi.fn((cb: (p: ConvertProgress) => void) => {
                sendProgress = cb;
                return () => {
                    sendProgress = undefined;
                };
            }),
            onPendingConversion: vi.fn(
                (cb: (p: PendingConversion | null) => void) => {
                    sendPending = cb;
                    return () => {
                        sendPending = undefined;
                    };
                },
            ),
        };
        window.electron = {
            ...(original ?? {}),
            ...api,
        } as unknown as typeof window.electron;
    });

    afterEach(() => {
        cleanup();
        window.electron = original;
    });

    it("shows nothing when no file waits", async () => {
        mount(null);
        await waitFor(() =>
            expect(api.getPendingConversion).toHaveBeenCalled(),
        );
        expect(screen.queryByTestId("convert-show-dialog")).toBeNull();
    });

    it("names the backup and converts nothing until Confirm", async () => {
        mount(PENDING);

        expect(
            await screen.findByTestId("convert-show-backup-name"),
        ).toHaveTextContent("Fall Show.pre-conversion.dots");
        expect(api.confirmConversion).not.toHaveBeenCalled();

        await userEvent.click(screen.getByTestId("convert-show-confirm"));
        expect(api.confirmConversion).toHaveBeenCalledTimes(1);
        expect(api.cancelConversion).not.toHaveBeenCalled();

        // While it converts, the dialog shows progress and can't be dismissed
        expect(
            await screen.findByTestId("convert-show-progress"),
        ).toBeInTheDocument();
        await waitFor(() => expect(sendProgress).toBeDefined());
        act(() =>
            sendProgress!({ phase: "convert", pagesDone: 2, pagesTotal: 5 }),
        );
        expect(screen.getByTestId("convert-show-progress")).toHaveTextContent(
            /2.*5/,
        );
        await userEvent.keyboard("{Escape}");
        expect(screen.getByTestId("convert-show-dialog")).toBeInTheDocument();
        expect(api.cancelConversion).not.toHaveBeenCalled();

        await act(async () => finishConfirm(200));
        await waitFor(() =>
            expect(screen.queryByTestId("convert-show-dialog")).toBeNull(),
        );
    });

    it("Cancel forgets the file without converting it", async () => {
        mount(PENDING);

        await userEvent.click(await screen.findByTestId("convert-show-cancel"));

        expect(api.cancelConversion).toHaveBeenCalledTimes(1);
        expect(api.confirmConversion).not.toHaveBeenCalled();
        await waitFor(() =>
            expect(screen.queryByTestId("convert-show-dialog")).toBeNull(),
        );
    });

    it("asks over the show that is open when the main process asks about another file", async () => {
        mount(null);
        await waitFor(() => expect(sendPending).toBeDefined());
        expect(screen.queryByTestId("convert-show-dialog")).toBeNull();

        act(() => sendPending!(PENDING));

        expect(
            await screen.findByTestId("convert-show-backup-name"),
        ).toHaveTextContent("Fall Show.pre-conversion.dots");
    });

    it("closes a stale question when another file opens or the show closes", async () => {
        mount(PENDING);
        await screen.findByTestId("convert-show-dialog");
        await waitFor(() => expect(sendPending).toBeDefined());

        act(() => sendPending!(null));

        await waitFor(() =>
            expect(screen.queryByTestId("convert-show-dialog")).toBeNull(),
        );
        expect(api.cancelConversion).not.toHaveBeenCalled();
        expect(api.confirmConversion).not.toHaveBeenCalled();
    });

    it("keeps showing the progress while it converts", async () => {
        mount(PENDING);
        await userEvent.click(
            await screen.findByTestId("convert-show-confirm"),
        );
        await screen.findByTestId("convert-show-progress");

        act(() => sendPending?.(null));

        expect(screen.getByTestId("convert-show-progress")).toBeInTheDocument();
        await act(async () => finishConfirm(200));
    });
});
