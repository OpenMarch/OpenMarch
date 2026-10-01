import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * After an undo or redo, `usePerformHistoryAction` goes to the page the action names and selects
 * its marchers (P7.13): page 0 included, a page the action restored once the page list has it, and
 * marchers the action restored.
 */

type TestPage = { id: number; name: string };
type TestMarcher = { id: number };

const state = vi.hoisted(() => ({
    pages: [] as { id: number; name: string }[],
    selectedPage: null as { id: number; name: string } | null,
    setSelectedPage: vi.fn(),
    setSelectedMarchers: vi.fn(),
    performHistoryAction: vi.fn(),
}));

vi.mock("@/App", () => ({ queryClient: undefined }));
vi.mock("@/global/database/db", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    db: {},
}));
vi.mock("@/db-functions", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    performHistoryAction: state.performHistoryAction,
}));
vi.mock("@/hooks/useTimingObjects", () => ({
    useTimingObjects: () => ({ pages: state.pages }),
}));
vi.mock("@/context/SelectedPageContext", () => ({
    useSelectedPage: () => ({
        selectedPage: state.selectedPage,
        setSelectedPage: state.setSelectedPage,
    }),
}));
vi.mock("@/context/SelectedMarchersContext", () => ({
    useSelectedMarchers: () => ({
        setSelectedMarchers: state.setSelectedMarchers,
    }),
}));

const { usePerformHistoryAction } = await import("../useHistory");
const { marcherKeys } = await import("../useMarchers");

const page = (id: number): TestPage => ({ id, name: String(id) });

const setUp = (marchers: TestMarcher[]) => {
    const qc = new QueryClient({
        defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
    qc.setQueryData(marcherKeys.all(), marchers);
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const hook = renderHook(() => usePerformHistoryAction(), { wrapper });
    return { qc, hook };
};

const selectedMarcherIds = () =>
    (
        state.setSelectedMarchers.mock.calls.at(-1)?.[0] as
            | TestMarcher[]
            | undefined
    )?.map((m) => m.id);

describe("usePerformHistoryAction", () => {
    beforeEach(() => {
        state.pages = [page(0), page(1), page(2)];
        state.selectedPage = page(2);
        state.setSelectedPage.mockReset();
        state.setSelectedMarchers.mockReset();
        state.performHistoryAction.mockReset();
    });

    it("goes to page 0 and selects its marchers", async () => {
        state.performHistoryAction.mockResolvedValue({
            pageIdToGoTo: 0,
            marcherIdsToSelect: new Set([2]),
            queriesToInvalidate: [],
        });
        const { hook } = setUp([{ id: 1 }, { id: 2 }]);
        await act(() => hook.result.current.mutateAsync("undo"));
        await waitFor(() =>
            expect(state.setSelectedPage).toHaveBeenCalledWith(page(0)),
        );
        expect(selectedMarcherIds()).toEqual([2]);
        expect(state.performHistoryAction).toHaveBeenCalledWith(
            "undo",
            expect.anything(),
            { currentPageId: 2 },
        );
    });

    it("waits for a page the action restored, then goes there and selects its marchers", async () => {
        state.performHistoryAction.mockResolvedValue({
            pageIdToGoTo: 9,
            marcherIdsToSelect: new Set([1]),
            queriesToInvalidate: [],
        });
        const { hook } = setUp([{ id: 1 }, { id: 2 }]);
        await act(() => hook.result.current.mutateAsync("redo"));
        // Not in the page list yet: no navigation and no selection
        expect(state.setSelectedPage).not.toHaveBeenCalled();
        expect(state.setSelectedMarchers).not.toHaveBeenCalled();

        // The page list is fetched again and has it now
        state.pages = [...state.pages, page(9)];
        hook.rerender();
        await waitFor(() =>
            expect(state.setSelectedPage).toHaveBeenCalledWith(page(9)),
        );
        expect(selectedMarcherIds()).toEqual([1]);

        // Applied once
        hook.rerender();
        expect(state.setSelectedPage).toHaveBeenCalledTimes(1);
    });

    it("stays on the current page and selects marchers the action restored", async () => {
        const { qc, hook } = setUp([{ id: 1 }]);
        state.performHistoryAction.mockImplementation(async () => {
            // The undo restores marcher 5; its query has the new row before the hook selects
            qc.setQueryData(marcherKeys.all(), [{ id: 1 }, { id: 5 }]);
            return {
                pageIdToGoTo: 2,
                marcherIdsToSelect: new Set([5]),
                queriesToInvalidate: [],
            };
        });
        await act(() => hook.result.current.mutateAsync("undo"));
        await waitFor(() => expect(selectedMarcherIds()).toEqual([5]));
        // Already on page 2: no page change
        expect(state.setSelectedPage).not.toHaveBeenCalled();
    });

    it("with no page, selects the marchers only", async () => {
        state.performHistoryAction.mockResolvedValue({
            pageIdToGoTo: undefined,
            marcherIdsToSelect: new Set([1]),
            queriesToInvalidate: [],
        });
        const { hook } = setUp([{ id: 1 }, { id: 2 }]);
        await act(() => hook.result.current.mutateAsync("undo"));
        expect(selectedMarcherIds()).toEqual([1]);
        expect(state.setSelectedPage).not.toHaveBeenCalled();
    });
});
