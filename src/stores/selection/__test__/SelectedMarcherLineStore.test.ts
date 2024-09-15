import { renderHook, act, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useSelectedMarcherLinesStore } from "../SelectedMarcherLineStore";
import { mockMarcherLines } from "@/__mocks__/globalMocks";

describe("SelectedMarcherLine Store", () => {
    afterEach(async () => {
        cleanup();
    });

    it("SelectedMarcherLineStore - initial selection is empty", async () => {
        // Expect the initial state to be an empty array
        const { result } = renderHook(() => useSelectedMarcherLinesStore());
        expect(result.current.selectedMarcherLines).toEqual([]);
    });

    it("SelectedMarcherLineStore - select one line", async () => {
        const { result } = renderHook(() => useSelectedMarcherLinesStore());

        act(() =>
            result.current.setSelectedMarcherLines([mockMarcherLines[0]])
        );
        expect(result.current.selectedMarcherLines).toEqual([
            mockMarcherLines[0],
        ]);
    });

    it("SelectedMarcherLineStore - select multiple lines", async () => {
        const { result } = renderHook(() => useSelectedMarcherLinesStore());

        act(() => result.current.setSelectedMarcherLines(mockMarcherLines));
        expect(result.current.selectedMarcherLines).toEqual(mockMarcherLines);
    });
});
