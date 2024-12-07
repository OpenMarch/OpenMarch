import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlignmentEvent, useAlignmentEventStore } from "../AlignmentEventStore";
import { mockMarcherPages, mockMarchers } from "@/__mocks__/globalMocks";

describe("AlignmentEvent Store", () => {
    it("AlignmentEventStore - initial settings", async () => {
        // Expect the initial state to be an empty array
        const { result } = renderHook(() => useAlignmentEventStore());
        expect(result.current.alignmentEvent).toEqual("default");
    });

    it("AlignmentEventStore - set to line", async () => {
        const { result } = renderHook(() => useAlignmentEventStore());

        const expectedMode = "line";

        act(() => result.current.setAlignmentEvent(expectedMode));
        expect(result.current.alignmentEvent).toEqual(expectedMode);
    });

    it("AlignmentEventStore - set to line, then back to default", async () => {
        const { result } = renderHook(() => useAlignmentEventStore());

        let expectedMode = "line" as AlignmentEvent;
        act(() => result.current.setAlignmentEvent(expectedMode));
        expect(result.current.alignmentEvent).toEqual(expectedMode);

        expectedMode = "default" as AlignmentEvent;
        act(() => result.current.setAlignmentEvent(expectedMode));
        expect(result.current.alignmentEvent).toEqual(expectedMode);
    });

    it("Set alignmentEventMarchers", async () => {
        const { result } = renderHook(() => useAlignmentEventStore());

        const expectedMarchers = mockMarchers;

        act(() => result.current.setAlignmentEventMarchers(expectedMarchers));
        expect(result.current.alignmentEventMarchers).toEqual(expectedMarchers);
        act(() => result.current.setAlignmentEventMarchers([]));
        expect(result.current.alignmentEventMarchers).toEqual([]);
    });

    it("Set newMarcherPages", async () => {
        const { result } = renderHook(() => useAlignmentEventStore());

        const expectedMarcherPages = mockMarcherPages;

        act(() =>
            result.current.setAlignmentEventNewMarcherPages(
                expectedMarcherPages,
            ),
        );
        expect(result.current.alignmentEventNewMarcherPages).toEqual(
            expectedMarcherPages,
        );
        act(() => result.current.setAlignmentEventNewMarcherPages([]));
        expect(result.current.alignmentEventNewMarcherPages).toEqual([]);
    });
});
