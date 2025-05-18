import { act, renderHook } from "@testing-library/react";
import {
    useSelectedPage,
    SelectedPageProvider,
} from "@/context/SelectedPageContext";
import { ElectronApi } from "electron/preload";
import { mockPages } from "@/__mocks__/globalMocks";
import { describe, expect, it, vi } from "vitest";

// Mock the electron api
window.electron = {
    sendSelectedPage: vi.fn(),
} as Partial<ElectronApi> as ElectronApi;

describe("SelectedPageContext", () => {
    it("initial selected pages should be []", async () => {
        const { result } = renderHook(() => useSelectedPage(), {
            wrapper: SelectedPageProvider,
        });
        expect(result.current?.selectedPage).toEqual(null);
    });

    it("set selected page", async () => {
        const { result } = renderHook(() => useSelectedPage(), {
            wrapper: SelectedPageProvider,
        });
        const pages = mockPages;

        // copy the first marcher to avoid reference equality issues
        const expectedPage = pages[0];
        act(() => result.current?.setSelectedPage(expectedPage));
        expect(result.current?.selectedPage).toEqual({ ...expectedPage });
    });

    it("set selected page - multiple changes", async () => {
        const { result } = renderHook(() => useSelectedPage(), {
            wrapper: SelectedPageProvider,
        });
        const pages = mockPages;

        // copy the page to avoid reference equality issues
        let expectedPage = pages[0];
        act(() => result.current?.setSelectedPage(expectedPage));
        expect(result.current?.selectedPage).toEqual({ ...expectedPage });

        // copy the page to avoid reference equality issues
        expectedPage = pages[2];
        act(() => result.current?.setSelectedPage(expectedPage));
        expect(result.current?.selectedPage).toEqual({ ...expectedPage });

        // no page
        act(() => result.current?.setSelectedPage(null));
        expect(result.current?.selectedPage).toEqual(null);

        // copy the page to avoid reference equality issues
        expectedPage = pages[1];
        act(() => result.current?.setSelectedPage(expectedPage));
        expect(result.current?.selectedPage).toEqual({ ...expectedPage });
    });
});
