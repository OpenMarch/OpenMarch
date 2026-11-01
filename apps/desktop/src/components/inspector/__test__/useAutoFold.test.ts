import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAutoFold } from "../useAutoFold";

describe("useAutoFold", () => {
    it("folds while asked and goes back to the person's choice", () => {
        const { result, rerender } = renderHook(
            ({ folded }) => useAutoFold(folded),
            { initialProps: { folded: false } },
        );
        expect(result.current[0]).toBe(true);

        rerender({ folded: true });
        expect(result.current[0]).toBe(false);
        rerender({ folded: false });
        expect(result.current[0]).toBe(true);

        // Closed by hand: stays closed after a fold and unfold
        act(() => result.current[1](false));
        rerender({ folded: true });
        rerender({ folded: false });
        expect(result.current[0]).toBe(false);
    });

    it("can be opened while folded, and starts folded if asked to", () => {
        const { result, rerender } = renderHook(
            ({ folded }) => useAutoFold(folded),
            { initialProps: { folded: true } },
        );
        expect(result.current[0]).toBe(false);
        act(() => result.current[1](true));
        expect(result.current[0]).toBe(true);
        rerender({ folded: true });
        expect(result.current[0]).toBe(true);
    });
});
