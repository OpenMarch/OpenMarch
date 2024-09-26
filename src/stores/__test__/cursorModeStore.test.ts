import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CursorMode, useCursorModeStore } from "../CursorModeStore";
import { mockMarcherPages, mockMarchers } from "@/__mocks__/globalMocks";

describe("CursorMode Store", () => {
    it("CursorModeStore - initial settings", async () => {
        // Expect the initial state to be an empty array
        const { result } = renderHook(() => useCursorModeStore());
        expect(result.current.cursorMode).toEqual("default");
    });

    it("CursorModeStore - set to line", async () => {
        const { result } = renderHook(() => useCursorModeStore());

        const expectedMode = "line";

        act(() => result.current.setCursorMode(expectedMode));
        expect(result.current.cursorMode).toEqual(expectedMode);
    });

    it("CursorModeStore - set to line, then back to default", async () => {
        const { result } = renderHook(() => useCursorModeStore());

        let expectedMode = "line" as CursorMode;
        act(() => result.current.setCursorMode(expectedMode));
        expect(result.current.cursorMode).toEqual(expectedMode);

        expectedMode = "default" as CursorMode;
        act(() => result.current.setCursorMode(expectedMode));
        expect(result.current.cursorMode).toEqual(expectedMode);
    });

    it("Set cursorModeMarchers", async () => {
        const { result } = renderHook(() => useCursorModeStore());

        const expectedMarchers = mockMarchers;

        act(() => result.current.setCursorModeMarchers(expectedMarchers));
        expect(result.current.cursorModeMarchers).toEqual(expectedMarchers);
        act(() => result.current.setCursorModeMarchers([]));
        expect(result.current.cursorModeMarchers).toEqual([]);
    });

    it("Set newMarcherPages", async () => {
        const { result } = renderHook(() => useCursorModeStore());

        const expectedMarcherPages = mockMarcherPages;

        act(() =>
            result.current.setCursorModeNewMarcherPages(expectedMarcherPages)
        );
        expect(result.current.newMarcherPages).toEqual(expectedMarcherPages);
        act(() => result.current.setCursorModeNewMarcherPages([]));
        expect(result.current.newMarcherPages).toEqual([]);
    });
});
