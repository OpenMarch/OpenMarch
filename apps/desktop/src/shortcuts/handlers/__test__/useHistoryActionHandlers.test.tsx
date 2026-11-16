import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { runFieldHistory } from "@/field/three/fieldHistory";
import { runAction } from "../../registry";
import { useHistoryActionHandlers } from "../useHistoryActionHandlers";

/**
 * Undo and Redo: the same action runs from a key or a field finger tap (tablet plan 1.6); a
 * tap's run also says "Undone"/"Redone" when the step did something.
 */

const mocks = vi.hoisted(() => ({
    perform: vi.fn<(direction: string) => Promise<{ nothingToDo: boolean }>>(),
}));

vi.mock("@/hooks/queries/useHistory", () => ({
    usePerformHistoryAction: () => ({ mutateAsync: mocks.perform }),
}));
vi.mock("@/hooks/useDatabaseReady", () => ({ useDatabaseReady: () => true }));
vi.mock("@tolgee/react", () => ({
    useTranslate: () => ({ t: (key: string) => key }),
}));
vi.mock("sonner", () => ({
    toast: Object.assign(vi.fn(), { warning: vi.fn() }),
}));

describe("useHistoryActionHandlers", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.perform.mockResolvedValue({ nothingToDo: false });
        renderHook(() => useHistoryActionHandlers());
    });
    afterEach(cleanup);

    it("a finger tap undoes through the action and says Undone", async () => {
        runFieldHistory("undo");
        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith("touch.undone", {
                duration: 1200,
            }),
        );
        expect(mocks.perform).toHaveBeenCalledExactlyOnceWith("undo");
    });

    it("a finger tap redoes through the action and says Redone", async () => {
        runFieldHistory("redo");
        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith("touch.redone", {
                duration: 1200,
            }),
        );
        expect(mocks.perform).toHaveBeenCalledExactlyOnceWith("redo");
    });

    it("the action without the tap's argument (a key, a button) says nothing new", async () => {
        expect(runAction("performUndo")).toBe(true);
        await waitFor(() => expect(mocks.perform).toHaveBeenCalledOnce());
        await Promise.resolve();
        expect(toast).not.toHaveBeenCalled();
    });

    it("a tap with nothing to undo only warns, as a key press does", async () => {
        mocks.perform.mockResolvedValue({ nothingToDo: true });
        runFieldHistory("undo");
        await waitFor(() =>
            expect(toast.warning).toHaveBeenCalledWith(
                "actions.edit.noUndoAvailable",
                { duration: 1500 },
            ),
        );
        expect(toast).not.toHaveBeenCalled();
    });
});
