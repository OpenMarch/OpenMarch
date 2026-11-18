import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import FileControls from "../FileControls";

/**
 * The title bar's Undo and Redo with nothing to undo: greyed out, saying so on hover and when
 * pressed, instead of a button that does nothing.
 */

const history = vi.hoisted(() => ({
    canUndo: false,
    /** Whether the queued undo finds something to undo */
    did: false,
    perform: vi.fn(),
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useQuery: (options: { queryKey?: readonly unknown[] }) => ({
        data: JSON.stringify(options.queryKey ?? []).includes("Redo")
            ? false
            : history.canUndo,
    }),
}));
vi.mock("@/hooks/queries/useHistory", () => ({
    canUndoQueryOptions: () => ({ queryKey: ["canUndo"] }),
    canRedoQueryOptions: () => ({ queryKey: ["canRedo"] }),
}));
vi.mock("@/shortcuts/handlers/historyQueue", () => ({
    queueHistoryAction: (direction: string) => {
        history.perform(direction);
        return Promise.resolve(history.did);
    },
}));
vi.mock("@/hooks/useDatabaseReady", () => ({ useDatabaseReady: () => true }));

beforeAll(async () => {
    await tolgee.run();
});
afterEach(() => {
    cleanup();
    history.perform.mockClear();
});

const mount = () =>
    render(
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <FileControls />
        </TolgeeProvider>,
    );

describe("the title bar's Undo", () => {
    it("with nothing to undo is greyed out, and a press that finds nothing says so", async () => {
        history.canUndo = false;
        history.did = false;
        mount();
        const undo = screen.getByRole("button", { name: "Undo" });
        expect(undo).toHaveAttribute("aria-disabled", "true");
        expect(undo).toHaveAccessibleDescription("No action to undo");
        fireEvent.click(undo);
        expect(history.perform).toHaveBeenCalledWith("undo");
        expect(
            await screen.findAllByText("No action to undo"),
        ).not.toHaveLength(0);
    });

    it("greyed out by a query that lags an edit still undoes when pressed, and says nothing", async () => {
        history.canUndo = false;
        history.did = true;
        mount();
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        expect(history.perform).toHaveBeenCalledWith("undo");
        await Promise.resolve();
        // Only the screen-reader description has the words, no bubble
        expect(screen.getAllByText("No action to undo")).toHaveLength(1);
    });

    it("with something to undo undoes", () => {
        history.canUndo = true;
        history.did = true;
        mount();
        const undo = screen.getByRole("button", { name: "Undo" });
        expect(undo).not.toHaveAttribute("aria-disabled");
        fireEvent.click(undo);
        expect(history.perform).toHaveBeenCalledWith("undo");
    });
});
