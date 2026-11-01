import { act, cleanup, render, screen } from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import * as Dialog from "@radix-ui/react-dialog";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import WindowTooSmallNotice from "../WindowTooSmallNotice";

function Harness({ dialogOpen }: { dialogOpen: boolean }) {
    return (
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <WindowTooSmallNotice size={{ width: 600, height: 800 }} />
            <Dialog.Root open={dialogOpen}>
                <Dialog.Portal>
                    <Dialog.Content aria-describedby={undefined}>
                        <Dialog.Title>Later dialog</Dialog.Title>
                        <button>Inside the later dialog</button>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </TolgeeProvider>
    );
}

const notice = () => screen.getByTestId("window-too-small");

describe("WindowTooSmallNotice", () => {
    beforeAll(async () => {
        await tolgee.run();
        Object.assign(window.electron ?? (window.electron = {} as never), {
            getZoomFactor: () => 1,
            isMacOS: false,
        });
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it("shows after a moment and takes focus", async () => {
        vi.useFakeTimers();
        render(<Harness dialogOpen={false} />);
        expect(screen.queryByTestId("window-too-small")).toBeNull();
        await act(async () => vi.advanceTimersByTime(300));
        expect(notice().contains(document.activeElement)).toBe(true);
    });

    it("stays the top layer when a dialog opens after it", async () => {
        vi.useFakeTimers();
        const { rerender } = render(<Harness dialogOpen={false} />);
        await act(async () => vi.advanceTimersByTime(300));
        vi.useRealTimers();

        rerender(<Harness dialogOpen />);
        await screen.findByText("Later dialog");
        // Mounted again, after the dialog, with focus back in it
        await vi.waitFor(() => {
            const layers = document.querySelectorAll(
                '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
            );
            expect(layers[layers.length - 1]).toBe(notice());
            expect(notice().contains(document.activeElement)).toBe(true);
        });
    });
});
